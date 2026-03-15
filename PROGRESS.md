## Estado actual

- La decision operativa para Railway ya cambio a modo `Hobby-first`: el repo ahora expone `npm run worker` como entrypoint recomendado para un unico proceso persistente con health server, queue loop y maintenance loop combinados.
- El repo ya tiene runbook explicito para deploy/cutover de Railway en `RAILWAY_PHASE1_RUNBOOK.md`, incluyendo variables minimas, start commands, health checks, orden de despliegue, pruebas de wake-up/fallback/shutdown y secuencia de apagado de `n8n`.
- Las rutas `/api/workers/*` ahora exponen headers de compatibilidad (`x-agentbuilder-worker-mode=compatibility`, `x-agentbuilder-worker-scheduler=railway-primary`) para dejar explicito que Railway es el scheduler principal y esos endpoints quedan como legado soportado.
- Los workers persistentes de Railway ahora exponen `GET /health` de forma explicita en vez de responder OK a cualquier path, manteniendo tambien `/` como alias simple.
- Ya existe el runtime minimo para salir de `n8n Cloud` en la capa de scheduling: `package.json` suma `npm run worker:queue` y `npm run worker:maintenance`, pensados para correr persistentes en Railway con health HTTP en `$PORT`, `SIGTERM`/`SIGINT` limpios y sin mover los endpoints de entrada fuera de Vercel.
- `src/lib/db/event-queue.ts` ahora publica `event_queue:notify` en Redis inmediatamente despues del `INSERT` exitoso o de detectar duplicado por `idempotency_key`, respetando que Redis solo despierta y que el ownership real sigue en Postgres.
- `src/lib/workers/queue-notify.ts` agrega el subscriber/publisher Redis por socket sin dependencias nuevas; `scripts/worker-queue.ts` combina subscribe + sweep cada 30s y reutiliza las route handlers reales de `events`, `rag` y `webhooks` como compatibilidad para no duplicar logica.
- `scripts/worker-maintenance.ts` ya agenda en proceso propio los jobs periodicos vigentes del repo (`approvals`, `oauth refresh`, `deletion`, `integration health`, `conversation reengagement`, `whatsapp followup` y `whatsapp broadcast`) con intervals conservadores y el mismo contrato auth/killswitch de las routes actuales.
- El wizard principal de creacion ya paso a flujo `workflow catalog -> workflow instance -> integrations -> rules -> model -> review`, usando `setup_state` como fuente de verdad workflow-first sin migracion SQL.
- `agents` sigue representando la instancia operativa; ahora `setup_state` persiste `workflowTemplateId`, `workflowCategory`, `requiredIntegrations`, `optionalIntegrations`, `allowedAutomationPresets`, `automationPreset`, `instanceConfig` y `successMetrics`.
- Ya convive sobre ese legado el nuevo contrato v1 `workflow unico + capacidades`: `setup_state` ahora tambien normaliza `workflowId = "general_operations"`, `capabilities` y `businessInstructions`, sin migracion SQL ni backfill masivo.
- Sobre ese mismo contrato ya empezo la transicion a `agentes por scope`: `setup_state` ahora tambien persiste `agentScope` (`support | sales | operations`) y `outOfScopePolicy = reject_and_redirect`, con derivacion legacy conservadora sin migracion SQL.
- El empaquetado comercial ya dejo de depender solo de `mensajes + integraciones por agente`: existe contrato central de planes con `public_label`, `max_scopes_active`, `max_sessions_month`, `max_active_agents_per_scope` y `integrations_unlimited`, manteniendo `max_messages_month` solo como metrica operativa legacy.
- El hard gate visible del producto ya corre por `sesiones` y no por `mensajes`: `/api/chat` y `non-stream-executor` verifican si la conversacion ya conto en el mes actual antes de bloquear nuevas conversaciones, mientras billing/dashboard muestran `sesiones atendidas` como cuota principal.
- El `system_prompt` recomendado ya no depende solo del builder legacy: se compila por capas (`globalGuardrails -> workflowPolicy -> scopePolicy -> capabilityPolicy -> integrationPolicy -> businessInstructions -> untrustedContext`) y se regenera server-side cuando entran `workflowId/agentScope/capabilities/businessInstructions` por API.
- El wizard de creacion ya no expone templates/presets al cliente final: ahora abre por `tipo de agente`, mantiene `workflowId = general_operations` tecnico, y muestra preview read-only del prompt compilado con la policy de rechazo fuera de scope.
- La identidad visible scope-first ya tambien llego a superficies de navegacion diaria: cards del listado, header del workspace, rail lateral y onboarding del detalle ahora muestran `agentScope` como `tipo de agente` y recuerdan la regla de rechazar/derivar fuera de alcance.
- Las quick actions del chat web tambien ya hablan por scope: copy, atajos y starter intents se segmentan por `support / sales / operations`, evitando seguir mostrando sugerencias neutrales o template-first en el uso diario.
- Las automatizaciones del workspace ya no se presentan como presets curados: la UI y la API aceptan `trigger + instruction + expectedOutput + deliveryTarget + approvalMode`, mientras el runtime sigue persistiendo `agent_automations` compatible y marca `scheduled_jobs` en `setup_state`.
- Los examples editables de automatizaciones ya se segmentan por `agentScope`, y el POST de automatizaciones falla cerrado cuando la instruccion cae claramente fuera del scope del agente.
- `/api/chat` ya tiene un gate central liviano de scope antes de las tools: pedidos claramente fuera de scope responden con rechazo + derivacion, y pedidos ambiguos piden aclaracion breve sin tocar runtimes sensibles.
- El enforcement inicial de scope ya no vive solo en `/api/chat`: `src/lib/chat/non-stream-executor.ts` ahora aplica el mismo gate antes del runtime no streaming, y `whatsapp_unified` alinea sus intents con scopes (`support`, `sales`, `operations`) para rechazar/derivar cuando el playbook detectado cae fuera del alcance del agente.
- El path de `approval inbox` ya suma un enforcement central de scope: `createApprovalRequest(...)` recibe `agentScope`, bloquea writes claramente fuera del alcance del agente antes de persistir `workflow_runs/steps/approval_items`, y los orquestadores de Salesforce, Gmail y Google Calendar ya le pasan ese contexto.
- Se cerro la direccion de automatizacion real en `AUTOMATION_PHASE0_PLAN.md`: antes de cualquier `v1.5` de escritura o workflow multi-sistema, la base obligatoria es la migracion SQL explicita ya aprobada para `workflow_runs`, `workflow_steps`, `approval_items` y el estado del budget allocator.
- El modo actual "desde cero" sigue vivo como `Modo avanzado / desde cero` dentro del catalogo, reutilizando el builder actual sin abrir tablas nuevas.
- Google Calendar v1 read-only ya corre en `chat web` via `/api/chat` con planner server-side, runtime real sobre `primary`, validacion de ventana y refresh de token.
- Gmail v1.5 ya corre en `chat web` con el mismo path real de writes validado en Calendar: `approval_items -> workflow_runs/workflow_steps -> event_queue -> worker -> runtime` para `create_draft_reply`, `apply_label` y `archive_thread`, manteniendo lectura segura metadata-only para `search_threads` y `read_thread`.
- Gmail ahora persiste referencia estable `thread_id + message_id + rfc_message_id` en el contexto reciente y en los payloads de approval para que los jobs async no dependan de heuristicas conversacionales.
- Gmail chat ahora puede resolver automaticamente un `thread_id` incompleto antes de una write: si el usuario pide borrador/label/archivar y solo hay `thread_id` reciente, el orquestador hace `read_thread` server-side para obtener `message_id` estable y crea la approval en el mismo turno.
- La timezone de Google Calendar ahora se resuelve server-side con precedencia `override manual -> metadata detectada de Google -> setup/browser fallback -> UTC`, con hidratacion lazy en `integrations.metadata`.
- Las approvals y summaries de Google Calendar en chat ya no muestran `startIso/endIso` crudos en UTC para altas y lecturas simples: ahora formatean la ventana en la timezone efectiva del agente para evitar confusion operativa con clientes finales.
- Gmail chat ya suma un intent extractor chico via Haiku (`src/lib/chat/gmail-intent-extractor.ts`) para clasificar requests breves de search/read/write y complementar el planner regex actual sin relajar el requisito de `thread_id/message_id` estable antes de cualquier write real.
- `/api/agents/[agentId]/run` y `src/lib/chat/non-stream-executor.ts` siguen sin runtime real de Gmail/Calendar en esta etapa.
- La migracion `supabase/migrations/20260313223000_add_workflow_phase0_foundation.sql` quedo validada como baseline de schema para la `Fase 0` comun.
- La migracion `supabase/migrations/20260313223000_add_workflow_phase0_foundation.sql` ya fue aplicada tambien en Supabase, asi que la base de schema de `Fase 0` ya no esta solo modelada en repo sino activa en el entorno objetivo.
- El aterrizaje repo-real de la `Fase 0` ya esta explicitado en `AUTOMATION_PHASE0_PLAN.md`: budgets siguen siendo post-consumo en Redis, `event_queue` aun no modela lifecycle por run/step, el badge actual del header es reutilizable para approvals, y faltan tipos Supabase + modulos DB/API para las tablas nuevas.
- Ya existe el primer slice implementado de `Fase 0`: tipos TS para tablas nuevas, modulos `src/lib/db` para runs/steps/approvals/budget allocations, APIs de approval inbox y contador pendiente, pagina web `/approvals` y badge visible en header/sidebar.
- Salesforce ya dejo de depender solo de `confirmo` en chat para escrituras asistidas: cuando el planner detecta una write, ahora se materializan `workflow_run`, `workflow_step` y `approval_item` reales y el chat deriva a la inbox `/approvals`.
- Aprobar un `approval_item` ya no deja el step solo en `queued`: `PATCH /api/approvals` ahora encola `workflow.step.execute` y el worker comun de `event_queue` puede ejecutar el step aprobado de punta a punta para Salesforce.
- El engine async ya no esta clavado en single-step `maxAttempts: 1`: `workflow.step.execute` ahora soporta retries controlados por `workflow_steps.max_attempts`, avance al siguiente step si existe en el run y cierre mas fino entre `failed`, `blocked`, `partially_completed` y `manual_repair_required`.
- El budget allocator ya tiene primer aterrizaje workflow-driven: las llamadas CRM ejecutadas desde `workflow.step.execute` reservan admision previa en `provider_budget_allocations` antes del provider call y luego cierran esa reserva como `consumed`, `released` o `rejected`.
- El allocator previo ya puede diferenciar `allow`, `queue`, `throttle` y `reject` en workflows CRM: para Salesforce lee quota sin consumirla, solo incrementa la ventana Redis cuando la admision es `allow` y deja `retry_after` persistido cuando decide cola o desaceleracion.
- El coordinator ya intenta compensaciones reales cuando falla un step requerido despues de side effects previos: ejecuta reversión server-side en orden inverso para steps compensables de Salesforce y solo deja `manual_repair_required` si existe un step no reversible o si alguna compensación falla.
- Google Calendar ya tiene runtime workflow-driven real para writes (`create_event`, `reschedule_event`, `cancel_event`) y la primera compensación segura `create_event -> cancel_created_event` dentro del mismo coordinator.
- El chat web de Google Calendar ya puede materializar approvals reales de write: el planner detecta `create_event`, `reschedule_event` y `cancel_event`, guarda `pending_crm_action`, y deriva la aprobacion a `/approvals` en vez de ejecutar la mutacion inline.
- Google Calendar v1.5 quedo validado end-to-end sobre una integracion real: se creo un evento temporal, aparecio confirmado en Google Calendar, luego se reprogramo y finalmente se cancelo pasando por `approval_items -> event_queue -> worker -> runtime`, con `approval_items.status = approved`, `workflow_runs/status = completed`, `workflow_steps/status = completed` y `event_queue/status = done`.
- El repo ahora tiene una forma reproducible de ejecutar tests TS con aliases via `npm.cmd run test:ts`, y una bateria dedicada `npm.cmd run test:google-calendar` para planner, runtime de lectura, orchestrator y runtime de escritura.

## Ultimos cambios relevantes

### Sesion: Build de Vercel destrabado por errores de lint

