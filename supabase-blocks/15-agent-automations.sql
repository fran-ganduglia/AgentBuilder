-- Bloque 15: agent_automations
-- Sistema de automatizaciones tipo trigger → acción → condición
-- Revisar y ejecutar en Supabase antes de desplegar código que lo consuma.

CREATE TABLE agent_automations (
  id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID         NOT NULL REFERENCES organizations(id),
  agent_id        UUID         NOT NULL,

  name            TEXT         NOT NULL CHECK (char_length(name) BETWEEN 1 AND 200),
  description     TEXT,
  is_enabled      BOOLEAN      NOT NULL DEFAULT true,

  -- Trigger: qué activa esta automatización
  -- 'schedule'  → trigger_config: { cron: "0 9 * * 1-5", timezone: "America/Buenos_Aires" }
  -- 'webhook'   → trigger_config: { source: "gmail" | "hubspot" | ... }
  -- 'event'     → trigger_config: { integration: "gmail", event: "new_email", filter: {} }
  trigger_type    TEXT         NOT NULL CHECK (trigger_type IN ('schedule', 'webhook', 'event')),
  trigger_config  JSONB        NOT NULL DEFAULT '{}',

  -- Acción: qué ejecuta el agente al dispararse
  -- 'agent_message'     → action_config: { prompt: "..." }
  -- 'integration_call'  → action_config: { integration: "hubspot", action: "create_task", params: {} }
  -- 'workflow'          → action_config: { workflow_id: "..." }
  action_type     TEXT         NOT NULL CHECK (action_type IN ('agent_message', 'integration_call', 'workflow')),
  action_config   JSONB        NOT NULL DEFAULT '{}',

  -- Condición: filtro opcional antes de ejecutar
  -- Ejemplo: { field: "email.subject", operator: "contains", value: "urgente" }
  condition_config JSONB       NOT NULL DEFAULT '{}',

  last_run_at     TIMESTAMPTZ,
  last_run_status TEXT         CHECK (last_run_status IN ('success', 'failed', 'skipped')),

  created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  deleted_at      TIMESTAMPTZ,

  FOREIGN KEY (agent_id, organization_id) REFERENCES agents (id, organization_id)
);

-- Índices de acceso frecuente
CREATE INDEX agent_automations_agent_idx
  ON agent_automations (agent_id, organization_id)
  WHERE deleted_at IS NULL;

CREATE INDEX agent_automations_schedule_idx
  ON agent_automations (trigger_type, is_enabled)
  WHERE deleted_at IS NULL AND trigger_type = 'schedule';

-- Trigger para updated_at automático
CREATE TRIGGER set_agent_automations_updated_at
  BEFORE UPDATE ON agent_automations
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();

-- RLS
ALTER TABLE agent_automations ENABLE ROW LEVEL SECURITY;

CREATE POLICY agent_automations_select ON agent_automations
  FOR SELECT TO authenticated
  USING (
    organization_id = get_user_organization_id()
    AND deleted_at IS NULL
  );

CREATE POLICY agent_automations_insert ON agent_automations
  FOR INSERT TO authenticated
  WITH CHECK (
    organization_id = get_user_organization_id()
    AND get_user_role() IN ('admin', 'editor')
  );

CREATE POLICY agent_automations_update ON agent_automations
  FOR UPDATE TO authenticated
  USING (
    organization_id = get_user_organization_id()
    AND deleted_at IS NULL
    AND get_user_role() IN ('admin', 'editor')
  )
  WITH CHECK (
    organization_id = get_user_organization_id()
  );

-- DELETE y TRUNCATE revocados: usar soft delete (deleted_at)
REVOKE DELETE ON agent_automations FROM authenticated;
REVOKE TRUNCATE ON agent_automations FROM authenticated;
