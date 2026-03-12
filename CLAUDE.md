# CLAUDE.md — AgentBuilder SaaS
> Claude Code lee este archivo automáticamente al inicio de cada sesión.
> No es necesario pegarlo manualmente.
> Actualizar PROGRESS.md después de cada sesión.
> Schema validado en Supabase real — bloques 1 a 14 ejecutados.

---

## Qué es este proyecto

**AgentBuilder** es un SaaS B2B que permite a empresas crear y gestionar agentes de IA sin conocimientos técnicos. La interfaz está inspirada en el "character creator" de videojuegos — el usuario configura la personalidad, habilidades y comportamiento de su agente de forma visual e intuitiva.

**El cliente paga una suscripción mensual y opera solo** después del onboarding. No es consultoría, es autogestión.

---

## Decisiones de negocio tomadas

```
Modelo:         SaaS B2B — suscripción mensual
Mercado:        Hispanohablante (desatendido en este espacio)
Estrategia:     Horizontal inicialmente (cualquier empresa)
                Verticalizar después según tracción
Diferenciador:  Seguridad bien pensada desde día 1
                Interfaz visual tipo character creator
                No requiere conocimientos técnicos del usuario
Planes:         trial ($0), starter ($29), pro ($99), enterprise (negociado)
```

---

## Stack técnico

```
Frontend:       Next.js + Tailwind → Vercel
                App Router, TypeScript estricto
                API Routes para toda lógica con service_role
Base de datos:  Supabase (PostgreSQL + Auth + Storage + Edge Functions)
Automatización: n8n en Queue Mode con Redis como broker
                n8n orquesta flujos — no piensa, solo conecta sistemas
Gateway IA:     LiteLLM
                Distribuye entre múltiples API keys
                Retry automático, caché de respuestas
                Soporta OpenAI, Anthropic, Gemini
Memoria:        Buffer conversacional → Redis (temporal)
                Historial persistente → Supabase PostgreSQL
                Documentos RAG → pgvector en Supabase (document_chunks)
Embeddings:     OpenAI text-embedding-3-small (vector 1536 dimensiones)
Lógica service_role: Next.js API Routes (mismo repo, más control)
                → Acceso a integration_secrets cifrados
                → Firma de webhooks con HMAC-SHA256
                → Procesamiento de deletion_requests
                → Cualquier operación que bypasee RLS
Costo MVP:      $30-50/mes inicialmente
```

---

## Convenciones de código

```
Lenguaje:       TypeScript en todo el proyecto — sin any, sin @ts-ignore
Componentes:    Un archivo por componente, exports nombrados
Estilos:        Tailwind únicamente — sin CSS custom salvo casos extremos
Fetching:       Supabase client para queries directas con rol authenticated
                API Routes para lógica con service_role
Variables env:  NEXT_PUBLIC_ solo para claves públicas
                Nunca API keys de LLM en el frontend ni en la base de datos
Nombrado:       camelCase para variables y funciones
                PascalCase para componentes y tipos
                snake_case en la base de datos (sigue el schema)
Errores:        Siempre manejar errores explícitamente — nunca catch vacío
                API Routes devuelven siempre { data } o { error }
Separación:     lib/db      → solo queries a Supabase
                lib/llm     → solo llamadas al LLM
                lib/auth    → solo lógica de sesión
                components  → solo UI, nunca lógica de negocio
                api routes  → orquestan las capas, nunca son gordas
```

---

## Estructura de carpetas