**Objetivo:** destrabar `npm run build` en Vercel corrigiendo errores puntuales de ESLint sin refactorizar fuera de alcance.

**Cambios implementados:**
- `src/components/chat/message-list.tsx`: se removio el import no usado `buildDynamicFormSubmissionMessage`.
- `src/lib/agents/public-workflow.ts`: `getPublicWorkflowById(...)` conserva la firma compatible pero ahora marca el parametro como consumido para evitar `no-unused-vars`.
- `src/lib/chat/chat-form-search.ts` y `src/lib/chat/inline-forms.ts`: los parametros legacy/no-op ahora se consumen explicitamente con `void ...` para mantener compatibilidad sin desactivar reglas.
- `src/lib/chat/interactive-markers.ts`: `labelPart` pasa de `let` a `const` para cumplir `prefer-const`.

**Pendientes inmediatos:**
- Confirmar en Vercel que el siguiente `build` avance mas alla del paso de lint.

**Riesgos / bloqueos:**
- `npm run build` completo no se corro en este entorno; solo quedo verificado `npm run lint`.

**Verificacion:**
- `npm.cmd run lint`

---

### Sesion: Automatizaciones ambiguas ahora fallan cerrado por scope

**Objetivo:** seguir la planificacion scope-first cerrando el ultimo gris de automatizaciones, donde los casos claramente `out_of_scope` ya se bloqueaban pero las instrucciones ambiguas todavia podian guardarse o ejecutarse desde el worker schedule.

**Cambios implementados:**
- `src/lib/agents/automation-contract.ts`: nuevo helper `shouldBlockAutomationForScope(...)` para centralizar la decision de bloqueo cuando la clasificacion scope-aware devuelve `out_of_scope` o `ambiguous`.
- `src/app/api/agents/[agentId]/automations/route.ts` y `src/app/api/agents/[agentId]/automations/[automationId]/route.ts`: create/edit ahora reutilizan el helper central y responden `422` tambien cuando la instruccion no deja claro si pertenece a soporte, ventas u operaciones.
- `src/app/api/workers/automations/route.ts`: el worker programado ahora falla cerrado tambien ante automatizaciones ambiguas, marcando `last_run_status = failed` en vez de ejecutarlas silenciosamente.
- `src/lib/agents/automation-contract.test.ts`: cobertura nueva para clasificacion `ambiguous` y para el helper compartido de bloqueo.

**Pendientes inmediatos:**
- Si mas adelante aparece una cola de revision humana para automatizaciones, cambiar el bloqueo de `ambiguous` por derivacion a review en vez de `failed` directo.
- Llevar la misma semantica de cierre conservador a cualquier otro entrypoint futuro que ejecute automatizaciones sin pasar por estas rutas.

**Riesgos / bloqueos:**
- La clasificacion sigue siendo heuristica y por texto; el cierre ahora es mas seguro, pero automatizaciones redactadas de forma muy vaga van a pedir reformulacion con mas frecuencia.

**Verificacion:**
- `npm.cmd run test:ts -- src/lib/agents/automation-contract.test.ts`
- `npm.cmd run typecheck`

---

### Sesion: UI de automatizaciones ya edita el contrato scope-first

**Objetivo:** cerrar el ultimo hueco visible de esta planificacion en el workspace del agente, donde la API ya aceptaba `PATCH` del contrato nuevo de automatizaciones pero la UI todavia solo permitia crear.

**Cambios implementados:**
- `src/components/agents/automations/automation-modal.tsx`: el modal ahora soporta modo crear/editar sobre el contrato nuevo (`trigger + instruction + expectedOutput + deliveryTarget + approvalMode`), hidrata datos existentes y muestra copy explicito de enforcement por `agentScope`.
- `src/components/agents/automations/automation-list.tsx`: cada automatizacion ahora puede abrirse en modo edicion, el guardado actualiza filas existentes sin recargar y el listado propaga `agentScope` al modal para mantener la semantica scope-aware tambien en UX.
- `src/components/agents/agent-detail-workspace-main.tsx`: la tab `automations` del detalle ya pasa `draftSetupState.agentScope` al listado para que la UI quede alineada con el runtime y las validaciones server-side.

**Pendientes inmediatos:**
- Evaluar si conviene mostrar tambien el resultado de clasificacion `ambiguous` dentro de la UI antes del submit, o si alcanza con seguir bloqueando solo desde server cuando el caso es claramente `out_of_scope`.
- Revisar en una iteracion posterior si automatizaciones `event/webhook` necesitan affordances de edicion mas especificas que el formulario actual centrado en `schedule`.

**Riesgos / bloqueos:**
- La edicion visual ya usa el contrato nuevo, pero la clasificacion sigue siendo heuristica y recae en el backend; la UI solo anticipa la policy, no reemplaza la validacion cerrada del server.
- El modal sigue priorizando el flujo `schedule`, asi que automatizaciones legacy/event-driven continuan editables pero con UX menos especializada que las programadas.

**Verificacion:**
- `npm.cmd run typecheck`

---

### Sesion: Scope enforcement mas duro en Gmail y Google Calendar

**Objetivo:** seguir la transicion scope-first donde ya existia gate central y approvals con `agentScope`, pero los writes de Gmail y Google Calendar todavia dependian demasiado de heuristicas generales del summary.

**Cambios implementados:**
- `src/lib/agents/agent-scope.ts`: `inferScopeFromProviderAction(...)` ahora acepta `summary` opcional y suma hints provider/action para `gmail` (`create_draft_reply`, `apply_label`, `archive_thread`) y `google_calendar` (`create_event`, `reschedule_event`, `cancel_event`), manteniendo Salesforce como mapping duro existente.
- `src/lib/agents/agent-scope.ts`: nuevo helper interno `inferScopeFromActionSummary(...)` para resolver casos donde el provider no tiene un scope fijo pero el summary deja claro si la accion es de `support`, `sales` u `operations`.
- `src/lib/agents/agent-scope.test.ts`: nueva cobertura para bloquear un borrador comercial de Gmail desde un agente `support`, bloquear una reunion operativa desde un agente `sales` y permitir una cancelacion interna coherente para `operations`.

**Pendientes inmediatos:**
- Extender la matriz/hints a mas acciones y providers futuros si aparecen nuevas writes workflow-driven fuera de Salesforce, Gmail y Google Calendar.
- Revisar si conviene extraer estos hints a una action matrix unificada por provider/action/scope cuando el catalogo de acciones crezca y deje de ser razonable mantenerlo inline.
- Seguir afinando keywords de clasificacion conversacional para casos mixtos o resúmenes demasiado neutros, donde el enforcement aun puede caer en `operations` o dejar pasar ambigüedad.

**Riesgos / bloqueos:**
- Gmail y Calendar quedaron mejor cubiertos para summaries explicitos, pero siguen sin tener un mapping 100% duro por accion porque varias mutaciones pueden pertenecer a scopes distintos segun el contexto del negocio.
- El gate sigue siendo conservador: cuando las señales empatan o son muy vagas, no fuerza un rechazo automatico solo con estos hints y todavia depende del clasificador general.

**Verificacion:**
- `npm.cmd run test:ts -- src/lib/agents/agent-scope.test.ts`
- `npm.cmd run typecheck`

---

### Sesion: Automatizaciones tambien respetan scope al editar y ejecutar

**Objetivo:** cerrar el hueco que quedaba en automatizaciones, donde el alta ya validaba `agentScope` pero un `PATCH` posterior o el worker schedule todavia podian dejar correr instrucciones fuera de alcance.

**Cambios implementados:**
- `src/lib/agents/automation-contract.ts`: nuevo helper reusable para leer el contrato nuevo desde `action_config`, recompilar el `prompt` y clasificar el texto operativo de una automatizacion contra `agentScope`.
- `src/app/api/agents/[agentId]/automations/route.ts`: el alta reutiliza el helper nuevo para mantener una sola semantica de clasificacion scope-aware.
- `src/app/api/agents/[agentId]/automations/[automationId]/route.ts`: `PATCH` ahora acepta tambien el contrato nuevo (`trigger`, `instruction`, `expectedOutput`, `deliveryTarget`, `approvalMode`), recompone `action_config` server-side y bloquea guardados fuera de scope con `422`.
- `src/app/api/workers/automations/route.ts` y `src/lib/db/agents.ts`: el worker carga los agentes scheduleados, relee `setup_state` antes de encolar y falla cerrado (`last_run_status = failed`) cuando una automatizacion vigente ya no coincide con el `agentScope` actual.
- `src/lib/agents/automation-contract.test.ts`: cobertura nueva para prompt builder, lectura del contrato persistido y clasificacion `support` vs `sales`.

**Pendientes inmediatos:**
- Evaluar si los casos `ambiguous` en automatizaciones programadas deben bloquearse tambien en worker o si basta con dejar el gate cerrado solo para `out_of_scope`.

**Riesgos / bloqueos:**
- El worker solo falla cerrado cuando puede resolver `setup_state`; automatizaciones totalmente legacy sin metadata nueva siguen corriendo por compatibilidad hasta una limpieza posterior.
- La clasificacion sigue siendo heuristica y texto-dependiente para automatizaciones multi-scope, igual que en chat y approvals.

**Verificacion:**
- Pendiente correr `npm.cmd run test:ts -- src/lib/agents/automation-contract.test.ts`
- `npm.cmd run typecheck`

---

### Sesion: Action matrix central tambien gobierna scope

**Objetivo:** seguir la misma planificacion scope-first pero sacando los hints de Gmail/Calendar/Salesforce de helpers dispersos, para que el enforcement de approvals tenga una fuente de verdad mas formal por `provider + action`.

**Cambios implementados:**
- `src/lib/workflows/action-matrix.ts`: cada entrada ahora puede declarar `primaryScope`, `allowedScopes` y `scopeKeywords`, incluyendo baseline formal para Salesforce y hints centralizados para Gmail/Google Calendar.
- `src/lib/workflows/action-matrix.ts`: nuevo `inferScopeFromWorkflowAction(...)` que resuelve el scope desde la action matrix y usa keywords solo cuando una misma accion puede pertenecer a multiples scopes.
- `src/lib/agents/agent-scope.ts`: `inferScopeFromProviderAction(...)` deja de mantener matrices inline y pasa a delegar en la action matrix central, reduciendo duplicidad y alineando approvals con una sola fuente reusable.
- `src/lib/agents/agent-scope.test.ts`: suma cobertura para verificar inferencia centralizada sobre `salesforce:create_case`, `gmail:apply_label` y `google_calendar:cancel_event`.

**Pendientes inmediatos:**
- Llevar esta misma metadata de scope a una matriz mas completa de acciones read-only y futuros providers, para que quick actions, planners y approvals lean exactamente el mismo contrato.
- Evaluar si algunas acciones multi-scope necesitan policy adicional de `disallowedScopes` o mensajes de derivacion mas especificos cuando el catalogo crezca.

**Riesgos / bloqueos:**
- Gmail y Google Calendar siguen necesitando heuristica contextual porque una misma write puede ser valida para scopes distintos segun el negocio; ahora esa heuristica esta centralizada, pero no desaparece.
- La matriz nueva cubre el baseline actual de writes workflow-driven; si aparecen nuevas acciones sin entry explicita, el fallback sigue siendo permisivo y cae en clasificacion general.

**Verificacion:**
- Pendiente correr `npm.cmd run test:ts -- src/lib/agents/agent-scope.test.ts`
- Pendiente correr `npm.cmd run typecheck`

---

### Sesion: Scope visible en listado y detalle del agente

**Objetivo:** continuar la transicion scope-first en UX visible, cerrando el gap donde el runtime ya operaba por `agentScope` pero el listado de agentes y partes del workspace todavia se presentaban con identidad demasiado generica.

**Cambios implementados:**
- `src/components/agents/agent-card.tsx`: cada card ahora lee `setup_state`, muestra el `tipo de agente` como badge visible y tambien lo refleja en el meta inferior junto al modelo.
- `src/components/agents/agent-detail-workspace-header.tsx` y `src/components/agents/agent-detail-workspace.tsx`: el header del workspace ahora recibe `agentScope` y lo muestra como identidad principal del agente dentro del detalle.
- `src/components/agents/agent-form-summary.tsx`: el rail lateral ahora resume `Tipo de agente` y explicita que el agente debe rechazar o derivar pedidos fuera de ese alcance.
- `src/components/agents/agent-setup-panel.tsx`: el onboarding guiado del detalle ahora incorpora el badge de `Tipo` y copy scope-aware sobre el rechazo/derivacion fuera de alcance.

