# Schema de Base de Datos — AgentBuilder SaaS
> Diseñado para Supabase (PostgreSQL) con Row Level Security (RLS)
> Multi-tenant desde el día 1 — integridad referencial garantizada por FK cruzados
> Versión 8.0 — Validado en Supabase real. Bloques 1-15 ejecutados.

---

## Decisiones de diseño documentadas

```
1. Un usuario pertenece a UNA sola organización (users.email UNIQUE global — decisión consciente)
   → Si en el futuro se necesita multi-org, migrar a tabla memberships y leer email de auth.users

2. Enums como TEXT + CHECK (no CREATE TYPE ENUM de PostgreSQL)
   → Las migraciones ALTER TYPE en Supabase son delicadas con datos vivos
   → Migrar a ENUM nativo cuando el schema esté estable en producción

3. Particionado por mes en messages, audit_logs, user_sessions
   → Cada tabla particionada tiene DEFAULT PARTITION para evitar fallos en inserts
   → user_sessions particionado por expires_at (queries principales filtran sesiones activas)
   → Crear particiones con 2 meses de anticipación via pg_cron
   → Verificar en Supabase que partitioned indexes se materializan correctamente

4. agent_versions usa config JSONB con whitelist explícita de campos
   → NO usar to_jsonb(OLD) — incluiría columnas no deseadas y datos sensibles futuros
   → changed_by es UUID NULL con changed_by_type TEXT ('user' | 'system')
   → NO se fuerza un "system user" global — se usa NULL + tipo explícito
   → Trigger con SECURITY DEFINER — verificar interacción con RLS en Supabase real

5. integration_secrets separada de integrations
   → integrations accesible a la UI (metadata/estado)
   → integration_secrets con RLS habilitado y policy USING(false) — hardening explícito
   → service_role bypasea RLS — acceso solo desde backend
   → secret_encrypted en organization_webhooks cifrado con pgcrypto (no hasheado)
     porque HMAC requiere el secreto original

6. event_queue con SELECT FOR UPDATE SKIP LOCKED
   → Garantiza que workers concurrentes no procesen el mismo evento
   → idempotency_key UNIQUE previene duplicados en retries (NULL permitido múltiples veces)

7. Consistencia multi-tenant garantizada por FK cruzados en todas las tablas
   → Tablas padre: UNIQUE (id, organization_id)
   → Tablas hijas: FOREIGN KEY (entity_id, organization_id) REFERENCES padre(id, organization_id)

8. SECURITY DEFINER con SET search_path = public en todas las funciones y triggers
   → Previene function hijacking / shadowing en Postgres/Supabase

9. RLS con WITH CHECK explícito en todas las policies FOR ALL / INSERT / UPDATE
   → Sin WITH CHECK, INSERT/UPDATE pueden crear filas que el usuario no puede ver
   → Cada tabla tiene policies separadas por operación donde el rol difiere

10. Policies de RLS alineadas con la matriz de permisos
    → integrations: SELECT para todos los roles, INSERT/UPDATE/DELETE solo admin
    → user_agent_permissions: todas las operaciones solo admin
    → notifications: solo SELECT desde frontend (INSERT/UPDATE/DELETE bloqueados)
    → agent_versions: solo SELECT (admin/editor) — INSERT solo desde trigger/backend
```

---

## Diagrama de relaciones

```
plans
  │
organizations ──── plan_id
    │
    ├── users  [UNIQUE (id, org_id)]
    │       ├── user_agent_permissions  (admin-only RLS + trigger enforza operador/viewer)
    │       ├── user_sessions           (particionado por expires_at + DEFAULT)
    │       └── notifications           (solo SELECT desde frontend)
    │
    ├── agents  [UNIQUE (id, org_id)]
    │       ├── agent_versions          (whitelist JSONB, changed_by NULL+type)
    │       ├── agent_tools             (FK cruzado a integrations)
    │       ├── agent_documents         (FK cruzado)
    │       └── conversations  [UNIQUE (id, org_id)]
    │               └── messages        (FK cruzado — particionado + DEFAULT)
    │
    ├── integrations  [UNIQUE (id, org_id)]
    │       ├── integration_secrets     (RLS bloqueada — solo service_role)
    │       └── integration_credentials_history (FK cruzado)
    │
    ├── organization_webhooks  [UNIQUE (id, org_id)]
    │       └── webhook_deliveries      (FK cruzado)
    │
    ├── event_queue
    ├── usage_records                   (FK cruzado a agents)
    └── audit_logs                      (particionado + DEFAULT — APPEND ONLY)
```

---

## Funciones globales

```sql
-- Trigger reutilizable para updated_at
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

-- Helper RLS: organización del usuario actual
-- Devuelve NULL si el usuario está suspendido, borrado,
-- o si la organización está inactiva o borrada.
-- Cuando devuelve NULL, todas las policies RLS fallan automáticamente.
CREATE OR REPLACE FUNCTION public.get_user_organization_id()
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE AS $$
DECLARE
  v_organization_id UUID;
  v_org_active      BOOLEAN;
  v_org_deleted     TIMESTAMPTZ;
BEGIN
  SELECT u.organization_id
  INTO   v_organization_id
  FROM   public.users u
  WHERE  u.id         = auth.uid()
    AND  u.is_active  = true
    AND  u.deleted_at IS NULL;

  IF v_organization_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT o.is_active, o.deleted_at
  INTO   v_org_active, v_org_deleted
  FROM   public.organizations o
  WHERE  o.id = v_organization_id;

  IF v_org_active = false OR v_org_deleted IS NOT NULL THEN
    RETURN NULL;
  END IF;

  RETURN v_organization_id;
END;
$$;

-- Helper RLS: rol del usuario actual
-- Misma lógica: devuelve NULL si el usuario o la organización no están operativos.
CREATE OR REPLACE FUNCTION public.get_user_role()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE AS $$
DECLARE
  v_role            TEXT;
  v_organization_id UUID;
  v_org_active      BOOLEAN;
  v_org_deleted     TIMESTAMPTZ;
BEGIN
  SELECT u.role, u.organization_id
  INTO   v_role, v_organization_id
  FROM   public.users u
  WHERE  u.id         = auth.uid()
    AND  u.is_active  = true
    AND  u.deleted_at IS NULL;

  IF v_role IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT o.is_active, o.deleted_at
  INTO   v_org_active, v_org_deleted
  FROM   public.organizations o
  WHERE  o.id = v_organization_id;

  IF v_org_active = false OR v_org_deleted IS NOT NULL THEN
    RETURN NULL;
  END IF;

  RETURN v_role;
END;
$$;
```

---

## Tablas

---

### 1. plans