```
src/
  app/
    (auth)/
      login/page.tsx
      register/page.tsx
    (app)/
      dashboard/page.tsx
      agents/page.tsx
      agents/new/page.tsx
      agents/[agentId]/page.tsx
      agents/[agentId]/chat/page.tsx
    api/
      auth/register/route.ts
      auth/invite/route.ts
      chat/route.ts
    layout.tsx
    page.tsx

  components/
    auth/
      login-form.tsx
      register-form.tsx
    agents/
      agent-form.tsx
      agent-list.tsx
      agent-card.tsx
    chat/
      chat-window.tsx
      chat-input.tsx
      message-list.tsx
    layout/
      app-sidebar.tsx
      app-header.tsx

  lib/
    supabase/
      browser.ts       → cliente para componentes cliente
      server.ts        → cliente para server components y API Routes
      middleware.ts    → refresco de sesión + protección de rutas
    auth/
      get-session.ts   → devuelve { user, organizationId, role }
      require-user.ts  → guard para páginas privadas
    db/
      agents.ts
      conversations.ts
      messages.ts
    llm/
      litellm.ts       → sendChatCompletion({ model, systemPrompt, messages })
    utils/
      env.ts           → validación centralizada de variables de entorno
      errors.ts

  types/
    database.ts        → tipos generados por supabase gen types
    app.ts             → tipos de dominio propios

middleware.ts
```

---

## Variables de entorno

```
NEXT_PUBLIC_SUPABASE_URL          → pública
NEXT_PUBLIC_SUPABASE_ANON_KEY     → pública
SUPABASE_SERVICE_ROLE_KEY         → solo servidor — nunca cliente
LITELLM_BASE_URL                  → solo servidor
LITELLM_API_KEY                   → solo servidor
REDIS_URL                         → solo servidor
```

---

## Patrón estándar de API Routes

```typescript
export async function POST(request: Request) {
  // 1. Validar sesión con getSession()
  // 2. Validar input con zod
  // 3. Lógica de negocio
  // 4. Devolver siempre { data } o { error }
}
```

---

## Code generation constraints for Claude Code

When generating code:

- Prefer small, composable functions over large monolithic ones.
- Do not create files exceeding 300 lines — split into smaller modules if needed.
- Avoid introducing new dependencies unless strictly required.
- Follow the existing folder architecture strictly — do not create new folders without justification.
- Reuse existing utilities, helpers, and DB functions when possible.
- Do not duplicate database queries across modules — centralize in lib/db.
- Prefer pure functions when possible.
- Prefer explicit types over inferred complex generics.
- Never generate placeholder comments like `// add logic here` — implement fully or ask for clarification.
- Do not generate code that cannot be immediately used — no stubs, no TODOs in logic paths.

---

## Minimal change rule

Claude Code must prefer the smallest possible change to achieve the requested result.

- Do not rewrite entire files unless explicitly requested.
- Modify only the relevant sections of the code.
- Preserve existing logic, imports, and structure.
- Avoid refactoring unrelated code.
- If a large refactor is required, explain why before implementing it.

---

## Pre-generation verification

Before generating code, Claude Code must verify:

1. The required files already exist in the project.
2. The database tables and columns match the schema defined in this file.
3. The necessary environment variables are defined in this file.
4. The requested feature does not conflict with the architecture defined in this file.

If any information is missing or unclear, state the assumption explicitly before generating code.
Do not invent tables, columns, types, or functions that are not defined in the project.

---

## Naming consistency

Claude Code must reuse existing names for:
- database tables and columns
- TypeScript types and interfaces
- services, functions, and helpers
- domain entities and concepts

Do not introduce alternative names for the same concept.

Reference:
```
agent run          → AgentRun (not AgentExecution, AgentJob, RunningAgent)
organization       → organization (not tenant, workspace, account)
soft delete        → deleted_at (not is_deleted, removed_at, archived_at)
usage tracking     → usage_records (not usage_logs, consumption, metrics)
message history    → messages (not chat_history, conversation_log)
```

When in doubt, check the existing codebase before introducing a new name.

---

## Database migrations

Claude Code must **never** modify the database schema implicitly.

All schema changes must:
1. Be proposed as a SQL migration file
2. Be reviewed and explicitly approved before execution
3. Never alter existing production data without explicit approval
4. Preserve backward compatibility whenever possible
5. Follow the existing naming conventions of the schema