**Pendientes inmediatos:**
- Llevar el mismo lenguaje scope-first a otras superficies de gestion donde todavia prevalece copy generico de "agente" sin explicitar `support / sales / operations`.
- Revisar si conviene exponer tambien `workflowId = general_operations` en listados administrativos o dejarlo solo en vistas tecnicas del detalle.
- Seguir endureciendo la action matrix por provider/action para que la identidad visible termine de alinearse con enforcement transaccional mas formal.

**Riesgos / bloqueos:**
- El workspace ya comunica mejor el scope publico, pero el enforcement duro sigue mezclando mappings explicitos y heuristicas; la UX ahora refleja mejor una policy que todavia no esta completamente formalizada por accion/proveedor.
- `src/components/agents/agent-detail-workspace.tsx` ya tenia cambios ajenos en el worktree al tocar esta slice, asi que cualquier diff amplio puede mostrar ruido no relacionado con este ajuste visual.

**Verificacion:**
- `npm.cmd run typecheck`

---

### Sesion: Scope tambien en approval inbox

**Objetivo:** cerrar el gap que quedaba en la transicion scope-first, donde `/api/chat`, runtime no streaming y automatizaciones ya filtraban por `agentScope`, pero los writes workflow-driven todavia podian materializar approvals sin una validacion central de alcance.

**Cambios implementados:**
- `src/lib/agents/agent-scope.ts`: suma `inferScopeFromProviderAction(...)` y `assertScopeAllowsSensitiveAction(...)` para combinar una matriz minima por provider/action con el clasificador heuristico existente sobre el summary de la accion.
- `src/lib/workflows/approval-request.ts`: `createApprovalRequest(...)` ahora acepta `agentScope` opcional y falla cerrado cuando la accion sensible cae claramente fuera de scope antes de crear `workflow_run`, `workflow_step` o `approval_item`.
- `src/lib/chat/salesforce-tool-orchestrator.ts`, `src/lib/chat/google-gmail-tool-orchestrator.ts` y `src/lib/chat/google-calendar-tool-orchestrator.ts`: los tres orquestadores ahora propagan `setupState.agentScope` hacia la capa central de approvals.
- `src/lib/agents/agent-scope.test.ts`: nueva cobertura para validar que un agente `support` no pueda preparar un `create_lead` de Salesforce, mientras un `create_case` del mismo provider siga permitido.

**Pendientes inmediatos:**
- Extender la matriz explicita provider/action mas alla del baseline inicial de Salesforce; Gmail y Google Calendar siguen apoyandose sobre todo en el summary heuristico cuando la accion no tiene mapeo duro.
- Llevar este mismo enforcement central a futuros paths workflow-driven que creen approvals fuera de los orquestadores de chat actuales.
- Revisar si `create_task` debe seguir cayendo en `operations` o si conviene abrir una clasificacion mas fina por subtipo de tarea en una fase posterior.

**Riesgos / bloqueos:**
- El gate nuevo endurece bien los writes mas claros de Salesforce, pero todavia no reemplaza una action matrix completa por provider/action/scope en todo el runtime.
- Para acciones con summaries muy neutros y sin mapping explicito, el enforcement sigue siendo conservador y puede dejar pasar casos que solo el clasificador heuristico no detecte.

**Verificacion:**
- `npm.cmd run test:ts -- src/lib/agents/agent-scope.test.ts`
- `npm.cmd run test:ts -- src/lib/chat/google-gmail-tool-orchestrator.test.ts`
- `npm.cmd run test:ts -- src/lib/chat/google-calendar-tool-orchestrator.test.ts`
- `npm.cmd run test:ts -- src/lib/chat/crm-core.test.ts`
- `npm.cmd run typecheck`

---

### Sesion: Reempaque comercial a `scopes + sesiones`

**Objetivo:** aterrizar en el repo el nuevo modelo comercial del producto sin abrir tablas nuevas, reaprovechando `agentScope`, `usage_records` y el wizard actual.

**Cambios implementados:**
- `src/lib/agents/agent-integration-limits.ts`: dejo de ser solo un cap por integraciones y ahora centraliza el contrato de planes (`trial | starter | growth | scale | enterprise`), incluyendo `publicLabel`, `maxScopesActive`, `maxSessionsMonth`, `maxActiveAgentsPerScope`, integraciones/workflows ilimitados y helpers para activar scopes o bloquear un segundo agente activo del mismo scope.
- `src/lib/db/organization-plans.ts`: nuevo `getOrganizationPlan(...)` que devuelve nombre normalizado + `features` + config resuelta; `pro` se mapea a `growth` para compatibilidad durante la transicion.
- `src/lib/db/session-usage.ts`: nuevo helper server-side para medir sesiones mensuales reales desde `messages` (`conversation_id` con al menos una respuesta assistant en el mes) y decidir si una conversacion nueva puede abrir una sesion adicional.
- `src/app/api/chat/route.ts` y `src/lib/chat/non-stream-executor.ts`: el hard gate de plan ya no usa `max_messages_month`; ahora bloquea solo cuando una conversacion nueva empujaria a la org por encima de `max_sessions_month`, permitiendo seguir conversaciones ya abiertas aunque la cuota este al limite.
- `src/app/api/agents/[agentId]/route.ts`: activar un agente ahora valida plan + scopes activos de la org y bloquea un segundo agente `active` dentro del mismo `agentScope` fuera de Enterprise; crear drafts adicionales sigue permitido.
- `src/lib/db/usage.ts`, `src/lib/db/usage-writer.ts`, `src/lib/db/notifications-writer.ts`, `src/lib/chat/non-stream-persistence.ts` y `src/lib/workers/event-processor.ts`: el uso visible, las alertas y el post-processing quedaron alineados a `sesiones`, manteniendo `mensajes/tokens` como metrica operativa interna.
- `src/app/(app)/settings/billing/page.tsx`, `src/components/settings/plan-comparison.tsx`, `src/components/usage/*`, `src/app/(app)/settings/page.tsx` y `src/components/agents/wizard/step-integrations-scope.tsx`: billing, banners, cards y wizard ya hablan de `scopes activos`, `sesiones/mes` e `integraciones ilimitadas` en planes pagos.
- `supabase/migrations/20260314210000_repackage_plans_for_scopes_and_sessions.sql`: migracion de datos para renombrar `pro -> growth`, agregar `scale` y sembrar `features` del nuevo contrato comercial sin cambiar schema.
- `SCHEMA.md`: documentado el nuevo seed de planes y las keys esperadas en `plans.features`.
- Test nuevo: `src/lib/agents/agent-integration-limits.test.ts`.

**Pendientes inmediatos:**
- Validar la migracion SQL en Supabase real antes de depender de `scale` en entornos compartidos.
- Revisar si conviene extender el conteo preciso de `sesiones` tambien a tablas/agregados por agente cuando cambie de modelo LLM dentro del mismo mes, hoy la cuota org-level ya se calcula deduplicando `conversation_id`.
- Endurecer otros entrypoints de activacion/restore si en una fase posterior se permite cambiar estado masivamente fuera de `PATCH /api/agents/[agentId]`.

**Riesgos / bloqueos:**
- El repo sigue arrastrando mucho worktree ajeno; esta slice se monto sobre esos cambios sin revertirlos, asi que cualquier diff amplio seguira mostrando remociones legacy no relacionadas.
- `max_messages_month` se mantiene en DB por compatibilidad operativa; si aparecen superficies legacy nuevas que lo sigan tratando como hard gate comercial habra que migrarlas a `max_sessions_month`.

**Verificacion:**
- `npm.cmd run typecheck`
- `npm.cmd run test:ts -- src/lib/agents/agent-integration-limits.test.ts`

---

### Sesion: Enforcement de scope tambien en runtime no streaming y WhatsApp

**Objetivo:** continuar la planificacion scope-first cerrando el gap fuera de `/api/chat`, donde el executor no streaming y `whatsapp_unified` todavia podian seguir heuristicas separadas.

**Cambios implementados:**
- `src/lib/chat/non-stream-executor.ts`: ahora reutiliza `classifyScopeIntent(...)` antes de cualquier orquestacion/tool runtime y responde igual que `/api/chat` en casos `ambiguous` o `out_of_scope`.
- `src/lib/chat/whatsapp-unified.ts`: los intents de WhatsApp ahora se alinean con scopes publicos (`support -> support`, `sales -> sales`, `appointment_booking/reminder_follow_up -> operations`) y, si el intent detectado no coincide con `agentScope`, el flujo responde con rechazo + derivacion en vez de cambiar de playbook silenciosamente.
- `src/lib/chat/whatsapp-unified.test.ts`: nueva cobertura para verificar ese mapeo scope-aware y el rechazo de un agente `support` ante un pedido comercial por WhatsApp.

**Pendientes inmediatos:**
- Llevar la misma semantica de scope a otros entrypoints runtime que aun no pasen por `/api/chat` ni por `non-stream-executor`.
- Endurecer la policy con una action matrix formal por proveedor/accion, porque el gate actual sigue siendo heuristico y previo a tools.
- Revisar si los intents `appointment_booking` y `reminder_follow_up` necesitan separacion comercial/operativa mas fina en una fase posterior.

**Riesgos / bloqueos:**
- El enforcement ya es mas consistente entre web chat, worker/non-stream y WhatsApp, pero sigue dependiendo de clasificadores heuristico/LLM y no de una matriz transaccional formal.
- En el worktree actual se esta retirando HubSpot, asi que cualquier lectura de diffs contra `HEAD` puede mostrar remociones legacy no relacionadas con esta slice.

**Verificacion:**
- `npm.cmd run test:ts -- src/lib/chat/whatsapp-unified.test.ts`
- `npm.cmd run test:ts -- src/lib/agents/agent-scope.test.ts`
- `npm.cmd run typecheck`

---

### Sesion: Quick actions de chat alineadas con `agentScope`

**Objetivo:** seguir la planificacion scope-first en las superficies restantes del producto, empezando por el rail de quick actions del chat web que todavia arrastraba copy generico y semantica de `template_playbook`.

**Cambios implementados:**
- `src/lib/chat/quick-actions.ts`: `ResolvedChatQuickActions` ahora conserva `agentScope` y el fallback inline deja de depender del id legacy `assistant:next-step`, detectando tambien CTAs scope-specific de "siguiente paso".
- `src/lib/chat/quick-actions-server.ts`: las quick actions server-side ahora se resuelven por `agentScope`, con asistencia, atajos Salesforce/Gmail/Google Calendar y labels distintos para `support`, `sales` y `operations`.
- `src/lib/chat/starter-intents.ts`: los starter intents iniciales del chat dejan de ser genericos por integracion y pasan a usar catalogos segmentados por scope, manteniendo el filtro de acciones permitidas en Salesforce.
- `src/components/chat/chat-quick-actions-panel.tsx` y `src/components/chat/chat-quick-actions-shell.tsx`: el rail y el drawer mobile ahora muestran copy y titulos por scope (`Atajos de soporte`, `Atajos comerciales`, `Playbook operativo`, etc.) en vez de seguir hablando de "template".
- `src/lib/chat/quick-actions.test.ts`: actualizado para cubrir el contrato con `agentScope` y verificar sugerencias distintas para agentes `sales` y `support`.

**Pendientes inmediatos:**
- Extender la misma semantica scope-first a quick actions/follow-ups derivados de contenido del mensaje cuando hoy sigan siendo demasiado genericos.
- Endurecer el gate runtime de scope fuera de `/api/chat`, especialmente donde WhatsApp y otros paths todavia usan heuristicas separadas.
- Revisar si el header del chat y otras superficies menores tambien deberian exponer el `tipo de agente` de forma mas visible.