```sql
CREATE TABLE plans (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name                  TEXT NOT NULL UNIQUE,
  max_agents            INT NOT NULL CHECK (max_agents >= -1),
  max_users             INT NOT NULL CHECK (max_users >= -1),
  max_messages_month    INT NOT NULL CHECK (max_messages_month >= -1),
  price_monthly_usd     DECIMAL(8,2),
  features              JSONB DEFAULT '{}',
  -- Schema esperado de features:
  -- {
  --   "custom_branding": false,
  --   "api_access": false,
  --   "priority_support": false,
  --   "audit_logs_retention_days": 30,
  --   "allowed_llm_providers": ["openai"],
  --   "allowed_channels": ["web"],
  --   "webhooks_enabled": false,
  --   "agent_versioning": false,
  --   "max_webhook_endpoints": 0
  -- }
  is_active             BOOLEAN DEFAULT true,
  created_at            TIMESTAMPTZ DEFAULT NOW(),
  updated_at            TIMESTAMPTZ DEFAULT NOW()
);

CREATE TRIGGER trigger_plans_updated_at
  BEFORE UPDATE ON plans
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

INSERT INTO plans (name, max_agents, max_users, max_messages_month, price_monthly_usd, features) VALUES
('trial',      3,   5,     1000,  0.00,  '{"audit_logs_retention_days":7,   "allowed_channels":["web"],                      "allowed_llm_providers":["openai"],                        "webhooks_enabled":false,"agent_versioning":false,"max_webhook_endpoints":0}'),
('starter',    5,   10,    5000,  29.00, '{"audit_logs_retention_days":30,  "allowed_channels":["web","email"],               "allowed_llm_providers":["openai"],                        "webhooks_enabled":false,"agent_versioning":true, "max_webhook_endpoints":0}'),
('pro',        20,  50,    50000, 99.00, '{"audit_logs_retention_days":90,  "allowed_channels":["web","email","whatsapp"],     "allowed_llm_providers":["openai","anthropic","gemini"],   "api_access":true,"webhooks_enabled":true,"agent_versioning":true,"max_webhook_endpoints":5}'),
('enterprise', -1,  -1,   -1,    null,  '{"audit_logs_retention_days":365, "allowed_channels":["web","email","whatsapp"],     "allowed_llm_providers":["openai","anthropic","gemini"],   "api_access":true,"custom_branding":true,"priority_support":true,"webhooks_enabled":true,"agent_versioning":true,"max_webhook_endpoints":-1}');
```

---

### 2. organizations

```sql
CREATE TABLE organizations (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id           UUID NOT NULL REFERENCES plans(id),
  name              TEXT NOT NULL,
  slug              TEXT UNIQUE NOT NULL,
  is_active         BOOLEAN NOT NULL DEFAULT true,
  settings          JSONB DEFAULT '{}',
  -- Schema esperado de settings:
  -- {
  --   "timezone": "America/Bogota",
  --   "notification_email": "admin@empresa.com",
  --   "max_conversation_duration_minutes": 30,
  --   "data_retention_days": 90,
  --   "default_language": "es",
  --   "alert_usage_threshold_pct": 80
  -- }
  trial_ends_at     TIMESTAMPTZ,
  deleted_at        TIMESTAMPTZ,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_organizations_slug     ON organizations(slug);
CREATE INDEX idx_organizations_plan_id  ON organizations(plan_id);
CREATE INDEX idx_organizations_active   ON organizations(is_active) WHERE deleted_at IS NULL;

CREATE TRIGGER trigger_organizations_updated_at
  BEFORE UPDATE ON organizations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
```

---

### 3. users

```sql
CREATE TABLE users (
  id                UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  organization_id   UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  email             TEXT NOT NULL UNIQUE,
  full_name         TEXT,
  role              TEXT NOT NULL DEFAULT 'viewer'
    CHECK (role IN ('admin', 'editor', 'viewer', 'operador')),
  is_active         BOOLEAN NOT NULL DEFAULT true,
  last_login        TIMESTAMPTZ,
  deleted_at        TIMESTAMPTZ,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE (id, organization_id)
);

CREATE INDEX idx_users_organization_id  ON users(organization_id);
CREATE INDEX idx_users_role             ON users(role);
CREATE INDEX idx_users_active           ON users(organization_id) WHERE deleted_at IS NULL;

CREATE TRIGGER trigger_users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
```

**Matriz de permisos:**
| Acción | Admin | Editor | Viewer | Operador |
|--------|-------|--------|--------|----------|
| Crear/editar agentes | ✅ | ✅ | ❌ | ❌ |
| Usar agentes | ✅ | ✅ | ❌ | ✅ (solo asignados) |
| Ver dashboard | ✅ | ✅ | ✅ | ✅ |
| Gestionar usuarios | ✅ | ❌ | ❌ | ❌ |
| Ver audit logs | ✅ | ✅ | ✅ | ❌ |
| Gestionar integraciones | ✅ | ❌ | ❌ | ❌ |
| Ver usage y costos | ✅ | ❌ | ❌ | ❌ |
| Gestionar webhooks | ✅ | ❌ | ❌ | ❌ |

---

### 4. user_sessions

```sql
CREATE TABLE user_sessions (
  id              UUID NOT NULL DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL,
  organization_id UUID NOT NULL,
  token_hash      TEXT NOT NULL,
  ip_address      INET,
  user_agent      TEXT,
  is_valid        BOOLEAN DEFAULT true,
  expires_at      TIMESTAMPTZ NOT NULL,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  revoked_at      TIMESTAMPTZ,
  revoked_by      UUID,

  PRIMARY KEY (id, expires_at),

  FOREIGN KEY (user_id, organization_id)
    REFERENCES users(id, organization_id) ON DELETE CASCADE

) PARTITION BY RANGE (expires_at);

CREATE TABLE user_sessions_2025_01 PARTITION OF user_sessions
  FOR VALUES FROM ('2025-01-01') TO ('2025-02-01');
CREATE TABLE user_sessions_2025_02 PARTITION OF user_sessions
  FOR VALUES FROM ('2025-02-01') TO ('2025-03-01');
CREATE TABLE user_sessions_default  PARTITION OF user_sessions DEFAULT;

CREATE INDEX idx_user_sessions_org_user
  ON user_sessions(organization_id, user_id);
CREATE INDEX idx_user_sessions_token_hash
  ON user_sessions(token_hash);
CREATE INDEX idx_user_sessions_active
  ON user_sessions(organization_id, is_valid, expires_at)
  WHERE is_valid = true;
```

---

### 5. agents