Claude Code must never:
- Add, rename, or drop columns without a reviewed migration
- Create new tables outside of a migration file
- Modify RLS policies, triggers, or functions directly
- Alter partitioned tables without explicit instruction

If a schema change appears necessary during code generation, stop and propose
the migration separately. Do not work around missing columns by changing
application code to compensate.

---

## Prompt size limits

Before sending any data to the LLM:

- Maximum conversation history: 20 messages
- Maximum retrieved RAG chunks: 5
- Maximum chunk size: 500 tokens
- Maximum total prompt size: 8.000 tokens
- Always include the system_prompt in the token budget calculation

Truncation order when limits are exceeded:
1. Truncate retrieved chunks first — oldest or least relevant first
2. Truncate conversation history second — oldest messages first
3. Never truncate the system_prompt
4. Never truncate the current user message

---

## Deterministic agent behavior

Agent responses must be predictable and bounded.

### Temperature
- Default temperature: 0.7
- Maximum temperature: 1.0 — never exceed this regardless of agent configuration
- Temperature is configurable per agent via `agents.llm_temperature`
- Never set temperature above the plan or system maximum

### Execution limits
- Tool loops limited to **5 calls per request**
- Maximum recursion depth: **3 levels**
- No uncontrolled or open-ended agent loops
- Every tool invocation must decrement a counter — halt execution if counter reaches zero

### Bounded outputs
- Always set `max_tokens` explicitly — never send an unbounded LLM request
- Default `max_tokens`: 1.000
- Maximum `max_tokens`: 4.000
- If a response requires more tokens, split into multiple turns — never increase the limit silently

---

## Arquitectura multi-tenant

**Regla fundamental:** cada usuario pertenece a exactamente una organización. Toda query a Supabase desde el frontend está aislada por `organization_id` via RLS automáticamente.

```
Usuario autenticado
    → auth.uid() resuelve su organization_id via get_user_organization_id()
    → RLS filtra automáticamente todas las tablas por esa organización
    → El frontend nunca necesita filtrar manualmente por organization_id
```

**Las funciones helper verifican:**
```
get_user_organization_id() y get_user_role() devuelven NULL si:
  → El usuario tiene is_active = false (suspendido)
  → El usuario tiene deleted_at != NULL (borrado)
  → La organización tiene is_active = false (ej. falta de pago)
  → La organización tiene deleted_at != NULL

Cuando devuelven NULL, todas las policies RLS fallan automáticamente.
No hay que tocar ninguna policy individual para bloquear acceso.
```

**Roles disponibles:**
```
admin     → acceso total a la organización
editor    → crea y edita agentes, no gestiona usuarios ni integraciones
viewer    → solo lectura del dashboard, solo ve sus propias sesiones
operador  → usa agentes asignados explícitamente vía user_agent_permissions
```

---

## Base de datos — Schema v8.0 + mejoras (bloques 1-14, validado en Supabase)

### Tablas completas

```
plans                           → Planes de suscripción (trial/starter/pro/enterprise)
organizations                   → Empresas clientes
users                           → Empleados (1 usuario = 1 organización siempre)
user_sessions                   → Sesiones activas — particionado por expires_at
agents                          → Los agentes creados por cada empresa
agent_versions                  → Snapshot completo de cada cambio de configuración
user_agent_permissions          → Acceso granular solo para operador y viewer
agent_tools                     → Habilidades asignadas a cada agente
agent_documents                 → Metadata de documentos subidos para RAG
document_chunks                 → Fragmentos vectorizados para búsqueda semántica
integrations                    → Metadata de conexiones externas
integration_secrets             → Credenciales cifradas — solo service_role
integration_credentials_history → Trazabilidad de rotación de credenciales
organization_webhooks           → Endpoints externos para recibir eventos
webhook_deliveries              → Trazabilidad de cada entrega de webhook
event_queue                     → Cola asíncrona central — desacopla escrituras
conversations                   → Sesiones de conversación con agentes
messages                        → Historial completo — particionado por mes
usage_records                   → Control de costos y límites por organización
notifications                   → Alertas internas del dashboard
audit_logs                      → Registro inmutable — particionado por mes
deletion_requests               → Solicitudes de borrado de datos (derecho al olvido)
```