**Riesgos / bloqueos:**
- La segmentacion actual mejora mucho la UX publica del chat, pero el enforcement duro sigue viviendo en el gate heuristico previo a tools; estas quick actions no reemplazan una action matrix formal.
- Las sugerencias por scope hoy siguen siendo copy-driven y conservadoras; si se suman nuevos providers o acciones, habra que mantener estos catalogos alineados con las capacidades reales.

**Verificacion:**
- `npm.cmd run test:ts -- src/lib/chat/quick-actions.test.ts`
- `npm.cmd run typecheck`

---

### Sesion: Scope publico tambien en detalle del agente

**Objetivo:** cerrar el gap restante entre el wizard scope-first y la pantalla `/agents/[agentId]`, donde todavia sobrevivian semantica y edicion legacy del prompt.

**Cambios implementados:**
- `src/components/agents/agent-detail-workspace.tsx` y `src/components/agents/agent-detail-config-panel.tsx`: el detalle ahora propaga `setupState`, `recommendedPrompt` y `promptSyncMode` a la configuracion principal.
- `src/components/agents/agent-form.tsx` y `src/components/agents/agent-form-sections.tsx`: cuando el agente ya esta gestionado por `setup_state`, la seccion de comportamiento deja de exponer textarea libre y pasa a mostrar:
  - `agentScope` visible como tipo de agente
  - `workflowId` tecnico actual
  - policy fuera de scope `rechazar y derivar`
  - prompt compilado recomendado en modo solo lectura
  - aviso de desalineacion cuando existe un `system_prompt` guardado distinto al compilado
- Los agentes legacy sin `setup_state` moderno conservan el editor libre de `systemPrompt` para no romper compatibilidad durante la transicion.

**Pendientes inmediatos:**
- Segmentar copy, quick actions y superficies restantes del producto por `support / sales / operations` fuera del wizard y del detail principal.
- Endurecer el gate de scope con semantica compartida para mas superficies runtime, especialmente WhatsApp y flujos ambiguos de automatizaciones.
- Decidir si en una fase posterior conviene eliminar tambien la posibilidad de persistir prompts custom desalineados para agentes scope-managed, en vez de solo señalarlos y ofrecer volver al compilado.

**Riesgos / bloqueos:**
- El detalle ahora muestra el prompt compilado como fuente principal, pero todavia puede existir un `system_prompt` legacy/custom persistido y desalineado hasta que el operador aplique el recomendado.
- El enforcement visual ya quedo consistente entre wizard y detail, pero el enforcement runtime sigue siendo heuristico en `/api/chat` y todavia no reemplaza una matriz formal por accion/proveedor.

**Verificacion:**
- `npm.cmd run typecheck`

---

### Sesion: Scope publico + rechazo fuera de alcance (slice compatible sin migracion SQL)

**Objetivo:** continuar la transicion desde `workflow unico + capacidades` hacia `agentes publicos por scope`, sin tocar schema ni romper compatibilidad legacy.

**Cambios implementados:**
- `src/lib/agents/agent-scope.ts`: nuevo contrato reusable para `agentScope`, `outOfScopePolicy`, derivacion legacy conservadora, classifier liviano por scope y respuestas de rechazo/aclaracion.
- `src/lib/agents/agent-setup.ts` y `src/lib/agents/agent-setup-state.ts`: `setup_state` suma `agentScope` + `outOfScopePolicy`, normaliza defaults server-side y preserva compatibilidad con payloads legacy sin backfill.
- `src/lib/agents/prompt-compiler.ts`: el prompt compilado ahora agrega `scopePolicy` entre workflow y capabilities, explicita el scope activo y obliga rechazo + derivacion fuera de alcance.
- `src/app/api/agents/route.ts` y `src/app/api/agents/[agentId]/route.ts`: ya aceptan `agentScope` y `outOfScopePolicy` como parte del contrato publico y regeneran `system_prompt` con scope como input obligatorio.
- `src/components/agents/wizard/step-workflow-select.tsx`, `agent-creation-wizard.tsx` y `step-review.tsx`: la UI ahora habla de `tipo de agente` (`Soporte`, `Ventas`, `Operaciones`) en vez de workflow unico abierto, y deja visible la regla de rechazo fuera de scope.
- `src/lib/agents/automation-suggestions.ts` + `src/app/api/agents/[agentId]/automations/*`: los examples editables ya se segmentan por scope y la creacion de automatizaciones bloquea instrucciones claramente fuera del alcance del agente.
- `src/app/api/chat/route.ts`: se agrego un gate central liviano antes de orquestadores/tools para cortar pedidos claramente out-of-scope y pedir aclaracion en casos ambiguos.
- Tests nuevos/actualizados: `src/lib/agents/agent-scope.test.ts`, `src/lib/agents/agent-setup-state.test.ts` y `src/lib/agents/prompt-compiler.test.ts`.

**Pendientes inmediatos:**
- Llevar `agentScope` y el prompt read-only al detail workspace del agente (`/agents/[agentId]`), donde todavia sobrevive semantica legacy y edicion general de `systemPrompt`.
- Endurecer el classifier/gate de scope con semantica compartida para mas superficies (por ejemplo WhatsApp intent routing y automatizaciones ambiguas con revision explicita en vez de solo fail-closed).
- Segmentar copy, examples y quick actions restantes del producto por scope para que `support/sales/operations` quede consistente fuera del wizard inicial.

**Riesgos / bloqueos:**
- El gate de scope en `/api/chat` es intencionalmente liviano y heuristico; sirve como enforcement inicial previo a tools, pero todavia no reemplaza una matriz formal por accion/proveedor.
- La compatibilidad legacy se conserva porque `workflowId` sigue siendo unico y `agentScope` se deriva best-effort; agentes viejos con nombres ambiguos pueden caer en `operations` hasta una limpieza posterior.

**Verificacion:**
- `npm.cmd run typecheck`
- `npm.cmd run test:ts -- src/lib/agents/agent-setup-state.test.ts`
- `npm.cmd run test:ts -- src/lib/agents/prompt-compiler.test.ts`
- `npm.cmd run test:ts -- src/lib/agents/agent-scope.test.ts`

---

### Sesion: Workflow unico + Capacidades (slice compatible sin migracion SQL)

**Objetivo:** empezar la transicion a `workflow unico + capacidades` sin romper agentes legacy ni tocar schema sensible.

**Cambios implementados:**
- `src/lib/agents/public-workflow.ts`: nuevo contrato publico minimo con `workflowId = "general_operations"`, capacidades visibles y recomendaciones base de modelo.
- `src/lib/agents/agent-setup.ts` y `src/lib/agents/agent-setup-state.ts`: `setup_state` suma `workflowId`, `capabilities` y `businessInstructions`; la normalizacion legacy ahora converge a `general_operations` y deriva capacidades seguras desde integraciones/presets existentes.
- `src/lib/agents/prompt-compiler.ts` + `src/lib/agents/agent-templates.ts`: nuevo compilador de prompt en capas. `buildRecommendedSystemPrompt(...)` ya usa ese ensamblador para setup states modernos, manteniendo candidatos legacy para sync/deteccion.
- `src/app/api/agents/route.ts` y `src/app/api/agents/[agentId]/route.ts`: ya aceptan `workflowId`, `capabilities` y `businessInstructions` como contrato nuevo, siguen aceptando `setupState` legacy y regeneran `system_prompt` server-side cuando cambian esas capas.
- `src/components/agents/wizard/*`: el wizard ahora muestra workflow unico, objetivo/contexto, capacidades, integraciones y preview read-only del prompt; desaparece la seleccion publica de templates/presets.
- `src/lib/agents/automation-suggestions.ts`, `src/components/agents/automations/*` y `src/app/api/agents/[agentId]/automations/route.ts`: las sugerencias pasaron a `examples` editables y el POST ya acepta el contrato publico `instruction/expectedOutput/deliveryTarget/approvalMode`, persistiendo payload interno compatible.
- Tests nuevos: `src/lib/agents/agent-setup-state.test.ts` y `src/lib/agents/prompt-compiler.test.ts`.

**Pendientes inmediatos:**
- Llevar el mismo modelo de prompt read-only y campos guiados al panel de detalle del agente (`/agents/[agentId]`), donde todavia sobrevive el editor general de `systemPrompt`.
- Revisar si `workflow_runs.workflow_template_id` conviene poblarse con `general_operations` o con un `policyProfileId` interno cuando se creen approvals/runs nuevos; por ahora se conserva el campo legacy sin migracion.
- Decidir si las capacidades deben derivar `scheduled_jobs` tambien desde lectura real de `agent_automations` en mas superficies server-side, no solo en la persistencia posterior a crear automatizaciones.

**Riesgos / bloqueos:**
- El worktree sigue con muchos cambios ajenos y legacy workflow-first en paralelo; cualquier cleanup adicional de templates/schema conviene hacerlo en una fase separada y con migracion SQL revisada.
- El detail workspace todavia conserva semantica vieja en algunas copias/paneles, aunque el wizard y la API nueva ya operan con el contrato v1.

**Verificacion:**
- `npm.cmd run typecheck`
- `npm.cmd run lint`
- `npm.cmd run test:ts -- src/lib/agents/agent-setup-state.test.ts`
- `npm.cmd run test:ts -- src/lib/agents/prompt-compiler.test.ts`

---

### Sesion: Retiro controlado de HubSpot

**Motivacion:** No hay organizaciones reales usando HubSpot. Se elimino completamente del codebase para reducir deuda tecnica y surface de riesgo.

**Archivos eliminados:**
- `src/lib/integrations/hubspot.ts`, `hubspot-tools.ts`, `hubspot-crm.ts`, `hubspot-agent-tool-selection.ts`, `hubspot-agent-runtime-utils.ts`, `hubspot-agent-runtime.ts`
- `src/lib/db/hubspot-integrations.ts`
- `src/lib/agents/hubspot-agent-integration.ts`
- `src/lib/chat/hubspot-tool-planner.ts`, `hubspot-tool-planner.test.ts`, `hubspot-tool-orchestrator.ts`, `hubspot-duplicate-guard.ts`
- `src/components/agents/hubspot-agent-tools-panel.tsx`, `src/components/settings/hubspot-connection-form.tsx`
- `src/app/api/workers/crm/hubspot/route.ts`
- `src/app/api/integrations/hubspot/` (start/callback/disconnect)
- `src/app/api/agents/[agentId]/tools/hubspot/route.ts`

**Tipos y catalogo actualizados (sin HubSpot):**
- `WizardIntegrationId`: solo `whatsapp | salesforce | gmail | google_calendar | slack`
- `WizardEcosystemId`: eliminado `hubspot`
- `ChatQuickActionProvider`: eliminado `hubspot`
- `ProviderIntegrationProvider`: eliminado `hubspot`
- `AGENT_TEMPLATE_IDS`: eliminados 4 templates HubSpot
- `N8N_BUSINESS_WORKFLOW_IDS`: eliminado `wCrmSyncHubSpot`
- `PROVIDER_BUDGET_POLICIES`: eliminados `hubspot` y `microsoft_teams`
- `CHAT_FORM_IDS` / `CHAT_CONFIRMATION_PROVIDERS`: eliminados 3 formularios HubSpot

**Cleanup de callers:**
- `src/app/(app)/agents/new/page.tsx`, `[agentId]/page.tsx`, `settings/integrations/page.tsx`
- `src/app/api/agents/route.ts`, `[agentId]/route.ts`, `[agentId]/setup/route.ts`, `[agentId]/tools/route.ts`
- `src/app/api/chat/route.ts`, `src/app/api/workers/oauth/refresh/route.ts`
- `src/lib/chat/chat-form-search.ts`, `chat-form-server.ts`, `chat-form-submit.ts`, `inline-forms.ts`, `non-stream-executor.ts`
- `src/lib/workflows/compensation.ts`, `execution.ts`
- `src/components/agents/wizard/step-template-select.tsx`, `wizard-ecosystem-icons.tsx`, `wizard-ecosystem-tutorial.tsx`
- `src/lib/agents/effective-prompt.ts`, `agent-templates.ts`, `automation-suggestions.ts`
- Tests: `quick-actions.test.ts`, `starter-intents.test.ts`, `inline-forms.test.ts`
- `.env.local.example`: eliminadas variables `HUBSPOT_CLIENT_ID`, `HUBSPOT_CLIENT_SECRET`, `HUBSPOT_OAUTH_SCOPES`