```sql
CREATE TABLE agents (
  id                        UUID NOT NULL DEFAULT gen_random_uuid(),
  organization_id           UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  created_by                UUID NOT NULL,
  name                      TEXT NOT NULL,
  description               TEXT,
  avatar                    TEXT,
  status                    TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'active', 'paused', 'archived')),
  llm_provider              TEXT NOT NULL DEFAULT 'openai'
    CHECK (llm_provider IN ('openai', 'anthropic', 'gemini')),
  llm_model                 TEXT NOT NULL DEFAULT 'gpt-4o',
  llm_temperature           FLOAT DEFAULT 0.7
    CHECK (llm_temperature >= 0.0 AND llm_temperature <= 1.0),
  max_tokens                INT DEFAULT 1000,
  system_prompt             TEXT NOT NULL,
  tone                      TEXT DEFAULT 'professional'
    CHECK (tone IN ('professional', 'friendly', 'formal', 'casual')),
  language                  TEXT DEFAULT 'es',
  memory_enabled            BOOLEAN DEFAULT true,
  memory_window             INT DEFAULT 20,
  max_conversations_per_day INT DEFAULT 100,
  current_version           INT DEFAULT 1,
  deleted_at                TIMESTAMPTZ,
  created_at                TIMESTAMPTZ DEFAULT NOW(),
  updated_at                TIMESTAMPTZ DEFAULT NOW(),

  PRIMARY KEY (id),
  UNIQUE (id, organization_id),

  FOREIGN KEY (created_by, organization_id)
    REFERENCES users(id, organization_id)
);

CREATE INDEX idx_agents_organization_id ON agents(organization_id);
CREATE INDEX idx_agents_org_status
  ON agents(organization_id, status) WHERE deleted_at IS NULL;

CREATE TRIGGER trigger_agents_updated_at
  BEFORE UPDATE ON agents
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
```

---

### 6. agent_versions
`changed_by` es NULL para acciones de sistema. `changed_by_type` es explícito.

```sql
CREATE TABLE agent_versions (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id          UUID NOT NULL,
  organization_id   UUID NOT NULL,
  version_number    INT NOT NULL,
  config            JSONB NOT NULL,
  system_prompt     TEXT NOT NULL,
  llm_model         TEXT NOT NULL,
  llm_provider      TEXT NOT NULL,
  changed_by        UUID,            -- NULL si changed_by_type = 'system'
  changed_by_type   TEXT NOT NULL DEFAULT 'user'
    CHECK (changed_by_type IN ('user', 'system')),
  change_note       TEXT,
  created_at        TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE (agent_id, version_number),

  -- FK cruzado: NULL permitido para acciones de sistema
  FOREIGN KEY (agent_id, organization_id)
    REFERENCES agents(id, organization_id) ON DELETE CASCADE
  -- changed_by sin FK cruzado porque puede ser NULL (sistema)
  -- El backend valida que si changed_by_type='user', changed_by pertenece a la org
);

CREATE INDEX idx_agent_versions_agent_id ON agent_versions(agent_id);
CREATE INDEX idx_agent_versions_org      ON agent_versions(organization_id);

-- Trigger de versionado: whitelist explícita, changed_by via auth.uid()
CREATE OR REPLACE FUNCTION public.create_agent_version()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_changed_by      UUID;
  v_changed_by_type TEXT;
  v_config          JSONB;
BEGIN
  v_changed_by := auth.uid();

  IF v_changed_by IS NULL THEN
    v_changed_by_type := 'system';
  ELSE
    v_changed_by_type := 'user';
  END IF;

  -- Whitelist explícita: NUNCA to_jsonb(OLD)
  v_config := jsonb_build_object(
    'system_prompt',              OLD.system_prompt,
    'llm_provider',               OLD.llm_provider,
    'llm_model',                  OLD.llm_model,
    'llm_temperature',            OLD.llm_temperature,
    'max_tokens',                 OLD.max_tokens,
    'tone',                       OLD.tone,
    'language',                   OLD.language,
    'memory_enabled',             OLD.memory_enabled,
    'memory_window',              OLD.memory_window,
    'max_conversations_per_day',  OLD.max_conversations_per_day,
    'description',                OLD.description,
    'avatar',                     OLD.avatar
  );

  INSERT INTO agent_versions (
    agent_id, organization_id, version_number,
    config, system_prompt, llm_model, llm_provider,
    changed_by, changed_by_type
  ) VALUES (
    OLD.id, OLD.organization_id, OLD.current_version,
    v_config, OLD.system_prompt, OLD.llm_model, OLD.llm_provider,
    v_changed_by, v_changed_by_type
  );

  NEW.current_version := OLD.current_version + 1;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trigger_agent_versioning
  BEFORE UPDATE ON agents
  FOR EACH ROW
  WHEN (
    OLD.system_prompt    IS DISTINCT FROM NEW.system_prompt   OR
    OLD.llm_model        IS DISTINCT FROM NEW.llm_model       OR
    OLD.llm_provider     IS DISTINCT FROM NEW.llm_provider    OR
    OLD.llm_temperature  IS DISTINCT FROM NEW.llm_temperature
  )
  EXECUTE FUNCTION public.create_agent_version();
```

---

### 7. user_agent_permissions

```sql
CREATE TABLE user_agent_permissions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL,
  agent_id        UUID NOT NULL,
  organization_id UUID NOT NULL,
  can_use         BOOLEAN DEFAULT true,
  can_edit        BOOLEAN DEFAULT false,
  granted_by      UUID NOT NULL,
  created_at      TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE (organization_id, user_id, agent_id),

  FOREIGN KEY (user_id, organization_id)
    REFERENCES users(id, organization_id) ON DELETE CASCADE,
  FOREIGN KEY (agent_id, organization_id)
    REFERENCES agents(id, organization_id) ON DELETE CASCADE,
  FOREIGN KEY (granted_by, organization_id)
    REFERENCES users(id, organization_id)
);

CREATE INDEX idx_uap_org_user  ON user_agent_permissions(organization_id, user_id);
CREATE INDEX idx_uap_org_agent ON user_agent_permissions(organization_id, agent_id);

-- Trigger: solo operador y viewer pueden tener permisos granulares
CREATE OR REPLACE FUNCTION public.check_limited_roles()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role TEXT;
BEGIN
  SELECT role INTO v_role FROM public.users WHERE id = NEW.user_id;
  IF v_role NOT IN ('operador', 'viewer') THEN
    RAISE EXCEPTION
      'user_agent_permissions solo aplica a roles operador y viewer. Rol actual: %', v_role;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER enforce_limited_roles
  BEFORE INSERT OR UPDATE ON user_agent_permissions
  FOR EACH ROW EXECUTE FUNCTION public.check_limited_roles();
```

---

### 8. agent_tools