### Reglas críticas de la base de datos

```
1. FK cruzados multi-tenant
   → Tablas padre tienen UNIQUE (id, organization_id)
   → Tablas hijas referencian FOREIGN KEY (entity_id, organization_id)
   → Garantiza que no puede existir un agente de org A apuntando a org B

2. Soft deletes
   → NUNCA hacer DELETE real en users, agents, integrations, agent_documents
   → Borrar = UPDATE deleted_at = NOW()
   → Las policies de SELECT filtran deleted_at IS NULL automáticamente
   → UPDATE bloqueado en filas con deleted_at != NULL
   → DELETE y TRUNCATE revocados para authenticated

3. Tablas particionadas
   → messages, audit_logs, user_sessions tienen particiones mensuales
   → Cada una tiene DEFAULT PARTITION para evitar fallos de insert
   → Crear nuevas particiones con 2 meses de anticipación via pg_cron

4. integration_secrets
   → Sin RLS pública — solo service_role
   → Credenciales cifradas con pgcrypto ANTES de guardar
   → NUNCA exponer al frontend

5. audit_logs
   → APPEND ONLY — DELETE, UPDATE y TRUNCATE revocados para authenticated
   → INSERT solo desde backend con service_role

6. event_queue
   → SELECT FOR UPDATE SKIP LOCKED para workers concurrentes
   → idempotency_key único por (organization_id, idempotency_key)
   → Solo service_role puede acceder

7. created_at inmutable
   → El trigger set_updated_at() reescribe NEW.created_at = OLD.created_at
   → Nadie puede alterar la fecha de creación de un registro via UPDATE

8. API keys de LLM
   → NUNCA en la base de datos
   → Solo en variables de entorno del servidor

9. organization_webhooks.secret_encrypted
   → Cifrado con pgcrypto — NO hasheado
   → HMAC-SHA256 requiere el secreto original para firmar
   → Columna secret_encrypted revocada para authenticated
```

### Flujo de escritura asíncrona

```
Usuario recibe respuesta del agente         (inmediato)
    ↓
INSERT messages                             (síncrono)
INSERT event_queue                          (síncrono — 1 operación liviana)
    ↓
Worker consume event_queue                  (asíncrono — FOR UPDATE SKIP LOCKED)
    → UPDATE usage_records
    → UPDATE conversations.message_count
    → Evalúa límites del plan
    → Si > 80% → INSERT notifications + INSERT event_queue 'plan.limit_warning'
    → Si > 100% → INSERT notifications + INSERT event_queue 'plan.limit_reached'
    ↓
Worker de webhooks                          (asíncrono separado)
    → Descifra secret_encrypted con service_role
    → Firma payload con HMAC-SHA256
    → HTTP POST al endpoint de la empresa
    → INSERT webhook_deliveries
    → Si failed → retry con backoff exponencial
```

### Flujo RAG

```
[INDEXACIÓN — cuando se sube un documento]
Usuario sube archivo
    ↓
INSERT agent_documents (status = 'processing')
INSERT event_queue (event_type = 'document.uploaded')
    ↓
Worker procesa:
    → Descarga archivo desde Supabase Storage
    → Extrae texto
    → Divide en chunks ~500 tokens con overlap ~50
    → POST OpenAI embeddings API por cada chunk
    → INSERT document_chunks (content, embedding, chunk_index, metadata)
    → UPDATE agent_documents SET status = 'ready', chunk_count = N

[RECUPERACIÓN — cuando el agente recibe una pregunta]
    → Genera embedding de la pregunta del usuario
    → SELECT * FROM search_document_chunks(org_id, agent_id, query_embedding, 5, 0.7)
    → Inyecta los chunks relevantes en el system_prompt como contexto
    → Envía al LLM con el contexto incluido
```