**Estado final:** `npx tsc --noEmit` sin errores.

---

### Sesion: Cierre definitivo de HubSpot

**Estado:** Se completó el retiro real de HubSpot en runtime, tooling y schema operativo.

**Cambios de cierre:**
- `supabase/migrations/20260314183000_retire_hubspot.sql`: limpia filas legacy de `integrations`, `agent_tools`, `workflow_runs`, `workflow_steps`, `approval_items`, `provider_budget_allocations` y `event_queue`, elimina `idx_integrations_one_hubspot_per_org` y recrea los constraints sin `hubspot`.
- `n8n/workflows/crm-sync-hubspot.json`: eliminado del repo.
- `src/lib/workflows/action-matrix.ts`, `approval-request.ts`, `src/lib/chat/chat-form-state.ts`, `crm-core.ts`, `src/lib/utils/env.ts`: removidos los ultimos contratos runtime/env que todavia aceptaban `hubspot`.
- `RAILWAY_PHASE1_RUNBOOK.md`, `SCHEMA.md` y `src/components/agents/automations/automation-modal.tsx`: alineados con el estado sin HubSpot.
- Tests/fixtures residuales migrados a Salesforce o casos genericos en `execution-engine.test.ts`, `crm-core.test.ts`, `provider-budgets.test.ts`, `refresh-coordination.test.ts`, `salesforce-selection.test.ts` e `inline-forms.test.ts`.

**Verificacion:**
- `npm.cmd run typecheck`
- `npm.cmd run test:ts -- src/lib/chat/crm-core.test.ts`
- `npm.cmd run test:ts -- src/lib/chat/inline-forms.test.ts`
- `npm.cmd run test:ts -- src/lib/workflows/execution-engine.test.ts`
- `npm.cmd run test:ts -- src/lib/integrations/provider-budgets.test.ts`
- `npm.cmd run test:ts -- src/lib/integrations/refresh-coordination.test.ts`
- `npm.cmd run test:ts -- src/lib/integrations/salesforce-selection.test.ts`

**Nota operativa:** La primera version del SQL de retiro re-creaba `integrations_type_check` antes de borrar las filas `type = 'hubspot'`; se corrigio el orden en `20260314183000_retire_hubspot.sql` para eliminar primero esas filas usando una tabla temporal.

---

### Sesion: Refactor hacia Workflows abiertos + Sistema de Automatizaciones

**Fase 1 — Desacoplamiento de templates**
- `src/lib/chat/quick-actions.ts`: `ChatQuickActionProvider` ampliado a `"gmail" | "google_calendar" | "whatsapp"`; `isCrmChat` → `hasConnectedIntegrations`; `provider` singular → `providers[]` plural. Todos los callers actualizados.
- `src/lib/chat/starter-intents.ts`: Eliminados catálogos por template (`SALESFORCE_STARTER_INTENT_CATALOG_BY_TEMPLATE`, `HUBSPOT_STARTER_INTENT_CATALOG_BY_TEMPLATE`). Nuevo `STARTER_INTENTS_BY_INTEGRATION` con entradas para Salesforce, HubSpot, Gmail y Google Calendar. `resolveInitialChatStarterIntents` ahora itera sobre `setupState.integrations`.
- `src/lib/chat/quick-actions-server.ts`: `resolveChatQuickActions` ya no lee `template_id`; itera sobre `setupState.integrations` y resuelve quick actions por integración conectada. Soporte nativo para Gmail y Google Calendar.
- `src/lib/agents/n8n-workflow-selector.ts`: Eliminada referencia a `template_id === "whatsapp_reminder_follow_up"`; Gmail/Google Calendar ya suman `wOAuthTokenRefresh` cuando aplica.
- `src/lib/chat/quick-actions.test.ts`: Test actualizado para usar setup states con integrations explícitas en vez de templateId.

**Fase 2 — Sistema de Automatizaciones**
- `supabase-blocks/15-agent-automations.sql`: Migración SQL para tabla `agent_automations` con RLS, índices y trigger de `updated_at`. Pendiente ejecutar en Supabase.
- `src/lib/db/agent-automations.ts`: CRUD completo (list, get, create, update, soft-delete). Funciones worker usan `createServiceSupabaseClient`.
- `src/lib/agents/automation-suggestions.ts`: Pure function `getAutomationSuggestions(integrations)` con 8 sugerencias predefinidas por combinación de integraciones.
- `src/app/api/agents/[agentId]/automations/route.ts`: GET + POST automations.
- `src/app/api/agents/[agentId]/automations/[automationId]/route.ts`: PATCH + DELETE (soft delete).
- `src/app/api/agents/[agentId]/automations/recommended/route.ts`: GET sugerencias por integración del agente.
- `src/app/api/workers/automations/route.ts`: Worker que evalúa automatizaciones con `trigger_type = 'schedule'` y encola eventos en `event_queue`.
- `src/lib/utils/cron-matcher.ts`: Evaluador de expresiones cron 5 campos sin dependencias externas. Soporta `*`, valores simples, listas, rangos y pasos.
- `src/components/agents/automations/automation-list.tsx`: Lista de automatizaciones con toggle enable/disable y sección de sugerencias. Se auto-carga via fetch.
- `src/components/agents/automations/automation-modal.tsx`: Modal 3 pasos (Trigger → Acción → Revisar) para crear automatizaciones cron.
- `src/components/agents/agent-detail-workspace-utils.ts`: Tab `"automations"` agregada a `WorkspaceTab`.
- `src/components/agents/agent-detail-workspace-main.tsx`: Renderiza `AutomationList` cuando `activeTab === "automations"`.
- `src/components/agents/agent-detail-workspace.tsx`: Tab "Automatizaciones" siempre visible en el workspace.
- `scripts/worker-queue.ts`: `runQueuePass` ahora incluye el worker de automatizaciones en cada ciclo.

**Pendiente**
- Ejecutar `supabase-blocks/15-agent-automations.sql` en Supabase real.
- Agregar tipos generados por Supabase para `agent_automations` en `src/types/database.ts`.
- Eventualmente: soporte UI para trigger tipo `event` (no solo `schedule`).