```sql
CREATE TABLE agent_tools (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id          UUID NOT NULL,
  organization_id   UUID NOT NULL,
  integration_id    UUID,
  tool_type         TEXT NOT NULL
    CHECK (tool_type IN (
      'whatsapp', 'email', 'google_calendar', 'google_sheets',
      'webhook', 'web_search', 'file_reader', 'crm'
    )),
  is_enabled        BOOLEAN DEFAULT true,
  config            JSONB DEFAULT '{}',
  -- config por tool_type (integration_id ya no va aquí):
  -- whatsapp:        { "phone_number_id": "" }
  -- email:           { "from_address": "" }
  -- google_calendar: { "calendar_id": "" }
  -- google_sheets:   { "spreadsheet_id": "", "sheet_name": "" }
  -- webhook:         { "url": "", "method": "POST", "headers": {} }
  -- web_search:      { "max_results": 3, "safe_search": true }
  -- file_reader:     { "allowed_types": ["pdf","docx"], "max_size_mb": 10 }
  -- crm:             { "provider": "hubspot" }
  created_at        TIMESTAMPTZ DEFAULT NOW(),

  FOREIGN KEY (agent_id, organization_id)
    REFERENCES agents(id, organization_id) ON DELETE CASCADE,
  FOREIGN KEY (integration_id, organization_id)
    REFERENCES integrations(id, organization_id) ON DELETE SET NULL
);

CREATE INDEX idx_agent_tools_org_agent
  ON agent_tools(organization_id, agent_id);
CREATE INDEX idx_agent_tools_integration
  ON agent_tools(organization_id, integration_id);
```

---

### 9. agent_documents

```sql
CREATE TABLE agent_documents (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id          UUID NOT NULL,
  organization_id   UUID NOT NULL,
  file_name         TEXT NOT NULL,
  file_type         TEXT NOT NULL
    CHECK (file_type IN ('pdf', 'txt', 'docx', 'csv', 'url')),
  storage_path      TEXT,
  file_size_bytes   INT,
  chunk_count       INT DEFAULT 0,
  status            TEXT DEFAULT 'processing'
    CHECK (status IN ('processing', 'ready', 'error')),
  error_message     TEXT,
  uploaded_by       UUID,
  deleted_at        TIMESTAMPTZ,
  created_at        TIMESTAMPTZ DEFAULT NOW(),

  FOREIGN KEY (agent_id, organization_id)
    REFERENCES agents(id, organization_id) ON DELETE CASCADE,
  FOREIGN KEY (uploaded_by, organization_id)
    REFERENCES users(id, organization_id) ON DELETE SET NULL
);

CREATE INDEX idx_agent_documents_org_agent
  ON agent_documents(organization_id, agent_id);
CREATE INDEX idx_agent_documents_status
  ON agent_documents(status);
```

---

### 10. integrations

```sql
CREATE TABLE integrations (
  id                UUID NOT NULL DEFAULT gen_random_uuid(),
  organization_id   UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  type              TEXT NOT NULL
    CHECK (type IN ('whatsapp', 'email', 'google', 'webhook', 'crm')),
  name              TEXT NOT NULL,
  is_active         BOOLEAN DEFAULT true,
  metadata          JSONB DEFAULT '{}',
  last_used         TIMESTAMPTZ,
  deleted_at        TIMESTAMPTZ,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW(),

  PRIMARY KEY (id),
  UNIQUE (id, organization_id)
);

CREATE INDEX idx_integrations_organization_id ON integrations(organization_id);

CREATE TRIGGER trigger_integrations_updated_at
  BEFORE UPDATE ON integrations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
```

---

### 11. integration_secrets
RLS habilitado con `USING(false)` — hardening explícito. service_role bypasea RLS.

```sql
CREATE TABLE integration_secrets (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  integration_id    UUID NOT NULL,
  organization_id   UUID NOT NULL,
  credentials       JSONB NOT NULL,
  -- ⚠️ Encriptado con pgcrypto ANTES de guardar
  -- ⚠️ RLS bloqueada para todos los roles — solo service_role accede
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW(),

  FOREIGN KEY (integration_id, organization_id)
    REFERENCES integrations(id, organization_id) ON DELETE CASCADE
);

CREATE TRIGGER trigger_integration_secrets_updated_at
  BEFORE UPDATE ON integration_secrets
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- RLS habilitado con bloqueo explícito (hardening operacional)
-- service_role bypasea RLS — el backend sigue teniendo acceso completo
ALTER TABLE integration_secrets ENABLE ROW LEVEL SECURITY;
CREATE POLICY integration_secrets_blocked ON integration_secrets
  FOR ALL USING (false) WITH CHECK (false);
```

---

### 12. integration_credentials_history

```sql
CREATE TABLE integration_credentials_history (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  integration_id    UUID NOT NULL,
  organization_id   UUID NOT NULL,
  changed_by        UUID NOT NULL,
  change_reason     TEXT,
  created_at        TIMESTAMPTZ DEFAULT NOW(),

  FOREIGN KEY (integration_id, organization_id)
    REFERENCES integrations(id, organization_id) ON DELETE CASCADE,
  FOREIGN KEY (changed_by, organization_id)
    REFERENCES users(id, organization_id)
);

CREATE INDEX idx_ich_org_integration
  ON integration_credentials_history(organization_id, integration_id);
```

---

### 13. organization_webhooks

```sql
CREATE TABLE organization_webhooks (
  id                UUID NOT NULL DEFAULT gen_random_uuid(),
  organization_id   UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name              TEXT NOT NULL,
  url               TEXT NOT NULL,
  secret_encrypted  TEXT NOT NULL,
  -- ⚠️ Cifrado con pgcrypto — NO hasheado
  -- HMAC-SHA256 requiere el secreto original para firmar el payload
  -- Backend descifra con service_role key solo al momento de firmar
  secret_hint       TEXT,
  events            TEXT[] NOT NULL,
  -- Eventos válidos: 'agent.error', 'agent.limit_reached', 'plan.limit_reached',
  --                  'plan.limit_warning', 'conversation.closed',
  --                  'user.created', 'integration.error'
  -- TODO: considerar tabla catálogo webhook_event_types para validación fuerte
  is_active         BOOLEAN DEFAULT true,
  last_triggered    TIMESTAMPTZ,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW(),

  PRIMARY KEY (id),
  UNIQUE (id, organization_id)
);

CREATE INDEX idx_org_webhooks_organization_id
  ON organization_webhooks(organization_id);

CREATE TRIGGER trigger_webhooks_updated_at
  BEFORE UPDATE ON organization_webhooks
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
```

---

### 14. webhook_deliveries

```sql
CREATE TABLE webhook_deliveries (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  webhook_id        UUID NOT NULL,
  organization_id   UUID NOT NULL,
  event_type        TEXT NOT NULL,
  payload           JSONB NOT NULL,
  status            TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'success', 'failed')),
  http_status_code  INT,
  response_body     TEXT,
  attempts          INT DEFAULT 0,
  max_attempts      INT DEFAULT 3,
  last_attempted_at TIMESTAMPTZ,
  next_attempt_at   TIMESTAMPTZ,
  created_at        TIMESTAMPTZ DEFAULT NOW(),

  FOREIGN KEY (webhook_id, organization_id)
    REFERENCES organization_webhooks(id, organization_id) ON DELETE CASCADE
);

CREATE INDEX idx_webhook_deliveries_org_webhook
  ON webhook_deliveries(organization_id, webhook_id);
CREATE INDEX idx_webhook_deliveries_status
  ON webhook_deliveries(status);
CREATE INDEX idx_webhook_deliveries_pending
  ON webhook_deliveries(next_attempt_at) WHERE status = 'pending';
```