---

## Seguridad

> Todas las reglas de seguridad están en **SECURITY.md**.
> Claude Code debe leer SECURITY.md cuando trabaje en: auth, webhooks, storage, integraciones, LLM, API routes, o cualquier tema de seguridad.

---

## Planes y límites

| Plan | Agentes | Usuarios | Mensajes/mes | Precio |
|------|---------|----------|--------------|--------|
| trial | 3 | 5 | 1.000 | $0 |
| starter | 5 | 10 | 5.000 | $29 |
| pro | 20 | 50 | 50.000 | $99 |
| enterprise | ∞ | ∞ | ∞ | negociado |

---

## Milestones del proyecto

```
Milestone 1 — Agent Runtime           ← ACTUAL
→ Auth + organización
→ Agente funciona, persiste, kill switch operativo
→ Chat con LLM, conversación guardada

Milestone 2 — Observability
→ Tokens, costos y latencia por organización y agente
→ Alertas de límite de plan (80% y 100%)
→ Dashboard de uso en tiempo real

Milestone 3 — Governance
→ Policy Engine por agente (allowed_tools, blocked_tools, dominios)
→ Security sandbox con enforcement en runtime
→ Execution trace completo por run
→ Cost guardrails por agente con pausa automática
→ Compliance export (audit logs CSV/PDF)

Milestone 4 — Visual Ecosystem
→ Agent Builder tipo character creator
→ Editor visual de herramientas y RAG
→ Onboarding guiado sin conocimientos técnicos
```

**Regla:** no avanzar al siguiente milestone hasta que el anterior esté
estable y operativo en producción.

---

## Cómo funciona el vibecoding

Este proyecto se construye en sesiones con Claude Code. Cada sesión:

1. **Claude Code lee este archivo automáticamente** — contexto completo desde el inicio
2. **Consultar PROGRESS.md** — para saber qué está construido y qué sigue
3. **Trabajar en una feature específica** — no saltar entre módulos
4. **Actualizar PROGRESS.md al terminar** — registrar qué se hizo y qué decisiones se tomaron

### Cómo pedirle código a Claude

```
✅ "Crear el componente AgentCard que muestra nombre, status y llm_model.
    Usar Tailwind. Recibe agent como prop con el tipo Agent del schema.
    Al hacer click navega a /agents/:id"

❌ "Crear la pantalla de agentes"
```

Incluir siempre:
- Qué componente o función se necesita
- Qué datos recibe y de dónde vienen
- Qué debe hacer exactamente
- Qué tipo de respuesta o navegación se espera

---

## Decisiones pendientes

```
1. ✅ Framework: Next.js + Tailwind + TypeScript
   → App Router
   → API Routes para service_role

2. ✅ Lógica service_role: Next.js API Routes
   → Mismo repo, más control
   → Acceso a credentials cifradas, firma HMAC, deletion_requests

3. pgvector — extensión habilitada
   → Ya ejecutado en Supabase (bloque 11)
   → Modelo de embeddings: OpenAI text-embedding-3-small (1536 dims)
   → Si se cambia a text-embedding-3-large → vector(3072) requiere migración

4. PII y privacidad
   → DPA en Terms of Service — pendiente redactar
   → deletion_requests — tabla creada, worker pendiente de implementar
   → data_retention_days — pg_cron pendiente de configurar
```

---

## Archivos de referencia

```
CLAUDE.md         → Este archivo — leído automáticamente por Claude Code
SECURITY.md       → Reglas de seguridad completas — consultar cuando sea relevante
PROGRESS.md       → Estado actual — actualizar después de cada sesión
SCHEMA.md         → Schema completo con todas las tablas documentadas
supabase-blocks/  → Los 14 bloques SQL ejecutados en Supabase
PROMPTS.md        → Prompts optimizados por etapa de desarrollo
```