- La organizacion `Prueba S.A` asociada al usuario `Prueba@gmail.com` fue actualizada manualmente en Supabase al plan `enterprise`, confirmando luego que `organizations.plan_id` apunta al registro `plans.name = 'enterprise'`.
- Se agrego `scripts/worker-service.ts` y el script `npm run worker` para Railway Hobby, consolidando cola y mantenimiento en un solo proceso persistente.
- `src/lib/chat/google-calendar-tool-orchestrator.ts` ahora resume `create_event`, `check_availability` y `list_events` en horario local formateado segun la timezone efectiva del agente, y `src/lib/chat/google-calendar-tool-orchestrator.test.ts` suma cobertura para evitar regresiones donde reaparezca el ISO UTC en approvals.
- `src/lib/chat/google-gmail-tool-planner.ts` ahora consulta un clasificador pequeño con Haiku antes del fallback regex para detectar mejor intents cortos como `crea un borrador que diga "Hola"`; el orquestador de Gmail ya espera el planner async y la cobertura de tests se amplió para ese caso breve con contexto reciente de hilo.
- `src/lib/integrations/refresh-coordination.ts` ahora soporta `onLockError`, ignora errores al liberar locks Redis con TTL y `GET /api/workers/oauth/refresh` usa fallback `refresh_without_lock` para que un timeout de Redis no rompa el refresh preventivo de HubSpot/Google.
- `README.md` y `RAILWAY_PHASE1_RUNBOOK.md` ahora dejan `worker` como despliegue recomendado; `worker:queue` y `worker:maintenance` quedan como fallback o futura separacion si el uso real lo justifica.
- Se agrego `RAILWAY_PHASE1_RUNBOOK.md` con el checklist concreto de deploy y cutover de la Fase 1 hacia Railway.
- Se revalido el checklist de despliegue actual del repo: `Vercel` queda para UI/API/OAuth/webhooks y los procesos persistentes `worker:queue` + `worker:maintenance` siguen yendo por `Railway`, con `APP_BASE_URL` apuntando siempre a la URL publica real de Vercel.
- `scripts/worker-queue.ts` y `scripts/worker-maintenance.ts` ahora responden `200` en `/health` y `404` fuera de `/health` o `/`, para que Railway tenga una ruta de health explicita.
- Se unifico la semantica de compatibilidad de `/api/workers/*`: respuestas `401`, `204`, `200` y `500` ya cargan headers que anuncian modo legado y scheduler primario en Railway; ademas `webhooks` vacio paso a `204` para alinearse con `events` y `rag`.
- `.env.local.example` deja de presentar `CRON_SECRET` como variable exclusiva de Vercel Cron y la documenta como auth/scheduling general de workers.
- Se implemento la Fase 1 minima del plan de salida de `n8n Cloud`: nuevos entrypoints Railway `worker:queue` y `worker:maintenance`, health checks HTTP livianos, shutdown limpio y contrato `event_queue insert -> Redis publish`.
- `worker:queue` no introduce negocio nuevo: ejecuta las mismas rutas `GET /api/workers/events`, `GET /api/workers/rag` y `GET /api/workers/webhooks` desde un proceso persistente, con despertar por `event_queue:notify` y sweep de respaldo cada 30 segundos.
- `worker:maintenance` tampoco reescribe processors: agenda internamente las rutas periodicas ya existentes (`approvals`, `oauth/refresh`, `deletion`, `integrations`, `conversations/reengagement`, `whatsapp/followup`, `whatsapp/broadcast`) para que Railway reemplace al scheduler de `n8n` por fases.
- Se agrego `src/lib/workers/queue-notify.ts` para manejar `PUBLISH` y `SUBSCRIBE` Redis sin sumar dependencias, y `src/lib/db/event-queue.ts` centraliza el wake-up para todos los callers actuales de `enqueueEvent`.
- Verificacion completada para esta slice: `npm.cmd run typecheck` y `npm.cmd run lint` OK.
- Verificacion puntual de esta correccion UX: `npm.cmd run test:ts -- src/lib/chat/google-calendar-tool-orchestrator.test.ts` OK.
- Verificacion puntual del slice Gmail: `npm.cmd run test:ts -- src/lib/chat/google-gmail-tool-planner.test.ts` OK y `npm.cmd run test:ts -- src/lib/chat/google-gmail-tool-orchestrator.test.ts` OK.
- Se agrego un kill switch global de workers via `WORKERS_ENABLED`: todas las rutas `/api/workers/*` ahora responden `204` sin procesar cuando la flag esta en `false`, y `src/lib/agents/n8n-activation.ts` ya no reactiva workflows de `n8n` mientras el switch siga apagado.
- Se sumo el script `scripts/toggle-n8n-workflows.mjs` mas los comandos `npm run workers:pause` y `npm run workers:resume` para desactivar/activar por API todos los workflows JSON importados en `n8n`, pensado para cortar rapido ejecuciones del trial sin entrar manualmente a la UI.
- En este entorno local ya se ejecuto `npm.cmd run workers:pause`: quedaron desactivados los workflows remotos de `n8n` visibles por API (`Conversation Reengagement`, `CRM Sync HubSpot/Salesforce`, `Deletion Worker`, `Event Queue Worker`, `Integration Health Worker`, `OAuth Token Refresh`, `RAG Processor`, `Webhook Delivery Worker`, `WhatsApp Broadcast` y `WhatsApp Follow Up`), y `Approval Expiration Worker` se reporto como no importado en esa instancia.
- Se verifico el comportamiento operativo de `GET /api/workers/events`: el scheduler oficial en `n8n` lo consulta cada 15 segundos y la route devuelve `204` cuando `claimEvents(...)` no encuentra eventos pendientes, asi que ese log repetido es esperado mientras la cola este vacia.
- Se actualizo `AUTOMATION_PHASE0_PLAN.md` con un mapa de gaps confirmados en el codigo real y una secuencia de implementacion por slices para `schema+types`, approval inbox, contratos runtime, execution engine, budget admission y primeros ecosistemas.
- Quedo explicitado en el plan que `src/lib/integrations/provider-budgets.ts` hoy registra consumo despues del provider call y que `src/lib/workers/event-queue.ts` todavia no persiste estado de saga por `workflow_run`/`workflow_step`.
- Tambien quedo asentado que `src/components/layout/app-header.tsx` y `src/app/(app)/layout.tsx` ya ofrecen un patron claro para el badge/counter de approvals, pero que approvals deben tener inbox y APIs propias en lugar de reutilizar `notifications`.
- Se extendio `src/types/database.ts` con `workflow_runs`, `workflow_steps`, `approval_items` y `provider_budget_allocations`, y `src/types/app.ts` ahora exporta aliases para esas entidades.
- Se agregaron `src/lib/db/workflow-runs.ts`, `src/lib/db/workflow-steps.ts`, `src/lib/db/approval-items.ts` y `src/lib/db/provider-budget-allocations.ts` como capa server-side inicial para la persistencia de Phase 0.
- `src/lib/db/approval-items.ts` ya implementa expiracion automatica por timeout, conteo de pendientes, listados y resolucion `approve/reject`, actualizando tambien el `workflow_step` y `workflow_run` relacionados con estados base.
- Se agregaron `GET/PATCH /api/approvals` y `GET /api/approvals/count`, mas la nueva pagina `src/app/(app)/approvals/page.tsx` con `src/components/approvals/approval-inbox.tsx`.
- El shell principal ahora muestra el estado de approvals pendientes en `src/components/layout/app-header.tsx`, `src/components/layout/app-sidebar.tsx` y `src/app/(app)/layout.tsx`.
- Verificacion completada para esta slice: `npm.cmd run typecheck` y `npm.cmd run lint` OK.
- Se actualizo `AUTOMATION_PHASE0_PLAN.md` para consolidar la `Fase 0` comun con approval inbox web, badge/counter in-app, expiration policy, async engine, saga coordinator, provider budget allocator con admision previa e idempotencia por step.
- El plan ahora deja cerrado el orden por ecosistema, la coordinacion cross-system via saga y los gaps/fases concretas para Gmail, Google Calendar, HubSpot, Salesforce, WhatsApp, Slack, Teams, Notion y Zapier.
- Se tomo `supabase/migrations/20260313223000_add_workflow_phase0_foundation.sql` como baseline aprobado de schema con `workflow_runs`, `workflow_steps`, `approval_items` y `provider_budget_allocations`, mas FK cruzados, triggers `updated_at` y RLS base.
- `SCHEMA.md` ya refleja las nuevas tablas Phase 0, sus contratos principales y las policies iniciales para runs, steps, approvals y budget allocations.
- Se agrego `src/lib/agents/workflow-templates.ts` con el catalogo inicial de workflows, presets permitidos, integraciones requeridas/opcionales, metricas observables y recomendaciones de modelo por workflow.
- `src/lib/agents/agent-setup.ts` y `src/lib/agents/agent-setup-state.ts` ahora aceptan y normalizan metadata workflow-first dentro de `setup_state`, ampliando `current_step` hasta 6 y preservando compatibilidad con el flujo legacy.
- El wizard de `src/components/agents/wizard/agent-creation-wizard.tsx` fue rehecho para entrar por workflow template, crear instancia nombrada, validar integraciones requeridas conectadas, configurar preset/reglas y cerrar con review workflow-first.
- Se agregaron `step-workflow-select.tsx`, `step-instance-config.tsx` y `step-workflow-rules.tsx`; tambien se actualizaron `step-integrations-scope.tsx`, `step-model-select.tsx`, `step-review.tsx` y `wizard-step-indicator.tsx` para la nueva UX.
- La review final ahora expone required vs optional integrations, preset de automatizacion, acciones automaticas / con confirmacion / en sugerencia, modelo elegido y tradeoff orientativo por workflow.
- Gmail ahora vuelve a requerir scopes ampliados en la superficie Google compartida: `gmail.metadata`, `gmail.compose` y `gmail.modify`, para soportar lectura segura mas borradores, labels y archivado reales.
- Se agregaron `src/lib/integrations/google-gmail-agent-runtime.ts`, `src/lib/chat/google-gmail-tool-planner.ts` y `src/lib/chat/google-gmail-tool-orchestrator.ts` para ejecutar lectura real de Gmail en `chat web` con respuestas directas server-side.
- El runtime de Gmail trabaja solo con metadata segura: busca hilos recientes por filtro local sobre subject/from/snippet, lee threads con headers + snippet + conteo de adjuntos, y nunca expone body completo ni HTML al LLM.
- `/api/chat` ahora orquesta Gmail antes del paso al LLM, agrega un guardrail anti prompt-injection cuando Gmail runtime esta activo y mantiene `toolContext` delimitado como `CONTENIDO EXTERNO NO CONFIABLE: GMAIL` solo cuando hace falta continuar la conversacion.
- `recent_crm_tool_context` ahora soporta TTL por proveedor; Gmail usa 5 minutos y persiste solo `thread_id` + asunto sanitizado, sin snippet ni body.
- Los defaults de Gmail quedaron read-only para agentes nuevos: `getDefaultGmailAgentToolConfig()` y el preset de setup guardan solo `search_threads` + `read_thread`, aunque el schema todavia acepta acciones de escritura por compatibilidad.
- Se agregaron contratos tipados de Gmail write (`create_draft_reply`, `apply_label`, `archive_thread`) con `thread_id/message_id` estables, planner conversacional conservador, approval payloads legibles y detalle operativo especifico en `/approvals`.
- `src/lib/integrations/google-gmail-agent-runtime.ts` ahora ejecuta writes reales de Gmail: crea borradores reply usando `threadId` + headers de reply, aplica labels existentes por nombre y archiva quitando `INBOX`, todo con refresh de token, errores seguros e idempotencia efectiva por step.
- `src/lib/chat/google-gmail-tool-planner.ts` y `src/lib/chat/google-gmail-tool-orchestrator.ts` ahora encadenan `read_thread -> write approval` cuando falta `message_id`, y una busqueda de Gmail con un solo resultado deja `thread_id` minimo en `recent_crm_tool_context` para habilitar el siguiente turno sin pedir ids manuales.
- La idempotencia de Gmail write ahora queda cubierta asi: `archive_thread` y `apply_label` son no duplicables por contrato del provider, y `create_draft_reply` reusa drafts existentes del mismo `workflowStepId` via header `X-AgentBuilder-Workflow-Step-Id` antes de crear uno nuevo.
- `src/lib/workflows/execution.ts` ya soporta `provider = gmail` dentro de `workflow.step.execute`, reutilizando `service_role`, runtime Google compartido y trazabilidad por `workflow_step`.
- Se actualizaron copy/diagnosticos de Gmail en tools, Settings y prompts recomendados para dejar de presentarlo como `metadata-only` absoluto: lectura sigue sin body completo, pero las writes asistidas ya estan habilitadas en chat web.
- Verificacion local completada para este slice Gmail: `npm.cmd run typecheck`, `npm.cmd run lint`, `npm.cmd run test:ts -- src/lib/chat/google-gmail-tool-planner.test.ts`, `npm.cmd run test:ts -- src/lib/integrations/google-gmail-agent-runtime.test.ts`, `npm.cmd run test:ts -- src/lib/chat/google-gmail-tool-orchestrator.test.ts` y `npm.cmd run test:ts -- src/lib/integrations/google-gmail-config.test.ts` OK.
- Se agregaron tests TS para config/scopes de Gmail, runtime metadata-only y orquestador de Gmail; hoy compilan con `tsc`, pero siguen sin correr directo con `node` por el mismo problema ESM/path aliases del repo.
- Se agrego runtime server-side para `check_availability` (`freeBusy`) y `list_events` (`events.list`) con contrato `ExecuteGoogleCalendarReadToolInput`, errores seguros y `reauth_required` si falla auth tras retry.
- Se agregaron budgets propios de Calendar en `provider-budgets`, planner/orquestador de Calendar para chat web, uso de timezone del setup checklist y persistencia de `recent_crm_tool_context` con provider `google_calendar`.
- `src/app/api/chat/route.ts` ahora conecta Calendar real solo en chat web y pasa `googleCalendarRuntimeAvailable: true` cuando corresponde.
- Se ajusto el copy visible de Calendar para dejar claro: disponible en chat web, no disponible todavia en `/run`, sin escrituras en v1.
- Se agregaron tests TS para planner, runtime y orquestador de Calendar.
- Se agrego `src/lib/integrations/google-calendar-timezone.ts` para resolver/persistir timezone detectada desde `CalendarList/primary` y fallback `Settings/timezone`, con cache en `integrations.metadata`.
- `GoogleOauthResult`, `GoogleIntegrationConfig` y la lectura flexible de metadata Google ahora exponen `google_calendar_primary_timezone` y `google_calendar_user_timezone`; OAuth callback y refresh preservan/actualizan esos valores.
- El setup checklist de horarios ahora trata la timezone como override manual del admin: autocompleta la detectada si no habia override, la muestra como "Detectada desde Google Calendar" y no pisa ediciones manuales previas.
- El orquestador de Google Calendar ahora devuelve copy accionable cuando la integracion queda en `reauth_required`, sin scopes o con tool faltante/desalineada, y Settings vuelve a mostrar CTA explicito de `Reconectar Google Calendar` para esos estados.
- El runtime de Google Calendar ya no marca `reauth_required` ante cualquier `403`: ahora distingue credenciales invalidas (`401` o `403` auth real) de permisos/scopes insuficientes y evita volver a romper la integracion por un rechazo de permisos del proveedor.
- Diagnostico real del loop manual en org `6b2f20e7-fed4-426c-b7b8-03c273a93217`: la integracion Google queda `connected` con `refresh_token` y scopes de Calendar, pero Google responde `403 accessNotConfigured` porque la Google Calendar API no esta habilitada en el proyecto OAuth. El runtime ahora lo reporta como infraestructura/API deshabilitada, no como reautenticacion.
- LiteLLM ahora espera hasta 30s antes de abortar `chat/completions` (`src/lib/llm/litellm.ts`), porque el mensaje "El proveedor tardo demasiado en responder" venia del timeout local de 15s y no de Google Calendar.
- `/api/chat` ahora emite `stageTimings` en `chat.pre_stream_ready` y `chat.stream_ready` para separar latencia de historial, RAG, persistencia, orquestacion (incluido Google Calendar), checks de runtime y readiness del LLM.
- Esa observabilidad de `/api/chat` ahora solo se imprime cuando la request supera 5s o cuando hubo RAG/tool backend, para reducir ruido en logs normales.
- Las consultas simples de Google Calendar (`list_events`, `check_availability`) ahora responden directo desde el orquestador con formato server-side, sin pasar por Claude, para recortar la latencia dominante del LLM en ese flujo.
- `src/lib/auth/get-session.ts` ya no usa `react cache`; cada request relee la sesion desde cookies/Supabase para evitar `401 No autenticado` espurios en route handlers cuando la sesion rota o refresca entre requests.
- Se agrego `src/lib/workflows/action-matrix.ts` como primer contrato runtime formal por proveedor/accion para approvals workflow-driven, con timeout y riesgo base para HubSpot, Salesforce, Gmail y Google Calendar.
- Se agrego `src/lib/workflows/approval-request.ts` para crear `workflow_runs`, `workflow_steps` y `approval_items` server-side desde acciones asistidas disparadas en chat.
- `src/lib/chat/crm-core.ts` ahora soporta providers que, en lugar de confirmar con `confirmo`, crean una approval real y responden con guidance hacia `/approvals`; si el usuario insiste con `confirmo`, el chat lo redirige a la inbox en vez de ejecutar la write.
- `src/lib/chat/hubspot-tool-orchestrator.ts` y `src/lib/chat/salesforce-tool-orchestrator.ts` ya conectan esas approvals reales usando `workflowTemplateId` y `automationPreset` del `setup_state`.
- `src/lib/chat/crm-core.test.ts` gano cobertura para el nuevo flujo de approval inbox ademas del flujo legacy de confirmacion en chat.
- `src/app/api/approvals/route.ts` ahora encola `workflow.step.execute` al aprobar, con idempotency key por `workflow_step`.
- `src/lib/workflows/execution.ts` agrega el primer ejecutor workflow-driven real: toma el `workflow_step` aprobado, recupera `integration_id` desde `workflow_run.metadata`, parsea el payload persistido y ejecuta HubSpot/Salesforce reusando los runtimes server-side existentes.
- `src/app/api/workers/events/route.ts` y `src/lib/workers/event-processor.ts` ya reclaman y procesan `workflow.step.execute`, cerrando `workflow_step`/`workflow_run` como `completed` o `failed`.
- Se agrego `src/lib/workflows/execution-engine.ts` como policy engine puro para normalizar errores, decidir retries por step, avanzar al siguiente step del run y degradar el run a `partially_completed` o `manual_repair_required` segun `is_required` y compensacion declarada.
- `src/lib/workflows/execution.ts` ahora crea nuevos intentos de `workflow_steps` cuando el error es transitorio (`rate_limited` / `provider_error` retryable), reencola el intento siguiente con backoff y usa la metadata persistida del run para continuar workflows multi-step ya materializados.
- `src/lib/db/approval-items.ts` ya no manda toda expiracion/rechazo directo a `manual_repair_required`: reusa la misma semantica del engine para distinguir `blocked` en primeros steps sin side effects, continuar pasos futuros cuando el step rechazado/expirado era opcional y marcar compensaciones pendientes si hubo pasos previos completados con `compensation_action`.
- `src/lib/workflows/approval-request.ts` deja `max_attempts: 3` en los steps creados desde chat, `src/app/api/approvals/route.ts` eleva `maxAttempts` del evento a 3 para cubrir fallos transitorios del worker y `src/lib/workflows/execution-engine.test.ts` agrega cobertura unitaria del nuevo policy engine.
- `src/lib/integrations/provider-budgets.ts` ahora puede reservar budget workflow-scoped y persistir la decision en `provider_budget_allocations`; el `window_key` distingue politica/ventana para evitar colisiones por `method_key`.
- `src/lib/integrations/provider-gateway.ts` acepta `workflowRunId` + `workflowStepId` opcionales: si vienen presentes, reserva budget antes de la llamada, rechaza por quota con trazabilidad persistida y al cerrar la request marca las reservas como `consumed` o `released`.
- `src/lib/integrations/hubspot-agent-runtime.ts`, `src/lib/integrations/salesforce-agent-runtime.ts` y `src/lib/workflows/execution.ts` ya propagan el contexto de `workflow_run`/`workflow_step` al gateway para que HubSpot/Salesforce usen allocator previo real dentro del engine async.
- `src/lib/redis.ts` suma `getCounter()` para inspeccionar cuota sin consumirla, `src/lib/integrations/provider-budgets.ts` exporta la heuristica `decideProviderBudgetAdmission()` y `src/lib/integrations/provider-budgets.test.ts` cubre la nueva semantica `allow -> queue -> throttle -> reject`.
- Se agrego `src/lib/workflows/compensation.ts` como ejecutor server-side de compensaciones y `src/lib/workflows/approval-request.ts` ahora declara `compensation_action` cuando la write tiene una reversión segura conocida.
- HubSpot y Salesforce sumaron compensaciones iniciales reales para `create_contact` y `create_task`: HubSpot archiva el objeto creado y Salesforce lo elimina; `create_lead`, `create_case`, `create_deal` y writes equivalentes siguen cayendo en reparacion manual.
- `src/lib/workflows/execution.ts` y `src/lib/db/approval-items.ts` ahora disparan compensación tanto en fallos de ejecución como en rechazos/expiraciones de approval cuando el run ya tenia side effects previos.
- La trazabilidad de compensación queda persistida por step dentro de `output_payload.compensation` con `action`, `status`, `startedAt`, `finishedAt`, `providerRequestKey` y resultado/error, además de `compensation_status`.
- `src/lib/integrations/google-agent-tools.ts` ya define contratos de write para Calendar, `src/lib/integrations/google-calendar-agent-runtime.ts` ejecuta mutaciones reales sobre `primary`, y `src/lib/workflows/execution.ts` ya soporta `provider = google_calendar` dentro de `workflow.step.execute`.
- El contrato de compensación ahora reconoce `google_calendar:create_event` como reversible y `src/lib/workflows/compensation.ts` puede cancelar el evento creado cuando un step requerido posterior falla.
- `src/lib/chat/google-calendar-tool-planner.ts` ya no es read-only: extrae titulo, fecha y rango horario para `create_event`, y usa el contexto reciente de `list_events` para resolver `reschedule_event` / `cancel_event`.
- `src/lib/chat/google-calendar-tool-orchestrator.ts` ahora crea approval items reales para writes de Calendar y responde con guidance a la inbox; `confirmo` vuelve a redirigir a `/approvals` si la accion ya quedo pendiente.
- `src/lib/integrations/google-calendar-agent-runtime.ts` ahora persiste ids/titulos/start/end de eventos en el tool context para que las siguientes acciones del chat puedan referirse al evento recien listado sin inventar ids.
- La desambiguacion de eventos de Google Calendar en chat ya no cae ciegamente al primer evento reciente: ahora prioriza `eventId`, ordinales ("segundo evento"), titulo quoted, matching por tokens y hora/fecha local; si siguen quedando varios candidatos devuelve guidance con opciones concretas para evitar mutaciones sobre el evento equivocado.
- Las approvals de Google Calendar para `reschedule_event` y `cancel_event` ahora arrastran contexto humano del evento resuelto (`eventTitle`, `eventStartIso`, `eventEndIso`, `eventTimezone`) dentro del `actionInput`, generan summaries legibles en inbox y persisten `payload_summary.resolved_event` para inspeccion operativa.
- `Fase 0` gano dos cierres operativos pendientes: existe worker dedicado `GET /api/workers/approvals` para expirar approvals sin depender de abrir la inbox, y el engine ya distingue `budget_queued`, `budget_throttled` y `budget_exhausted` en vez de colapsar toda admision previa del allocator en un `429` generico.
- Quedo cerrada la decision operativa del scheduler: `Fase 0` usa `n8n` como scheduler oficial para workers recurrentes. El repo ya tenia workflows para `/api/workers/events` y `/api/workers/integrations`, y ahora suma tambien `n8n/workflows/approval-expiration-worker.json` para `/api/workers/approvals`; `vercel.json` deja de ser la fuente de scheduling.
- `/approvals` ya renderiza detalles amigables para Google Calendar en vez de depender solo del JSON crudo: muestra accion, evento resuelto, id, timezone y horarios actual/nuevo para `create_event`, `reschedule_event` y `cancel_event`, manteniendo el payload tecnico abajo como fallback de debugging.
- El planner de Google Calendar ya extrae tambien `location`, `description` y `attendeeEmails` cuando el usuario los explicita en lenguaje relativamente estructurado, y esos campos ahora viajan hasta approvals y ejecucion real para `create_event` y `reschedule_event`.
- La inbox de approvals ya muestra esos nuevos campos de Calendar (`ubicacion`, `invitados`, `descripcion`) dentro del bloque amigable, sin perder el JSON tecnico como respaldo.
- El planner de Google Calendar ahora tambien soporta variantes mas libres para contexto de write: detecta mejor `nota/detalle/aclaracion`, acepta ubicaciones tipo `por Zoom/via Meet` y arrastra `location`, `description` y `attendeeEmails` tambien en `cancel_event` solo como contexto de approval.
- Se extendio el contrato tipado de `cancel_event` para admitir ese contexto opcional sin afectar la ejecucion real, y se sumo cobertura en tests del planner/orchestrator para cancelaciones con contexto y frases menos estructuradas.
- Se alineo `README.md` y `AUTOMATION_PHASE0_PLAN.md` con el cierre definitivo de `Fase 0`: el scheduler oficial ya no es Vercel Cron sino `n8n`, con frecuencia esperada por worker y autenticacion bearer usando una `Variable` `cronSecret` en `n8n`.
- Para desarrollo local se dejo explicitado el puente correcto entre `n8n` en Docker y la app Next nativa: `compose.yaml` ahora agrega `host.docker.internal:host-gateway` al servicio `n8n` y fija `APP_BASE_URL=http://host.docker.internal:3000` dentro del contenedor.
- Se suavizo `src/lib/utils/request-security.ts` solo para desarrollo local: la validacion same-origin ahora acepta equivalencia entre `localhost`, `127.0.0.1` y `host.docker.internal` cuando protocolo y puerto coinciden, evitando falsos `Origen no permitido` en chat/login durante el trabajo local.
- Se encontro el bloqueo real del path `approval -> worker -> Google Calendar`: el `workflow_run` fallaba con `provider_error permission denied for function get_user_organization_id`. Se agrego la migracion `supabase/migrations/20260314035000_grant_rls_helper_functions_to_service_role.sql` para grant de `EXECUTE` sobre `get_user_organization_id()` y `get_user_role()` a `service_role`.
- Verificacion completada para esta slice: `npm.cmd run typecheck` y `npm.cmd run lint` OK.
- Se corrigio un bug real del path async de compensacion: Google Calendar estaba cargando runtime de compensacion con el helper user-scoped en vez de `service_role`, lo que podia romper reversiones dentro del worker.
- Se corrigieron bugs funcionales del planner de Google Calendar detectados al habilitar la bateria ejecutable: preguntas de `eventos` ya no caen en `check_availability`, consultas sin ventana temporal responden `missing_data`, reschedules con frases tipo `evento de las 10 -> 12:30 a 13:30` usan el ultimo rango como destino y la deteccion de `eventId` ya no interpreta la preposicion `a` como id.
- Se corrigio el detector de auth/permisos del runtime de Google Calendar para no tratar `403 insufficient scopes` como si fueran errores de refresh/reauth, preservando el mensaje correcto al operador.
- `src/lib/agents/agent-setup.ts` ahora tolera mejor `setup_state` parciales o legacy sin asumir que siempre existen `requiredIntegrations`, `optionalIntegrations`, `allowedAutomationPresets`, `instanceConfig`, `builder_draft` o `checklist`.
- Verificacion completada para este cierre de Calendar: `npm.cmd run typecheck`, `npm.cmd run lint` y `npm.cmd run test:google-calendar` OK, ademas de una corrida live contra la org `6b2f20e7-fed4-426c-b7b8-03c273a93217` y el agente `629ba835-c98d-4da2-85b4-94723aa4cd68` que creo/reprogramo/cancelo el evento real `h3qns5568njsia2v7539ofcaq4`.