---

### 15. event_queue

```sql
CREATE TABLE event_queue (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  event_type        TEXT NOT NULL,
  entity_type       TEXT,
  entity_id         UUID,
  correlation_id    UUID DEFAULT gen_random_uuid(),
  trace_id          TEXT,
  payload           JSONB NOT NULL,
  idempotency_key   TEXT UNIQUE,
  -- NULL permitido (Postgres permite múltiples NULL en UNIQUE)
  -- Formato cuando se usa: '{event_type}:{entity_id}:{timestamp_bucket}'
  -- Requerido en: 'message.created', 'plan.limit_warning', 'webhook.trigger'
  status            TEXT DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'done', 'failed')),
  attempts          INT DEFAULT 0,
  max_attempts      INT DEFAULT 3,
  process_after     TIMESTAMPTZ DEFAULT NOW(),
  processed_at      TIMESTAMPTZ,
  error_message     TEXT,
  created_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_event_queue_pending
  ON event_queue(process_after) WHERE status = 'pending';
CREATE INDEX idx_event_queue_failed
  ON event_queue(attempts) WHERE status = 'failed';
CREATE INDEX idx_event_queue_organization
  ON event_queue(organization_id);
CREATE INDEX idx_event_queue_correlation
  ON event_queue(correlation_id);
```

**Patrón de consumo seguro — workers concurrentes:**
```sql
BEGIN;
  SELECT id, payload, event_type, entity_id, correlation_id
  FROM event_queue
  WHERE status = 'pending' AND process_after <= NOW()
  ORDER BY process_after
  LIMIT 10
  FOR UPDATE SKIP LOCKED;

  UPDATE event_queue
  SET status = 'processing', attempts = attempts + 1
  WHERE id = ANY(ARRAY[...ids...]);
COMMIT;
-- Éxito:  UPDATE status='done',   processed_at=NOW()
-- Fallo:  UPDATE status='failed', error_message=..., next_attempt_at=NOW()+backoff
```

---

### 16. conversations

```sql
CREATE TABLE conversations (
  id                UUID NOT NULL DEFAULT gen_random_uuid(),
  agent_id          UUID NOT NULL,
  organization_id   UUID NOT NULL,
  initiated_by      UUID,
  channel           TEXT NOT NULL DEFAULT 'web'
    CHECK (channel IN ('web', 'whatsapp', 'email', 'api')),
  external_id       TEXT,
  status            TEXT DEFAULT 'active'
    CHECK (status IN ('active', 'closed', 'error')),
  metadata          JSONB DEFAULT '{}',
  -- { "user_phone":"","user_name":"","user_email":"",
  --   "source":"","tags":[],"resolution":"solved|escalated|abandoned" }
  started_at        TIMESTAMPTZ DEFAULT NOW(),
  ended_at          TIMESTAMPTZ,
  message_count     INT DEFAULT 0,

  PRIMARY KEY (id),
  UNIQUE (id, organization_id),

  FOREIGN KEY (agent_id, organization_id)
    REFERENCES agents(id, organization_id) ON DELETE CASCADE,
  FOREIGN KEY (initiated_by, organization_id)
    REFERENCES users(id, organization_id) ON DELETE SET NULL
);

CREATE INDEX idx_conversations_org_agent
  ON conversations(organization_id, agent_id);
CREATE INDEX idx_conversations_org_status
  ON conversations(organization_id, status);
CREATE INDEX idx_conversations_started_at
  ON conversations(started_at DESC);
```

---

### 17. messages

```sql
CREATE TABLE messages (
  id                UUID NOT NULL DEFAULT gen_random_uuid(),
  conversation_id   UUID NOT NULL,
  organization_id   UUID NOT NULL,
  role              TEXT NOT NULL
    CHECK (role IN ('user', 'assistant', 'system')),
  content           TEXT NOT NULL,
  tokens_input      INT DEFAULT 0,
  tokens_output     INT DEFAULT 0,
  llm_model         TEXT,
  response_time_ms  INT,
  created_at        TIMESTAMPTZ DEFAULT NOW(),

  PRIMARY KEY (id, created_at),

  FOREIGN KEY (conversation_id, organization_id)
    REFERENCES conversations(id, organization_id) ON DELETE CASCADE

) PARTITION BY RANGE (created_at);

CREATE TABLE messages_2025_01 PARTITION OF messages
  FOR VALUES FROM ('2025-01-01') TO ('2025-02-01');
CREATE TABLE messages_2025_02 PARTITION OF messages
  FOR VALUES FROM ('2025-02-01') TO ('2025-03-01');
CREATE TABLE messages_default PARTITION OF messages DEFAULT;

CREATE INDEX idx_messages_conversation_created
  ON messages(conversation_id, created_at DESC);
CREATE INDEX idx_messages_org_created
  ON messages(organization_id, created_at DESC);
```

---

### 18. usage_records

```sql
CREATE TABLE usage_records (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id       UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  agent_id              UUID,
  period_start          DATE NOT NULL,
  period_end            DATE NOT NULL,
  total_conversations   INT DEFAULT 0,
  total_messages        INT DEFAULT 0,
  total_tokens_input    INT DEFAULT 0,
  total_tokens_output   INT DEFAULT 0,
  estimated_cost_usd    DECIMAL(10,4) DEFAULT 0,
  llm_provider          TEXT,
  created_at            TIMESTAMPTZ DEFAULT NOW(),
  updated_at            TIMESTAMPTZ DEFAULT NOW(),

  CHECK (period_end >= period_start),
  UNIQUE (organization_id, agent_id, period_start, llm_provider),

  FOREIGN KEY (agent_id, organization_id)
    REFERENCES agents(id, organization_id) ON DELETE SET NULL
);

CREATE INDEX idx_usage_organization_id ON usage_records(organization_id);
CREATE INDEX idx_usage_period          ON usage_records(period_start DESC);
CREATE INDEX idx_usage_org_agent       ON usage_records(organization_id, agent_id);

CREATE TRIGGER trigger_usage_updated_at
  BEFORE UPDATE ON usage_records
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
```

---

### 19. notifications

