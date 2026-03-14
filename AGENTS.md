# AGENTS.md - AgentBuilder SaaS
> Codex lee este archivo automaticamente al inicio de cada sesion.
> Mantener este archivo corto. Leer documentacion adicional solo cuando la tarea lo requiera.
> Actualizar `PROGRESS.md` al cerrar cada sesion.
> Historial largo: `PROGRESS_HISTORY.md`.
> Schema validado en Supabase real. La fuente de verdad detallada vive en `SCHEMA.md`.

---

## Contrato operativo base

### Proyecto y stack
- Producto: SaaS B2B para crear y operar agentes de IA sin conocimientos tecnicos.
- Mercado inicial: hispanohablante.
- Frontend: Next.js App Router + Tailwind + TypeScript estricto.
- Backend app: Next.js API Routes.
- Datos: Supabase (PostgreSQL, Auth, Storage, pgvector).
- Automatizacion: n8n + Redis.
- Gateway LLM: LiteLLM.

### Arquitectura obligatoria
- `src/components` contiene UI; no poner logica de negocio ni acceso a secretos.
- `src/lib/db` contiene queries a Supabase; no duplicar queries en otros modulos.
- `src/lib/llm` contiene llamadas al modelo.
- `src/lib/auth` contiene sesion y autorizacion reutilizable.
- API Routes orquestan capas; no concentrar logica gorda ni secretos en cliente.
- Operaciones sensibles, `service_role`, cifrado, webhooks y bypass de RLS ocurren solo server-side.

### Convenciones de codigo
- TypeScript en todo el proyecto. No usar `any` ni `@ts-ignore`.
- Componentes: un archivo por componente, exports nombrados.
- Estilos: Tailwind; evitar CSS custom salvo necesidad real.
- Nombrado: camelCase en codigo, PascalCase en tipos/componentes, snake_case en base de datos.
- Errores: manejar explicitamente. API Routes devuelven siempre `{ data }` o `{ error }`.
- Minimal change rule: hacer el menor cambio posible; no refactorizar fuera de alcance.

---

## Reglas de seguridad no negociables

- Nunca exponer secretos, tokens, API keys ni `SUPABASE_SERVICE_ROLE_KEY` al cliente, logs o bundles.
- Nunca confiar en input del cliente para `organization_id`, `user_id`, `role`, ownership o permisos.
- Validar todas las mutaciones server-side con `zod`.
- Mantener aislamiento multi-tenant: toda query tenant-scoped debe usar identificador + contexto de organizacion autenticada, incluso con RLS.
- Toda operacion sensible debe resolverse con identidad server-side; nunca con estado de sesion del cliente.
- No bypass de RLS salvo codigo backend explicitamente justificado.
- No modificar schema, RLS, triggers, functions ni tablas implicitamente. Toda alteracion va en migracion SQL revisable y aprobada.
- `integration_secrets`, secretos de webhooks, tokens OAuth y claves LLM viven solo server-side y cifrados cuando corresponda.
- No usar `dangerouslySetInnerHTML` con contenido no sanitizado.
- Si la autorizacion no esta clara, fallar cerrado.

### Flujo obligatorio en ejecucion de agentes
En cada request del agente, no saltar ni reordenar:
1. Validar sesion y resolver usuario autenticado.
2. Cargar agente y verificar que pertenece a la organizacion autenticada.
3. Verificar kill switch `agents.is_active`.
4. Verificar organizacion activa.
5. Verificar estado del agente.
6. Verificar limites del plan.
7. Cargar o crear conversacion.
8. Cargar historial acotado.
9. Verificar allowlist de tools.
10. Llamar al LLM via LiteLLM con limites de prompt y tokens.
11. Persistir mensajes y encolar eventos asincronos.

### Limites operativos LLM
- Maximo 20 mensajes de historial.
- Maximo 5 chunks RAG.
- Maximo 500 tokens por chunk.
- Maximo 8.000 tokens totales de prompt.
- `system_prompt` nunca se trunca.
- `max_tokens` explicito siempre. Default 1.000; maximo 4.000.
- Temperatura default 0.7; nunca superar 1.0.
- Loops de tools: maximo 5 llamadas por request.
- Recursion maxima: 3 niveles.

---

## Verificacion previa antes de generar codigo

Confirmar siempre:
1. Los archivos relevantes existen.
2. La tarea respeta la arquitectura del repo.
3. El schema y nombres usados existen en el codigo o en `SCHEMA.md`.
4. Las env vars necesarias ya estan definidas o documentadas.
5. La tarea no requiere migracion, cambios de RLS o cambios sensibles no aprobados.

Si falta informacion, explicitar la suposicion. No inventar tablas, columnas, tipos, funciones ni nombres de dominio.

### Nombres que se deben preservar
- `organization`, no `tenant` ni `workspace`.
- `AgentRun`, no variantes alternativas.
- `deleted_at` para soft delete.
- `usage_records` para uso y limites.
- `messages` para historial.

---

## Carga bajo demanda

Trabajar solo con este archivo base mas el codigo relevante, salvo que la tarea toque alguna de estas areas:

- `SCHEMA.md`: tablas, columnas, relaciones, particiones, flujos async, RAG, migraciones, restricciones de DB.
- `SECURITY.md`: auth, autorizacion, RLS, secrets, webhooks, storage, SSRF, CSRF, headers, revisiones sensibles.
- `PROGRESS.md`: estado actual corto y proximos pasos.
- `PROGRESS_HISTORY.md`: decisiones y cambios historicos si hace falta contexto viejo.
- `README.md`: setup local y comandos generales.

### Regla practica
- Tarea de UI o refactor chico: usar `AGENTS.md` + codigo.
- Tarea de API Route o mutacion: abrir `SECURITY.md` si toca auth, permisos, secretos o side effects.
- Tarea de DB o nombres persistentes: abrir `SCHEMA.md`.
- Si hay que retomar trabajo previo: abrir `PROGRESS.md`; usar `PROGRESS_HISTORY.md` solo si falta contexto historico.

---

## Variables de entorno esperadas

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `LITELLM_BASE_URL`
- `LITELLM_API_KEY`
- `REDIS_URL`

Agregar otras variables solo si ya existen en el proyecto o si se documentan en el cambio correspondiente.

---

## Higiene del workspace

- Ignorar artefactos de exploracion y build como `.next`, `.next-backup-*`, `node_modules`, payloads y archivos temporales.
- No usar esos directorios como fuente de verdad.
- Preferir leer codigo fuente, migraciones, docs de referencia y tests.

---

## Regla de cierre de sesion

- Actualizar `PROGRESS.md` con snapshot corto:
  - estado actual
  - ultimos cambios relevantes
  - pendientes inmediatos
  - riesgos o bloqueos
  - comandos de verificacion conocidos
- Si el detalle historico importa, agregarlo en `PROGRESS_HISTORY.md`, no en `PROGRESS.md`.