## Pendientes inmediatos

- Desplegar `worker` en Railway con las mismas credenciales server-side de Supabase/Redis que hoy usa Vercel, y verificar que el health check golpee `GET /health` en el `$PORT` correcto.
- Con `worker` arriba, pausar en `n8n Cloud` al menos `rag-processor`, `event-queue-worker` y `webhook-delivery` para cortar consumo duplicado y validar que la cola siga drenando solo desde Railway.
- Desplegar `worker:queue` y `worker:maintenance` en Railway con las mismas credenciales server-side de Supabase/Redis que hoy usa Vercel, y verificar que el health check golpee el `$PORT` correcto de cada proceso.
- Con `worker:queue` arriba, pausar en `n8n Cloud` al menos `rag-processor`, `event-queue-worker` y `webhook-delivery` para cortar consumo duplicado y validar que la cola siga drenando solo desde Railway.
- Verificar en vivo el contrato `INSERT event_queue -> PUBLISH event_queue:notify`: un evento nuevo debe despertarse sin esperar el sweep, y ante falla Redis debe recuperarse en el siguiente sweep de 30s.
- Verificar en staging/produccion que cualquier llamada de compatibilidad a `/api/workers/*` devuelva los headers `x-agentbuilder-worker-mode=compatibility` y `x-agentbuilder-worker-scheduler=railway-primary`, para que observabilidad y runbooks detecten rapido si el cutover quedo incompleto.
- Validar shutdown limpio en Railway enviando `SIGTERM` durante un batch real y confirmar que no reclame nuevos jobs mientras termina el lote en curso.
- Si el objetivo es bajar consumo del trial de `n8n` ya mismo, no alcanza con `WORKERS_ENABLED=false`: hace falta ejecutar `npm run workers:pause` en un entorno con acceso a `N8N_BASE_URL` + `N8N_API_KEY` validos para desactivar los workflows remotos.
- Regenerar `src/types/database.ts` si los tipos locales todavia no fueron refrescados contra el entorno Supabase ya migrado.
- Confirmar en el entorno `n8n` productivo que existan las variables `appBaseUrl` y `cronSecret`, y que queden importados y activos `event-queue-worker`, `approval-expiration-worker` e `integration-health`.
- Aplicar la migracion `20260314035000_grant_rls_helper_functions_to_service_role.sql` en Supabase antes de seguir validando writes workflow-driven de Google Calendar u otros paths async que toquen tablas con policies basadas en esos helpers.
- Extender compensaciones reales a mas acciones reversibles. Hoy la cobertura incluye Salesforce `create_contact` + `create_task` y Google Calendar `create_event`; faltan `reschedule_event`, Gmail writes y otros providers.
- Materializar runs multi-step reales desde los planners/runtime slices futuros; el engine de `Fase 0` ya puede avanzarlos si las filas existen, pero varios ecosistemas siguen creando un solo step por approval.
- Seguir endureciendo el parser conversacional de Google Calendar para lenguaje aun mas libre. Ya cubre mejor `nota/detalle/aclaracion`, `por Zoom/via Meet` y contexto opcional en `cancel_event`, pero todavia depende de emails literales y de pistas relativamente explicitas.
- Extender esa renderizacion amigable de `/approvals` a otros providers que tambien tengan payloads operativos ricos.
- Extender el allocator previo a Google Workspace, WhatsApp y otros callers fuera del engine CRM; hoy la persistencia en `provider_budget_allocations` ya cubre Salesforce workflow-driven, pero el resto sigue usando solo contador Redis.
- Profundizar observabilidad/metricas del allocator en UI o reporting; el engine ya distingue `queue`, `throttle` y `budget_exhausted`, pero todavia falta explotar esa senal en superficies operativas.
- Regenerar tipos de Supabase una vez que la migracion `20260313223000_add_workflow_phase0_foundation.sql` quede aplicada en el entorno real que corresponda.
- Validar si `provider_budget_allocations` cubre todo el contrato de admision/reserva o si todavia hace falta documentar estado efimero complementario en Redis.
- Diseñar la `approval inbox` web y el badge/counter de pendientes reutilizando el shell actual, pero con modelo propio y sin depender solo de `notifications`.
- Formalizar la action matrix por proveedor/accion para reemplazar heuristicas actuales de `read/write/requiresConfirmation`.
- Conectar el detalle del agente y el listado de agentes a la nueva semantica visible de "workflow instance" para que la UX no siga hablando solo de "agente" en todas las superficies.
- Implementar la gobernanza runtime uniforme de required vs optional integrations en `/api/chat` y futuras superficies, usando la metadata nueva de `setup_state` en vez de copy fijo.
- Definir si `tool_scope_preset` debe seguir visible tal cual o compilarse internamente desde `automationPreset` en una iteracion posterior, para evitar duplicidad conceptual.
- Decidir si los workflows futuros no vendibles (`phase 3+`) deben seguir visibles en el catalogo principal o pasar a una vista "coming soon".
- Validar manualmente con una integracion Google real de Gmail ya reconectada con scopes `gmail.metadata + gmail.compose + gmail.modify`, habilitar tool Gmail y probar `search_threads` + `read_thread` desde `chat web`.
- Validar en vivo el cierre de Gmail v1.5: crear draft real y confirmar que aparece en Gmail, aplicar label real y confirmar que queda en el thread, archivar thread real y confirmar que sale de Inbox pasando por `approval inbox + worker + runtime`.
- Confirmar en vivo los estados terminales del path Gmail: `approval_items.status`, `workflow_runs.status`, `workflow_steps.status`, `event_queue.status`, y revisar que expiracion/rechazo queden correctos tambien para approvals Gmail.
- Validar manualmente el caso `reauth_required`: confirmar que el chat guia a `Settings > Integraciones` y que la card de Google Calendar ofrece `Reconectar Google Calendar`.
- Validar manualmente el flujo de setup con un agente existente sin metadata nueva para confirmar la autohidratacion al primer ingreso.
- Si la siguiente fase suma escrituras o soporte en `/run`, reutilizar este slice vertical sin abrir una abstraccion mayor antes de tiempo.