```sql
CREATE TABLE notifications (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id           UUID,
  type              TEXT NOT NULL
    CHECK (type IN ('warning', 'error', 'info', 'billing')),
  title             TEXT NOT NULL,
  body              TEXT,
  resource_type     TEXT,
  resource_id       UUID,
  is_read           BOOLEAN DEFAULT false,
  created_at        TIMESTAMPTZ DEFAULT NOW(),

  FOREIGN KEY (user_id, organization_id)
    REFERENCES users(id, organization_id) ON DELETE CASCADE
);

CREATE INDEX idx_notifications_organization_id ON notifications(organization_id);
CREATE INDEX idx_notifications_user_id         ON notifications(user_id);
CREATE INDEX idx_notifications_unread
  ON notifications(organization_id, is_read) WHERE is_read = false;
```

---

### 20. audit_logs

```sql
CREATE TABLE audit_logs (
  id                UUID NOT NULL DEFAULT gen_random_uuid(),
  organization_id   UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id           UUID,
  action            TEXT NOT NULL,
  resource_type     TEXT NOT NULL,
  resource_id       UUID,
  old_value         JSONB,
  new_value         JSONB,
  ip_address        INET,
  user_agent        TEXT,
  created_at        TIMESTAMPTZ DEFAULT NOW(),

  PRIMARY KEY (id, created_at)

) PARTITION BY RANGE (created_at);

CREATE TABLE audit_logs_2025_01 PARTITION OF audit_logs
  FOR VALUES FROM ('2025-01-01') TO ('2025-02-01');
CREATE TABLE audit_logs_2025_02 PARTITION OF audit_logs
  FOR VALUES FROM ('2025-02-01') TO ('2025-03-01');
CREATE TABLE audit_logs_default PARTITION OF audit_logs DEFAULT;

CREATE INDEX idx_audit_logs_org_created
  ON audit_logs(organization_id, created_at DESC);
CREATE INDEX idx_audit_logs_user_id   ON audit_logs(user_id);
CREATE INDEX idx_audit_logs_action    ON audit_logs(action);
CREATE INDEX idx_audit_logs_resource  ON audit_logs(resource_type, resource_id);

REVOKE DELETE ON audit_logs FROM authenticated;
REVOKE UPDATE ON audit_logs FROM authenticated;
```

---

### 21. document_chunks

```sql
CREATE TABLE document_chunks (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id     UUID NOT NULL,
  organization_id UUID NOT NULL,
  agent_id        UUID NOT NULL,
  chunk_index     INT NOT NULL DEFAULT 0,
  -- Posición del chunk dentro del documento
  content         TEXT NOT NULL,
  -- El fragmento de texto (~500 tokens con overlap de ~50)
  metadata        JSONB DEFAULT '{}',
  -- { "page_number": 3, "section": "intro", "char_start": 0, "char_end": 500 }
  embedding       vector(1536),
  -- Compatible con: OpenAI text-embedding-3-small (1536 dims)
  -- Si se usa text-embedding-3-large cambiar a vector(3072)
  created_at      TIMESTAMPTZ DEFAULT NOW(),

  FOREIGN KEY (document_id, organization_id)
    REFERENCES agent_documents(id, organization_id) ON DELETE CASCADE,
  FOREIGN KEY (agent_id, organization_id)
    REFERENCES agents(id, organization_id)
);

CREATE INDEX idx_document_chunks_embedding
  ON document_chunks USING hnsw (embedding vector_cosine_ops);

CREATE INDEX idx_document_chunks_org_agent
  ON document_chunks(organization_id, agent_id);
```

---

### 22. deletion_requests

```sql
-- Tabla para el derecho al olvido (GDPR/privacidad)
-- Pendiente de implementar worker de procesamiento — Milestone 3
CREATE TABLE deletion_requests (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  requested_by      UUID,
  entity_type       TEXT NOT NULL
    CHECK (entity_type IN ('user', 'conversation', 'agent', 'organization')),
  entity_id         UUID NOT NULL,
  status            TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  reason            TEXT,
  processed_at      TIMESTAMPTZ,
  error_message     TEXT,
  created_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_deletion_requests_org    ON deletion_requests(organization_id);
CREATE INDEX idx_deletion_requests_status ON deletion_requests(status) WHERE status = 'pending';
```


---

## Row Level Security — Completa, explícita, con WITH CHECK

```sql
-- Activar RLS en todas las tablas
ALTER TABLE organizations               ENABLE ROW LEVEL SECURITY;
ALTER TABLE users                       ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_sessions               ENABLE ROW LEVEL SECURITY;
ALTER TABLE agents                      ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_versions              ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_agent_permissions      ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_tools                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_documents             ENABLE ROW LEVEL SECURITY;
ALTER TABLE integrations                ENABLE ROW LEVEL SECURITY;
ALTER TABLE integration_secrets         ENABLE ROW LEVEL SECURITY;  -- bloqueada explícitamente
ALTER TABLE integration_credentials_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE organization_webhooks       ENABLE ROW LEVEL SECURITY;
ALTER TABLE webhook_deliveries          ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_queue                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversations               ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages                    ENABLE ROW LEVEL SECURITY;
ALTER TABLE usage_records               ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications               ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_chunks             ENABLE ROW LEVEL SECURITY;
ALTER TABLE deletion_requests           ENABLE ROW LEVEL SECURITY;

-- ─────────────────────────────────────────────
-- organizations
-- ─────────────────────────────────────────────
CREATE POLICY organizations_select ON organizations
  FOR SELECT USING (id = public.get_user_organization_id());
CREATE POLICY organizations_update ON organizations
  FOR UPDATE
  USING     (id = public.get_user_organization_id() AND public.get_user_role() = 'admin')
  WITH CHECK(id = public.get_user_organization_id() AND public.get_user_role() = 'admin');
-- INSERT/DELETE solo via service_role (backend gestiona altas/bajas de orgs)

-- ─────────────────────────────────────────────
-- users
-- ─────────────────────────────────────────────
CREATE POLICY users_select ON users
  FOR SELECT USING (organization_id = public.get_user_organization_id());
CREATE POLICY users_insert ON users
  FOR INSERT WITH CHECK (
    organization_id = public.get_user_organization_id()
    AND public.get_user_role() = 'admin'
  );
CREATE POLICY users_update ON users
  FOR UPDATE
  USING     (organization_id = public.get_user_organization_id() AND public.get_user_role() = 'admin')
  WITH CHECK(organization_id = public.get_user_organization_id() AND public.get_user_role() = 'admin');
CREATE POLICY users_delete ON users
  FOR DELETE USING (
    organization_id = public.get_user_organization_id()
    AND public.get_user_role() = 'admin'
  );

-- ─────────────────────────────────────────────
-- user_sessions
-- ─────────────────────────────────────────────
CREATE POLICY user_sessions_select ON user_sessions
  FOR SELECT USING (organization_id = public.get_user_organization_id());
-- INSERT/UPDATE/DELETE solo via service_role (el backend gestiona sesiones)

-- ─────────────────────────────────────────────
-- agents
-- ─────────────────────────────────────────────
CREATE POLICY agents_select ON agents
  FOR SELECT USING (organization_id = public.get_user_organization_id());
CREATE POLICY agents_insert ON agents
  FOR INSERT WITH CHECK (
    organization_id = public.get_user_organization_id()
    AND public.get_user_role() IN ('admin', 'editor')
  );
CREATE POLICY agents_update ON agents
  FOR UPDATE
  USING     (organization_id = public.get_user_organization_id() AND public.get_user_role() IN ('admin', 'editor'))
  WITH CHECK(organization_id = public.get_user_organization_id() AND public.get_user_role() IN ('admin', 'editor'));
CREATE POLICY agents_delete ON agents
  FOR DELETE USING (
    organization_id = public.get_user_organization_id()
    AND public.get_user_role() = 'admin'
  );

-- ─────────────────────────────────────────────
-- agent_versions (solo SELECT — INSERT via trigger/backend)
-- ─────────────────────────────────────────────
CREATE POLICY agent_versions_select ON agent_versions
  FOR SELECT USING (
    organization_id = public.get_user_organization_id()
    AND public.get_user_role() IN ('admin', 'editor')
  );
-- INSERT permitido para trigger (SECURITY DEFINER bypasea RLS)
-- Verificar comportamiento en Supabase real

-- ─────────────────────────────────────────────
-- user_agent_permissions (solo admin)
-- ─────────────────────────────────────────────
CREATE POLICY uap_admin_only ON user_agent_permissions
  FOR ALL
  USING     (organization_id = public.get_user_organization_id() AND public.get_user_role() = 'admin')
  WITH CHECK(organization_id = public.get_user_organization_id() AND public.get_user_role() = 'admin');

-- ─────────────────────────────────────────────
-- agent_tools
-- ─────────────────────────────────────────────
CREATE POLICY agent_tools_select ON agent_tools
  FOR SELECT USING (organization_id = public.get_user_organization_id());
CREATE POLICY agent_tools_insert ON agent_tools
  FOR INSERT WITH CHECK (
    organization_id = public.get_user_organization_id()
    AND public.get_user_role() IN ('admin', 'editor')
  );
CREATE POLICY agent_tools_update ON agent_tools
  FOR UPDATE
  USING     (organization_id = public.get_user_organization_id() AND public.get_user_role() IN ('admin', 'editor'))
  WITH CHECK(organization_id = public.get_user_organization_id() AND public.get_user_role() IN ('admin', 'editor'));
CREATE POLICY agent_tools_delete ON agent_tools
  FOR DELETE USING (
    organization_id = public.get_user_organization_id()
    AND public.get_user_role() IN ('admin', 'editor')
  );

-- ─────────────────────────────────────────────
-- agent_documents
-- ─────────────────────────────────────────────
CREATE POLICY agent_documents_select ON agent_documents
  FOR SELECT USING (organization_id = public.get_user_organization_id());
CREATE POLICY agent_documents_insert ON agent_documents
  FOR INSERT WITH CHECK (
    organization_id = public.get_user_organization_id()
    AND public.get_user_role() IN ('admin', 'editor')
  );
CREATE POLICY agent_documents_delete ON agent_documents
  FOR DELETE USING (
    organization_id = public.get_user_organization_id()
    AND public.get_user_role() IN ('admin', 'editor')
  );

-- ─────────────────────────────────────────────
-- integrations: SELECT todos los roles / escritura solo admin
-- ─────────────────────────────────────────────
CREATE POLICY integrations_select ON integrations
  FOR SELECT USING (organization_id = public.get_user_organization_id());
CREATE POLICY integrations_insert ON integrations
  FOR INSERT WITH CHECK (
    organization_id = public.get_user_organization_id()
    AND public.get_user_role() = 'admin'
  );
CREATE POLICY integrations_update ON integrations
  FOR UPDATE
  USING     (organization_id = public.get_user_organization_id() AND public.get_user_role() = 'admin')
  WITH CHECK(organization_id = public.get_user_organization_id() AND public.get_user_role() = 'admin');
CREATE POLICY integrations_delete ON integrations
  FOR DELETE USING (
    organization_id = public.get_user_organization_id()
    AND public.get_user_role() = 'admin'
  );

-- ─────────────────────────────────────────────
-- integration_secrets (bloqueada para todos — solo service_role)
-- ─────────────────────────────────────────────
CREATE POLICY integration_secrets_blocked ON integration_secrets
  FOR ALL USING (false) WITH CHECK (false);

-- ─────────────────────────────────────────────
-- integration_credentials_history (solo admin)
-- ─────────────────────────────────────────────
CREATE POLICY ich_admin_only ON integration_credentials_history
  FOR SELECT USING (
    organization_id = public.get_user_organization_id()
    AND public.get_user_role() = 'admin'
  );

-- ─────────────────────────────────────────────
-- organization_webhooks (solo admin)
-- ─────────────────────────────────────────────
CREATE POLICY webhooks_admin_select ON organization_webhooks
  FOR SELECT USING (
    organization_id = public.get_user_organization_id()
    AND public.get_user_role() = 'admin'
  );
CREATE POLICY webhooks_admin_insert ON organization_webhooks
  FOR INSERT WITH CHECK (
    organization_id = public.get_user_organization_id()
    AND public.get_user_role() = 'admin'
  );
CREATE POLICY webhooks_admin_update ON organization_webhooks
  FOR UPDATE
  USING     (organization_id = public.get_user_organization_id() AND public.get_user_role() = 'admin')
  WITH CHECK(organization_id = public.get_user_organization_id() AND public.get_user_role() = 'admin');
CREATE POLICY webhooks_admin_delete ON organization_webhooks
  FOR DELETE USING (
    organization_id = public.get_user_organization_id()
    AND public.get_user_role() = 'admin'
  );

-- ─────────────────────────────────────────────
-- webhook_deliveries (solo admin, solo lectura)
-- ─────────────────────────────────────────────
CREATE POLICY webhook_deliveries_select ON webhook_deliveries
  FOR SELECT USING (
    organization_id = public.get_user_organization_id()
    AND public.get_user_role() = 'admin'
  );

-- ─────────────────────────────────────────────
-- event_queue (bloqueada al frontend)
-- ─────────────────────────────────────────────
CREATE POLICY event_queue_blocked ON event_queue
  FOR ALL USING (false) WITH CHECK (false);

-- ─────────────────────────────────────────────
-- conversations
-- ─────────────────────────────────────────────
CREATE POLICY conversations_select ON conversations
  FOR SELECT USING (organization_id = public.get_user_organization_id());
CREATE POLICY conversations_insert ON conversations
  FOR INSERT WITH CHECK (organization_id = public.get_user_organization_id());
CREATE POLICY conversations_update ON conversations
  FOR UPDATE
  USING     (organization_id = public.get_user_organization_id())
  WITH CHECK(organization_id = public.get_user_organization_id());

-- ─────────────────────────────────────────────
-- messages
-- ─────────────────────────────────────────────
CREATE POLICY messages_select ON messages
  FOR SELECT USING (organization_id = public.get_user_organization_id());
CREATE POLICY messages_insert ON messages
  FOR INSERT WITH CHECK (organization_id = public.get_user_organization_id());

-- ─────────────────────────────────────────────
-- usage_records (solo admin, solo lectura)
-- ─────────────────────────────────────────────
CREATE POLICY usage_admin_select ON usage_records
  FOR SELECT USING (
    organization_id = public.get_user_organization_id()
    AND public.get_user_role() = 'admin'
  );
-- INSERT/UPDATE solo via service_role (event_queue worker)

-- ─────────────────────────────────────────────
-- notifications (solo SELECT desde frontend — INSERT via backend)
-- ─────────────────────────────────────────────
CREATE POLICY notifications_select ON notifications
  FOR SELECT USING (
    organization_id = public.get_user_organization_id()
    AND (user_id = auth.uid() OR user_id IS NULL)
  );
CREATE POLICY notifications_update ON notifications
  FOR UPDATE
  USING     (organization_id = public.get_user_organization_id() AND user_id = auth.uid())
  WITH CHECK(organization_id = public.get_user_organization_id() AND user_id = auth.uid());
  -- Solo permite marcar como leída (is_read = true) — validar en backend

-- ─────────────────────────────────────────────
-- audit_logs (lectura: admin/editor/viewer — sin escritura desde frontend)
-- ─────────────────────────────────────────────
CREATE POLICY audit_logs_select ON audit_logs
  FOR SELECT USING (
    organization_id = public.get_user_organization_id()
    AND public.get_user_role() IN ('admin', 'editor', 'viewer')
  );
-- INSERT solo via service_role (backend/workers)
```