## Riesgos o bloqueos

- El modo `Hobby-first` reduce costo y complejidad operativa, pero concentra cola y maintenance en un solo proceso; si la carga real crece o RAG bloquea demasiado, habra que volver a separar servicios.
- La Fase 1 nueva reutiliza route handlers Next dentro de scripts Node; paso `typecheck`/`lint`, pero todavia falta la validacion operativa en Railway para confirmar que `next/server` y las dependencias server-only del repo se comportan igual fuera del proceso web.
- Los headers de compatibilidad mejoran trazabilidad del cutover, pero no fuerzan por si solos que nadie siga usando `n8n`; la salida real sigue dependiendo de pausar los workflows remotos y validar logs en Railway.
- `worker:queue` hoy orquesta tres batches separados (`events`, `rag`, `webhooks`) sobre la misma `event_queue`; funcionalmente sirve para la migracion, pero mas adelante conviene consolidar ese dispatch en una libreria comun para reducir acoplamiento a route handlers legacy.
- `worker:maintenance` migra a Railway solo los jobs periodicos que ya existen en repo; followups/broadcasts futuros basados en `due_at` o `next_run_at` todavia requeriran endurecer contratos de claim/idempotencia cuando salgan del modo actual.
- `WORKERS_ENABLED=false` corta procesamiento server-side y evita reactivaciones automaticas, pero por si solo no impide que `n8n` siga contando ejecuciones programadas; para eso hay que desactivar los workflows remotos.
- Redis sigue siendo necesario para coordinar wake-ups y locks, pero el job `oauth-refresh` ya no trata un `Tiempo de espera agotado en Redis` como si fuera un fallo propio del provider mientras el refresh pueda ejecutarse igual.
- La base de automatizacion real ya tiene schema Phase 0 aplicado en Supabase y cierre de scheduler definido en `n8n`; lo pendiente ya no es fundacional sino operacion/QA y expansion por ecosistema.
- El repo ya tiene `event_queue`, budgets y notificaciones, pero todavia como piezas parciales; falta unificarlas sin mezclar approvals con notificaciones genericas ni registrar consumo solo despues de pegarle al proveedor.
- A nivel repo y decision operativa, la `Fase 0` comun queda cerrada: approvals con expiracion definida, inbox y badge, engine async, retries, compensacion inicial, allocator previo, idempotencia por step, schema aplicado y scheduler oficial en `n8n`. Lo que sigue ahora es QA operativa, instrumentacion y expansion por ecosistema sobre esa base.
- La gobernanza workflow-first hoy queda modelada en `setup_state` y visible en wizard/review, pero todavia no compila una matriz runtime por accion; la degradacion uniforme y enforcement transaccional siguen pendientes de Fase 2.
- La action matrix nueva ya existe como baseline para approvals workflow-driven, pero todavia no reemplaza todas las heuristicas legacy del producto ni gobierna budgets/admision/ejecucion end-to-end.
- Las compensaciones automaticas ya existen para un subconjunto seguro de CRM, pero siguen dependiendo de `integration_id` + `created_by` presentes en `workflow_runs.metadata`; runs viejos o incompletos sin esos datos seguiran cayendo en `manual_repair_required`.
- Google Calendar ya puede escribir y compensar dentro del engine, y el chat ahora evita fallback peligroso al primer evento reciente; de todos modos faltan validaciones/manual QA de UX para mutaciones reales y desambiguaciones mas libres fuera de los patrones cubiertos.
- Google Calendar v1.5 de escritura ya no esta bloqueado por dudas de implementacion: el flujo real de approval inbox + worker + runtime quedo validado en vivo. Lo pendiente en este ecosistema pasa por expansion/cobertura adicional, no por cierre operativo base.
- El parser de write de Google Calendar en chat es intencionalmente conservador: requiere horario explicito para crear/reprogramar y se apoya en contexto reciente para identificar eventos; frases mas libres todavia pueden caer en `missing_data`.
- El allocator previo ya persiste admisiones para Salesforce y el engine distingue `queue/throttle/reject`, pero esa semantica todavia no cubre todos los providers/callers; fuera de ese camino aun hay consumo guiado solo por Redis.
- La trazabilidad temporal de compensación se persiste dentro de `output_payload.compensation` porque el schema actual no tiene columnas dedicadas para timestamps de compensación; si esa data necesita consulta SQL directa, hara falta migracion futura.
- El review clasifica acciones en automaticas vs escritura usando heuristicas por nombre de tool (`search/read/list/check/get`); alcanza para UX inicial, pero no reemplaza una matriz formal por accion.
- El wizard ahora bloquea la creacion si una integracion requerida no figura operativa, pero no crea todavia una experiencia de "guardar como draft incompleto" diferenciada para workflows con requeridas faltantes.
- `npm.cmd run build` falla en este entorno con `spawn EPERM`, asi que no quedo verificada la build de Next end-to-end.
- La ejecucion directa de `node src/...test.ts` sigue fallando por resolucion ESM/path aliases del repo; usar `npm.cmd run test:ts -- <archivo>` o `npm.cmd run test:google-calendar`.
- Gmail sigue siendo metadata-only para lectura: `search_threads` continua filtrando localmente sobre hilos recientes y `read_thread` no expone body completo ni HTML, aunque ahora la misma superficie tambien soporte writes asistidas.
- El cierre operativo de Gmail v1.5 ya quedo implementado y verificado localmente, pero todavia falta QA vivo contra una cuenta real para confirmar scopes, labels existentes y comportamiento visual real de drafts/archivado en Gmail.
- El planner de fechas relativas cubre v1 (`hoy`, `manana`, `pasado manana`, `esta semana`, weekdays, ISO date, `despues de eso`), pero no lenguaje temporal mas complejo.
- La deteccion de timezone desde Google se hace best-effort: si Google devuelve valores invalidos o falla la consulta, se conserva el fallback actual sin bloquear el runtime.

## Comandos de verificacion conocidos

- `npm.cmd run lint`
- `npm.cmd run typecheck`
- `npm.cmd run test:ts -- src/lib/chat/google-gmail-tool-planner.test.ts`
- `npm.cmd run test:ts -- src/lib/integrations/google-gmail-agent-runtime.test.ts`
- `npm.cmd run test:ts -- src/lib/chat/google-gmail-tool-orchestrator.test.ts`
- `npm.cmd run test:ts -- src/lib/integrations/google-gmail-config.test.ts`
- `npm.cmd run test:ts -- src/lib/chat/google-calendar-tool-planner.test.ts`
- `npm.cmd run test:google-calendar`
- `npm.cmd run test:ts -- src/lib/chat/crm-core.test.ts`
- `npm.cmd run test:ts -- src/lib/chat/inline-forms.test.ts`
- `npm.cmd run test:ts -- src/lib/workflows/execution-engine.test.ts`
- `npm.cmd run test:ts -- src/lib/integrations/provider-budgets.test.ts`
- `npm.cmd run test:ts -- src/lib/integrations/refresh-coordination.test.ts`
- `npm.cmd run test:ts -- src/lib/integrations/salesforce-selection.test.ts`
- `npm.cmd run build`
- `node --experimental-strip-types src\\lib\\integrations\\google-gmail-config.test.ts`  `falla hoy por resolucion ESM/extensiones locales`
- `node --experimental-strip-types src\\lib\\integrations\\google-gmail-agent-runtime.test.ts`  `falla hoy por resolucion ESM/extensiones locales`
- `node --experimental-strip-types src\\lib\\chat\\google-gmail-tool-orchestrator.test.ts`  `falla hoy por resolucion ESM/extensiones locales`
- `node src\\lib\\chat\\google-calendar-tool-planner.test.ts`  `seguiria fallando directo sin el loader por aliases TS`
- `node src\\lib\\integrations\\google-calendar-agent-runtime.test.ts`  `seguiria fallando directo sin el loader por aliases TS`
- `node src\\lib\\chat\\google-calendar-tool-orchestrator.test.ts`  `seguiria fallando directo sin el loader por aliases TS`