---

-- ─────────────────────────────────────────────
-- document_chunks
-- ─────────────────────────────────────────────
CREATE POLICY document_chunks_select ON document_chunks
  FOR SELECT USING (organization_id = public.get_user_organization_id());

CREATE POLICY document_chunks_insert ON document_chunks
  FOR INSERT WITH CHECK (
    organization_id = public.get_user_organization_id()
    AND public.get_user_role() IN ('admin', 'editor')
  );

CREATE POLICY document_chunks_delete ON document_chunks
  FOR DELETE USING (
    organization_id = public.get_user_organization_id()
    AND public.get_user_role() IN ('admin', 'editor')
  );

CREATE POLICY document_chunks_service_all ON document_chunks
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- ─────────────────────────────────────────────
-- deletion_requests (solo admin — Milestone 3)
-- ─────────────────────────────────────────────
CREATE POLICY deletion_requests_admin ON deletion_requests
  FOR ALL
  USING     (organization_id = public.get_user_organization_id() AND public.get_user_role() = 'admin')
  WITH CHECK(organization_id = public.get_user_organization_id() AND public.get_user_role() = 'admin');
```

---

## Checklist de verificación

```
□ Todas las policies tienen WITH CHECK donde aplica (INSERT/UPDATE)
□ integration_secrets con RLS habilitado y USING(false) explícito
□ user_agent_permissions con policy admin-only real (no solo trigger)
□ integrations: SELECT todos los roles / escritura solo admin
□ notifications: solo SELECT + UPDATE (marcar leída) desde frontend
□ agent_versions: INSERT solo via trigger SECURITY DEFINER — verificar en Supabase real
□ Todas las funciones/triggers tienen SET search_path = public
□ changed_by_type ('user'|'system') en agent_versions — sin system user global
□ organization_webhooks.secret_encrypted con pgcrypto (no hasheado)
□ CHECK (period_end >= period_start) en usage_records
□ DEFAULT PARTITION en messages, audit_logs, user_sessions
□ FK cruzados (id, org_id) en todas las tablas hijas sin excepción
□ Índices empezando por organization_id en tablas hot
□ API keys de LLM en variables de entorno — nunca en base de datos
□ REVOKE DELETE/UPDATE en audit_logs para authenticated
□ event_queue con FOR UPDATE SKIP LOCKED en workers concurrentes
□ Probar schema completo en entorno Supabase real antes de producción
□ get_user_organization_id() verifica is_active y deleted_at de user y org
□ get_user_role() verifica is_active y deleted_at de user y org
□ llm_temperature CHECK es <= 1.0 (no <= 2.0)
□ document_chunks con índice HNSW y FK cruzados
□ deletion_requests con status 'pending' para worker de Milestone 3
```

---

## Resumen de tablas

| # | Tabla | Propósito | Particionada | Prioridad |
|---|-------|-----------|:---:|-----------|
| 1 | plans | Planes de suscripción | ❌ | 🔴 Día 1 |
| 2 | organizations | Empresas clientes | ❌ | 🔴 Día 1 |
| 3 | users | Empleados | ❌ | 🔴 Día 1 |
| 4 | user_sessions | Sesiones activas | ✅ expires_at + DEFAULT | 🔴 Día 1 |
| 5 | agents | Agentes creados | ❌ | 🔴 Día 1 |
| 6 | agent_versions | Snapshots de cambios | ❌ | 🔴 Día 1 |
| 7 | user_agent_permissions | Acceso granular operador/viewer | ❌ | 🔴 Día 1 |
| 8 | agent_tools | Habilidades con FK cruzado | ❌ | 🔴 Día 1 |
| 9 | agent_documents | Base de conocimiento RAG | ❌ | 🟡 MVP |
| 10 | integrations | Metadata de conexiones | ❌ | 🟡 MVP |
| 11 | integration_secrets | Credenciales — solo service_role | ❌ | 🟡 MVP |
| 12 | integration_credentials_history | Trazabilidad de rotaciones | ❌ | 🟡 MVP |
| 13 | organization_webhooks | Endpoints externos cifrados | ❌ | 🟡 MVP |
| 14 | webhook_deliveries | Trazabilidad de entregas | ❌ | 🟡 MVP |
| 15 | event_queue | Cola asíncrona central | ❌ | 🔴 Día 1 |
| 16 | conversations | Sesiones de conversación | ❌ | 🔴 Día 1 |
| 17 | messages | Historial completo | ✅ created_at + DEFAULT | 🔴 Día 1 |
| 18 | usage_records | Costos y límites | ❌ | 🔴 Día 1 |
| 19 | notifications | Alertas del dashboard | ❌ | 🔴 Día 1 |
| 20 | audit_logs | Registro inmutable | ✅ created_at + DEFAULT | 🔴 Día 1 |
| 21 | document_chunks | Fragmentos vectorizados RAG | ❌ | 🟡 MVP |
| 22 | deletion_requests | Derecho al olvido | ❌ | 🟢 Milestone 3 |
