## Snapshot sesion 2026-03-20 - Migración a planner-only runtime (sin declarative engine)

- Estado actual: el declarative engine fue eliminado completamente. Todas las requests pasan por el planner LLM. El flujo es: pre-policy → request shaping → planner → runtime execution O semantic fallback.
- Ultimos cambios relevantes:
  - **Paso 0a** — Eliminados 9 archivos muertos: `declarative-chat-read-engine.ts`, `declarative-chat-read-engine.test.ts`, `declarative-capability-resolver.ts`, `declarative-capability-resolver.test.ts`, `capability-graph.ts`, `capability-graph.test.ts`, `declarative-chat-engine-flag.server.ts`, `intent-planner-llm.ts`, `intent-planner-llm.test.ts`.
  - **Paso 0a** — `env.ts`: eliminadas variables `DECLARATIVE_CHAT_ENGINE_ENABLED` y `DECLARATIVE_CHAT_ENGINE_ORG_IDS`.
  - **Paso 0a** — `conversation-metadata.ts`: renombrados `RecentDeclarativeEngineContext` → `RecentActionContext`, `recentDeclarativeEngineContextSchema` → `recentActionContextSchema`, `recent_declarative_engine_context` → `recent_action_context`, y todas las funciones helper asociadas. Runtime files actualizados: `chat-bridge.ts`, `resolver-engine.ts`, `resolver-engine.test.ts`, `surface-orchestrator.ts`.
  - **Paso 0a** — `request-shaping.ts`: eliminados imports de `capability-graph`, reemplazado `selectOperationalSlice` con lógica simplificada basada solo en `detectOperationalCue`. `TurnIntent` ya no incluye `"tool_clear"` (todo operacional es `"tool_ambiguous"`). Actualizado `operational-mode.ts`, `semantic-turns.ts`, `model-routing-signals.ts`, `operational-mode.test.ts`, `semantic-turns.test.ts`.
  - **Paso 0a** — `route.ts`: eliminados import y bloque completo del declarative engine.
  - **Paso 0b** — `non-stream-executor.ts`: el operational gate (`resolveOperationalModeDecision`) se saltea cuando `plannerAttempted=true`, evitando bloquear requests con `clarify_with_ui` después de que el planner ya las evaluó.
  - **Paso 1** — `planner.ts`: `buildPlannerMessages()` ahora acepta `recentActionContext` e inyecta un bloque `CONTEXTO_RECIENTE` en el primer mensaje si el contexto es válido y no expiró. `PlanActionInput` tiene el campo nuevo.
  - **Paso 1** — `surface-orchestrator.ts`: `planRuntimeSurfaceTurn` acepta y pasa `recentActionContext` al planner. `non-stream-executor.ts` y `route.ts` pasan `conversationMetadata.recent_action_context`.
  - **Paso 2** — `src/app/api/approvals/[approvalId]/resolve/route.ts`: nuevo endpoint PATCH que resuelve una approval por ID de URL, llama a `resolveApprovalItem` y guarda un mensaje en la conversación confirmando approve/reject.
  - **Paso 4** — `non-stream-executor.ts`: cost guardrail que consulta `agents.settings.monthly_action_budget`; si se superó, retorna mensaje de límite sin ejecutar la acción.
- Build: `next build` pasa sin errores ni warnings de lint.
- Pendientes inmediatos:
  - Test manual: request simple como "busca emails" → debe planear con planner y ejecutar.
  - Test manual: request ambigua → planner con confidence < 0.75 → semantic fallback sin bloqueo del operational gate.
  - Verificar que `recent_action_context` se persiste correctamente después de una ejecución exitosa (surface-orchestrator postprocess).
  - Test manual del endpoint `/api/approvals/{id}/resolve` con approve/reject.

## Snapshot sesion 2026-03-20 - Fase 2: Candidate fetcher + clarifications con datos reales

- Estado actual: las clarificaciones de planner ya muestran selects con datos reales de la integración. Cuando el planner falla con `planner_empty` y hay campos faltantes como `threadRef`, `eventRef` o `label`, el backend fetcha datos reales (hilos de Gmail, eventos de Calendar, etiquetas) y los inyecta como opciones en el formulario dinámico. El mensaje de aclaración también cambia para reflejar cuántos candidatos encontró.
- Ultimos cambios relevantes:
  - `src/lib/runtime/candidate-fetcher.ts`: nuevo módulo que fetchea candidates reales por `resourceFamily`. Soporta: `thread` (threads INBOX recientes de Gmail), `event` (próximos 7 días de Calendar), `label` (etiquetas user de Gmail), `sheet`/`spreadsheet` (tabs si hay `runtime_last_spreadsheet_id` en metadata). Timeout de 2s, catch silencioso por campo.
  - `src/lib/runtime/surface-orchestrator.ts`: `buildRuntimeRoutingRejectionResult` ahora es async; fetchea candidates una sola vez, los usa para el mensaje contextual (`buildPlannerNeedsUserMessage`) y para el form (`buildPlannerClarificationMetadataPatch`). Mensaje contextual cambia según candidatos: "Encontré N hilos recientes. Seleccioná cuál querés usar." vs texto genérico.
  - `src/lib/chat/interactive-markers.ts`: CHOICES guidance ya tenía la regla de usar datos reales (pre-existente de sesión anterior).
  - Lint fixes varios archivos pre-existentes: `declarative-chat-read-engine.ts` (imports y funciones muertas), `model-routing-signals.ts` (readCount sin usar), `runtime-clarification.ts` (index sin usar), `engine/types.ts` (any con eslint-disable), `executor.ts` y `executor.test.ts` (adapter sin usar), `intent-planner-llm.ts` (tipo ChatMessage).
- Pendientes inmediatos:
  - Test manual: enviar "archiva un email" → debe mostrar select con últimos 5 hilos del INBOX.
  - Test manual: enviar "crear borrador de respuesta" → debe mostrar select con hilos recientes.
  - Test manual: enviar "cancela el evento" → debe mostrar select con próximos eventos del calendario.
  - Test manual: enviar "aplica etiqueta" → debe mostrar select con etiquetas de usuario de Gmail.
  - Si hay un spreadsheet conocido en conversación, "busca filas" debe mostrar las tabs disponibles.
- Riesgos o bloqueos:
  - El fetch de candidatos tiene timeout de 2s por campo; en conexiones lentas puede degradar silenciosamente a text field, que es el comportamiento correcto de fallback.
  - `runtime_last_spreadsheet_id` no se persiste aún en conversationMetadata desde el runtime nuevo — sheet candidates siempre devolverán [] hasta que se agregue ese write en el postprocess del sheets adapter.
- Comandos de verificacion conocidos:
  - `npm run build` — build limpio ✓
  - `npm run typecheck`

## Snapshot sesion 2026-03-18 - Preview editable en chat antes de mandar Gmail a approvals

- Estado actual: el flujo `send_email` del runtime ya no encola directo la approval en el primer pase; ahora, cuando el planner resuelve un email listo para enviar, el chat devuelve un `dynamic_form` persistido con preview editable para asunto, cuerpo y destinatarios. Al enviar ese formulario, el siguiente turno salta el preview y recien ahi prepara la solicitud de aprobacion en inbox.
- Ultimos cambios relevantes:
  - `src/lib/runtime/pre-approval-chat-form.ts`: nuevo helper para construir el formulario de preview de Gmail a partir de la accion runtime, con campos prellenados, flag oculto `preview_submit_mode` y detector de submit para evitar loops de preview.
  - `src/lib/runtime/pre-approval-chat-form.test.ts`: nueva cobertura para validar la construccion del form y la deteccion del submit de preview.
  - `src/app/api/chat/route.ts`: se agrego el gate previo a `executeRuntimeSurfacePlan(...)` para `send_email` con una sola accion y sin `missingFields`; persiste `pending_chat_form`, responde con el copy de preview y luego deja que el segundo submit continue hacia approvals.
- Pendientes inmediatos:
  - Probar manualmente en web el caso real `Crea un mail para intentar vender un producto y enviaselo a jspansecchi@gmail.com` para confirmar que el primer turno muestra preview editable y el segundo crea la approval en `/approvals`.
  - Verificar si producto quiere extender este mismo patron de preview editable a `create_draft_email` o a otras writes sensibles como Calendar/Sheets.
- Riesgos o bloqueos:
  - El bypass del segundo pase depende de que el submit llegue con el flag oculto `preview_submit_mode`; si en el futuro cambia la serializacion del form, podria reaparecer un loop de preview y habria que ajustar ese detector.
  - Este gate nuevo esta acotado a `send_email`; el resto de acciones sensibles sigue yendo directo a approval inbox como antes.
- Comandos de verificacion conocidos:
  - `npm.cmd run test:ts -- src/lib/runtime/pre-approval-chat-form.test.ts`
  - `npm.cmd run test:ts -- src/lib/runtime/chat-bridge.test.ts`
  - `npm.cmd run typecheck`

## Snapshot sesion 2026-03-18 - Form runtime inline sin duplicar mensaje aclaratorio

- Estado actual: cuando el agente devuelve un mensaje de aclaracion y luego se hidrata el `dynamic_form` persistido con el mismo copy, la UI ya no lo dibuja como un bloque extra separado abajo; el formulario se adjunta al ultimo mensaje del agente y evita la sensacion de duplicado.
- Ultimos cambios relevantes:
  - `src/components/chat/message-list.tsx`: se agrego comparacion normalizada entre el ultimo mensaje assistant y `activeUiState.message`; si coinciden, el form persistido se renderiza inline bajo ese mensaje en lugar de abrir un bloque adicional "Formulario activo".
- Pendientes inmediatos:
  - Reprobar en web `Envia un mail` para confirmar que ahora queda un solo mensaje con el form pegado debajo.
- Riesgos o bloqueos:
  - La heuristica compara texto normalizado; si en el futuro el copy del mensaje y el del form divergen a proposito, volvera a usar el bloque separado, que sigue siendo un fallback valido.
- Comandos de verificacion conocidos:
  - `npm.cmd run typecheck`

## Snapshot sesion 2026-03-18 - Planner empty con intent claro ahora genera form

- Estado actual: las aclaraciones de planner ya no dependen exclusivamente de que el modelo devuelva `actions[0]`; cuando el planner cae en `planner_empty` pero deja un `intent` reconocible como `enviar email` y `missingFields` validos, el backend sintetiza un draft minimo y puede seguir renderizando el formulario dinamico.
- Ultimos cambios relevantes:
  - `src/lib/chat/runtime-clarification.ts`: se agrego inferencia de `RuntimeActionType` desde `plannerDraftPlan.intent` y sintesis de un draft minimo para casos `planner_empty`, reutilizado por `buildRuntimeClarificationSpec(...)`.
  - `src/lib/chat/runtime-clarification.test.ts`: nueva cobertura para validar que `intent: "enviar email"` + `missingFields: ["to"]` genera un spec reanudable con accion `send_email`.
- Pendientes inmediatos:
  - Probar manualmente el caso real `Envia un mail` sobre el chat web para confirmar que el planner empty ahora muestra el form de destinatario en vez de solo texto.
  - Si aparecen otros intents frecuentes con `planner_empty`, extender la heuristica de inferencia a mas acciones usando evidencia real de logs.
- Riesgos o bloqueos:
  - Esta inferencia es deliberadamente conservadora y solo cubre intents claros por texto; si el planner devuelve un intent demasiado vago, seguiremos fallando cerrado sin form, que es preferible a inventar una accion.
- Comandos de verificacion conocidos:
  - `npm.cmd run test:ts -- src/lib/chat/runtime-clarification.test.ts`
  - `npm.cmd run typecheck`

## Snapshot sesion 2026-03-18 - Runtime blocked copy especifico para mail/policies

- Estado actual: cuando una accion runtime queda en `blocked`, el chat ya no cae siempre en el mensaje generico; ahora traduce razones frecuentes como `provider_blocked:gmail`, `plan_action_blocked`, `integration_blocked`, `turn_budget_exceeded` o limites de concurrencia a copy accionable para el usuario.
- Ultimos cambios relevantes:
  - `src/lib/runtime/chat-bridge.ts`: se amplio el mapping de `renderRuntimeNonSuccessMessage(...)` para cubrir bloqueos de proveedor, canal, surface, plan, agente/organizacion, budget, concurrencia y capacidad no soportada.
  - `src/lib/runtime/chat-bridge.test.ts`: nueva cobertura para validar mensajes especificos de bloqueo por plan, proveedor y presupuesto.
- Pendientes inmediatos:
  - Probar manualmente el caso real de `send_email` bloqueado para confirmar cual razon concreta sale ahora en UI y decidir si hay que destrabar configuracion o cambiar policy.
  - Si el bloqueo real termina siendo `provider_blocked:gmail` o `integration_blocked`, revisar en una tanda separada la fuente exacta de `runtime_policy_context` para exponerla tambien en observabilidad/admin.
- Riesgos o bloqueos:
  - Este cambio mejora la explicacion al usuario, pero no cambia la policy subyacente; si Gmail sigue bloqueado o desconectado, la accion seguira fallando cerrado como corresponde.
- Comandos de verificacion conocidos:
  - `npm.cmd run test:ts -- src/lib/runtime/chat-bridge.test.ts`
  - `npm.cmd run typecheck`

## Snapshot sesion 2026-03-18 - Clarify UX runtime email visible y seleccionable

- Estado actual: la UI web vuelve a mostrar de forma confiable las aclaraciones runtime persistidas aunque `pending_chat_form` se escriba unos milisegundos despues del response, y el caso `send_email` con destinatario ambiguo ahora ofrece selector cuando el runtime ya trae candidatos concretos.
- Ultimos cambios relevantes:
  - `src/components/chat/chat-window.tsx`: `refreshActiveUiState(...)` ahora reintenta varias veces tras cada respuesta del chat, evitando la carrera entre el `after(...)` server-side y el unico fetch cliente que hacia desaparecer la UX de aclaracion hasta recargar.
  - `src/lib/chat/runtime-clarification.ts`: el builder del formulario prioriza `select` cuando un campo ya tiene opciones candidatas, incluyendo `recipient`, en vez de forzar siempre `textarea` para emails ambiguos.
  - `src/lib/chat/runtime-clarification.test.ts`: nueva cobertura para asegurar que `send_email.to` usa `select` con candidatos y mantiene `textarea` cuando no hay opciones.
- Pendientes inmediatos:
  - Probar manualmente en chat web el caso real `Envia un mail` con alias ambiguo para confirmar que el formulario aparece sin reload y que el dropdown de emails resuelve bien el submit.
  - Si producto quiere UX aun mas guiada, evaluar mostrar un copy distinto para `recipient` cuando el campo viene como selector en vez de texto libre.
- Riesgos o bloqueos:
  - La persistencia del assistant message y `pending_chat_form` sigue ocurriendo en `after(...)`; los reintentos cliente mitigan la carrera visible, pero si ese trabajo server-side falla realmente, la UI seguira sin formulario y dependera de logs.
  - El polling corto de UI activa agrega algunos fetchs chicos a `/api/chat/forms/active` tras cada turno; es acotado y solo corre cuando termina una respuesta.
- Comandos de verificacion conocidos:
  - `npm.cmd run test:ts -- src/lib/chat/runtime-clarification.test.ts`
  - `npm.cmd run typecheck`

## Snapshot sesion 2026-03-18 - Clarify UX dinamica planner/runtime inline

- Estado actual: el chat web ya puede mostrar y enviar aclaraciones runtime/planner como formulario inline estructurado, generado server-side desde el runtime real y persistido en `conversations.metadata` con `pending_runtime_clarification` + `pending_chat_form`.
- Ultimos cambios relevantes:
  - `src/lib/chat/runtime-clarification.ts`, `src/lib/chat/conversation-metadata.ts`, `src/lib/chat/chat-form-state.ts`, `src/lib/chat/interactive-markers.ts`: se agrego el contrato `RuntimeClarificationSpec`, su persistencia segura en metadata, la proyeccion a `pending_chat_form`, y soporte UI para `number`, `helperText` y `placeholder`.
  - `src/lib/runtime/planner.ts`, `src/lib/runtime/surface-orchestrator.ts`, `src/lib/db/runtime-runs.ts`: el planner ahora preserva `plannerDraft` aunque baje la confianza; el orquestador persiste aclaraciones estructuradas tanto en rechazo `planner_empty` como en `needs_user` del runtime, y tambien permite reanudar desde checkpoint/action plan ya materializado.
  - `src/app/api/chat/forms/runtime/submit/route.ts`, `src/app/api/chat/route.ts`: se agrego el submit estructurado server-side para formularios runtime, con validacion de sesion/agente/conversacion/checkpoint, limpieza segura del estado pendiente y reanudacion del runtime sin confiar en `actionType`, `runtimeRunId` ni ownership enviados por el cliente.
  - `src/components/chat/message-list.tsx`, `src/components/chat/chat-window.tsx`, `src/components/chat/dynamic-chat-form-card.tsx`: la UI ahora renderiza formularios persistidos debajo del mensaje del agente aunque no haya marker LLM, y usa el endpoint estructurado para estas aclaraciones sin volver a serializarlas como texto libre.
- Pendientes inmediatos:
  - Probar manualmente en chat web al menos un caso `planner` (`create_event` sin `start/end`) y uno `runtime` (`cancel_event` ambiguo o `send_email` sin `to`) para validar la reanudacion punta a punta.
  - Agregar tests especificos del nuevo endpoint `/api/chat/forms/runtime/submit` y del builder `buildRuntimeClarificationSpec(...)` para cubrir mas combinaciones de campos/candidatos.
- Riesgos o bloqueos:
  - El submit estructurado persiste el turno del usuario como mensaje resumido de formulario para mantener trazabilidad en chat; la reanudacion no depende de ese texto, pero conviene revisar luego si producto quiere una representacion mas UX-friendly.
  - V1 deriva widgets y params desde `action-catalog` + checkpoint/planner draft; casos muy ambiguos fuera de una accion dominante siguen cayendo en aclaracion textual, que es el comportamiento esperado por ahora.
- Comandos de verificacion conocidos:
  - `npm.cmd run typecheck`
  - `npm.cmd run test:ts -- src/lib/chat/chat-form-state.test.ts`
  - `npm.cmd run test:ts -- src/lib/chat/conversation-metadata.test.ts`
  - `npm.cmd run test:ts -- src/lib/runtime/surface-orchestrator.test.ts`

## Snapshot sesion 2026-03-18 - Runtime Gmail alias ultimo hilo sin contexto previo

- Estado actual: el runtime nuevo ya puede resolver `threadRef` del estilo `ultimo hilo` / `ultimo email` aun cuando el usuario no haya listado antes los threads en la conversacion, y tambien entiende ese alias contra contexto reciente cuando si existian multiples resultados de Gmail.
- Ultimos cambios relevantes:
  - `src/lib/runtime/surface-orchestrator.ts`, `src/lib/runtime/surface-orchestrator.test.ts`: se agrego una lookup deterministica server-side para `threadRef` que, ante aliases inequívocos como `ultimo hilo`, consulta el thread mas reciente de Gmail via metadata y lo devuelve como referencia resuelta en lugar de caer en `missing_threadRef`.
  - `src/lib/runtime/resolver-engine.ts`, `src/lib/runtime/resolver-engine.test.ts`: el resolver conversacional de threads ahora tambien interpreta `el ultimo hilo` / `el ultimo email` sobre contexto reciente y elige el candidato mas nuevo cuando ese alias ya es suficientemente especifico.
  - Esta slice deja alineado el comportamiento de follow-ups referenciales entre Calendar y Gmail: cuando el alias es ordinal y determinista, el runtime resuelve; cuando sigue ambiguo, pide aclaracion.
- Pendientes inmediatos:
  - Probar manualmente en chat web el caso real `Resumime el ultimo hilo` sobre un agente Gmail conectado para confirmar que ahora ejecuta `summarize_thread` sin pedir aclaracion innecesaria.
  - Evaluar en una tanda separada si conviene soportar tambien aliases ordinales adicionales como `primer hilo`, `penultimo`, etc.
- Riesgos o bloqueos:
  - La resolucion server-side de `ultimo hilo` hoy usa el thread mas reciente que devuelve Gmail; si producto necesita distinguir entre Inbox vs `in:anywhere` o aplicar otro filtro, habra que definir esa semantica explicitamente.
  - Si Gmail no devuelve threads o la integracion no esta operativa, el runtime seguira cerrando en `needs_user`/`missing_threadRef`, que es el fail-closed deseado.
- Comandos de verificacion conocidos:
  - `npm.cmd run test:ts -- src/lib/runtime/resolver-engine.test.ts`
  - `npm.cmd run test:ts -- src/lib/runtime/surface-orchestrator.test.ts`
  - `npm.cmd run typecheck`

## Snapshot sesion 2026-03-18 - Runtime calendar follow-up reprogramar ultimo evento

- Estado actual: el runtime nuevo ya interpreta mejor follow-ups de Google Calendar del estilo "Reprograma el ultimo evento que listaste para manana...", evitando el falso match contra `create_event`, recordando mejor los `list_events` recientes y tolerando mejor respuestas de planner con texto envolvente.
- Ultimos cambios relevantes:
  - `src/lib/chat/capability-graph.ts`, `src/lib/chat/capability-graph.test.ts`: el scoring de `create_event` dejo de depender del cue demasiado amplio `programa`, el contexto reciente de Calendar ahora usa solo el ultimo `list_events`, y el follow-up "ultimo evento que listaste" puede resolver el ultimo item listado en vez de caer por ambiguedad o escoger `create_event`.
  - `src/lib/runtime/chat-bridge.ts`, `src/lib/runtime/chat-bridge.test.ts`: los `list_events` exitosos del runtime ahora se persisten dentro de `recent_declarative_engine_context`, para que el siguiente turno tenga memoria conversacional util sobre eventos.
  - `src/lib/runtime/resolver-engine.ts`, `src/lib/runtime/resolver-engine.test.ts`: la resolucion conversacional de `eventRef` ya entiende aliases como `el ultimo evento que listaste` y selecciona el ultimo evento del ultimo listado reciente cuando corresponde.
  - `src/lib/runtime/planner.ts`, `src/lib/runtime/planner.test.ts`: el prompt del planner ahora explicita que mover/reprogramar eventos existentes debe mapear a `reschedule_event`, suma un ejemplo de follow-up calendar y acepta JSON envuelto en texto/fences antes de declararlo `planner_invalid_output`.
- Pendientes inmediatos:
  - Probar manualmente en chat web el caso real con el agente que reporto `planner_invalid_output`, para confirmar que la telemetria ahora cae en `reschedule_event` y no en rechazo del planner.
  - Evaluar en una tanda separada si conviene persistir tambien contexto runtime reciente para otras writes referenciales ademas de `list_events`.
- Riesgos o bloqueos:
  - La resolucion automatica de "ultimo evento" hoy toma el ultimo item del ultimo `list_events`; si UX/producto necesita otra semantica ordinal, habra que explicitarla y testearla.
  - El planner sigue dependiendo del modelo remoto; esta slice reduce falsos negativos y parseos fragiles, pero no elimina por completo la variabilidad del modelo.
- Comandos de verificacion conocidos:
  - `npm.cmd run test:ts -- src/lib/chat/capability-graph.test.ts`
  - `npm.cmd run test:ts -- src/lib/runtime/resolver-engine.test.ts`
  - `npm.cmd run test:ts -- src/lib/runtime/chat-bridge.test.ts`
  - `npm.cmd run test:ts -- src/lib/runtime/planner.test.ts`
  - `npm.cmd run typecheck`

## Snapshot sesion 2026-03-18 - Cutover runtime-only parte 6 observabilidad runtime unico

- Estado actual: la observabilidad operativa del snapshot runtime-only ya expone outcomes y gaps del runtime nuevo sin esconderlos detras de rates agregados; el dashboard/API `runtime/migration` puede ver explicitamente `success`, `needs_user`, `blocked`, `failed`, `waiting_approval`, ademas de `planner_empty`, `runtime_clarification`, `runtime_failure` y `unsupported_action`.
- Ultimos cambios relevantes:
  - `src/lib/runtime/migration-snapshot.ts`: el snapshot agrego `runtimeOutcomeCounts` y `runtimeObservability` a nivel global, y tambien por capability, reutilizando la metadata viva `runtime_observability` que ya persisten `/api/chat` y `/run`.
  - `src/lib/runtime/migration-snapshot.test.ts`: nueva cobertura para validar que el snapshot acumula correctamente outcomes runtime-first y los cuatro contadores explicitos de observabilidad.
  - No se reintrodujo `legacy_fallback`: el wiring de observabilidad sigue leyendo solo mensajes `runtime_primary`, pero ahora deja visibles los huecos del runtime unico en vez de resumir todo unicamente como success-rate.
- Pendientes inmediatos:
  - Si hay UI/dashboard consumiendo `runtime/migration`, evaluar en una tanda separada mostrar estos contadores nuevos de forma mas prominente en la interfaz.
  - Agregar tests mas cercanos al entrypoint HTTP para `/api/chat` y `/run` que validen metadata runtime-only end-to-end, no solo el snapshot agregado.
- Riesgos o bloqueos:
  - El snapshot sigue llamandose `migration` por compatibilidad historica; internamente ya refleja observabilidad runtime-only, pero el naming puede seguir confundiendo hasta un renombre posterior.
  - `runtimeCoverageRate` mantiene su semantica actual y no se ajusto en esta slice; esta parte se concentro en hacer visibles outcomes/gaps del runtime unico.
- Comandos de verificacion conocidos:
  - `npm.cmd run test:ts -- src/lib/runtime/migration-snapshot.test.ts`
  - `npm.cmd run typecheck`

## Snapshot sesion 2026-03-18 - Cutover runtime-only parte 5 poda final del kill switch

- Estado actual: el wiring vivo ya no expone contratos ni helpers con naming `legacy` para el kill switch del runtime; chat web, `/run` y el snapshot operativo consumen un kill switch runtime-only y dejan de aceptar compatibilidad activa con `legacy_default` o `legacy_forced_*`.
- Ultimos cambios relevantes:
  - `src/lib/runtime/runtime-kill-switch.ts`, `src/lib/runtime/runtime-kill-switch.test.ts`: se reemplazo `legacy-rollout` por un contrato explicito de kill switch (`disabledSurfaces`, `disabledActionTypes`) y el parser ya ignora claves heredadas como `default_mode`, `legacy_forced_surfaces` y `legacy_forced_action_types`.
  - `src/lib/runtime/chat-route.ts`, `src/lib/runtime/surface-orchestrator.ts`, `src/lib/runtime/chat-route.test.ts`: el routing runtime-first ahora recibe `killSwitch` en vez de `rollout`, dejando mas dificil reintroducir semantica de convivencia o fallback en el planner path.
  - `src/app/api/chat/route.ts`, `src/lib/chat/non-stream-executor.ts`, `src/lib/db/runtime-migration.ts`: los entrypoints vivos y el reader server-side pasaron a `getOrganizationRuntimeKillSwitchConfig`, alineando el wiring con un unico cerebro y un kill switch tecnico acotado.
  - `src/lib/runtime/index.ts`: el barrel del runtime ya no reexporta `legacy-rollout`, para que el repo no sugiera otra vez el concepto heredado como API viva.
- Pendientes inmediatos:
  - Agregar tests mas cercanos al entrypoint HTTP para `/api/chat` y `/run` que prueben metadata runtime-only y ausencia de cualquier wiring declarative/legacy en acciones soportadas.
  - Evaluar en una tanda separada si conviene renombrar `recent_declarative_engine_context`, que sigue siendo deuda de claridad aunque ya lo alimente el runtime nuevo.
- Riesgos o bloqueos:
  - Si alguna organizacion todavia guardaba settings viejos bajo `runtime_rollout.default_mode` o `legacy_forced_*`, esos valores dejan de tener efecto con esta poda; dado el corte agresivo sin clientes activos, eso es intencional.
  - El endpoint/ruta `runtime/migration` conserva naming historico de “migration”; la semantica interna ya habla de `killSwitch`, pero queda deuda documental si se busca limpieza total.
- Comandos de verificacion conocidos:
  - `npm.cmd run test:ts -- src/lib/runtime/chat-route.test.ts`
  - `npm.cmd run test:ts -- src/lib/runtime/runtime-kill-switch.test.ts`
  - `npm.cmd run typecheck`

## Snapshot sesion 2026-03-18 - Cutover runtime-only parte 4 endurecer gaps del runtime

- Estado actual: el runtime nuevo ya se hace cargo mejor de sus vacios operativos en Gmail/Calendar writes, con aclaraciones propias para destinatarios, hilos y eventos ambiguos en vez de depender de copy generico o cobertura implicita del legacy.
- Ultimos cambios relevantes:
  - `src/lib/runtime/resolver-engine.ts`, `src/lib/runtime/resolver-engine.test.ts`: los resolvers conversacionales de Gmail threads y Calendar events ahora exponen candidatos ricos (`label` + `threadId`/`eventId`) cuando hay ambiguedad, para que el runtime pueda pedir aclaracion util sin esconder el gap.
  - `src/lib/runtime/node-registry.ts`, `src/lib/runtime/node-registry.test.ts`: `createUserClarificationNodeHandlerV1` ahora distingue mejor `ambiguous_threadRef` y `ambiguous_eventRef`, devolviendo preguntas runtime-first especificas para hilos/eventos recientes en vez de caer en la misma aclaracion generica.
  - `src/lib/runtime/surface-orchestrator.ts`: el renderer de candidatos de aclaracion ya formatea objetos de thread/event además de contactos, asi que el chat puede listar opciones concretas del runtime nuevo cuando falta una referencia inequívoca.
  - `src/lib/runtime/chat-bridge.ts`, `src/lib/runtime/chat-bridge.test.ts`: los mensajes no exitosos del runtime ahora contemplan aclaraciones especificas para eventos ambiguos y reutilizan el mismo formateo de candidatos enriquecidos.
- Pendientes inmediatos:
  - Agregar tests mas cercanos al entrypoint HTTP para `/api/chat` que prueben end-to-end `send_email` alias ambiguo, `archive_thread` ambiguo y `cancel_event` ambiguo sin tocar ningun bridge legacy.
  - Revisar en una tanda separada si conviene normalizar strings historicos con encoding raro (`Â¿`) en algunos mensajes viejos del runtime para limpiar UX sin mezclarlo con esta slice.
- Riesgos o bloqueos:
  - Estas aclaraciones dependen del contexto reciente persistido (`recent_declarative_engine_context`) y de resolucion determinista previa; si no hay contexto util, el runtime seguira pidiendo una referencia explicita, que es el comportamiento deseado pero mas conservador.
  - El naming de `recent_declarative_engine_context` sigue siendo historico aunque el contenido ya lo produce el runtime nuevo; no bloquea el corte, pero sigue siendo deuda de claridad.
- Comandos de verificacion conocidos:
  - `npm.cmd run test:ts -- src/lib/runtime/resolver-engine.test.ts`
  - `npm.cmd run test:ts -- src/lib/runtime/node-registry.test.ts`
  - `npm.cmd run test:ts -- src/lib/runtime/chat-bridge.test.ts`
  - `npm.cmd run test:ts -- src/lib/runtime/surface-orchestrator.test.ts`
  - `npm.cmd run typecheck`

## Snapshot sesion 2026-03-18 - Cutover runtime-only parte 3 cleanup de routing/config y observabilidad

- Estado actual: el path vivo de chat/runtime queda sin semantica operativa de `legacy_fallback`, `runtime_rollout` ya expone contrato runtime-first (`disabled_surfaces`, `disabled_action_types`) y la observabilidad auxiliar dejo de modelar convivencia normal entre dos motores.
- Ultimos cambios relevantes:
  - `src/lib/runtime/legacy-rollout.ts`, `src/lib/runtime/legacy-rollout.test.ts`: `runtime_rollout` ahora acepta claves runtime-first de kill switch y mantiene compatibilidad de lectura con settings legacy solo como puente corto; el wiring vivo deja de invitar a seguir configurando `legacy_forced_*`.
  - `src/lib/runtime/chat-route.ts`: se simplifico `shouldAttemptRuntimePlanner` para que solo decida si una request entra o no al runtime, sin semantica sobrante de rollout/fallback.
  - `src/lib/runtime/migration-snapshot.ts`, `src/lib/db/runtime-migration.ts`, `src/app/api/runtime/migration/route.ts`, `src/lib/runtime/migration-snapshot.test.ts`: el snapshot/API operativo deja de exponer `legacyFallbackCount`/`legacyFallbackRate` y pasa a reportar salud runtime-only (`runtime_active`, `runtime_attention_needed`, `no_recent_runtime_traffic`; `healthy` vs `stabilize_runtime`).
  - `src/lib/runtime/surface-orchestrator.test.ts`: se fijaron casos runtime-first de aclaracion para `ambiguous_thread` y `missing_eventRef`, ademas de planner vacío, planner inválido y acción no disponible, para evitar reintroducir fallback silencioso.
- Pendientes inmediatos:
  - Agregar tests mas cercanos al entrypoint HTTP para `/api/chat` y `/run` que verifiquen explicitamente metadata runtime-only y ausencia de wiring declarative en acciones soportadas.
  - Evaluar en una tanda separada si conviene renombrar `recent_declarative_engine_context` ahora que el legacy ya no participa del request path vivo.
- Riesgos o bloqueos:
  - La compatibilidad de lectura con `default_mode` y `legacy_forced_*` sigue presente para no romper settings existentes; ya no domina el wiring vivo, pero conserva deuda de naming historico.
  - El endpoint `/api/runtime/migration` sigue usando ruta/nombre historico de “migration”; la semantica interna ya es runtime-only, pero puede valer renombre posterior si se busca limpieza documental completa.
- Comandos de verificacion conocidos:
  - `npm.cmd run test:ts -- src/lib/runtime/chat-route.test.ts`
  - `npm.cmd run test:ts -- src/lib/runtime/surface-orchestrator.test.ts`
  - `npm.cmd run test:ts -- src/lib/runtime/legacy-rollout.test.ts`
  - `npm.cmd run test:ts -- src/lib/runtime/migration-snapshot.test.ts`
  - `npm.cmd run typecheck`

## Snapshot sesion 2026-03-18 - Cutover runtime-only parte 2 runtime unico en ejecucion

- Estado actual: chat web y `executeNonStreamingAgentTurn` quedaron alineados con un contrato runtime-first sin semantica operativa de `legacy_fallback`; cuando el planner/runtime nuevo no puede continuar, el propio runtime rechaza o aclara explicitamente con `needs_user`, `blocked` o `failed`, y `runtime_rollout` queda reinterpretado solo como kill switch tecnico temporal.
- Ultimos cambios relevantes:
  - `src/lib/runtime/chat-route.ts`, `src/lib/runtime/chat-route.test.ts`: `RuntimeChatRoutingDecision` dejo de exponer `shouldUseRuntime`, `legacyForcedActions` y `legacy_forced_by_rollout`; ahora decide `accept`/`reject`, agrupa `unsupportedActions` y sigue intentando planner en surfaces runtime aunque una capability este deshabilitada, para que el runtime tome o rechace explicitamente la request.
  - `src/lib/runtime/legacy-rollout.ts`, `src/lib/runtime/legacy-rollout.test.ts`: `runtime_rollout` paso a modelarse como kill switch minimo (`disabledSurfaces`, `disabledActionTypes`) en vez de convivencia normal `runtime_default`/`legacy_default`; se conserva compatibilidad de lectura con settings viejos, pero el wiring vivo ya no habla de “forzar al legacy”.
  - `src/lib/runtime/surface-orchestrator.ts`, `src/app/api/chat/route.ts`, `src/lib/chat/non-stream-executor.ts`: los rechazos del planner/runtime se persisten como outcomes propios del runtime y la metadata/observabilidad ahora refleja `runtimeDecision`, `unsupportedActions` y contadores `planner_empty_count`, `runtime_clarification_count`, `runtime_failure_count`, `unsupported_action_count`.
  - `src/lib/runtime/migration-snapshot.ts`, `src/lib/runtime/migration-snapshot.test.ts`: el snapshot operativo deja de considerar `legacy_fallback` como estado normal del presente y se centra en mensajes `runtime_primary`, para que la lectura reciente no siga normalizando doble cerebro en dashboards auxiliares.
- Pendientes inmediatos:
  - Agregar tests de integracion para `/api/chat` y `/run` que validen explicitamente metadata runtime-only y ausencia de invocacion declarative en acciones soportadas.
  - Revisar naming residual como `recent_declarative_engine_context` para ver si conviene renombrarlo a metadata runtime-only en una tanda separada.
  - Extender la misma limpieza runtime-only a otros entrypoints asincronicos si siguen consumiendo rollout o snapshots con naming heredado.
- Riesgos o bloqueos:
  - Se mantiene compatibilidad de lectura con `organizations.settings.runtime_rollout.default_mode/legacy_forced_*`; aunque el path vivo ya no usa semantica de fallback, sigue habiendo deuda de naming historico en datos/config existentes.
  - `migration-snapshot` sigue llamandose asi por compatibilidad, aunque ya no usa `legacy_fallback` como outcome activo; puede requerir rename posterior para evitar confusion documental.
  - `recent_declarative_engine_context` sigue almacenando contexto reciente derivado del runtime; no rompe el corte, pero el nombre puede inducir a pensar que el engine legacy sigue en el loop vivo.
- Comandos de verificacion conocidos:
  - `npm.cmd run test:ts -- src/lib/runtime/chat-route.test.ts`
  - `npm.cmd run test:ts -- src/lib/runtime/surface-orchestrator.test.ts`
  - `npm.cmd run test:ts -- src/lib/runtime/legacy-rollout.test.ts`
  - `npm.cmd run test:ts -- src/lib/runtime/migration-snapshot.test.ts`
  - `npm.cmd run typecheck`

## Snapshot sesion 2026-03-18 - Cutover runtime-only parte 1 en chat y routing

- Estado actual: `/api/chat` y `executeNonStreamingAgentTurn` ya no saltan automaticamente a `executeDeclarativeReadChatTurn`; cuando el planner/runtime nuevo no puede seguir, el propio runtime responde con `needs_user`, `blocked` o `failed`, y el consultive LLM solo queda para pedidos fuera de las surfaces soportadas.
- Ultimos cambios relevantes:
  - `src/lib/runtime/chat-route.ts`, `src/lib/runtime/chat-route.test.ts`: `RuntimeChatRoutingDecision` dejo de modelar fallback implicito; `fallbackReason` paso a `rejectionReason` y ahora distingue `planner_empty`, `planner_invalid_output`, `planner_failed`, `runtime_unavailable_for_action` y `legacy_forced_by_rollout` como rechazos explicitos del runtime.
  - `src/lib/runtime/surface-orchestrator.ts`, `src/lib/runtime/surface-orchestrator.test.ts`: el orchestrator ahora materializa rechazos del planner/runtime como resultados runtime-first antes de tocar DB o adapters, con render propio para aclaraciones y fallos controlados; ademas, un fallo tecnico durante ejecucion devuelve `failed` del runtime en vez de `null`.
  - `src/app/api/chat/route.ts`: se elimino el branch operativo hacia `executeDeclarativeReadChatTurn`, desaparece `routingDecision: "legacy_fallback"` del flujo vivo de chat web y la metadata de shaping/runtime ahora habla de `rejectionReason` en vez de fallback.
  - `src/lib/chat/non-stream-executor.ts`: `/run` y el ejecutor no streaming quedaron alineados con el mismo contrato runtime-first, sin puente declarative operativo ni metadata `legacy_fallback` en el camino principal.
- Pendientes inmediatos:
  - Continuar con la parte 2 del cutover limpiando `runtime_rollout`/snapshot/metricas que todavia asumen convivencia normal con `legacy_fallback`.
  - Revisar si conviene reemplazar `recent_declarative_engine_context` por metadata con naming runtime-only ahora que el engine declarative salio del request path vivo.
  - Agregar tests mas cercanos a integración para `/api/chat` y `/run` que verifiquen explicitamente que no se invoca el declarative en acciones soportadas.
- Riesgos o bloqueos:
  - `migration-snapshot` y algunos tests/documentacion historica todavia conservan semantica `legacy_fallback` para leer datos viejos; no bloquea el path vivo, pero puede confundir hasta hacer la limpieza de la parte siguiente.
  - `runtime_rollout` sigue pudiendo rechazar acciones con `legacy_forced_by_rollout`; ya no cae al engine anterior, pero la config aun conserva naming heredado hasta la poda de config.
  - El consultive LLM standalone sigue activo para pedidos fuera de surfaces runtime; eso es intencional en este corte y no debe confundirse con fallback legacy.
- Comandos de verificacion conocidos:
  - `npm.cmd run test:ts -- src/lib/runtime/chat-route.test.ts src/lib/runtime/surface-orchestrator.test.ts`
  - `npm.cmd run typecheck`

## Snapshot sesion 2026-03-18 - Runtime recipients deterministas para writes

- Estado actual: `send_email` y `create_event.attendees` ya pueden salir del planner con destinatario no literal cuando asunto/cuerpo estan claros, y el runtime resuelve aliases solo por vias deterministas/API antes de approval; si no hay un unico email, pide aclaracion cerrada sin inventar destinatarios ni caer al legacy por planner vacio.
- Ultimos cambios relevantes:
  - `src/lib/runtime/planner.ts`, `src/lib/runtime/planner.test.ts`: el prompt del planner ahora conserva `send_email` con `to` tipo `entity` para aliases como `jspansecchi` y mantiene confidence >= 0.75 cuando `subject` y `body` ya estan claros.
  - `src/lib/runtime/resolver-engine.ts`, `src/lib/runtime/resolver-engine.test.ts`: recipients no literales dejaron de resolverse como explicit payload; el integration resolver acepta resultados ricos (`resolved` / `ambiguous` / `missing`) y cubre alias unico, alias ambiguo, alias inexistente y reutilizacion en `create_event.attendees`.
  - `src/lib/runtime/surface-orchestrator.ts`, `src/lib/integrations/google.ts`: el runtime nuevo ahora pasa deps reales al node registry para resolver recipients con Google People API si existe scope, historial reciente de Gmail y cache local de contactos, devolviendo email literal solo cuando queda un match unico.
  - `src/lib/runtime/node-registry.ts`, `src/lib/runtime/chat-bridge.ts`, `src/lib/runtime/{node-registry,chat-bridge}.test.ts`: las aclaraciones de runtime para recipients ambiguos ahora muestran candidatos concretos y preguntan "Encontre N contactos. ¿Cual queres usar?" en vez de un mensaje generico.
  - `src/lib/chat/declarative-chat-read-engine.ts`, `src/lib/chat/capability-graph.ts`, `src/lib/chat/declarative-chat-read-engine.test.ts`: el fallback legacy para `send_email` ya no habla de hilos y responde con "Necesito el email exacto del destinatario." cuando falta un recipient.
- Pendientes inmediatos:
  - Persistir un cache local explicito de contactos resueltos por conversacion para mejorar recall sin volver a consultar Google en cada turno ambiguo.
  - Evaluar si conviene agregar scopes opcionales de contactos/directory al flujo OAuth de Google Workspace para aumentar cobertura de aliases en organizaciones grandes.
  - Sumar pruebas directas del orchestrator runtime-first para verificar end-to-end el render final de candidatos en chat, no solo resolver/policy/message helpers.
- Riesgos o bloqueos:
  - La resolucion de aliases depende de scopes realmente concedidos y del access token vigente de la integracion Google; si no hay People scope ni señales recientes en Gmail/cache, el runtime va a pedir email exacto aunque el contacto exista fuera de esos datos.
  - El cache local por ahora es best-effort desde metadata reciente de conversacion; mejora casos cercanos, pero no reemplaza una libreta de contactos persistida tenant-scoped.
  - La heuristica determinista de matching prioriza seguridad sobre recall; evita adivinar destinatarios, pero puede dejar aliases poco obvios en `needs_user`.
- Comandos de verificacion conocidos:
  - `npm.cmd run typecheck`
  - `npm.cmd run test:ts -- src/lib/runtime/planner.test.ts`
  - `npm.cmd run test:ts -- src/lib/runtime/resolver-engine.test.ts`
  - `npm.cmd run test:ts -- src/lib/runtime/node-registry.test.ts`
  - `npm.cmd run test:ts -- src/lib/runtime/chat-bridge.test.ts`
  - `npm.cmd run test:ts -- src/lib/chat/declarative-chat-read-engine.test.ts`

## Snapshot sesion 2026-03-18 - Fase 3 punto 9 migracion y retirada del legacy

- Estado actual: chat web y `/run` ya respetan un rollout reversible por organizacion para el runtime nuevo, con fallback legacy forzado por `organizations.settings.runtime_rollout` cuando hace falta rollback controlado, y existe un snapshot operativo para medir cobertura reciente `runtime_primary` vs `legacy_fallback` por capability antes de apagar el engine anterior.
- Ultimos cambios relevantes:
  - `src/lib/runtime/legacy-rollout.ts`: contrato puro nuevo para leer `runtime_rollout` desde `organizations.settings`, con `default_mode`, `legacy_forced_surfaces`, `legacy_forced_action_types` y `freeze_legacy_features` para rollback reversible por organizacion sin agregar migracion.
  - `src/lib/runtime/chat-route.ts`, `src/lib/runtime/surface-orchestrator.ts`: el routing runtime ahora distingue `legacy_forced_by_rollout`, expone `legacyForcedActions` y evita planear/ejecutar el runtime nuevo cuando una surface o capability quedo forzada al legacy por rollout.
  - `src/app/api/chat/route.ts`, `src/lib/chat/non-stream-executor.ts`: chat web y `/run` cargan la config de rollout por organizacion y persisten metadata uniforme de fallback legacy, cerrando la trazabilidad comparativa entre ambos caminos sobre las dos superficies principales.
  - `src/lib/runtime/migration-snapshot.ts`, `src/lib/db/runtime-migration.ts`, `src/app/api/runtime/migration/route.ts`: snapshot nuevo admin-only para comparar trafico reciente `runtime_primary` vs `legacy_fallback`, calcular cobertura y success rate del runtime nuevo, y listar por `actionType` que capabilities siguen mixtas, legacy-only o candidatas a apagar manualmente.
  - `src/lib/runtime/{legacy-rollout,migration-snapshot,chat-route}.test.ts`: cobertura nueva para parseo de rollout, fallback por capability/surface y snapshot de readiness por capability.
- Pendientes inmediatos:
  - Extender el mismo contrato de rollout a automatizaciones, resumes async, workers y futuros webhooks cuando esas entradas pasen end-to-end por el mismo `ActionPlanV3` + dispatcher comun.
  - Usar el snapshot nuevo para fijar el umbral operativo real de apagado por capability y documentar el fallback manual por capability antes de retirar modulos legacy residuales.
  - Congelar nuevas features sobre los caminos legacy que aun sobreviven fuera de chat/`/run`, para que el rollout reversible no reabra deuda funcional en el engine anterior.
- Riesgos o bloqueos:
  - El rollback por organizacion hoy vive en `organizations.settings.runtime_rollout`; queda listo para operacion, pero todavia no hay UI dedicada para administrarlo y requiere edicion controlada server-side.
  - El snapshot comparativo se basa en metadata persistida de mensajes assistant recientes; sirve para readiness operativa, pero no reemplaza QA manual ni checks de paridad/trazabilidad completos antes del apagado final.
  - Surfaces que todavia no pasan por esta metadata uniforme pueden seguir apareciendo fuera de la muestra del snapshot hasta converger sobre el runtime comun.
- Comandos de verificacion conocidos:
  - `npm.cmd run typecheck`
  - `npm.cmd run test:ts -- src/lib/runtime/legacy-rollout.test.ts src/lib/runtime/migration-snapshot.test.ts src/lib/runtime/chat-route.test.ts`

## Snapshot sesion 2026-03-18 - Fase 3 punto 8 pricing y usage model final

- Estado actual: el runtime nuevo ya persiste `runtime_usage_events` como fuente primaria atomica para billing y observabilidad de costo, mientras `usage_records` queda desplazado al rol de agregado historico y compatibilidad.
- Ultimos cambios relevantes:
  - `supabase/migrations/20260318123000_add_runtime_usage_events.sql`: agrega la tabla tenant-scoped `runtime_usage_events` con FK a `runtime_runs`, indices operativos por `organization/usage_kind/provider/runtime_run`, check de `usage_kind` y policy admin-only de lectura.
  - `src/lib/runtime/types.ts`, `src/lib/runtime/pricing.ts`: nuevos contratos `RuntimeUsageKindV1` / `RuntimeUsageEventV1` y matriz compartida de costo estimado por accion abstracta para no duplicar heuristicas entre policy y billing.
  - `src/lib/runtime/usage-events.ts`: builder puro que deriva eventos atomicos `runtime_run`, `action_executed`, `approval_enqueued`, `llm_planner_call`, `llm_repair_call`, `llm_postprocess_call`, `provider_call` y `side_effect_write` desde el trace comun del runtime.
  - `src/lib/db/runtime-usage-events.ts`: modulo server-side para persistir usage events y resumir el mes corriente desde eventos atomicos del runtime, incluyendo costo LLM diario y volumen de side effects.
  - `src/lib/runtime/surface-orchestrator.ts`: el path runtime-first de chat ahora inserta `runtime_usage_events` junto con `runtime_events` tanto en exito como en fallo post-planner, sin reimplementar logica fuera del runtime.
  - `src/lib/runtime/runtime-policy-context.ts`, `src/lib/db/runtime-runs.ts`: el policy engine deja de inferir costo/side effects desde `usage_records` y pasa a leer el resumen mensual desde `runtime_usage_events`.
  - `src/lib/runtime/usage-events.test.ts`: cobertura nueva para la generacion de eventos atomicos y costo total por run.
- Pendientes inmediatos:
  - Extender la emision de `runtime_usage_events` a `/run`, automatizaciones, resumes async y workers cuando esas surfaces entren por el mismo orchestrator comun end-to-end.
  - Definir el agregado batch de `usage_records` a partir de `runtime_usage_events` para que dashboard/billing historico de todo el producto converja sobre la nueva fuente primaria.
  - Exponer snapshots pricing-ready por `usage_kind`, `provider` y `action_type` en APIs/UI operativas, no solo en lectura interna para policy.
- Riesgos o bloqueos:
  - El costo monetario de `provider_call` y `side_effect_write` queda por ahora en `0` salvo el estimado por accion abstracta y costo LLM; sirve para pricing-ready y volumen real, pero no modela todavia tarifas externas proveedor-especificas.
  - La nueva tabla exige correr la migracion `20260318123000_add_runtime_usage_events.sql` en Supabase real antes de usar este path en produccion; el repo ya compila y los tipos quedaron alineados manualmente.
  - Las surfaces que aun no pasan por `executeRuntimeSurfacePlan` no emiten todavia estos eventos atomicos; la fuente primaria queda cerrada para el carril runtime-first actual, no para todo el producto legacy.
- Comandos de verificacion conocidos:
  - `npm.cmd run typecheck`
  - `npm.cmd run test:ts -- src/lib/runtime/observability.test.ts`
  - `npm.cmd run test:ts -- src/lib/runtime/operations.test.ts`
  - `npm.cmd run test:ts -- src/lib/runtime/usage-events.test.ts`

## Snapshot sesion 2026-03-18 - Fase 3 punto 7 replay, debugging y herramientas operativas

- Estado actual: el runtime nuevo ya tiene tooling operativo server-side y APIs internas para `runtime replay` sin side effects, `dry_run`, `trace viewer`, `runtime diff`, `dead letter handling` y `manual repair` sobre el contrato comun de `runtime_runs` + `runtime_events` + `runtime.queue.dispatch`.
- Ultimos cambios relevantes:
  - `src/lib/runtime/types.ts`: agrega contratos de Fase 3 para `ReplayRequestV1`, `RuntimeReplayResultV1`, `RuntimeTraceViewerV1`, `RuntimeRunDiffV1`, `RuntimeManualRepairResultV1` y `RuntimeDeadLetterRecordV1`.
  - `src/lib/runtime/debug-tools.ts`: modulo nuevo con timeline/trace viewer por run, diff entre intentos, replay seguro que reejecuta el graph usando `simulate` y bloquea side effects reales en `execute`, mas helpers para leer checkpoint operativo desde eventos.
  - `src/lib/db/runtime-debug.ts`: modulo nuevo server-side para cargar un `runtime run` completo como fuente de replay/debug, listar dead letters desde `runtime_runs` + `event_queue` y encolar manual repair usando el resume token comun y audit log.
  - `src/app/api/runtime/...`: nuevas rutas internas admin-only para `dead-letter`, `runs/[runtimeRunId]/trace`, `runs/[runtimeRunId]/replay`, `runs/[runtimeRunId]/manual-repair` y `runs/diff`.
  - `src/lib/runtime/index.ts`: exporta el toolkit nuevo.
  - `src/lib/runtime/debug-tools.test.ts`: cobertura nueva para trace viewer, diff y replay sin side effects.
- Pendientes inmediatos:
  - Exponer estas APIs en una UI operativa real para soporte, con viewer visual por nodo/accion y acciones de operador protegidas.
  - Persistir checkpoints estructurados del runtime en `runtime_runs` o `runtime_events` enriquecidos para que `manual repair` pueda reanudar con contexto de nodo mas exacto, no solo con el bridge workflow actual.
  - Ampliar replay para rehidratar `policyContext` y runtime availability reales por surface cuando `/run`, automatizaciones y resumes nativos del DAG usen el mismo contrato end-to-end.
- Riesgos o bloqueos:
  - El replay usa el runtime graph actual y evita side effects reales reemplazando `execute` por salida simulada; sirve para diagnostico seguro, pero puede diferir del contexto historico exacto si cambiaron policy/resolvers/adapters desde el run original.
  - `manual repair` hoy encola el resume comun y conserva el `checkpointNode` elegido, pero la reanudacion concreta sigue delegando al bridge `workflow_step_execute`; hasta absorber ese bridge, la granularidad de repair por nodo sigue siendo parcial.
- Comandos de verificacion conocidos:
  - `npm.cmd run typecheck`
  - `npm.cmd run test:ts -- src/lib/runtime/debug-tools.test.ts`

## Snapshot sesion 2026-03-18 - Fase 3 punto 6 observability y operaciones de produccion

- Estado actual: el runtime nuevo ya expone una capa operativa reutilizable para producción sobre `runtime_runs`, `runtime_events`, approvals y `event_queue`, con snapshots listos para dashboards, alertas mínimas, reconstrucción end-to-end por run y trazabilidad de side effects con actor/trigger/approval/workflow/provider/idempotency.
- Ultimos cambios relevantes:
  - `src/lib/runtime/operations.ts`: módulo nuevo con agregadores de operaciones para throughput, error rate, latency, retries, approval backlog, worker backlog, costo LLM, usage por provider, generación de alertas operativas y reconstrucción de side effects/timelines por run.
  - `src/lib/db/runtime-observability.ts`: módulo nuevo server-side para leer `runtime_runs`, `runtime_events`, approvals pendientes y `runtime.queue.dispatch` desde Supabase y producir snapshots consumibles por dashboards/ops o tooling posterior.
  - `src/lib/runtime/surface-orchestrator.ts`: la persistencia de `runtime_events` ahora adjunta payload operativo enriquecido con `surface`, `channel`, `conversation_id`, `actor_user_id`, `trigger_message_id`, `action_type`, `side_effect_kind`, linkage workflow/approval y `idempotency_key` cuando existe.
  - `src/lib/runtime/index.ts`: exporta la nueva capa de operaciones del runtime.
  - `src/lib/runtime/operations.test.ts`: cobertura nueva para payload operativo, side effect traces y alerting básico.
  - `RUNTIME_PHASE3_OPERATIONS_RUNBOOK.md`: runbook nuevo con dashboards mínimos, alertas mínimas y procedimientos para `provider outage`, `retry storm`, `approval backlog`, `budget exhaustion`, `stuck runtime runs` y `compensación fallida`.
- Pendientes inmediatos:
  - Exponer `getRuntimeOperationsSnapshot` y/o `getRuntimeRunTraceView` en UI o API interna para que el dashboard/trace viewer consuma esta capa en vez de reconstruir métricas ad hoc.
  - Persistir health/circuit state multi-instancia si queremos que la alerta de provider outage no dependa solo de eventos recientes o del estado en memoria del proceso actual.
  - Extender esta misma instrumentación a futuras continuaciones async nativas del DAG cuando el bridge workflow deje de ser el único resume target.
- Riesgos o bloqueos:
  - La detección de provider outage hoy combina eventos recientes y, opcionalmente, health snapshots in-memory; todavía no existe una tabla persistida de salud/circuit breaker compartida entre workers.
  - La trazabilidad enriquecida aplica a los `runtime_events` nuevos; runs históricos previos seguirán teniendo menos linkage en payload hasta que queden fuera de la ventana operativa.
- Comandos de verificacion conocidos:
  - `npm.cmd run typecheck`
  - `npm.cmd run test:ts -- src/lib/runtime/operations.test.ts`
  - `npm.cmd run test:ts -- src/lib/runtime/observability.test.ts`

## Snapshot sesion 2026-03-18 - Fase 3 punto 5 adapter layer escalable

- Estado actual: el runtime nuevo ya expone un adapter layer mas operable y escalable, con manifests tipados por provider, versionado explicito, probing de capacidades al cargar el registry y guardas operativas compartidas para feature flags, health snapshot y circuit breaking antes de tocar providers reales.
- Ultimos cambios relevantes:
  - `src/lib/runtime/types.ts`: agrega `AdapterManifestV1`, `AdapterCapabilityProbeV1`, `AdapterHealthSnapshotV1`, nuevos error codes operativos (`feature_disabled`, `circuit_open`) y extiende `IntegrationAdapterV1` con `manifest`, `normalizeOutput`, probing, health y `compensate` opcional.
  - `src/lib/runtime/adapters/platform.ts`: modulo nuevo del adapter platform con feature flags por provider, health snapshots, capability probing y circuit breaker in-memory por provider/integracion para bloquear ejecucion cuando una integracion falla repetidamente.
  - `src/lib/runtime/adapters/{registry,selector}.ts`: el registry ahora separa `adapters + platform`, inyecta el guard comun en todos los adapters y expone helpers para listar manifests, probe de capacidades y snapshots de salud del adapter layer.
  - `src/lib/runtime/adapters/{gmail-adapter,google-calendar-adapter,google-sheets-adapter,salesforce-adapter}.ts`: cada adapter publica su `manifest` versionado, usa `normalizeOutput` explicito, consulta el platform guard antes de ejecutar y reporta success/failure para circuit breaking; Calendar agrega `compensate` acotado para revertir `create_event` via `cancel_event`.
  - `src/lib/runtime/executor.ts`: se ajusta al nuevo shape del registry sin cambiar el contrato operativo del runtime graph.
  - `src/lib/runtime/adapters/{registry,platform}.test.ts` y `src/lib/runtime/executor.test.ts`: cobertura nueva para manifests/probing, feature flag disable, apertura/cierre del circuit breaker y compatibilidad del executor con el registry nuevo.
- Pendientes inmediatos:
  - Persistir feature flags, health y circuit state en storage operativo compartido si queremos que sobrevivan reinicios de workers y se reflejen en dashboards multi-instancia.
  - Conectar capability probing al flujo real de carga de integraciones para reflejar scopes disponibles y limits efectivos por integracion, no solo por adapter/provider.
  - Exponer manifests/health en observability y tooling de operadores para completar los entregables de Fase 3 punto 6 y punto 7.
- Riesgos o bloqueos:
  - El circuit breaker actual es in-memory y por proceso; protege la ejecucion local del runtime pero todavia no coordina estado entre workers distintos.
  - Los `requiredScopes` de los manifests describen el contrato operativo esperado del adapter, pero el probing real por integracion sigue dependiendo de los runtimes/provider loaders existentes.
- Comandos de verificacion conocidos:
  - `npm.cmd run typecheck`
  - `npm.cmd run test:ts -- src/lib/runtime/adapters/registry.test.ts`
  - `npm.cmd run test:ts -- src/lib/runtime/adapters/platform.test.ts`
  - `npm.cmd run test:ts -- src/lib/runtime/executor.test.ts`

## Snapshot sesion 2026-03-18 - Fase 3 punto 4 policy engine de produccion

- Estado actual: el runtime nuevo ya evalua policy de produccion por accion con contexto multi-tenant real, incorporando limites por plan/canal/surface, concurrencia, side effects, presupuesto estimado por run y decisiones operativas nuevas como `queue_for_async` y `retry` antes de tocar adapters o providers.
- Ultimos cambios relevantes:
  - `src/lib/runtime/types.ts`: extiende el contrato del runtime con `RuntimeSurfaceV1`, `RuntimeRiskLevelV1`, canal en `ExecutionContextV1`, outcomes de policy `queue_for_async` y `degrade_to_partial`, y nuevos campos de `RuntimePolicyContextV1` para concurrencia, side effects, budgets, provider gating y allowlists operativos.
  - `src/lib/runtime/policy-engine.ts`: endurece la evaluacion declarativa con bloqueos por `channel/surface/provider/integration`, encolado preventivo por exceso de concurrencia, `retry` por provider throttling, bloqueo por side effects diarios/mensuales y corte preventivo cuando el costo estimado del plan o el gasto LLM diario de la organizacion supera el presupuesto.
  - `src/lib/runtime/runtime-policy-context.ts`: modulo nuevo server-side que construye el `RuntimePolicyContextV1` desde plan de organizacion, disponibilidad runtime por surface, contadores de `runtime_runs`, resumen mensual de `usage_records`, riesgo por tipo de accion y un estimador operativo de costo por plan/accion.
  - `src/lib/db/runtime-runs.ts`: agrega helpers para contar runs activos por organizacion/agente y resumir costo/volumen mensual actual como insumo del policy engine.
  - `src/lib/runtime/surface-orchestrator.ts`, `src/lib/chat/non-stream-executor.ts`: el carril runtime-first web/no-stream ahora propaga `surface + channel` al contexto y usa el builder de policy de produccion en vez del stub permissivo anterior.
  - `src/lib/runtime/{policy-engine,node-registry}.test.ts`: cobertura nueva para `queue_for_async` por concurrencia, `retry` por throttle del provider y bloqueo por costo estimado del plan, manteniendo verde el contracto del policy gate.
- Pendientes inmediatos:
  - Hacer que `/run`, automatizaciones, resumes de approvals y futuros webhooks tambien inyecten `surface` real al `ExecutionContextV1` para que el mismo policy engine gobierne todas las entradas con el mismo nivel de enforcement.
  - Reemplazar los defaults operativos hardcodeados por configuracion persistida por organizacion/plan cuando entren las tablas o streams de pricing/usage de Fase 3 punto 8.
  - Conectar `queue_for_async`, `retry` y futuros `degrade_to_partial` a delivery/runtime dispatcher para que no solo se vean en policy metadata sino tambien en routing operativo y dashboards.
- Riesgos o bloqueos:
  - Los limites de concurrencia/costo introducidos hoy son defaults operativos por plan inferidos en codigo; sirven para enforcement preventivo inmediato, pero todavia no provienen de configuracion editable ni de eventos atomicos `runtime_usage_events`.
  - `activeRunsForSurface` hoy reutiliza el total de runs activos de la organizacion porque `runtime_runs` aun no persiste una columna dedicada de surface/entrypoint; cuando llegue esa persistencia conviene refinar el contador para no sobrerrestringir surfaces mezcladas.
- Comandos de verificacion conocidos:
  - `npm.cmd run typecheck`
  - `npm.cmd run test:ts -- src/lib/runtime/policy-engine.test.ts src/lib/runtime/node-registry.test.ts`

## Snapshot sesion 2026-03-18 - Fase 3 punto 3 scheduler y async execution unificados

- Estado actual: approvals, retries y continuaciones async del runtime nuevo ya pueden reanudarse por un dispatcher comun `runtime.queue.dispatch`, con `event_queue` como source of truth pero usando `runtimeRunId + RuntimeResumeTokenV1` como contrato primario de wake-up en vez de payloads verticales por surface.
- Ultimos cambios relevantes:
  - `src/lib/runtime/types.ts`: agrega `RuntimeResumeReasonV1`, `RuntimeResumeTokenV1`, target tipado `workflow_step_execute` y eventos `runtime.resume.enqueued/dispatched` para modelar resumes async del runtime.
  - `src/lib/runtime/runtime-queue-dispatcher.ts`: modulo nuevo que construye resume tokens, encola `runtime.queue.dispatch`, persiste eventos de runtime al encolar/despachar y rehidrata el target async antes de delegar al engine de workflow.
  - `src/lib/db/approval-items.ts`: la aprobacion resuelta ya no reencola solo `workflow.step.execute`; ahora intenta primero el dispatcher runtime usando `runtime_run_id` y cae al evento legacy solo si el run viejo no tiene linkage runtime.
  - `src/lib/workflows/execution.ts`: retries y continuaciones de steps posteriores tambien pasan por el mismo helper de resume runtime, manteniendo compatibilidad para workflows anteriores sin `runtime_run_id`.
  - `src/lib/workers/event-processor.ts`, `src/app/api/workers/events/route.ts`: el worker ahora reclama y procesa `runtime.queue.dispatch`, traduciendolo a la continuacion concreta del step sin duplicar logica de ejecucion en el entrypoint.
  - `src/lib/runtime/runtime-queue-dispatcher.test.ts`: cobertura nueva para roundtrip del payload `runtimeRunId + resumeToken` y para la hidratacion del evento de workflow desde el token.
- Pendientes inmediatos:
  - Mover cron/automatizaciones programadas y futuros resumes por `needs_user` o `scheduled_trigger` al mismo dispatcher para completar todos los tipos cerrados de Fase 3.
  - Reemplazar la dependencia en `workflow_step_execute` como target interno por un resume mas nativo del execution graph cuando el runtime ejecute DAG async end-to-end sin bridge workflow.
  - Extender observability/dashboards para leer explicitamente `runtime.resume.enqueued/dispatched` y medir backlog por `resumeReason`.
- Riesgos o bloqueos:
  - El dispatcher unificado ya gobierna los wakes nuevos del runtime, pero sigue delegando la ejecucion concreta a `processWorkflowStepExecution`; todavia no absorbe cron ni surfaces webhook-driven fuera del bridge actual.
  - Se mantuvo fallback a `workflow.step.execute` para runs historicos sin `runtime_run_id`; eso evita romper pendientes previos, pero implica convivencia temporal de ambos contratos hasta completar la migracion.
- Comandos de verificacion conocidos:
  - `npm.cmd run typecheck`
  - `npm.cmd run test:ts -- src/lib/runtime/runtime-queue-dispatcher.test.ts src/lib/runtime/runner.test.ts src/lib/runtime/workflow-bridge.test.ts`

## Snapshot sesion 2026-03-18 - Fase 3 punto 2 multi-step `ActionPlanV3`

- Estado actual: el runtime nuevo ya soporta planes multi-step reales con `ActionPlanV3`, dependencias explicitas, `outputMapping` tipado entre acciones y resume con estado suficiente para reanudar un DAG acotado sin reejecutar acciones ya completadas.
- Ultimos cambios relevantes:
  - `src/lib/runtime/types.ts`: agrega `ActionPlanV3`, `ActionDependencyV3`, `ActionOutputMappingV3`, `executionMode`, snapshot de estado de ejecucion para checkpoints y extiende el contrato del runner para aceptar planes `v1 | v3`; el budget default sube a 5 acciones por plan.
  - `src/lib/runtime/runner.ts`: el runner ahora valida y ordena el graph declarativo, ejecuta acciones segun dependencias, materializa outputs previos como params tipados (`primitive`, `reference`, `entity`, `time`, `computed`) y persiste en checkpoint los outputs ya producidos + `completedActionIds` para resume consistente.
  - `src/lib/runtime/planner.ts`: alinea el limite operativo del planner con Fase 3 y acepta hasta 5 acciones por plan, aunque por ahora sigue emitiendo `ActionPlanV1` mientras no se cablee planner DAG-native.
  - `src/lib/runtime/runner.test.ts`: cobertura nueva para orden topologico, mapping de outputs entre acciones, bloqueo por output dependiente ausente y resume desde checkpoint de un plan `v3`.
- Pendientes inmediatos:
  - Hacer que planner/runtime surfaces empiecen a emitir y consumir `ActionPlanV3` end-to-end en chat, `/run` y workers, en vez de usar solo el soporte del runner.
  - Reemplazar el `resumeFromCheckpoint` actual por un `RuntimeResumeToken` explicito cuando entre el dispatcher comun del punto 3.
  - Extender observability para persistir `edges`, orden real de ejecucion y linkage de dependencias en `runtime_events`.
- Riesgos o bloqueos:
  - El planner productivo todavia genera `ActionPlanV1`; el soporte DAG ya existe en runtime, pero las surfaces sincronicas aun no producen planes `v3` por defecto.
  - El runner resuelve branching acotado via graph declarativo y cortes tempranos; todavia no existe scheduling async por branch ni replay tooling sobre estos nuevos snapshots.
- Comandos de verificacion conocidos:
  - `npm.cmd run typecheck`
  - `npm.cmd run test:ts -- src/lib/runtime/runner.test.ts`
  - `npm.cmd run test:ts -- src/lib/runtime/planner.test.ts`

## Snapshot sesion 2026-03-18 - Fase 3 punto 1 runtime como plataforma unica

- Estado actual: el runtime nuevo ya quedo encapsulado como servicio comun reutilizable para surfaces sincronicas, con `chat web` y el carril no-stream (`/api/agents/[agentId]/run` + worker de WhatsApp via `executeNonStreamingAgentTurn`) entrando por el mismo planner/orquestador en vez de sostener implementaciones runtime paralelas por surface.
- Ultimos cambios relevantes:
  - `src/lib/runtime/surface-orchestrator.ts`: modulo nuevo que separa explicitamente `planner interface` (`planRuntimeSurfaceTurn`) y `runtime orchestrator` (`executeRuntimeSurfacePlan`), centralizando planner runtime, `runtime_runs/runtime_events`, execution graph, postprocess semantico y metadata comun para delivery.
  - `src/app/api/chat/route.ts`: `/api/chat` ahora consume el helper compartido del runtime para planificar y ejecutar el path `runtime_primary`, manteniendo el fallback legacy pero sin duplicar la logica principal de planner + orchestrator + trazabilidad runtime.
  - `src/lib/chat/non-stream-executor.ts`: el carril no-stream paso a ser runtime-first sobre el mismo helper compartido, incluyendo Salesforce ademas de Gmail/Calendar/Sheets; esto arrastra automaticamente a `/api/agents/[agentId]/run` y al auto-reply del worker WhatsApp porque ambos ya usan este executor.
  - `src/lib/runtime/index.ts`: exporta el nuevo surface orchestrator como contrato compartido del runtime.
- Pendientes inmediatos:
  - Llevar automatizaciones programadas y `event_queue` a un dispatcher runtime comun en el punto 3, para que cron/resume dejen de depender de eventos verticales por surface.
  - Reemplazar el bridge puntual de approvals/workflow por un contrato de resume token mas explicito cuando avance `ActionPlanV3`.
  - Sumar tests mas directos sobre el helper nuevo o sobre `executeNonStreamingAgentTurn` para validar el carril runtime-first fuera de `/api/chat`.
- Riesgos o bloqueos:
  - El fallback legacy sigue vivo para requests no ejecutables por el planner runtime o surfaces no soportadas por el carril declarativo; el punto 1 unifica la capa runtime, pero no retira todavia todos los fallback paths del producto.
  - Workers de automatizacion/scheduler todavia encolan eventos propios; quedaron fuera a proposito porque su unificacion real depende del dispatcher comun del punto 3.
- Comandos de verificacion conocidos:
  - `npm.cmd run typecheck`
  - `npm.cmd run test:ts -- src/lib/runtime/chat-route.test.ts src/lib/runtime/planner.test.ts`

## Snapshot sesion 2026-03-18 - Fase 2 punto 9 `/api/chat` runtime-first con fallback explicito

- Estado actual: `/api/chat` ya decide de forma explicita y testeable cuando usar el runtime nuevo y cuando caer al carril legacy, manteniendo al runtime V2 como path preferido para acciones soportadas y dejando trazado uniforme de fallback cuando el planner no devuelve plan ejecutable o falta runtime operativo para alguna accion del plan.
- Ultimos cambios relevantes:
  - `src/lib/runtime/chat-route.ts`: helper nuevo para centralizar `shouldAttemptRuntimePlanner`, mapeo `action -> surface`, chequeo `actionAllowedByAgent` y la decision `runtime_primary` vs `legacy_fallback` con `fallbackReason`, `unavailableActions` y disponibilidad por accion.
  - `src/app/api/chat/route.ts`: `/api/chat` ahora consume esa decision centralizada en vez de helpers inline, ejecuta el runtime nuevo cuando la decision lo habilita y adjunta metadata consistente de routing tambien cuando termina en declarative/consultive fallback.
  - `src/app/api/chat/route.ts`: las respuestas del runtime nuevo quedaron mas alineadas con Fase 2 al incluir `routingDecision`, `executionOutcome`, `approvalLinkage`, `workflowLinkage` y breakdown LLM; los carriles legacy ahora tambien guardan el intento del planner runtime y la razon del fallback.
  - `src/lib/runtime/chat-route.test.ts`: cobertura nueva para planner attempt, allowlist por agente/provider y fallback por plan vacio o runtime faltante.
  - `src/lib/runtime/index.ts`: exporta el helper nuevo para que el route use el mismo contrato que los tests.
- Pendientes inmediatos:
  - Sumar un test de integracion mas cercano al route si queremos validar end-to-end que un request soportado no cae accidentalmente al carril legacy.
  - Revisar si conviene ampliar `fallbackReason` para distinguir tambien planner error vs planner unsupported en observability/product analytics.
  - Conectar la UI/telemetria a `metadata.runtime.routingDecision` y `metadata.runtime.executionOutcome` como fuentes preferidas.
- Riesgos o bloqueos:
  - La decision runtime-first sigue dependiendo de `selectedSurfaces` y de la calidad del planner; si el shaping no detecta superficie operativa, el planner runtime no se intenta.
  - El fallback legacy sigue conviviendo por compatibilidad; la decision ya queda auditada, pero todavia hay dos carriles de ejecucion/observability.
- Comandos de verificacion conocidos:
  - `npm.cmd run typecheck`
  - `npm.cmd run test:ts -- src/lib/runtime/chat-route.test.ts src/lib/runtime/chat-bridge.test.ts`

## Snapshot sesion 2026-03-18 - Fase 2 punto 8 `/api/chat` como default path del runtime nuevo

- Estado actual: `/api/chat` ahora intenta primero el runtime nuevo para todo el catalogo soportado de Fase 2 segun integraciones operativas disponibles, incluyendo Gmail, Calendar, Google Sheets y Salesforce; el engine legacy/declarativo queda como fallback cuando el planner no devuelve un plan ejecutable del catalogo nuevo.
- Ultimos cambios relevantes:
  - `src/app/api/chat/route.ts`: el gate del planner/runtime deja de estar limitado a Gmail + Calendar, carga disponibilidad real tambien para Google Sheets y Salesforce, valida ejecutabilidad por accion abstracta y usa esa disponibilidad para policy-gate por provider en vez de asumir solo surfaces Google.
  - `src/app/api/chat/route.ts`: las respuestas persistidas del path runtime nuevo ahora incluyen metadata mas consistente con `runtimeRunId`, `actionPlan`, outcome, linkage approval/workflow por accion y breakdown LLM planner/postprocess, alineado con el objetivo pricing/observability-ready de Fase 2.
  - `src/lib/runtime/planner.ts`: el planner ampliÃ³ su contrato para las acciones nuevas del catalogo (`archive_thread`, `apply_label`, `reschedule_event`, `cancel_event`, `list_events`, `read_sheet_range`, `append_sheet_rows`, `update_sheet_range`, `search_records`, `create_lead`, `update_lead`, `create_task`), acepta `entity` y `computed`, y respeta el limite cerrado de maximo 3 acciones por plan.
  - `src/lib/runtime/chat-bridge.ts`: el renderer user-facing del runtime nuevo ya cubre lecturas de Calendar/Sheets/Salesforce y approvals de Gmail/Calendar/Sheets/Salesforce con mensajes concretos para el usuario final.
  - `src/lib/runtime/{planner,chat-bridge}.test.ts`: tests ampliados para acciones nuevas del planner y para respuestas runtime de Calendar/Salesforce.
- Pendientes inmediatos:
  - Sumar tests mas dirigidos sobre `/api/chat` o un helper extraido si queremos cobertura automatica del fallback runtime -> legacy segun surfaces/integraciones.
  - Evaluar una respuesta user-facing multi-accion mas rica cuando el planner empiece a emitir secuencias cortas de 2-3 acciones con mayor frecuencia.
  - Conectar este metadata contract nuevo a la UI/observability para leer preferentemente `runtime.actionPlan` y `runtime.llmUsageBreakdown` en vez de reconstruirlo desde fragmentos.
- Riesgos o bloqueos:
  - El planner ya puede devolver acciones nuevas del catalogo, pero la calidad real de planning sigue dependiendo de prompt/model routing; conviene monitorear especialmente prompts ambiguos de Sheets y Salesforce una vez en uso real.
  - El fallback legacy sigue vivo por compatibilidad; eso evita regresiones, pero durante Fase 2 todavia conviven dos carriles de respuesta y observabilidad.
- Comandos de verificacion conocidos:
  - `npm.cmd run typecheck`
  - `npm.cmd run test:ts -- src/lib/runtime/planner.test.ts src/lib/runtime/chat-bridge.test.ts`

## Snapshot sesion 2026-03-18 - Fase 2 punto 7 persistencia runtime_runs/runtime_events

- Estado actual: el runtime nuevo ya persiste estado y trazabilidad propia en `runtime_runs` y `runtime_events`, en paralelo al espejo legacy sobre metadata JSON, de modo que approvals/workflows async pueden reingresar y cerrar el mismo run auditable sin depender solo de `conversation.metadata` o `workflow_runs.metadata`.
- Ultimos cambios relevantes:
  - `supabase/migrations/20260318110000_add_runtime_runs_and_events.sql`: agrega tablas nuevas `runtime_runs` y `runtime_events`, con FK tenant-scoped, indices operativos y RLS de solo lectura por organizacion autenticada.
  - `src/lib/db/runtime-runs.ts`, `src/lib/db/runtime-events.ts`: helpers nuevos en la capa `src/lib/db` para crear/actualizar runs e insertar eventos normalizados del runtime.
  - `src/app/api/chat/route.ts`: cuando el request entra al runtime nuevo ahora crea un `runtime_run` al inicio, propaga `runtimeRunId` en `ExecutionContextV1`, persiste el stream completo de eventos al finalizar y deja status/costo/tokens/checkpoint/finalizacion consistentes segun `success`, `needs_user`, `blocked`, `failed` o `waiting_approval`.
  - `src/lib/runtime/{types,runner,executor,observability}.ts`: el contrato del runtime ahora propaga `runtimeRunId` y `workflowStepId` en contexto/eventos, para que `runtime_events` capture linkage real con approvals/workflows async sin inferencias por metadata.
  - `src/lib/runtime/executor.ts`: los writes encolados por approval guardan `runtime_run_id` en `workflow_runs.metadata`, `workflow_steps.input_payload` y `approval_items.context`, manteniendo compatibilidad con la `runtime_execution_trace` previa.
  - `src/lib/db/approval-items.ts`, `src/lib/workflows/execution.ts`, `src/lib/runtime/workflow-bridge.ts`: aprobar/rechazar/expirar approvals y el worker async ahora actualizan tambien `runtime_runs`/`runtime_events`, dejando el mismo run en `waiting_async_execution`, `retry`, `success`, `failed`, `blocked` o `manual_repair_required` segun corresponda.
  - `src/types/database.ts`, `SCHEMA.md`: contratos del schema actualizados para incluir las tablas nuevas como fuente de verdad del repo.
- Pendientes inmediatos:
  - Empezar a leer `runtime_runs` / `runtime_events` desde observability y desde la metadata user-facing de `/api/chat`, para que el punto 8 deje de depender del resumen reconstruido en memoria.
  - Evaluar si conviene migrar tambien el checkpoint conversacional a lectura preferente desde `runtime_runs` cuando se cablee `resume_from_checkpoint` end-to-end en chat y worker.
  - Sumar tests mas dirigidos sobre la sincronizacion approval/workflow -> runtime DB si en el punto 8/9 aparece algun drift entre metadata espejo y tablas dedicadas.
- Riesgos o bloqueos:
  - Hasta aplicar la migracion nueva en Supabase real, el codigo espera que existan `runtime_runs` y `runtime_events`; el repo ya quedo consistente, pero el despliegue requiere correr esa migracion antes de usar este path en vivo.
  - Se mantuvo deliberadamente el espejo `runtime_execution_trace` en metadata de workflow/conversation para compatibilidad; la fuente preferida del punto 7 pasa a ser la persistencia dedicada, pero todavia conviven ambos carriles.
- Comandos de verificacion conocidos:
  - `npm.cmd run typecheck`
  - `npm.cmd run test:ts -- src/lib/runtime/runner.test.ts`
  - `npm.cmd run test:ts -- src/lib/runtime/observability.test.ts`
  - `npm.cmd run test:ts -- src/lib/runtime/workflow-bridge.test.ts`
  - `npm.cmd run test:ts -- src/lib/runtime/executor.test.ts`
  - `npm.cmd run test:ts -- src/lib/workflows/execution-engine.test.ts`

## Snapshot sesion 2026-03-18 - Fase 2 punto 6 bridge unico con approvals/workflows

- Estado actual: el runtime nuevo ya usa `workflow_runs`, `workflow_steps` y `approval_items` como backend real para writes soportadas, y el worker async puede reingresar sobre la accion abstracta congelada del runtime en vez de depender solo del carril legacy `workflow-action-runtime`.
- Ultimos cambios relevantes:
  - `src/lib/runtime/executor.ts`: `enqueueRuntimeApproval(...)` ahora persiste la `abstract_action` completa dentro de `workflow_steps.input_payload`, mantiene el payload compilado separado en `action_input` y siembra una `runtime_execution_trace` compartida en `workflow_runs.metadata` para approval + ejecuciÃ³n async.
  - `src/lib/runtime/adapters/{gmail-adapter,google-calendar-adapter,google-sheets-adapter,salesforce-adapter}.ts`: los adapters write ahora distinguen entre `approvalMode: "required"` (encolar approval) y la ejecuciÃ³n async ya aprobada (`approvalMode: "auto"`), reutilizando los runtimes reales de Gmail, Calendar, Sheets y Salesforce con `workflowRunId/workflowStepId` propagados al provider gateway.
  - `src/lib/runtime/types.ts`: `ExecutionContextV1` incorpora `workflowRunId` y `workflowStepId` opcionales para que el path async use el mismo contrato runtime sin inventar otro contexto paralelo.
  - `src/lib/runtime/workflow-bridge.ts`: helper nuevo para rehidratar `RuntimeActionV1` desde `workflow_steps.input_payload`, ejecutar la acciÃ³n aprobada con el registry runtime unificado y mantener una `runtime_execution_trace` Ãºnica en workflow metadata/output.
  - `src/lib/workflows/execution.ts`: el worker `workflow.step.execute` intenta primero el bridge del runtime nuevo cuando existe `abstract_action`; si no, cae al engine legacy para compatibilidad. El mismo worker ahora agrega eventos `async_execution_started/completed/failed` a la traza compartida.
  - `src/lib/db/approval-items.ts`: aprobar, rechazar o expirar approvals actualiza la misma `runtime_execution_trace`, dejando outcomes consistentes (`queued` al aprobar, `blocked` al rechazar/expirar) antes de la ejecuciÃ³n o cierre del run.
  - Tests nuevos/actualizados: `src/lib/runtime/workflow-bridge.test.ts`; `npx.cmd tsc --noEmit`, `npm.cmd run test:ts -- src/lib/runtime/executor.test.ts src/lib/runtime/workflow-bridge.test.ts src/lib/workflows/execution-engine.test.ts` quedaron verdes.
- Pendientes inmediatos:
  - Reemplazar por completo `src/lib/engine/workflow-action-runtime.ts` una vez que todos los workflow steps soportados por approvals congelen `abstract_action` completa y ya no necesiten fallback legacy.
  - Llevar esta misma `runtime_execution_trace` a tablas dedicadas `runtime_runs/runtime_events` cuando avance el punto 7, para no depender de metadata JSON como almacenamiento principal.
  - Conectar `/api/chat` y observability del punto 8/9 para exponer esta traza compartida en metadata user-facing y mÃ©tricas por nodo/acciÃ³n.
- Riesgos o bloqueos:
  - Los workflow steps creados antes de este cambio pueden no tener `abstract_action` completa en `input_payload`; esos casos siguen cayendo deliberadamente al engine legacy para no romper runs pendientes.
  - La traza compartida quedÃ³ en `workflow_runs.metadata` y espejo parcial de `workflow_steps.output_payload`; sirve para Fase 2 punto 6, pero todavÃ­a no sustituye la persistencia dedicada del runtime cerrada para el punto 7.
- Comandos de verificacion conocidos:
  - `npm.cmd run typecheck`
  - `npm.cmd run test:ts -- src/lib/runtime/executor.test.ts src/lib/runtime/workflow-bridge.test.ts src/lib/workflows/execution-engine.test.ts`

## Snapshot sesion 2026-03-18 - Fase 2 punto 5 executor layer unificado

- Estado actual: `src/lib/runtime` ya ejecuta sobre un contrato de adapter mas uniforme, con selector por capacidad/soporte real, taxonomia comun de errores provider/budget y registry ampliado para Gmail, Calendar, Sheets y Salesforce sin que el executor dependa de implementaciones concretas.
- Ultimos cambios relevantes:
  - `src/lib/runtime/types.ts`: `IntegrationAdapterV1` ahora exige `supports`, `simulate`, `execute`, `normalizeError` y `buildIdempotencyMaterial`, e incorpora `RuntimeProviderV1`, `RuntimeAdapterCapabilityV1` y la taxonomia compartida (`auth`, `scope`, `rate_limit`, `budget_queued`, `budget_throttled`, `budget_exhausted`, `provider_retryable`, `provider_fatal`, `validation`).
  - `src/lib/runtime/adapters/shared.ts`: helper comun nuevo para normalizar errores provenientes de `ProviderRequestError`, materializar keys de idempotencia estables y convertir payloads tabulares a shapes canonicas para Sheets/Salesforce sin reimplementar hashing/errores por provider.
  - `src/lib/runtime/adapters/{gmail-adapter,google-calendar-adapter,google-sheets-adapter,salesforce-adapter}.ts`: adapters runtime ahora comparten el mismo contrato y cubren el catalogo abstracto de Fase 2 para Gmail (`search_email`, `summarize_thread`, `send_email`, `archive_thread`, `apply_label`), Calendar (`create_event`, `reschedule_event`, `cancel_event`, `list_events`), Sheets (`read_sheet_range`, `append_sheet_rows`, `update_sheet_range`) y Salesforce (`search_records`, `create_lead`, `update_lead`, `create_task`).
  - `src/lib/runtime/adapters/registry.ts`, `src/lib/runtime/adapters/selector.ts`: registry ampliado a cuatro providers y selector reescrito para elegir adapter via `supports(...)` en vez de depender solo de `actionTypes.includes(...)`.
  - `src/lib/runtime/executor.ts`: `simulate`/`execute` ahora seleccionan adapters con contexto, normalizan errores via `adapter.normalizeError(...)` y el path de approval/workflow persiste tambien `runtime_action_type` + `abstract_action` junto al payload compilado para dejar mejor puenteado el contrato abstracto.
  - Tests actualizados: `src/lib/runtime/executor.test.ts` y `src/lib/runtime/adapters/registry.test.ts`; adicionalmente `npx.cmd tsc --noEmit` quedo verde con el contrato nuevo.
- Pendientes inmediatos:
  - Reusar estos adapters desde el worker async/bridge del punto 6 para que `workflow-action-runtime` deje de duplicar resolucion provider-specific y ejecute sobre el mismo registro unificado.
  - Hacer que `workflow_steps.action` y/o su bridge puedan conservar simultaneamente accion abstracta y accion compilada sin depender solo de `provider + action` legacy.
  - Conectar estas acciones nuevas al planner y a `/api/chat` cuando avance el punto 8, porque hoy el catalogo/registry ya las soporta pero el planner runtime todavia no las produce end-to-end.
- Riesgos o bloqueos:
  - Para `archive_thread` y `apply_label`, el runtime abstracto todavia solo congela `threadRef`; el adapter usa un placeholder estable para `messageId` porque el contrato write legado de Gmail pide ese campo aunque la mutacion real opere sobre `threadId`. Conviene enriquecer la referencia persistida en el punto 6/8 para eliminar ese parche.
  - El approval bridge ya guarda `abstract_action` dentro de `workflow_steps.input_payload`, pero la columna `action` sigue siendo la accion compilada del provider para no romper el worker existente; la unificacion completa del carril async todavia requiere absorber `workflow-action-runtime`.
- Comandos de verificacion conocidos:
  - `npm.cmd run test:ts -- src/lib/runtime/executor.test.ts src/lib/runtime/adapters/registry.test.ts`
  - `npx.cmd tsc --noEmit`

## Snapshot sesion 2026-03-18 - Fase 2 punto 4 policy engine uniforme

- Estado actual: `src/lib/runtime` ya tiene un policy engine mas declarativo y compartido entre `validate` y `policy_gate`, con decisiones explicitas (`execute`, `ask_user`, `use_llm`, `enqueue_approval`, `block`) y budgets alineados a los limites cerrados de Fase 2.
- Ultimos cambios relevantes:
  - `src/lib/runtime/types.ts`: el runtime ahora modela `RuntimePolicyDecisionOutcomeV1`, budgets por request para `llm_repair` y acciones destructivas, y sube defaults a `llmRepairCallsMaxPerAction=2`, `llmRepairCallsMaxPerRequest=2`, `syncRetriesMaxPerAction=3`, `destructiveActionsMaxPerRequest=1`.
  - `src/lib/runtime/action-catalog.ts`: cada accion abstracta ahora declara `sideEffectKind` (`read`, `write`, `destructive`) para que policy y runner puedan gobernar approvals y limites sin heuristicas provider-specific.
  - `src/lib/runtime/policy-engine.ts`: `evaluateRuntimeActionPolicyV1(...)` ahora persiste una decision declarativa de policy, bloquea `action_not_supported`, corta writes destructivos extra por request interactivo, obliga `ask_user` ante targets ambiguos de mutacion y restringe `use_llm` a campos no criticos/no sensibles; nunca habilita LLM para `entity`, `reference`, `time`, `recipient`, `record`, `datetime`, `timezone`.
  - `src/lib/runtime/node-registry.ts`: `policy_gate` ya consume la decision declarativa persistida por `validate` en vez de re-inferirla solo desde `status + requiresApproval`.
  - `src/lib/runtime/runner.ts`: el runner ahora acumula `llmRepairCallsUsedInRequest` y `destructiveActionsUsedInRequest` en `ctx.budget`, aplicando el limite transversal de `llm_repair` por request y propagando ese estado en reentry/checkpoints.
  - `src/lib/runtime/executor.ts`: los `workflow_steps` creados por el runtime nuevo pasan a `max_attempts = 5`, alineados con el limite async cerrado para Fase 2.
  - `src/app/api/chat/route.ts`: el budget inicial del path runtime nuevo ya usa los defaults cerrados de Fase 2 para retries sync, `llm_repair` por request y acciones destructivas.
  - Tests nuevos/actualizados: `src/lib/runtime/policy-engine.test.ts`, `src/lib/runtime/node-registry.test.ts`, `src/lib/runtime/runner.test.ts` cubren decision declarativa, veto de LLM en campos sensibles, bloqueo de accion destructiva extra y limite transversal de `llm_repair`; `src/lib/runtime/executor.test.ts` sigue verde con el contrato actualizado.
- Pendientes inmediatos:
  - Reutilizar este contrato declarativo cuando se implemente el bridge completo con approvals/workflows del punto 6, para que reject/expire/resume compartan exactamente los mismos outcomes y reasons.
  - Expandir `getPolicyContext(...)` con seÃ±ales reales de preset/scope/catalog soportado por provider cuando `/api/chat` pase a usar mas acciones del catalogo ampliado.
  - Evaluar si conviene persistir `policyDecision` y budgets acumulados tambien en `runtime_runs/runtime_events` cuando se implemente el punto 7, en vez de depender solo de metadata/checkpoint.
- Riesgos o bloqueos:
  - El limite de accion destructiva hoy depende de `sideEffectKind` del catalogo; por ahora `archive_thread`, `cancel_event` y `update_sheet_range` quedaron marcadas como destructivas, pero convendra revisar esa clasificacion cuando entren mas adapters reales de Sheets/Salesforce.
  - `use_llm` ya quedo vetado para campos sensibles por contrato del runtime, pero el planner legacy y algunos caminos fuera de `src/lib/runtime` todavia pueden tener heuristicas propias hasta que el punto 8 termine de consolidar `/api/chat` sobre este engine.
- Comandos de verificacion conocidos:
  - `npm.cmd run test:ts -- src/lib/runtime/policy-engine.test.ts`
  - `npm.cmd run test:ts -- src/lib/runtime/node-registry.test.ts`
  - `npm.cmd run test:ts -- src/lib/runtime/runner.test.ts`
  - `npm.cmd run test:ts -- src/lib/runtime/executor.test.ts`
  - `npm.cmd run typecheck`

## Snapshot sesion 2026-03-18 - Fase 2 punto 3 resolver engine extensible real

- Estado actual: `src/lib/runtime/resolver-engine.ts` ya dejo de ser un registro rigido por `action.type + param.kind` y paso a resolver por etapas ordenadas (`explicit_payload -> conversation_context -> db -> integration -> deterministic -> llm`) con registro declarativo, prioridad, familia de resolver y criticidad por parametro.
- Ultimos cambios relevantes:
  - `src/lib/runtime/types.ts`: el runtime ahora reconoce las acciones nuevas objetivo de Fase 2 (`archive_thread`, `apply_label`, `reschedule_event`, `cancel_event`, `list_events`, `read_sheet_range`, `append_sheet_rows`, `update_sheet_range`, `search_records`, `create_lead`, `update_lead`, `create_task`) y amplia `ParamValueV1` con `entity` y `computed`; `ResolverResultV1` ahora persiste `resolutionStatus` para distinguir `resolved / ambiguous / missing / blocked` sin romper el runner.
  - `src/lib/runtime/action-catalog.ts`: el catalogo abstracto ya define contratos minimos, `resourceFamily` y `criticality` para Gmail, Calendar, Sheets y Salesforce, de modo que el resolver no dependa de planners/orchestrators verticales para saber que intentar resolver y que campos pueden degradar a LLM.
  - `src/lib/runtime/resolver-engine.ts`: engine nuevo registrable con familias `entityResolvers`, `referenceResolvers`, `timeResolvers`, `computedResolvers` y `llmResolvers`; soporta referencias desde contexto reciente persistido para `threadRef`, `eventRef`, `sheetRef` y `rangeRef`, fallback a metadata/DB, lectura de integracion, transforms deterministicos de tiempo/email/texto y fallback LLM controlado solo para campos no criticos tipo `body`.
  - `src/lib/runtime/resolver-engine.test.ts`: cobertura nueva para orden de resolvers, ambiguedad de `eventRef`, reutilizacion de contexto reciente de Sheets, precedencia de `readLocalMetadata` sobre integracion, relative dates y `needs_llm` limitado a `body` no critico.
- Pendientes inmediatos:
  - Conectar este resolver engine al planner/runtime path cuando se ejecute el punto 8, para que `/api/chat` empiece a producir acciones nuevas del catalogo y no solo las MVP actuales.
  - Expandir resolvers de Salesforce y Sheets con lookup real por DB/API cuando avancemos el punto 5 y existan adapters/selector para esas acciones nuevas.
  - Evaluar si conviene formalizar `ParamValueV2`/`ActionPlanV2` como alias nuevos en vez de seguir extendiendo `V1`, una vez que planner y executor usen el catalogo ampliado end-to-end.
- Riesgos o bloqueos:
  - El catalogo y el resolver ya conocen mas acciones que el planner y los adapters actuales; eso es intencional para avanzar por capas, pero significa que esas acciones todavia no quedan ejecutables desde `/api/chat` hasta los puntos siguientes.
  - `computed` hoy sirve para defaults/payloads estructurados del resolver, pero falta endurecer su contrato cuando entren writes reales de Sheets/Salesforce para no aceptar shapes demasiado laxas.
- Comandos de verificacion conocidos:
  - `npm.cmd run test:ts -- src/lib/runtime/resolver-engine.test.ts`
  - `npm.cmd run test:ts -- src/lib/runtime/policy-engine.test.ts`
  - `npm.cmd run test:ts -- src/lib/runtime/runner.test.ts`
  - `npm.cmd run test:ts -- src/lib/runtime/chat-bridge.test.ts`
  - `npm.cmd run test:ts -- src/lib/runtime/executor.test.ts`
  - `npm.cmd run typecheck`

## Snapshot sesion 2026-03-18 - Fase 2 punto 2 node registry completo con variantes de flujo

- Estado actual: `src/lib/runtime` ya expone un node registry centralizado para Fase 2 con `policy_gate` dentro del grafo principal y nodos auxiliares reales (`llm_repair`, `user_clarification`, `error_handler`) consumidos por el runner, de modo que el flujo deja de ser una tuberia lineal definida en `/api/chat`.
- Ultimos cambios relevantes:
  - `src/lib/runtime/types.ts`, `src/lib/runtime/graph.ts`: el grafo principal ahora incluye `policy_gate` y el registry tipado cubre todos los nodos obligatorios de Fase 2, no solo los lineales.
  - `src/lib/runtime/node-registry.ts`: factory nueva `createRuntimeNodeRegistryV1(...)` que compone handlers default para `normalize`, `enrich`, `resolve`, `validate`, `policy_gate`, `simulate`, `execute`, `postprocess`, `llm_repair`, `user_clarification` y `error_handler`.
  - `src/lib/runtime/policy-engine.ts`: `validate` ahora persiste un snapshot de policy enriquecido con `status` y `reason`, que `policy_gate` reutiliza para decidir `execute / enqueue_approval / ask_user / use_llm / block`.
  - `src/lib/runtime/runner.ts`: el runner ya invoca `user_clarification` antes de checkpoint de aclaracion y `error_handler` para clasificar fallos/degradaciones, manteniendo `resumeFrom` sobre el nodo funcional original.
  - `src/app/api/chat/route.ts`: `/api/chat` dejo de construir el registry inline y ahora consume `createRuntimeNodeRegistryV1(...)`, con policy context inyectado desde la ruta pero flujo gobernado desde `src/lib/runtime`.
  - `src/lib/runtime/runner.test.ts`: cobertura nueva para orden con `policy_gate`, checkpoint via `user_clarification`, resume desde checkpoint enriquecido y degradacion por `error_handler`.
- Pendientes inmediatos:
  - Hacer que `/api/chat` use la salida estructurada de `user_clarification.output.question` para responder con la pregunta concreta del runtime, en vez de depender solo del renderer heuristico actual.
  - Empezar a mover parte de la clasificacion retryable/blocking al `error_handler` de adapters/providers para que no quede solo en reglas genericas.
  - Cablear `resumeFromCheckpoint` end-to-end desde respuestas de aclaracion del usuario y desde el worker async, ahora que el registry ya emite checkpoints sobre nodos auxiliares.
- Riesgos o bloqueos:
  - `llmRepair` legacy queda todavia en la firma del runner por compatibilidad, pero el path preferido ya es `nodes.llm_repair`; conviene limpiar esa interfaz cuando el bridge async quede migrado.
  - `user_clarification` ya persiste payload estructurado en metadata del mensaje/runtime, pero la UX user-facing todavia no lo consume directamente.
- Comandos de verificacion conocidos:
  - `npm.cmd run test:ts -- src/lib/runtime/runner.test.ts src/lib/runtime/policy-engine.test.ts src/lib/runtime/resolver-engine.test.ts src/lib/runtime/chat-bridge.test.ts src/lib/runtime/executor.test.ts`
  - `npm.cmd run typecheck`

## Snapshot sesion 2026-03-18 - Fase 2 punto 1 runtime core robusto con checkpoints y reentry

- Estado actual: `src/lib/runtime` ya soporta un runner mas robusto para Fase 2 con checkpoints persistibles por accion/nodo, reentry desde checkpoint, limites explicitos de loops y soporte cerrado de hasta 3 acciones por plan sin depender todavia de tablas nuevas.
- Ultimos cambios relevantes:
  - `src/lib/runtime/types.ts`: el contrato del runtime ahora incorpora estados operativos adicionales (`waiting_approval`, `waiting_async_execution`, `completed_with_degradation`), budgets/guardrails de loops (`maxNodeVisitsPerAction`, `maxRetriesPerNode`, `maxActionsPerPlan`, `repeatedErrorFingerprintLimit`) y checkpoints enriquecidos con `actionIndex`, `node`, `status`, snapshots y contadores para reentry real.
  - `src/lib/runtime/runner.ts`: el runner ahora normaliza budget con defaults, corta planes de mas de 3 acciones, limita visitas por nodo, detecta fingerprints repetidos, separa `policyDecision`/`executionOutcome` en las visitas, soporta `resumeFromCheckpoint`, persiste checkpoints con snapshot de accion/contexto y pausa de forma consistente en `needs_user` y `waiting_approval`.
  - `src/lib/chat/conversation-metadata.ts`: metadata de conversacion extendida para aceptar el nuevo `runtime_checkpoint` persistible y estados ampliados en `runtime_trace_summary`, sin requerir migracion.
  - `src/lib/runtime/runner.test.ts`: cobertura nueva para approval checkpoint, plan action limit, resume desde checkpoint y shape enriquecido del checkpoint.
- Pendientes inmediatos:
  - Consumir `resumeFromCheckpoint` desde `/api/chat` y desde el worker async para que el reentry quede cableado end-to-end y no solo disponible en el core.
  - Introducir los nodos faltantes de Fase 2 (`policy_gate`, `user_clarification`, `error_handler`) para que estos estados nuevos dejen de ser solo contratos del runner y pasen a gobernar flujos reales.
  - Definir persistencia dedicada (`runtime_runs` / `runtime_events`) cuando se tome el punto 7, para no depender de metadata de conversacion como almacenamiento principal del checkpoint.
- Riesgos o bloqueos:
  - El runtime ya puede guardar snapshots de checkpoint en metadata, pero eso aumenta el peso del JSON de conversacion hasta que exista persistencia propia del runtime.
  - `waiting_async_execution` y `completed_with_degradation` ya quedaron modelados en tipos/core, pero todavia no hay nodos/adapters del repo que los emitan de forma real.
- Comandos de verificacion conocidos:
  - `npm.cmd run test:ts -- src/lib/runtime/runner.test.ts src/lib/runtime/chat-bridge.test.ts src/lib/runtime/observability.test.ts`
  - `npm.cmd run typecheck`

## Snapshot sesion 2026-03-18 - Fase 1 punto 8 observabilidad minima runtime backend-first

- Estado actual: el runtime MVP ya emite eventos estructurados con helper propio en `src/lib/runtime/observability.ts`, reutilizado desde `/api/chat` para normalizar logs server-side por plan y por nodo sin depender de `console.info(...)` inline.
- Ultimos cambios relevantes:
  - `src/lib/runtime/observability.ts`: helper nuevo para serializar eventos runtime al shape requerido (`request_id`, `trace_id`, `action_id`, `action_type`, `node`, `status`, `latency_ms`, `llm_calls`, `tokens_input`, `tokens_output`, `provider`, `provider_request_id`, `approval_item_id`, `workflow_run_id`) y para enriquecer la traza con metricas LLM del planner y del `postprocess`.
  - `src/app/api/chat/route.ts`: el branch runtime ya usa `enrichRuntimeEvents(...)` + `logRuntimeEvents(...)` en vez de logging ad hoc, incorporando tokens/llamadas del planner y del postproceso semantico de `summarize_thread` dentro de la misma traza.
  - `src/lib/runtime/observability.test.ts`: cobertura nueva para enriquecimiento de eventos de plan, enriquecimiento del nodo `postprocess` y serializacion estable del payload estructurado.
- Pendientes inmediatos:
  - Si queremos observabilidad completa tambien para fallos del planner antes de entrar al graph runner, conviene emitir `runtime.plan.started|completed|failed` desde el intento de planner y no solo desde la traza del runner.
  - Si el `postprocess` semantico falla hoy, el costo/error sigue quedando reflejado en `llm_call_metrics`, pero no como un `runtime.node.failed` sintetico dentro del trace.
- Riesgos o bloqueos:
  - La telemetria de planner y `postprocess` se injerta sobre eventos ya generados por el runner; esto mantiene el cambio chico, pero deja parte de la semantica de observabilidad todavia en la capa de orquestacion.
- Comandos de verificacion conocidos:
  - `npm.cmd run test:ts -- src/lib/runtime/observability.test.ts src/lib/runtime/runner.test.ts src/lib/runtime/executor.test.ts`
  - `npm.cmd run typecheck`

## Snapshot sesion 2026-03-17 - Fase 1 punto 7 bridge `/api/chat` hacia runtime MVP backend-first

- Estado actual: `/api/chat` ya enruta al runtime nuevo cuando el planner MVP devuelve un `ActionPlanV1` ejecutable dentro del catalogo (`search_email`, `summarize_thread`, `send_email`, `create_event`) y hay runtime Google usable; si no, mantiene intacto el fallback al engine actual/declarativo.
- Ultimos cambios relevantes:
  - `src/app/api/chat/route.ts`: bridge nuevo server-side para ejecutar `runExecutionGraph(...)` con node registry MVP (`normalize`, `enrich`, `resolve`, `validate`, `simulate`, `execute`, `postprocess`) construido en la capa de orquestacion, sin mover logica legacy fuera de su path actual.
  - `src/app/api/chat/route.ts`: el branch runtime persiste `runtime_trace_summary` y `runtime_checkpoint`, registra eventos estructurados por nodo via `console.info(...)`, y sigue guardando costos/tokens en `usage_records`.
  - `src/app/api/chat/route.ts`: `summarize_thread` ahora responde con salida semantica grounded en evidencia validada del thread; `search_email` responde directo desde backend; `send_email`/`create_event` responden con mensaje de approval inbox sin side effect directo.
  - `src/app/api/chat/route.ts`: al manejar lecturas Gmail exitosas, el bridge actualiza `recent_declarative_engine_context` para que el resolver MVP pueda reutilizar referencias conversacionales como `ultimo hilo` o `ese hilo`.
  - `src/lib/chat/conversation-metadata.ts`: metadata extendida para soportar `runtime_checkpoint` y `runtime_trace_summary` sin perder esos campos al mergear conversaciones.
  - `src/lib/runtime/chat-bridge.ts`: helpers nuevos para renderizar respuestas runtime-friendly, construir `runtime_trace_summary` y derivar contexto declarativo reciente desde outputs del runtime.
  - `src/lib/runtime/chat-bridge.test.ts`: cobertura nueva para renderizado de lecturas/writes, resumen de trace y persistencia de contexto reciente.
- Pendientes inmediatos:
  - Mover el `postprocess` semantico de `summarize_thread` desde el bridge de `/api/chat` a un handler propio del runtime si queremos que la traza incluya explicitamente ese nodo LLM.
  - Implementar reingreso end-to-end desde aclaracion del usuario retomando `runtime_checkpoint.resumeFrom = "resolve"` en la siguiente request, en vez de limitarse a persistir el checkpoint.
  - Completar observabilidad dedicada si queremos exportar estos eventos a un sink estructurado, no solo a logs server-side.
- Riesgos o bloqueos:
  - El bridge hoy asume una accion principal por turno para el mensaje final; la traza soporta multiples acciones, pero la respuesta user-facing toma la primera accion ejecutada del plan.
  - `summarize_thread` ya usa evidencia validada antes de pasar por LLM, pero ese postproceso vive todavia en la ruta y no en el graph runner, asi que la telemetria de nodo no refleja ese paso como `postprocess`.
- Comandos de verificacion conocidos:
  - `npm.cmd run test:ts -- src/lib/runtime/chat-bridge.test.ts src/lib/runtime/runner.test.ts src/lib/runtime/resolver-engine.test.ts src/lib/runtime/policy-engine.test.ts src/lib/runtime/executor.test.ts`
  - `npm.cmd run typecheck`

## Snapshot sesion 2026-03-17 - Fase 1 punto 6 adapters y executor MVP runtime backend-first

- Estado actual: el runtime nuevo ya tiene capa `adapters/registry` + `adapter-selector` + `executor` en `src/lib/runtime`, con adapters MVP para Gmail y Google Calendar, previews determinÃ­sticos para writes y encolado idempotente hacia `approval_items` + `workflow_runs` + `workflow_steps` usando la infraestructura async existente.
- Ultimos cambios relevantes:
  - `src/lib/runtime/types.ts`: contratos nuevos `ProviderPayloadV1`, `SimulationResultV1` y `ExecutionOutcomeV1`, y extension de `IntegrationAdapterV1` para `compile/simulate/execute`.
  - `src/lib/runtime/adapters/shared.ts`: utilidades comunes para normalizar params resueltos, construir payloads provider-specific y generar `idempotency_key = organizationId + agentId + conversationId + actionType + canonicalParamsHash`.
  - `src/lib/runtime/adapters/gmail-adapter.ts`: adapter MVP para `search_email`, `summarize_thread` y `send_email`; las lecturas usan el runtime Google existente (`search_threads` / `read_thread`) y `send_email` genera preview + approval/workflow sin side effect directo.
  - `src/lib/runtime/adapters/google-calendar-adapter.ts`: adapter MVP para `create_event` con preview determinÃ­stico y encolado de approval/workflow, validando runtime Google Calendar usable antes de persistir la solicitud.
  - `src/lib/runtime/adapters/registry.ts`, `src/lib/runtime/adapters/selector.ts`: registro nuevo de adapters y selector desacoplado por accion abstracta.
  - `src/lib/runtime/executor.ts`: APIs nuevas `simulateAction(...)`, `executeAction(...)`, `createSimulateNodeHandlerV1(...)`, `createExecuteNodeHandlerV1(...)` y helper `enqueueRuntimeApproval(...)` con lookup por `workflow_steps.idempotency_key` para deduplicar retries.
  - `src/lib/runtime/executor.ts`: los writes ahora guardan `integration_id` real en `workflow_runs.metadata`, dejando al worker async existente listo para ejecutar el step aprobado sin cambios de schema.
  - `src/lib/runtime/index.ts`: export del executor y del registry/selector nuevos.
  - `src/lib/runtime/adapters/registry.test.ts`, `src/lib/runtime/executor.test.ts`: cobertura nueva para seleccion de adapter, simulate node y execute node.
- Pendientes inmediatos:
  - Cablear `createSimulateNodeHandlerV1(...)` y `createExecuteNodeHandlerV1(...)` dentro del registry real del graph runner.
  - Implementar `postprocess` para `summarize_thread` usando LLM solo sobre evidencia validada de Gmail.
  - Ejecutar el punto 7 para que `/api/chat` derive al runtime nuevo cuando el planner produzca acciones MVP validas y persista `runtime_trace_summary` / `runtime_checkpoint`.
- Riesgos o bloqueos:
  - El helper idempotente deduplica por `workflow_steps.idempotency_key`; ante carreras simultaneas muy cerradas evita duplicar el step, pero el cleanup del `workflow_run` huÃ©rfano depende del manejo actual en el path de conflicto.
  - `create_event` hoy compila `start/end` directamente desde params resueltos; la validacion semantica fina del rango temporal sigue recayendo en resolver/policy y en el schema del runtime Google al ejecutar el worker.
- Comandos de verificacion conocidos:
  - `npm.cmd run test:ts -- src/lib/runtime/adapters/registry.test.ts`
  - `npm.cmd run test:ts -- src/lib/runtime/executor.test.ts`
  - `npm.cmd run test:ts -- src/lib/runtime/runner.test.ts`
  - `npm.cmd run test:ts -- src/lib/runtime/resolver-engine.test.ts`
  - `npm.cmd run test:ts -- src/lib/runtime/policy-engine.test.ts`
  - `npm.cmd run typecheck`

## Snapshot sesion 2026-03-17 - Fase 1 punto 5 policy-engine MVP runtime backend-first

- Estado actual: el runtime nuevo ya tiene `policy-engine` separado en `src/lib/runtime/policy-engine.ts`, con evaluacion cerrada por accion abstracta y un `validate` node handler listo para enchufarse al graph runner sin mezclar autorizacion/presupuesto con el resolver.
- Ultimos cambios relevantes:
  - `src/lib/runtime/policy-engine.ts`: motor nuevo `evaluateRuntimeActionPolicyV1(...)` que aplica reglas cerradas del MVP para `search_email`, `summarize_thread`, `send_email` y `create_event`, distinguiendo `success`, `needs_llm`, `needs_user` y `blocked`.
  - `src/lib/runtime/policy-engine.ts`: el policy engine bloquea por `auth`, integracion inactiva, scopes faltantes, organizacion/agente inactivos y acciones no permitidas por plan/agente/organizacion; no depende del resolver para esas decisiones.
  - `src/lib/runtime/policy-engine.ts`: `needs_llm` queda permitido solo para campos no criticos y con budget disponible; si se agota el budget de repair degrada a `needs_user`, y si el costo estimado supera el presupuesto del turno bloquea como `turn_budget_exceeded`.
  - `src/lib/runtime/policy-engine.ts`: `createValidateNodeHandlerV1(...)` consume el resumen de resolucion del nodo `resolve` y persiste `runtime_policy` tanto en `action.metadata` como en `messageMetadata`.
  - `src/lib/runtime/types.ts`: tipos nuevos `RuntimeResolutionSummaryV1`, `RuntimePolicyContextV1` y `RuntimePolicyEvaluationV1` para formalizar el contrato entre `resolve`, `validate` y el futuro bridge server-side.
  - `src/lib/runtime/resolver-engine.ts`: el resumen de resolucion ahora incluye `ambiguousFields` ademas de `resolvedFields`, `missingFields`, `llmFields` y `blockedFields`, para que policy pueda distinguir aclaracion real de un faltante simple.
  - `src/lib/runtime/policy-engine.test.ts`: cobertura unitaria nueva para read ejecutable, write con approval requerido, faltantes criticos, ambiguedad, bloqueos por auth/scope, permiso de `needs_llm` solo en campos no criticos y budget del turno.
  - `src/lib/runtime/resolver-engine.test.ts`, `src/lib/runtime/index.ts`: ajuste de contrato/export para el nuevo summary y export del policy engine.
- Pendientes inmediatos:
  - Cablear `createValidateNodeHandlerV1(...)` dentro del registry real del graph runner junto con el `resolve` node ya existente.
  - Inyectar `RuntimePolicyContextV1` real desde el bridge de `/api/chat` con auth, plan, estado del agente/organizacion e integracion Google disponible.
  - Ejecutar el punto 6 con adapters/selector y empezar a usar `runtime_policy` para decidir `simulate/execute` sin tocar el engine legacy.
- Riesgos o bloqueos:
  - El policy engine ya falla cerrado, pero por ahora usa defaults permisivos cuando el bridge todavia no inyecta `runtime_policy_context`; eso evita falsos bloqueos mientras no esta conectado end-to-end.
  - La deteccion de ambiguedad hoy depende de `ambiguous_*` o `output.candidates` del resolver; si futuros resolvers agregan otras formas de ambiguedad, habra que reflejarlas en el resumen comun.
- Comandos de verificacion conocidos:
  - `npm.cmd run test:ts -- src/lib/runtime/policy-engine.test.ts`
  - `npm.cmd run test:ts -- src/lib/runtime/resolver-engine.test.ts`
  - `npm.cmd run test:ts -- src/lib/runtime/runner.test.ts`
  - `npm.cmd run typecheck`

## Snapshot sesion 2026-03-17 - Fase 1 punto 4 resolver-engine MVP runtime backend-first

- Estado actual: el runtime nuevo ya tiene `resolver-engine` desacoplado en `src/lib/runtime/resolver-engine.ts`, con registro por `action.type + param.kind`, API `resolveParam(...)`, resolucion por accion `resolveAction(...)` y un `resolve` node handler listo para enchufarse al graph runner.
- Ultimos cambios relevantes:
  - `src/lib/runtime/resolver-engine.ts`: engine nuevo con registro cerrado para `summarize_thread`, `send_email`, `create_event` y `search_email`, resolviendo params en orden controlado y sin mezclar providers con acciones abstractas.
  - `src/lib/runtime/resolver-engine.ts`: resolver `reference/thread` soporta `ultimo hilo`, `ese hilo` y `threadId` explicito usando `recent_declarative_engine_context` como contexto reciente persistido, y falla cerrado con `needs_user` si hay ambiguedad.
  - `src/lib/runtime/resolver-engine.ts`: resolver `time/basic` soporta ISO, fecha explicita, `hoy`, `manana`, `pasado manana` y weekdays simples, con timezone default inyectable para futuro bridge de Google Calendar.
  - `src/lib/runtime/resolver-engine.ts`: resolver `recipient/email` acepta solo emails literales para `to`, `cc`, `bcc` y `attendees`; no intenta adivinar personas por nombre.
  - `src/lib/runtime/resolver-engine.ts`: resolver `body/text` usa texto explicito y degrada a `needs_llm` solo para `body` cuando el caller marca drafting permitido y el destinatario ya quedo inequivoco; campos criticos como `to` nunca disparan repair.
  - `src/lib/runtime/types.ts`: tipo nuevo `ResolverResultV1` para exponer la salida interna del resolver engine de forma consistente con estados del runtime.
  - `src/lib/runtime/index.ts`: export del resolver engine desde el barrel del runtime.
  - `src/lib/runtime/resolver-engine.test.ts`: cobertura nueva para `threadRef` desde contexto reciente, fechas relativas basicas, rechazo de destinatario sin email explicito, guardrail de no usar LLM en campos criticos y shape del node handler `resolve`.
- Pendientes inmediatos:
  - Ejecutar el punto 5 con el `policy-engine` separado y conectarlo al `resolve` node para traducir `needs_user|needs_llm|blocked` en reglas cerradas por accion.
  - Cablear el `resolve` node handler dentro del registry real del graph runner y persistir `runtime_checkpoint`/resumen cuando entre el bridge de `/api/chat`.
  - Conectar los hooks opcionales del resolver (`readLocalMetadata`, `readIntegrationValue`, `getDefaultTimezone`) al bridge server-side para usar metadata real e integracion Google Calendar sin inventar estado en cliente.
- Riesgos o bloqueos:
  - El engine ya deja listos hooks para metadata local e integration read, pero en este punto siguen como dependencias inyectables; todavia no estan conectados al runtime end-to-end porque eso depende de los puntos 5-7.
  - `time/basic` normaliza a fecha o datetime local + `timezone`, no a payload provider-specific; la conversion final al shape exacto de Calendar queda para adapters/executor.
- Comandos de verificacion conocidos:
  - `npm.cmd run test:ts -- src/lib/runtime/resolver-engine.test.ts`
  - `npm.cmd run test:ts -- src/lib/runtime/runner.test.ts src/lib/runtime/planner.test.ts src/lib/runtime/action-catalog.test.ts`
  - `npm.cmd run typecheck`

## Snapshot sesion 2026-03-17 - Fase 1 punto 3 action-catalog MVP runtime backend-first

- Estado actual: el runtime nuevo ya tiene un `action-catalog` abstracto en `src/lib/runtime/action-catalog.ts` que define los 4 contratos cerrados del MVP (`search_email`, `summarize_thread`, `send_email`, `create_event`) con inputs minimos, opcionales, output esperado y `approvalMode` server-side.
- Ultimos cambios relevantes:
  - `src/lib/runtime/action-catalog.ts`: nuevo catalogo fuente de verdad para contratos abstractos del runtime MVP, incluyendo definiciones tipadas por accion, params permitidos, output semantico, helper de `approvalMode` y validacion de params (`missingRequired`, `unknownParams`, `invalidKinds`).
  - `src/lib/runtime/planner.ts`: el planner ya no duplica la regla de approval de lecturas vs escrituras; ahora la toma del catalogo para mantener consistencia con el runtime.
  - `src/lib/runtime/index.ts`: export del catalogo desde el barrel de runtime.
  - `src/lib/runtime/action-catalog.test.ts`: cobertura unitaria nueva para shape del catalogo, contratos minimos/opcionales por accion, `approvalMode` cerrado y validacion de params permitidos.
- Pendientes inmediatos:
  - Ejecutar el punto 4 con el `resolver-engine` desacoplado y registro por `param.kind + action.type`.
  - Conectar el punto 5 (`policy-engine`) al runner nuevo usando el catalogo como base de campos criticos y reglas de approval/bloqueo.
  - Implementar el bridge del punto 7 para que `/api/chat` derive al runtime nuevo cuando el planner produzca un plan valido del catalogo MVP.
- Riesgos o bloqueos:
  - El catalogo ya fija contratos abstractos, pero todavia no esta siendo consumido por `resolver-engine`, `policy-engine` ni adapters; por ahora actua como fuente de verdad tipada y validable.
  - La semantica de outputs queda documentada a nivel runtime, pero el shape exacto de payloads de `execute/postprocess` se definira cuando entren adapters y executor.
- Comandos de verificacion conocidos:
  - `npm.cmd run test:ts -- src/lib/runtime/action-catalog.test.ts`
  - `npm.cmd run test:ts -- src/lib/runtime/planner.test.ts`
  - `npm.cmd run typecheck`

## Snapshot sesion 2026-03-17 - Fase 1 punto 2 planner MVP runtime backend-first

- Estado actual: el runtime nuevo ya tiene planner MVP aislado en `src/lib/runtime/planner.ts`, con salida `ActionPlanV1` estricta para las 4 acciones MVP (`search_email`, `summarize_thread`, `send_email`, `create_event`) y un hook inicial en `/api/chat` que lo invoca antes del engine declarativo actual sin romper el fallback legacy/declarativo existente.
- Ultimos cambios relevantes:
  - `src/lib/runtime/planner.ts`: planner nuevo server-side via LiteLLM con una sola llamada por request, prompt corto, JSON estricto validado con `zod`, params limitados a `primitive|reference|time|unknown`, confidence gate `< 0.75 => actions vacias`, y sanitizacion server-side de `approvalMode` (`auto` para lecturas, `required` para writes).
  - `src/lib/runtime/index.ts`: export del planner nuevo desde el barrel de runtime.
  - `src/lib/runtime/planner.test.ts`: cobertura unitaria para NL -> `search_email`, NL -> `send_email`, NL -> `create_event` y turno ambiguo con `missingFields` + plan vacio.
  - `src/app/api/chat/route.ts`: pre-hook nuevo que invoca el planner solo cuando el turno cae en superficies Google MVP (`gmail`/`google_calendar`) con runtime disponible; hoy se usa para observabilidad/costo y deja preparado el bridge del runtime nuevo sin cambiar todavia la ejecucion final del turno.
  - `src/app/api/chat/route.ts`: metadata/usage del turno ahora incluyen el costo del planner (`runtime_planner`, `llm_call_metrics`, `tokens_input_total`, `tokens_output_total`) cuando el hook corre.
- Pendientes inmediatos:
  - Ejecutar el punto 3 con el `action-catalog` abstracto y contratos cerrados por accion.
  - Conectar el punto 4 (`resolver-engine`) y el punto 5 (`policy-engine`) al runner nuevo para que el planner deje de ser solo prepaso observacional y pase a enrutar acciones MVP reales.
  - Implementar el bridge del punto 7 para que `/api/chat` derive al runtime nuevo cuando el planner produzca un plan valido del catalogo MVP.
- Riesgos o bloqueos:
  - El hook en `/api/chat` hoy no ejecuta todavia el runtime nuevo; solo planifica, registra telemetria y preserva compatibilidad. El cambio de ruteo real queda para los siguientes puntos.
  - El planner usa el modelo cheap resuelto por `resolveRuntimeModelRoutePolicy(...)`; no se agregaron nuevas env vars porque el repo ya tenia router/modelos configurables.
- Comandos de verificacion conocidos:
  - `npm.cmd run test:ts -- src/lib/runtime/planner.test.ts`
  - `npm.cmd run test:ts -- src/lib/runtime/runner.test.ts`
  - `npm.cmd run typecheck`

## Snapshot sesion 2026-03-17 - Fase 1 punto 1 runtime core nuevo

- Estado actual: existe un modulo nuevo aislado en `src/lib/runtime` con contratos base del MVP backend-first (`ActionPlanV1`, `RuntimeActionType`, `ParamValueV1`, `ExecutionContextV1`, `NodeResultV1`, `ExecutionTraceV1`, `RuntimeEventV1`, `IntegrationAdapterV1`) y un graph runner fijo listo para colgar planner/resolvers/adapters sin tocar todavia el runtime legacy.
- Ultimos cambios relevantes:
  - `src/lib/runtime/types.ts`: contratos tipados nuevos para acciones abstractas MVP, params `primitive|reference|time|unknown`, budget/runtime context, trace, eventos, adapters y registry de nodos.
  - `src/lib/runtime/graph.ts`: definicion del grafo fijo `normalize -> enrich -> resolve -> validate -> simulate -> execute -> postprocess`.
  - `src/lib/runtime/runner.ts`: runner nuevo `runExecutionGraph(...)` con reglas cerradas de visita por nodo, maximo 2 retries tecnicos por accion, maximo 1 `llm_repair` por accion, corte por mismo error repetido, degradacion `needs_llm -> needs_user` cuando policy no permite repair y persistencia de checkpoint en `conversationMetadata.runtime_checkpoint` para reingreso desde `resolve`.
  - `src/lib/runtime/index.ts`: barrel export del modulo nuevo.
  - `src/lib/runtime/runner.test.ts`: cobertura inicial del punto 1 para orden de nodos, limite de retries, checkpoint `needs_user`, repair LLM permitido y degradacion cuando no esta permitido.
- Pendientes inmediatos:
  - Implementar el planner MVP sobre estos contratos nuevos.
  - Agregar node registry real por etapa (`normalize/enrich/resolve/...`) y conectar policy/resolver engines del nuevo runtime.
  - Definir el bridge en `/api/chat` para enrutar al runtime nuevo solo cuando el turno caiga dentro del catalogo MVP.
- Riesgos o bloqueos:
  - El checkpoint hoy se persiste como shape generico en metadata (`runtime_checkpoint`), pero el wiring real a conversaciones/mensajes todavia no esta hecho en este punto.
  - `llm_repair` queda modelado como nodo auxiliar interno del runner; falta la policy real para decidir campos no criticos cuando entren planner/resolvers concretos.
- Comandos de verificacion conocidos:
  - `npm.cmd run typecheck`
  - `npm.cmd run test:ts -- src/lib/runtime/runner.test.ts`

## Snapshot sesion 2026-03-17 - Capability graph declarativo para chat operativo

- Estado actual: el slice operativo de chat ya resuelve selecciÃ³n declarativa vÃ­a `src/lib/chat/capability-graph.ts`; `request-shaping` y `declarative-capability-resolver` dejaron de hardcodear surface/action con heurÃ­sticas provider-first, y el runtime declarativo ahora soporta Gmail, Google Calendar y Google Sheets sin abrir un segundo engine.
- Ultimos cambios relevantes:
  - `src/lib/chat/capability-graph.ts`: registry tipado nuevo con nodos por capability concreta, `schemaResolver`, `executionMode`, `cue metadata`, `clarificationBuilder`, `renderer`, scoring determinista, `graphTrace`, `slotResolution`, `transitionPath` y `exitReason`.
  - `src/lib/chat/declarative-capability-resolver.ts`: wrapper nuevo sobre el capability graph; ahora devuelve selecciÃ³n, plan y trace declarativo en vez de helpers especÃ­ficos por provider.
  - `src/lib/chat/request-shaping.ts`: simplificado para budget/historial/RAG/allowlist; la selecciÃ³n operativa sale del graph, y la observabilidad ahora expone `matchedCapabilityId`, `candidateCapabilityIds`, `graphTrace`, `slotResolution`, `transitionPath` y `exitReason`.
  - `src/lib/chat/declarative-chat-read-engine.ts`: soporte nuevo para `google_sheets` (`list_sheets`, `read_range`, `append_rows`, `update_range`, `clear_range`) reutilizando `runActionPlan(...)`, runtime/schemas existentes y metadata del graph.
  - `src/lib/chat/conversation-metadata.ts`: contexto declarativo reciente extendido para snapshots de Google Sheets.
  - `src/app/api/chat/route.ts`, `src/lib/chat/non-stream-executor.ts` y `src/lib/chat/operational-mode.ts`: wiring nuevo de runtime Sheets y surface soportada en el gate operativo.
  - Tests nuevos/actualizados: `src/lib/chat/capability-graph.test.ts`, `src/lib/chat/request-shaping.test.ts`, `src/lib/chat/declarative-capability-resolver.test.ts`, `src/lib/chat/declarative-chat-read-engine.test.ts`, `src/lib/chat/operational-mode.test.ts`.
- Pendientes inmediatos:
  - Expandir el registry a mÃ¡s acciones de Google Sheets si queremos cubrir ediciÃ³n estructural/formatting beyond `read_range|append_rows|update_range|clear_range`.
  - Evaluar si conviene mover mÃ¡s renderers/resolvers del engine al registry para seguir reduciendo lÃ³gica local en `declarative-chat-read-engine.ts`.
  - Si la fase 2 busca unificar workflows y chat, reutilizar este mismo registry desde `workflow-action-runtime`.
- Riesgos o bloqueos:
  - El graph de Sheets en v1 cubre lectura puntual y writes tabulares bÃ¡sicas; pedidos mÃ¡s libres o estructurales siguen cerrando en `clarify`/`fail_closed`, a propÃ³sito.
  - El comando con glob `npm.cmd run test:ts -- src/lib/chat/*.test.ts src/lib/engine/*.test.ts` no expande en este entorno Windows/Node; para verificaciÃ³n real hay que pasar la lista explÃ­cita de archivos.
- Comandos de verificacion conocidos:
  - `npm.cmd run typecheck`
  - `npm.cmd run test:ts -- src/lib/chat/capability-graph.test.ts`
  - `npm.cmd run test:ts -- src/lib/chat/request-shaping.test.ts`
  - `npm.cmd run test:ts -- src/lib/chat/declarative-capability-resolver.test.ts`
  - `npm.cmd run test:ts -- src/lib/chat/declarative-chat-read-engine.test.ts`
  - `npm.cmd run test:ts -- src/lib/chat/operational-mode.test.ts src/lib/chat/semantic-turns.test.ts src/lib/engine/runtime.test.ts src/lib/engine/workflow-action-runtime.test.ts src/lib/engine/observability.test.ts`

## Snapshot sesion 2026-03-17 - Parte 5 separacion explicita operacion vs asesoria

- Estado actual: `/api/chat` y `executeNonStreamingAgentTurn(...)` ya separan explicitamente operacion de asesoria/generacion; el runtime estructurado sigue resolviendo lo operativo y, fuera de ese path, el LLM entra solo via `semantic-generation` con `usageKind` finito y sin tools ni tool loop legacy.
- Ultimos cambios relevantes:
  - `src/lib/chat/semantic-turns.ts`: helper nuevo para clasificar turnos consultivos/generativos en `general_consultive_reply`, `semantic_summary`, `semantic_ranking`, `semantic_comparison`, `next_step_advice`, `draft_email_body`, `draft_reply_body` y `draft_internal_update`, ademas de prompts acotados para modo standalone y `post_structured`.
  - `src/lib/llm/semantic-generation.ts`: el boundary consultivo/generativo ahora incluye `general_consultive_reply` para evitar que los entrypoints caigan a un â€œchat libreâ€ difuso fuera del runtime operativo.
  - `src/app/api/chat/route.ts`: se elimino el fallback operativo al tool loop legacy/streaming generativo; tras el gate estructurado solo quedan dos caminos validos: `structured -> semantic followup` cuando el pedido mezcla fetch + analisis/drafting, o `semantic standalone` sin tools para asesoria/generacion.
  - `src/lib/chat/non-stream-executor.ts`: mismo corte aplicado al path server-side y a `whatsapp_unified`, reemplazando `sendRoutedChatCompletion(...)` directo por `sendSemanticCompletion(...)` cuando corresponde y dejando metadata explicita `semantic_generation`.
  - `src/lib/chat/semantic-turns.test.ts`: cobertura nueva para clasificacion de `usageKind`, deteccion de follow-up semantico sobre evidencia estructurada y armado del payload de evidencia.
- Pendientes inmediatos:
  - Extender esta misma separacion a mas casos mixtos soportados cuando entren `google_sheets` y `salesforce` al runtime estructurado unico.
  - Ejecutar la parte 6 del plan v2 retirando callers legacy/remotos que ya no encajan en la arquitectura final.
- Riesgos o bloqueos:
  - El follow-up semantico post-estructurado hoy trabaja sobre la evidencia textual deterministica ya renderizada; si mas adelante se necesita ranking/comparacion mas rico, convendra exponer evidencia estructurada adicional sin reabrir decision operativa por LLM.
  - Se removio el streaming generativo por defecto del endpoint de chat en este path para forzar el boundary `semantic-generation`; si la UX necesita streaming consultivo despues, habra que reintroducirlo dentro de ese mismo modulo aislado.
- Comandos de verificacion conocidos:
  - `npm.cmd run test:ts -- src/lib/chat/semantic-turns.test.ts src/lib/llm/semantic-generation.test.ts src/lib/chat/operational-mode.test.ts`
  - `npm.cmd run typecheck`

## Snapshot sesion 2026-03-17 - Parte 4 modulo LLM consultivo/generativo explicito

- Estado actual: el repo ya tiene un boundary explicito para usos permitidos del LLM consultivo/generativo bajo `src/lib/llm/semantic-generation.ts`, con `llm_usage_kind` finito y sin exponer tools ni tool loops dentro de ese modulo.
- Ultimos cambios relevantes:
  - `src/lib/llm/semantic-generation.ts`: modulo nuevo `semantic generation/analysis` con `SemanticLlmUsageKind` finito (`draft_email_body`, `draft_reply_body`, `draft_internal_update`, `semantic_summary`, `semantic_ranking`, `semantic_comparison`, `next_step_advice`, `qa_prompt_proposal`) y wrapper `sendSemanticCompletion(...)` sobre `sendRoutedChatCompletion(...)`, siempre sin tools ni `toolChoice`.
  - `src/lib/llm/semantic-generation.ts`: el routing queda tipado por uso; los drafts salen como `high_quality_synthesis` y los usos analiticos/QA como `analysis`, dejando la decision de modelo dentro de un modulo separado del runtime operativo.
  - `src/app/api/agents/[agentId]/qa/proposal/route.ts`: QA proposal y su repair path ya consumen el nuevo modulo con `usageKind: "qa_prompt_proposal"` en vez de llamar directo a `sendRoutedChatCompletion(...)`.
  - `src/lib/llm/semantic-generation.test.ts`: cobertura nueva para el contrato del modulo, el mapping de routing por `usageKind` y la garantia de que no salen tools por este boundary.
- Pendientes inmediatos:
  - Migrar futuros usos consultivos/generativos reales a este mismo modulo cuando entren `semantic_summary`, `semantic_ranking`, `semantic_comparison`, `next_step_advice` o drafting explicito desde UI/runtime estructurado.
  - Ejecutar las partes 5 y 6 del plan v2 para terminar de separar operacion vs asesoria y retirar callers LLM legacy que todavia no son consultivos/generativos.
  - Revisar despues si el clasificador LLM de `whatsapp-unified` debe eliminarse o migrarse a una estrategia deterministicamente estructurada, porque no entra en los usos permitidos finales.
- Riesgos o bloqueos:
  - Este corte crea el boundary pedido y mueve un caller permitido real (`qa_prompt_proposal`), pero no elimina todavia los callers legacy operativos fuera de alcance de la parte 4.
  - El modulo nuevo asume inputs ya resueltos/validados por el caller; no agrega validacion semantica propia ni ejecuta side effects.
- Comandos de verificacion conocidos:
  - `npm.cmd run test:ts -- src/lib/llm/semantic-generation.test.ts`
  - `npm.cmd run typecheck`

## Snapshot sesion 2026-03-17 - Parte 3 slice operativo sin sintesis LLM en runtime declarativo

- Estado actual: el slice estructurado que ya cubria Gmail y Google Calendar en `chat web` y `executeNonStreamingAgentTurn(...)` ahora cierra completamente sin LLM en pedidos operativos soportados; el runtime declarativo ya no llama a `sendRoutedChatCompletion(...)` para resumir resultados verificados y responde con renderers deterministas por capability.
- Ultimos cambios relevantes:
  - `src/lib/chat/declarative-chat-read-engine.ts`: se elimino la etapa de `synthesize(...)` y el acoplamiento operativo a `sendRoutedChatCompletion(...)`; el path `executed` ahora devuelve `model=null`, `tokens=0` y usa renderers deterministas para `gmail.search_threads`, `gmail.read_thread`, `google_calendar.list_events` y `google_calendar.check_availability`.
  - `src/lib/chat/declarative-chat-read-engine.ts`: metadata nueva `declarative_engine.render.mode="deterministic"` y `operational_metrics.synthesisUsage=0`, alineando observabilidad con el principio `structure-first`.
  - `src/lib/chat/declarative-chat-read-engine.test.ts`: cobertura ajustada para validar que el engine operativo soportado ya no sintetiza con LLM y sigue resolviendo clarifications/approvals igual.
- Pendientes inmediatos:
  - Migrar `google_sheets` y `salesforce` al mismo contrato estructurado de chat para que dejen de caer en `reject_unsupported` y compartan `resolve/validate/enrich/policy/execute/render`.
  - Extraer un renderer/manifest operativo compartido para que chat y workflow runtime no dupliquen formato por provider a medida que entren mas capabilities.
  - Ejecutar la parte 4 del plan v2 separando el LLM consultivo/generativo en un modulo explicito de `llm_usage_kind` finito.
- Riesgos o bloqueos:
  - Este corte elimina la ultima llamada LLM del slice operativo ya migrado, pero `google_sheets` y `salesforce` todavia no tienen resolver estructurado chat-side; siguen cerrando fail-closed guiado.
  - Los renderers deterministas priorizan brevedad y verificabilidad sobre redaccion rica; si se quiere una capa consultiva posterior, debe vivir fuera del runtime operativo y reingresar por contrato estructurado para ejecutar.
- Comandos de verificacion conocidos:
  - `npm.cmd run test:ts -- src/lib/chat/declarative-chat-read-engine.test.ts`
  - `npm.cmd run typecheck`

## Snapshot sesion 2026-03-17 - Parte 2 resolver deterministico por capabilities en chat declarativo

- Estado actual: el slice declarativo soportado de `chat web` y `executeNonStreamingAgentTurn(...)` ya no usa el planner LLM ni el repair step LLM para decidir/parametrizar Gmail y Google Calendar; el matching operativo ahora sale de un `capability resolver` deterministico y el LLM queda solo en la sintesis final cuando realmente hay que resumir resultado verificado.
- Ultimos cambios relevantes:
  - `src/lib/chat/declarative-capability-resolver.ts`: modulo nuevo que resuelve `capability id` finito para Gmail/Google Calendar a partir de `selectedToolDefinitions`, surfaces disponibles, contexto declarativo reciente y slots estructurados; cubre `search/read`, writes Gmail con referencia reciente y availability/list/event actions de Calendar con ventanas temporales acotadas.
  - `src/lib/chat/declarative-chat-read-engine.ts`: `executeDeclarativeReadChatTurn(...)` ahora usa `resolveDeclarativeCapabilities(...)` en vez de `planDeclarativeChatAction(...)` y elimina el repair step via `sendRoutedChatCompletion(...)`; las salidas de clarification/approval sin sintesis ya no consumen tokens ni reportan modelo.
  - `src/app/api/chat/route.ts`: el registro de usage del path declarativo tolera respuestas operativas deterministicas sin proveedor LLM, usando `deterministic` cuando no hubo llamada al modelo.
  - `src/lib/chat/declarative-capability-resolver.test.ts` y `src/lib/chat/declarative-chat-read-engine.test.ts`: cobertura nueva para match de capability, uso de contexto reciente (`Lee ese hilo`), clarification cuando falta referencia y disponibilidad de Calendar con ventana temporal relativa.
- Pendientes inmediatos:
  - Expandir este mismo resolver/contrato a `google_sheets` y `salesforce`, que siguen cerrando `fail-closed` en modo guiado mientras no migren al runtime unico.
  - Retirar del repo el legacy documental/tipado del planner (`declarative-chat-planner`) y revisar si queda codigo muerto alrededor de `calendar-intent-extractor`.
  - Separar la sintesis/ranking/drafting en un modulo explicito de `llm_usage_kind` finito para completar la parte 4 del plan v2.
- Riesgos o bloqueos:
  - El resolver actual es deliberadamente conservador: soporta Gmail/Calendar con slots acotados y prefiere `clarify_user` antes que asumir destinatarios, bodies, eventos o rangos temporales ambiguos.
  - La sintesis final de resultados operativos todavia usa `sendRoutedChatCompletion(...)`; esta sesion solo saco al LLM de `decidir / enrutar / parametrizar / reparar`, no de `resumir`.
- Comandos de verificacion conocidos:
  - `npm.cmd run test:ts -- src/lib/chat/declarative-capability-resolver.test.ts`
  - `npm.cmd run test:ts -- src/lib/chat/declarative-chat-read-engine.test.ts`
  - `npm.cmd run typecheck`

## Snapshot sesion 2026-03-17 - Gate structure-first sin fallback generativo en pedidos operativos

- Estado actual: `chat web` y `non-stream-executor` ya no caen al loop legacy ni al streaming generativo cuando el turno fue clasificado como operativo (`tool_clear` / `tool_ambiguous`) pero el runtime estructurado no lo resolvio; ahora cierran `fail-closed guiado` y solo dejan pasar el LLM en usos consultivos/generativos.
- Ultimos cambios relevantes:
  - `src/lib/chat/operational-mode.ts`: helper central nuevo que separa `allow_consultive_llm` de dos salidas operativas cerradas: `clarify_with_ui` para surfaces ya soportadas estructuralmente y `reject_unsupported` para `google_sheets` / `salesforce`.
  - `src/app/api/chat/route.ts`: despues del intento declarativo y antes de cualquier fallback legacy, el endpoint aplica el gate operativo; si el turno es operativo y no puede seguir por estructura, persiste una respuesta guiada con `llm_call_metrics.phase=operational_gate`.
  - `src/lib/chat/non-stream-executor.ts`: mismo gate aplicado al path non-stream para workers/superficies server-side, evitando que una operacion no resuelta termine en `sendRoutedChatCompletion(...)` o `sendChatCompletion(...)`.
  - `src/lib/chat/operational-mode.test.ts`: cobertura nueva para distinguir turnos consultivos, operativos soportados y operativos en surfaces todavia no migradas al runtime estructurado.
- Pendientes inmediatos:
  - Reemplazar el planner LLM de `declarative-chat-planner` por un `capability resolver` deterministico para que el path operativo soportado tambien deje de depender del modelo al decidir/parametrizar.
  - Migrar `google_sheets` y `salesforce` al contrato operativo unico antes de endurecer aun mas el gate, para no perder cobertura funcional mientras salen del legacy.
  - Separar explicitamente la capa consultiva/generativa del runtime operativo en un modulo de `llm_usage_kind` finito, como pide el plan v2.
- Riesgos o bloqueos:
  - Este corte elimina fallback generativo solo despues de `request-shaping`; el slice declarativo de Gmail/Calendar sigue usando planner/repair/synthesis con LLM y todavia no cumple el objetivo final de `operation without LLM`.
  - Pedidos operativos sobre `google_sheets` o `salesforce` ahora fallan cerrado con mensaje guiado en vez de intentar resolverse por prompting libre; es una regresion deliberada de cobertura a cambio de alinear comportamiento con `structure-first`.
- Comandos de verificacion conocidos:
  - `npm.cmd run test:ts -- src/lib/chat/operational-mode.test.ts`
  - `npm.cmd run test:ts -- src/lib/chat/request-shaping.test.ts`
  - `npm.cmd run typecheck`

## Snapshot sesion 2026-03-17 - Backend-first declarativo en chat web y non-stream

- Estado actual: `chat web` y `non-stream-executor` ahora intentan primero `executeDeclarativeReadChatTurn(...)` y solo caen al tool loop legacy cuando el engine devuelve `handled=false`; ademas el router de modelos ya distingue explicitamente sintesis/redaccion de alta calidad como motivo legitimo para usar `strong`.
- Ultimos cambios relevantes:
  - `src/app/api/chat/route.ts`: el bloque declarativo se movio antes del tool loop legacy; si el engine maneja el turno, el request corta ahi y persiste usage/metadata sin ejecutar el loop viejo.
  - `src/lib/chat/non-stream-executor.ts`: mismo hook declarativo agregado para workers/superficies no-web, reutilizando `recent_declarative_engine_context` y devolviendo metadata declarativa cuando corresponde.
  - `src/lib/llm/model-routing.ts`, `src/lib/chat/model-routing-signals.ts` y `src/lib/chat/declarative-chat-read-engine.ts`: nueva seÃ±al/ruta explicita `high_quality_synthesis`, usada en la fase de sintesis del engine declarativo para justificar `strong` por calidad de redaccion y no por ambiguedad accidental.
  - `src/app/api/chat/route.ts` y `src/lib/chat/non-stream-executor.ts`: cuando el turno cae en `google_sheets` o `salesforce`, el engine declarativo queda explicitamente fuera de alcance y se registra `llm_call_metrics.phase=declarative_engine` con `status=skipped` y `reason=unsupported_surface` para priorizacion posterior.
  - `src/lib/llm/model-routing.test.ts` y `src/lib/chat/declarative-chat-read-engine.test.ts`: cobertura nueva para la ruta `high_quality_synthesis` hacia `strong` y para el fallback fuera del slice declarativo (`google_sheets` => `handled=false`).
- Pendientes inmediatos:
  - Reprobar manualmente un caso Gmail/Calendar soportado en `chat web` y otro en `/run` o worker para confirmar en logs que no se ejecuta el loop legacy cuando el declarativo responde `handled=true`.
  - Medir cuantas veces aparecen `unsupported_surface=google_sheets|salesforce` para decidir cual conviene sumar primero al contrato declarativo compartido.
- Riesgos o bloqueos:
  - `google_sheets` y `salesforce` siguen fuera del slice declarativo; este cambio mejora priorizacion y convergencia de entrypoints, pero no amplÃ­a cobertura funcional de esos providers.
  - La seÃ±al `high_quality_synthesis` hoy se usa explicitamente en la sintesis del engine declarativo; si despues se quiere enrutar otras tareas largas de redaccion fuera de ese path, habra que emitir la misma seÃ±al desde esos callers.
- Comandos de verificacion conocidos:
  - `npm.cmd run typecheck`
  - `npm.cmd run test:ts -- src/lib/llm/model-routing.test.ts`
  - `npm.cmd run test:ts -- src/lib/chat/declarative-chat-read-engine.test.ts`

## Snapshot sesion 2026-03-17 - Auditoria principio "codigo + UX antes de LLM"

- Estado actual: el repo ya tiene varias capas deterministicas antes del LLM en `chat web` y `whatsapp`, pero el principio todavia no esta impuesto como gate universal previo a cada llamada; conviven slices declarativos/heuristicos con un runtime legacy donde la interpretacion principal sigue en el modelo.
- Ultimos cambios relevantes:
  - No hubo cambios de codigo productivo en esta sesion.
  - Se revisaron `src/app/api/chat/route.ts`, `src/lib/chat/non-stream-executor.ts`, `src/lib/chat/declarative-chat-read-engine.ts`, `src/lib/chat/request-shaping.ts`, `src/lib/chat/quick-actions*.ts`, `src/lib/chat/starter-intents.ts`, `src/lib/chat/whatsapp-unified.ts` y `src/lib/policy/agent-policy.ts`.
  - Hallazgo principal: ya existen gates deterministicos reales para policy/scope/security, UX guiada con quick actions/starter intents, routing heuristico de superficies y un slice declarativo para Gmail/Google Calendar que fail-closed antes de caer al runtime legacy.
  - Brecha principal: fuera de ese slice, `chat` y `non-stream-executor` todavia terminan rapido en `sendRoutedChatCompletion(...)` / `sendChatCompletion(...)`; no existe un "resolver registry" o decision layer central que responda explicitamente "esto lo resuelve codigo + UX, no LLM" antes de cada llamada.
  - Hallazgo secundario: `src/lib/chat/calendar-intent-extractor.ts` todavia implementa un clasificador chico via LLM y hoy no aparece usado, lo que sugiere deuda o codigo sobrante alrededor de intent routing.
- Pendientes inmediatos:
  - Definir un gate central previo al LLM con outcomes finitos (`resolve_now`, `clarify_with_ui`, `run_declarative`, `approval_flow`, `llm_required`).
  - Expandir el enfoque declarativo/heuristico mas alla de Gmail + Google Calendar hacia Salesforce, Google Sheets y los casos simples de respuesta guiada.
  - Medir en logs/metadata que porcentaje de turnos se resuelve sin LLM por surface, intent y canal para convertir este principio en KPI real.
- Riesgos o bloqueos:
  - Sin metrica de cobertura real, la cercania a este principio hoy solo puede estimarse cualitativamente por lectura de codigo.
  - El runtime legacy sigue siendo el fallback dominante para varios surfaces; si se quiere imponer el principio en serio, probablemente haga falta una fase de extraccion/centralizacion mas que un ajuste puntual.
- Comandos de verificacion conocidos:
  - `rg -n "sendRoutedChatCompletion|sendChatCompletion\\(|sendStreamingChatCompletion\\(" src`
  - `rg -n "executeDeclarativeReadChatTurn|evaluatePreAgentMessagePolicy|prepareWhatsAppUnifiedTurn" src`

## Snapshot sesion 2026-03-17 - Planner declarativo sin escalada prematura por falta de tool call

- Estado actual: el planner declarativo de `chat web` ya no escala automaticamente a `strong` solo porque el modelo cheap no devolvio la tool call esperada, una salida vacia o una aclaracion generica; en esos casos el backend ahora cierra conservadoramente con `clarification` antes de gastar otro intento fuerte.
- Ultimos cambios relevantes:
  - `src/lib/llm/model-routing.ts`: `sendRoutedChatCompletion(...)` ahora acepta `suppressEscalationReasonCodes`, permitiendo desactivar motivos puntuales de escalada en callers estructurados.
  - `src/lib/chat/declarative-chat-planner.ts`: el planner declarativo suprime para su llamada los motivos `escalate_expected_tool_missing`, `escalate_empty_output` y `escalate_generic_clarification`; ademas solo marca `parseValid=false` cuando efectivamente hubo una tool call del planner pero fue invalida, evitando tratar como `parse_invalid` los casos donde el cheap simplemente no devolvio plan.
  - `src/lib/chat/declarative-chat-planner.ts`: cuando el planner no devuelve accion estructurada, ahora retorna un `ActionPlan` vacio y `lowConfidence=true` en vez de `null`, para que el engine pueda decidir deterministicamente el siguiente paso.
  - `src/lib/chat/declarative-chat-read-engine.ts`: si el planner produce `0` acciones dentro del slice declarativo, el request se responde con clarification segura y metadata declarativa (`clarifications: 1`) en vez de caer al fallback legacy.
  - `src/lib/llm/model-routing.test.ts` y `src/lib/chat/declarative-chat-read-engine.test.ts`: cobertura nueva para no escalar por falta de tool call y para el cierre por clarification cuando el planner barato queda sin plan.
- Pendientes inmediatos:
  - Reprobar manualmente un caso como `Lee ese hilo` o una write ambigua y confirmar que desaparece `escalate_expected_tool_missing` en el planner declarativo cuando el backend igual va a terminar en clarification.
  - Medir si con Anthropic baja la latencia/costo de esos casos ambiguos al evitar el segundo intento `strong`.
- Riesgos o bloqueos:
  - El planner todavia puede escalar por `escalate_parse_invalid` o `escalate_low_confidence` cuando si hubo una salida estructurada defectuosa; eso se mantiene a proposito porque ahi el segundo intento fuerte sigue teniendo valor real.
  - Este ajuste prioriza fail-closed en el slice declarativo; si un caso no genera plan util, ahora aclara antes de dejar que el runtime legacy â€œinterpreteâ€ libremente el turno.
- Comandos de verificacion conocidos:
  - `npm.cmd run typecheck`
  - `npm.cmd run test:ts -- src/lib/llm/model-routing.test.ts`
  - `npm.cmd run test:ts -- src/lib/chat/declarative-chat-read-engine.test.ts`

## Snapshot sesion 2026-03-17 - Fix Nuevo chat reutilizando memoria anterior

- Estado actual: `Nuevo chat` en `chat web` ya no reutiliza silenciosamente la conversacion activa previa al mandar el primer mensaje sin `conversationId`; ahora puede forzar la creacion de una conversacion nueva y evitar que se arrastre `recent_declarative_engine_context` o metadata vieja.
- Ultimos cambios relevantes:
  - `src/components/chat/chat-window.tsx`: al tocar `Nuevo chat`, la UI marca el siguiente envio con `forceNewConversation=true` mientras no exista un `conversationId` nuevo asignado por backend.
  - `src/app/api/chat/route.ts`: el endpoint ahora acepta `forceNewConversation?: boolean`; si llega activo y no se paso `conversationId`, usa `createConversation(...)` en vez de `getOrCreateConversation(...)`.
  - Causa raiz confirmada: el cliente limpiaba el estado local, pero el backend reusaba la conversacion activa mas reciente del mismo usuario/agente cuando el primer POST venia sin `conversationId`, reinyectando memoria/contexto de la conversacion anterior.
- Pendientes inmediatos:
  - Probar manualmente `Nuevo chat` seguido por un prompt ambiguo como `Lee ese hilo` para confirmar que ya no toma el contexto del chat anterior.
  - Verificar que el comportamiento sin `forceNewConversation` siga preservando la reutilizacion actual donde todavia sea deseada.
- Riesgos o bloqueos:
  - El fix esta acotado a `chat web`; otras superficies que creen conversaciones podrian necesitar la misma semantica explicita si en el futuro agregan UI de "nuevo chat".
  - No se agrego test especifico de UI/API para el flag nuevo; la validacion de esta sesion fue `typecheck` + test dirigido del engine declarativo.
- Comandos de verificacion conocidos:
  - `npm.cmd run typecheck`
  - `npm.cmd run test:ts -- src/lib/chat/declarative-chat-read-engine.test.ts`

## Snapshot sesion 2026-03-17 - Fix planner declarativo Anthropic input_schema

- Estado actual: el planner declarativo de `chat web` ya no envia la tool interna `submit_action_plan` con un JSON Schema top-level basado en `$ref`, evitando el 400 de Anthropic/LiteLLM (`tools.0.custom.input_schema.type: Field required`) que aparecia al activar el feature flag del engine declarativo.
- Ultimos cambios relevantes:
  - `src/lib/chat/declarative-chat-planner.ts`: `buildPlannerToolDefinition()` ahora genera `parameters` con `zodToJsonSchema(..., { target: "openApi3" })`, dejando `type: "object"` inline en vez de un wrapper con `$ref`/`definitions`.
  - `src/lib/chat/declarative-chat-planner.test.ts`: test nuevo que valida compatibilidad del schema de la tool del planner (`type === "object"` y sin `$ref` top-level).
  - Se validÃ³ ademÃ¡s que `src/lib/chat/declarative-chat-read-engine.test.ts` siga pasando para asegurar que el fix no rompiÃ³ el slice declarativo.
- Pendientes inmediatos:
  - Reprobar manualmente en `chat web` el prompt Gmail read con el feature flag activo para confirmar que ahora el planner entra y ya no falla en LiteLLM/Anthropic.
  - Verificar en los logs del turno resultante que aparezcan seÃ±ales del engine declarativo (`declarative_engine`, `operational_metrics`) en vez del error HTTP 400 del planner.
  - Si aparece un nuevo error provider-side, revisar el payload exacto ya despuÃ©s del schema fix, porque el bloqueo anterior era previo a la planificaciÃ³n misma.
- Riesgos o bloqueos:
  - El fix corrige el contrato del schema top-level; no cambia la semÃ¡ntica del planner ni cubre posibles incompatibilidades futuras de Anthropic con keywords JSON Schema mÃ¡s avanzadas.
  - No se corriÃ³ `typecheck` completo en esta sesiÃ³n; la validaciÃ³n fue con tests dirigidos del planner y del engine declarativo.
- Comandos de verificacion conocidos:
  - `npm.cmd run test:ts -- src/lib/chat/declarative-chat-planner.test.ts`
  - `npm.cmd run test:ts -- src/lib/chat/declarative-chat-read-engine.test.ts`

## Snapshot sesion 2026-03-17 - Set de prompts QA para engine declarativo

- Estado actual: se preparo un set manual de prompts de prueba para validar el engine declarativo ya implementado en `chat web`, cubriendo lecturas Gmail/Google Calendar, clarifications, writes con `approval inbox`, multi-step acotado y regresiones fail-closed.
- Ultimos cambios relevantes:
  - No hubo cambios de codigo.
  - Se revisaron los contratos y tests actuales del engine/planner (`src/lib/chat/declarative-chat-planner.ts`, `src/lib/chat/declarative-chat-read-engine.test.ts`, `src/lib/engine/runtime.test.ts`, `src/lib/engine/workflow-action-runtime.test.ts`) para alinear los prompts de QA con el slice realmente soportado hoy.
  - Se confirmo que el vocabulario declarativo vigente para `chat web` cubre Gmail (`search_threads`, `read_thread`, writes con approval) y Google Calendar (`check_availability`, `list_events`, writes con approval), con contexto estructurado reciente y observabilidad operativa.
- Pendientes inmediatos:
  - Ejecutar los prompts manuales en `chat web` con una org que tenga `DECLARATIVE_CHAT_ENGINE_ENABLED` y conexiones reales de Google.
  - Verificar para los casos write que aparezcan approval items en `/approvals` y que el metadata/telemetria refleje `write_with_approval`.
  - Si aparecen huecos de lenguaje no cubiertos, decidir si se corrigen en planner/resolvers o si deben caer deliberadamente a clarification.
- Riesgos o bloqueos:
  - Este set valida el slice implementado hoy; prompts demasiado abiertos o fuera de Gmail/Calendar todavia pueden caer al runtime legacy o fuera de alcance.
  - Parte de la validacion completa sigue requiriendo QA vivo con integraciones reales para confirmar scopes, referencias recientes y resultados visibles en Gmail/Calendar.
- Comandos de verificacion conocidos:
  - `npm.cmd run test:ts -- src/lib/chat/declarative-chat-read-engine.test.ts`
  - `npm.cmd run test:ts -- src/lib/engine/runtime.test.ts`
  - `npm.cmd run test:ts -- src/lib/engine/workflow-action-runtime.test.ts`
  - `npm.cmd run typecheck`

## Snapshot sesion 2026-03-17 - Fase 5 observabilidad y pricing operativo

- Estado actual: la arquitectura declarativa ya emite observabilidad operativa compartida para `chat web` y `workflow_async`, con clasificacion por tipo de accion, contadores de planner/fallback/clarifications/approvals y costo/tokens agregados sin exponer tokens puros en superficies cliente.
- Ultimos cambios relevantes:
  - `src/lib/engine/observability.ts`: helper shared nuevo para clasificar `simple_read | multi_step_read | write_with_approval | workflow_async`, calcular `estimatedCostUsd`, resumir uso LLM por fase y repartir costo/tokens por accion con allocation explicita.
  - `src/lib/chat/declarative-chat-read-engine.ts`: el metadata del mensaje ahora incluye `operational_metrics`; tambien se suman los tokens reales del `repair step` al total persistido para que billing agregado y observabilidad no diverjan.
  - `src/lib/engine/workflow-action-runtime.ts` y `src/lib/workflows/execution.ts`: cada step async devuelve `operationalMetrics`, los guarda en `workflow_steps.output_payload.engine_observability` y acumula un resumen de run en `workflow_runs.metadata.workflow_operational_observability`.
  - `src/lib/db/usage-writer.ts`: el calculo de `estimated_cost_usd` ahora reutiliza la misma helper shared del engine para mantener consistencia entre reporting agregado y observabilidad nueva.
  - `src/lib/engine/observability.test.ts`, `src/lib/chat/declarative-chat-read-engine.test.ts` y `src/lib/engine/workflow-action-runtime.test.ts`: cobertura nueva para clasificacion operativa, metadata de chat y runtime async.
- Pendientes inmediatos:
  - Explotar `operational_metrics` y `workflow_operational_observability` desde reporting/UI para mostrar consumo por clase de accion sin bajar al usuario a tokens crudos.
  - Decidir si `usage_records` necesita evolucionar en una fase posterior para persistir breakdown por clase de accion, o si alcanza con derivarlo desde metadata JSON y `workflow_steps`.
  - Validar manualmente en entorno real que la metadata enriquecida no interfiera con consumers existentes de `output_payload`, compensaciones y auditoria.
- Riesgos o bloqueos:
  - La clasificacion de chat prioriza contratos declarativos (`executionMode`, plan size, approvals) y evita heuristicas literales, pero los casos que bloquean antes de ejecutar steps dependen del plan disponible en ese turno.
  - `usage_records` sigue siendo mensual/agregado por provider; Fase 5 deja la base lista para billing/reporting operativo, pero no cambia todavia el schema visible ni la UI de costos.
- Comandos de verificacion conocidos:
  - `npm.cmd run test:ts -- src/lib/engine/observability.test.ts`
  - `npm.cmd run test:ts -- src/lib/chat/declarative-chat-read-engine.test.ts`
  - `npm.cmd run test:ts -- src/lib/engine/workflow-action-runtime.test.ts`
  - `npm.cmd run typecheck`

## Snapshot sesion 2026-03-17 - Fase 4 convergencia declarative engine con workflows

- Estado actual: el path async de workflows/workers ya converge sobre el contrato declarativo compartido; `src/lib/workflows/execution.ts` conserva transitions, retries e idempotencia, pero la logica de ejecutar una accion ahora vive en un runtime declarativo nuevo bajo `src/lib/engine/workflow-action-runtime.ts`.
- Ultimos cambios relevantes:
  - `src/lib/engine/workflow-action-runtime.ts`: runtime declarativo nuevo para workers que reutiliza `ActionDefinition`, `ResolverResult`, `PolicyDecision` y `runAction(...)`, con registry tipado para Salesforce, Gmail, Google Calendar y Google Sheets.
  - El runtime nuevo resuelve `action_input` aprobado contra schemas declarativos, carga runtimes Google via step declarativo, ejecuta la accion por provider y devuelve `provider_request_key + output_payload` sin que `execution.ts` conozca detalles por surface.
  - `src/lib/workflows/execution.ts`: se elimino el switch imperativo por provider/accion y ahora delega toda la ejecucion concreta a `executeWorkflowAction(...)`; el archivo sigue siendo el dueÃ±o de `workflow_runs/workflow_steps`, retries, compensaciones y transiciones.
  - `src/lib/engine/workflow-action-runtime.test.ts`: cobertura nueva para ejecucion declarativa de Salesforce, ejecucion declarativa de Gmail con load-runtime y bloqueo fail-closed ante payload invalido ya persistido.
- Pendientes inmediatos:
  - Validar manualmente en entorno real que approvals ya aprobadas de Gmail/Calendar/Sheets sigan terminando en el mismo `output_payload` esperado por UI, compensaciones y auditoria.
  - Evaluar si el siguiente paso extrae tambien las definiciones declarativas de chat hacia manifests compartidos por provider para reducir duplicacion entre `declarative-chat-read-engine.ts` y el runtime async.
  - Extender este mismo runtime compartido a mas callers async futuros antes de sumar nuevas ramas imperativas.
- Riesgos o bloqueos:
  - La convergencia de Fase 4 ya unifica el contrato de ejecucion, pero chat y workflows todavia no comparten un unico manifest por provider; hoy comparten vocabulario/engine base y el worker ya no tiene switch propio, pero queda duplicacion puntual en resolvers chat-side.
  - No hubo QA vivo contra proveedores reales en esta sesion; la validacion del corte fue por tests dirigidos + `typecheck`.
- Comandos de verificacion conocidos:
  - `npm.cmd run test:ts -- src/lib/engine/workflow-action-runtime.test.ts`
  - `npm.cmd run test:ts -- src/lib/workflows/execution-engine.test.ts`
  - `npm.cmd run typecheck`

## Snapshot sesion 2026-03-17 - Verificacion Fase 2 + ejecucion Fase 3 declarative engine

- Estado actual: la Fase 2 ya estaba efectivamente implementada en el repo para `chat web` declarativo; hoy se ejecuto la Fase 3 sobre esa base y el mismo engine ahora tambien soporta writes sensibles de Gmail y Google Calendar terminando en `approval inbox` por `approval_async`.
- Ultimos cambios relevantes:
  - Verificado en codigo que Fase 2 no estaba solo "planeada": `src/lib/engine/runtime.ts` ya corria `runActionPlan(...)` multi-step, `src/lib/chat/declarative-chat-read-engine.ts` ya persistia `actionHistory` estructurado en `recent_declarative_engine_context` y el repair step seguia acotado a completar parametros sin replanear el turno.
  - `src/lib/engine/types.ts` y `src/lib/engine/runtime.ts`: el contrato declarativo ahora soporta el estado intermedio `approval_enqueued` ademas de `executed/policy_blocked`, permitiendo que acciones `approval_async` ejecuten steps declarativos seguros sin pasar por `execute` directo.
  - `src/lib/chat/declarative-chat-planner.ts`: el planner declarativo se amplio para planear writes tipadas de `gmail` (`create_draft_reply`, `create_draft_email`, `send_reply`, `send_email`, `archive_thread`, `apply_label`) y `google_calendar` (`create_event`, `reschedule_event`, `cancel_event`) sin tool calls crudas ni bypass de approvals.
  - `src/lib/chat/declarative-chat-read-engine.ts`: el engine declarativo ahora resuelve parametros de writes sobre contexto estructurado verificado, reutiliza referencias recientes cuando son deterministicas, manda ambiguedades reales a clarification y encola approvals via `createApprovalRequest(...)` como step declarativo `declarative.enqueue_approval`.
  - `src/app/api/chat/route.ts`: el entrypoint de `chat web` ya pasa los runtimes separados de Gmail/Calendar, el `recent_declarative_engine_context` y `agentScope` al engine declarativo, manteniendo el runtime legacy como fallback fuera del slice soportado.
  - `src/lib/chat/declarative-chat-read-engine.test.ts` y `src/lib/engine/runtime.test.ts`: cobertura nueva para `approval_async` declarativo y ajuste del runtime base para validar el nuevo estado `approval_enqueued`.
- Pendientes inmediatos:
  - Validar manualmente en un entorno con integraciones reales que las writes declarativas de Gmail/Calendar creen approval items correctos y que el payload que llega a `/approvals` sea el esperado.
  - Decidir si la siguiente iteracion expande el repair step a writes muy acotadas de contenido generado o si se mantiene deliberadamente en clarification para cualquier faltante sensible.
  - Empezar la convergencia de Fase 4 reutilizando el mismo contrato `approval_enqueued` desde workflows/workers en vez de solo `chat web`.
- Riesgos o bloqueos:
  - El slice declarativo de Fase 3 es conservador a proposito: no intenta autocompletar IDs criticos fuera de contexto estructurado verificado y cualquier write con referencia realmente ambigua cae a clarification.
  - Las writes declarativas todavia no tienen QA vivo contra cuentas reales en este corte; la cobertura actual es de typecheck + tests dirigidos del engine/planner.
- Comandos de verificacion conocidos:
  - `npm.cmd run test:ts -- src/lib/chat/declarative-chat-read-engine.test.ts`
  - `npm.cmd run test:ts -- src/lib/engine/runtime.test.ts`
  - `npm.cmd run typecheck`

## Snapshot sesion 2026-03-17 - Fase 1 declarative chat read-only en chat web

- Estado actual: la Fase 1 quedo implementada para `chat web` bajo feature flag por organizacion, con slice vertical read-only single-surface para `gmail` y `google_calendar`; el runtime legacy sigue vivo como fallback para el resto de los casos.
- Ultimos cambios relevantes:
  - `src/lib/chat/declarative-chat-engine-flag.server.ts` y `src/lib/utils/env.ts`: rollout server-side nuevo con `DECLARATIVE_CHAT_ENGINE_ENABLED=false` por default y allowlist opcional `DECLARATIVE_CHAT_ENGINE_ORG_IDS`; `.env.local.example` quedo documentado.
  - `src/lib/chat/declarative-chat-planner.ts`: planner estructurado nuevo que usa una tool interna `submit_action_plan` para devolver `ActionPlan` tipado con `PlannedParam` finitos, confidence y candidate providers, preservando `model_routing` para este paso.
  - `src/lib/chat/declarative-chat-read-engine.ts`: engine read-only nuevo para `gmail.search_threads`, `gmail.read_thread`, `google_calendar.check_availability` y `google_calendar.list_events`; resuelve params tipados, consulta policy declarativa, ejecuta steps deterministas y luego sintetiza la respuesta final con resultado verificado del engine.
  - `src/app/api/chat/route.ts`: `chat web` ahora intenta la ruta declarativa antes del tool-loop legacy cuando el turno cae en el slice read-only permitido; si el planner no produce accion valida o el caso queda fuera de alcance, el request sigue por el runtime existente sin cambios.
  - `src/lib/chat/declarative-chat-read-engine.test.ts`: cobertura nueva para exito read-only Gmail, aclaracion por low confidence y bypass cuando el feature flag esta apagado.
- Pendientes inmediatos:
  - Extender la fase a multi-surface y follow-ups mas ricos sin depender de que `chat web` haya seleccionado una sola surface.
  - Persistir contexto estructurado del engine en vez de depender solo del resultado formateado para la sintesis.
  - Llevar el mismo contrato declarativo a `non-stream-executor` y luego a workflows/shared runtime.
- Riesgos o bloqueos:
  - Esta entrega esta deliberadamente acotada a `single_surface` para minimizar riesgo; turnos ambiguos Gmail+Calendar siguen por el camino legacy.
  - `read_thread` aclara cuando falta una referencia concreta; todavia no hay encadenamiento declarativo de `search_threads -> read_thread` dentro del mismo turno.
  - La clasificacion fina de errores de provider todavia es conservadora; en esta fase se privilegia fail-closed y fallback al runtime existente antes que adivinar.
- Comandos de verificacion conocidos:
  - `npm.cmd run test:ts -- src/lib/chat/declarative-chat-read-engine.test.ts`
  - `npm.cmd run typecheck`

## Snapshot sesion 2026-03-17 - Fase 0 engine declarativo base

- Estado actual: la Fase 0 quedo implementada sin cambiar el comportamiento visible del chat CRM actual; `crm-core` ahora normaliza la decision del planner a un `ActionPlan` interno y delega la ejecucion a un engine declarativo con registries, steps y policy separada.
- Ultimos cambios relevantes:
  - `src/lib/engine/types.ts`, `src/lib/engine/runtime.ts` y `src/lib/engine/policy.ts`: nuevo skeleton compartido con contratos `ActionPlan`, `PlannedAction`, `PlannedParam`, `ActionDefinition`, `ResolverResult`, `FailureKind`, `PolicyDecision`, registries de acciones/steps y `runAction(...)`.
  - `src/lib/chat/crm-core.ts`: el loop chat-first sigue con la misma API externa, pero el punto de extension ahora pasa por `ActionPlan + Engine`; se agrego adaptacion de planner decision a accion estructurada, steps declarativos (`check_action_allowed`, `execute_action`, `format_result`) y uso de policy separada.
  - `src/lib/workflows/action-matrix.ts`: helper nuevo `hasWorkflowActionMatrixEntry(...)` para que el engine use `action-matrix` como source of truth cuando la accion ya esta registrada y preserve comportamiento legacy del adapter en acciones CRM todavia no modeladas alli.
  - `src/lib/engine/runtime.test.ts`: cobertura nueva de Fase 0 para orden de steps, bloqueo por approval y mapping `ambiguous_reference -> clarify_user`.
- Pendientes inmediatos:
  - Fase 1: registrar acciones reales read-only de `gmail` y `google_calendar` en el nuevo engine en vez de usar el wrapper generico de `crm-core`.
  - Introducir resolvers reales tipados por accion/provider para `entity_ref` y `temporal_ref`, evitando el passthrough actual de `actionInput`.
  - Evaluar si conviene mover el engine nuevo a un namespace compartido con workflows cuando empiece la convergencia de Fase 4.
- Riesgos o bloqueos:
  - En esta fase el engine usa resolucion passthrough para no cambiar comportamiento; todavia no hay resolver semantico por accion ni classification de `FailureKind` rica desde providers.
  - `crm-core` sigue preservando fallback legacy para acciones no registradas en `action-matrix`; eso es deliberado para compatibilidad, pero la convergencia completa requiere modelar esas acciones en la matrix/registry.
- Comandos de verificacion conocidos:
  - `npm.cmd run test:ts -- src/lib/chat/crm-core.test.ts`
  - `npm.cmd run test:ts -- src/lib/engine/runtime.test.ts`
  - `npm.cmd run typecheck`

## Snapshot sesion 2026-03-17 - Analisis de conversacion externa sobre pricing y arquitectura de agentes

- Estado actual: se analizo la conversacion compartida `Modelo de pago para IA` y se identificaron implicancias directas para `proyecto-amigos` en pricing, request shaping, routing de tools, fallback al LLM y workflows deterministas.
- Ultimos cambios relevantes:
  - No hubo cambios de codigo.
  - Se confirmo que las recomendaciones de la conversacion se alinean con trabajo ya avanzado en el repo: `request_shaping`, `tool selection`, router `cheap/strong`, budgets y execution engine workflow-first.
  - Se sintetizaron como lineas aplicables para producto: pricing hibrido base + uso, no cobrar por integracion aislada, medir costo por tipo de interaccion, mantener el LLM como planner/fallback y no como runtime omnisciente.
- Pendientes inmediatos:
  - Definir metrica comercial principal visible al cliente (`interacciones`, `tasks`, `creditos` o mix) y separarla de la metrica interna de costo real por tokens/tools/provider.
  - Aterrizar una matriz de billing por clase de accion para web chat y workflows async reutilizando `usage_records` y metadata existente.
  - Revisar si conviene exponer en UI una nocion de creditos por accion/surface en vez de tokens puros.
- Riesgos o bloqueos:
  - Cobrar por tokens directos seria fiel al costo pero poco vendible para el mercado objetivo hispanohablante no tecnico.
  - Cobrar solo por agente o solo por integraciones deja expuesto margen negativo cuando aumentan tool calls, retries o turns tool-heavy.
- Comandos de verificacion conocidos:
  - No aplica; tarea de analisis sin cambios ejecutables.

## Snapshot sesion 2026-03-16 - Fix del bypass en filtrado de tools por intencion

- Estado actual: el shaping ya no conserva todas las tools de una surface solo porque sean 8 o menos; ahora el filtrado por intencion tambien aplica en Gmail/Calendar/Salesforce compactos, lo que habilita que lecturas simples queden como `read-only` y el router pueda enviarlas por `cheap`.
- Ultimos cambios relevantes:
  - `src/lib/chat/request-shaping.ts`: se elimino el early-return que devolvia las tools sin filtrar cuando `definitions.length <= 8`; para prompts con intencion detectada, el filtrado por accion corre siempre.
  - `src/lib/chat/request-shaping.test.ts`: el caso de Gmail read ahora valida explicitamente que un pedido tipo `Busca el ultimo mail... y resumelo` exponga solo `gmail_search_threads` y `gmail_read_thread`.
- Pendientes inmediatos:
  - Volver a probar el caso real reutilizando la misma conversacion y confirmar en logs que `selectedToolDefinitions` baje de `8` a `2`, con `modelTier: 'cheap'` en el primer intento salvo escalada real.
- Riesgos o bloqueos:
  - Si una surface futura tiene acciones con nombres poco alineados a los prefixes actuales, el filtrado puede quedar conservador hasta sumar ese vocabulario.
- Comandos de verificacion conocidos:
  - `npm.cmd run test:ts -- src/lib/chat/request-shaping.test.ts`
  - `npm.cmd run test:ts -- src/lib/llm/model-routing.test.ts`
  - `npm.cmd run typecheck`

## Snapshot sesion 2026-03-16 - Freno al crecimiento de tokens en lecturas simples

- Estado actual: las lecturas simples single-surface con tools ya no se marcan como complejas solo porque la conversacion venga con historial largo, y `request_shaping` ahora recorta mas agresivamente ese historial para evitar que `tokens_input` siga creciendo turno a turno.
- Ultimos cambios relevantes:
  - `src/lib/llm/model-routing.ts`: el chequeo `low complexity read` ya no se invalida por `historySize`, por lo que un turno de lectura read-only puede seguir en `cheap` aunque la conversacion reutilizada traiga mas historial; `direct_strong_high_history` tambien queda desactivado para ese subtipo de turnos.
  - `src/lib/chat/request-shaping.ts`: prompts tipo `busca`, `resumime`, `ultimo mail`, `recibido` ahora se interpretan mejor como lecturas; para `tool_clear + single_surface + read/find` el historial se trimmea con budget mas bajo y cap de 8 mensajes para frenar el crecimiento lineal de input tokens.
  - `src/lib/llm/model-routing.test.ts` y `src/lib/chat/request-shaping.test.ts`: cobertura actualizada para history alto en lectura simple y para el cap de historial en pedidos tipo Gmail read.
- Pendientes inmediatos:
  - Repetir el caso real `Resumime el ultimo mail recibido por jspansecchi` y confirmar en logs que baja `historyMessages`, que desaparece `direct_strong_high_history` y que el primer intento entra por `cheap`.
  - Si el loop sigue costando demasiado aun en `cheap`, revisar despues el reenvio de tool outputs entre iteraciones como siguiente foco de optimizacion.
- Riesgos o bloqueos:
  - La inferencia de lectura sigue siendo heuristica; mejoro para este tipo de prompts comunes, pero pueden aparecer formulaciones nuevas que requieran sumar sinonimos o una clasificacion mas estructurada.
- Comandos de verificacion conocidos:
  - `npm.cmd run test:ts -- src/lib/llm/model-routing.test.ts`
  - `npm.cmd run test:ts -- src/lib/chat/request-shaping.test.ts`
  - `npm.cmd run typecheck`

## Snapshot sesion 2026-03-16 - Router dinamico para lecturas simples con tools

- Estado actual: el router de modelos ya no manda directo a `strong` solo por `toolCount >= 8`; ahora usa senales dinamicas derivadas del request shaped para distinguir lecturas simples single-surface de turns realmente complejos.
- Ultimos cambios relevantes:
  - `src/lib/chat/model-routing-signals.ts`: helper shared nueva para `chat web` y `/run` que deriva `readOnlyTools`, `hasSensitiveWrites` y `toolComplexity` desde las tools realmente expuestas al modelo, usando las acciones seleccionadas por `request_shaping`.
  - `src/lib/llm/model-routing.ts`: `direct_strong_tool_heavy` ahora exige complejidad real adicional (writes sensibles, complejidad alta, multi-surface, ambiguedad o history alto) y deja pasar por `cheap` los turns de lectura simple con una sola surface, sin RAG y no ambiguos.
  - `src/app/api/chat/route.ts` y `src/lib/chat/non-stream-executor.ts`: ambos caminos runtime dejaron de duplicar la heuristica minima y consumen la helper shared para construir senales de routing consistentes.
  - `src/lib/llm/model-routing.test.ts`: cobertura nueva para asegurar que un caso `single_surface + read_only + tool_clear` se quede en `cheap`, mientras un caso con writes sensibles siga yendo a `strong`.
- Pendientes inmediatos:
  - QA manual con el caso reportado de Gmail (`Resumime el ultimo mail recibido por jspansecchi`) para confirmar que ahora el primer intento salga en `cheap` y solo escale si falla de verdad.
  - Revisar en logs si bajan `reasonCodes: ['direct_strong_tool_heavy']` en lecturas simples y comparar costo real before/after por turno.
- Riesgos o bloqueos:
  - La clasificacion de complejidad por accion sigue siendo heuristica, aunque ahora esta basada en categorias dinamicas de acciones y no en una regla fija por cantidad bruta.
  - Los casos con tools de nombre poco estandar pueden caer en `medium` por precaucion hasta que aparezcan ejemplos reales y convenga afinar prefixes.
- Comandos de verificacion conocidos:
  - `npm.cmd run test:ts -- src/lib/llm/model-routing.test.ts`
  - `npm.cmd run typecheck`

## Snapshot sesion 2026-03-16 - Compact v2 seguro para runtime prompt

- Estado actual: el variant interno `compact` ahora compila como `compact v2` para prompts `recommended`, con prompt plano y canonico mas corto tanto en chat web como en `/run`; los prompts `custom` siguen resolviendo a `full` para no resumir texto arbitrario ni perder instrucciones.
- Ultimos cambios relevantes:
  - `src/lib/agents/prompt-compiler.ts`: la rama `compact` ahora usa `compileCompactSystemPromptV2(...)`, sin headings ni secciones verbosas, con orden fijo de identidad minima, invariantes canonicas fusionadas, scope operativo corto, capacidades por superficie activa y lineas opcionales de handoff/output/onboarding.
  - `src/lib/agents/agent-templates.ts`: se compactaron las lineas de integracion de Gmail, Google Calendar y Salesforce para `compact`, eliminando ejemplos largos y redundancias ya cubiertas por el core; el onboarding compacto tambien quedo acotado a un maximo de tres lineas.
  - `src/lib/agents/effective-prompt.ts`: se agrego `systemPromptProfile` interno (`full | compact_v2 | custom_full`) para distinguir observabilidad real; `recommended + compact` usa `compact v2` y `custom` permanece en `full` aunque se solicite `compact`.
  - `src/lib/chat/request-shaping.ts`, `src/app/api/chat/route.ts` y `src/lib/chat/non-stream-executor.ts`: `request_shaping` ahora recibe y loggea `systemPromptProfile`, y cuando el prompt va en `compact` usa una guia interactiva corta de 4 reglas manteniendo markers, formularios y chips; `full` sigue con la guia larga existente.
  - Cobertura actualizada en `src/lib/agents/prompt-compiler.test.ts`, `src/lib/agents/effective-prompt.test.ts` y `src/lib/chat/request-shaping.test.ts` para validar ausencia de headings en `compact`, preservacion de invariantes de seguridad/approval, resolucion `custom_full` y observabilidad del perfil usado.
- Pendientes inmediatos:
  - QA manual en runtime real con los escenarios definidos: lectura Gmail, disponibilidad Calendar, lookup Salesforce, write sensible con approval, pedido fuera de scope y handoff por falta de contexto.
  - Revisar metadata/logs `request_shaping` en una org allowlisted para comparar `systemPromptProfile`, `systemPromptTokensApprox` y `promptTokenDeltaApprox` en before/after real del provider.
- Riesgos o bloqueos:
  - La deduplicacion de business instructions en `compact v2` es deliberadamente conservadora por snippets canonicos; evita repeticiones obvias, pero no intenta resumir instrucciones libres complejas.
  - La reduccion de tokens sigue midiendose de forma aproximada por caracteres (`/4`); sirve para comparar perfiles, pero no reemplaza tokens reales del modelo/proxy.
- Comandos de verificacion conocidos:
  - `npm.cmd run test:ts -- src/lib/agents/prompt-compiler.test.ts`
  - `npm.cmd run test:ts -- src/lib/agents/effective-prompt.test.ts`
  - `npm.cmd run test:ts -- src/lib/chat/request-shaping.test.ts`
  - `npm.cmd run typecheck`

## Snapshot sesion 2026-03-16 - Compactacion segura del prompt recomendado fase 1

- Estado actual: el runtime compartido de chat web y `executeNonStreamingAgentTurn(...)` ya puede resolver el `system_prompt` recomendado en variante `full` o `compact` sin tocar prompts custom, con rollout server-side por organizacion y observabilidad comparativa por turno dentro de `request_shaping`.
- Ultimos cambios relevantes:
  - `src/lib/agents/prompt-compiler.ts`, `src/lib/agents/agent-templates.ts` y `src/lib/agents/effective-prompt.ts`: nuevo tipo interno `PromptVariant = "full" | "compact"`, compilacion compacta del prompt recomendado preservando identidad, guardrails, scope, untrusted context y business instructions, mientras resume `Workflow policy`, `Capability policy`, `Integration policy` y `Onboarding context` segun las reglas de fase 1.
  - `src/lib/agents/prompt-variant.server.ts` y `src/lib/utils/env.ts`: rollout server-side por org con `AGENT_COMPACT_PROMPT_ENABLED=false` por default y allowlist opcional `AGENT_COMPACT_PROMPT_ORG_IDS`; `.env.local.example` quedo documentado.
  - `src/app/api/chat/route.ts`, `src/lib/chat/non-stream-executor.ts` y `src/lib/chat/request-shaping.ts`: ambos caminos runtime consumen el mismo variant efectivo y loggean `promptVariant`, `systemPromptTokensApprox`, `compactCandidateTokensApprox` y `promptTokenDeltaApprox` sin tocar tool selection, `ragMode`, history trimming ni `effectiveMaxTokens`.
  - `src/lib/agents/agent-setup.ts` y `src/lib/agents/agent-setup.test.ts`: fix adicional para que `getResolvedToolsForIntegration(...)` solo devuelva acciones cuando la integracion realmente fue seleccionada en `setupState.integrations`; esto evita que el alta auto-vincule surfaces de Google no elegidas y desalinee el prompt recomendado desde el nacimiento del agente.
  - `src/lib/agents/effective-prompt.ts`, `src/lib/agents/effective-prompt.test.ts`, `src/app/api/chat/route.ts` y `src/lib/chat/non-stream-executor.ts`: el matching de prompts recomendados ahora puede usar el `setup_state` persistido como fuente de comparacion y el `setup_state` enriquecido por `agent_tools` como fuente para renderizar el prompt efectivo; esto corrige casos donde el runtime antes trataba como `custom` a agentes nuevos/recomendados por pequenas diferencias introducidas al leer integraciones reales.
  - Cobertura nueva/actualizada en `src/lib/agents/prompt-compiler.test.ts`, `src/lib/agents/effective-prompt.test.ts`, `src/lib/agents/prompt-variant.server.test.ts` y `src/lib/chat/request-shaping.test.ts`.
- Pendientes inmediatos:
  - QA manual con el agente nuevo ya creado y, si hace falta, con otro agente nuevo para confirmar que `chat.request_shaping` ya muestra `promptVariant: "compact"` cuando el prompt sigue siendo recomendado, ademas de los escenarios definidos de Gmail, Google Calendar, pedido ambiguo Gmail+Calendar, RAG, write con approval y agente con prompt custom.
  - Revisar logs/metadata de `request_shaping` en organizaciones allowlisted para confirmar una caida visible de `systemPromptTokensApprox` sin degradar tool choice ni aclaraciones.
- Riesgos o bloqueos:
  - El variant `compact` solo aplica cuando el prompt guardado sigue matcheando una variante `recommended`; cualquier prompt custom o desalineado sigue yendo por `full`, lo cual es deliberado para esta fase.
  - Los agentes creados antes de este fix pueden haber quedado con tools Google extra y seguir desalineados hasta recrearlos o limpiar esas tools manualmente.
  - La comparacion de tokens sigue siendo aproximada por caracteres (`/4`) y vive en metadata/logs; sirve para before/after rapido, pero no reemplaza la medicion real del provider.
- Comandos de verificacion conocidos:
  - `npm.cmd run test:ts -- src/lib/agents/agent-setup.test.ts`
  - `npm.cmd run test:ts -- src/lib/agents/effective-prompt.test.ts`
  - `npm.cmd run test:ts -- src/lib/agents/prompt-compiler.test.ts`
  - `npm.cmd run test:ts -- src/lib/agents/prompt-variant.server.test.ts`
  - `npm.cmd run test:ts -- src/lib/chat/request-shaping.test.ts`
  - `npm.cmd run typecheck`
  - `.\\node_modules\\.bin\\eslint.cmd src\\lib\\agents\\prompt-compiler.ts src\\lib\\agents\\agent-templates.ts src\\lib\\agents\\effective-prompt.ts src\\lib\\agents\\prompt-variant.server.ts src\\lib\\chat\\request-shaping.ts src\\app\\api\\chat\\route.ts src\\lib\\chat\\non-stream-executor.ts src\\lib\\agents\\prompt-compiler.test.ts src\\lib\\agents\\effective-prompt.test.ts src\\lib\\agents\\prompt-variant.server.test.ts src\\lib\\chat\\request-shaping.test.ts src\\lib\\utils\\env.ts`

## Snapshot sesion 2026-03-16 - Fix select controlado en formulario dinamico del chat

- Estado actual: el warning de React por `select` controlado/no controlado en el formulario dinamico del chat quedo resuelto; los campos `select` ahora se renderizan solo como componentes controlados.
- Ultimos cambios relevantes:
  - `src/components/chat/dynamic-chat-form-card.tsx`: se removio `defaultValue=""` del `<select>` dentro de `renderField(...)`, manteniendo `value` como unica fuente de verdad.
- Pendientes inmediatos:
  - QA manual en el chat con un formulario que incluya `select` para confirmar que desaparece el warning de consola y que el placeholder `Seleccionar` sigue mostrandose correctamente cuando el valor esta vacio.
- Riesgos o bloqueos:
  - El cambio es minimo y localizado; no se detectaron bloqueos en lint, pero la verificacion funcional del flujo UI queda manual.
- Comandos de verificacion conocidos:
  - `.\\node_modules\\.bin\\eslint.cmd src\\components\\chat\\dynamic-chat-form-card.tsx`

## Snapshot sesion 2026-03-16 - Claude Haiku habilitado en selector de agentes

- Estado actual: `claude-haiku-4-5-20251001` ya quedo habilitado como modelo permitido del producto, alineado con la configuracion existente de LiteLLM. Desde ahora puede elegirse en wizard/formularios del agente y convivir con el router por tiers como cheap model real.
- Ultimos cambios relevantes:
  - `src/lib/agents/agent-config.ts`: se agrego `claude-haiku-4-5-20251001` a `ALLOWED_AGENT_MODELS`, `agentModelSchema` y `AGENT_MODEL_OPTIONS`, con label/copy visible para UI.
  - `src/lib/agents/workflow-templates.ts`: se amplio el union type de `WorkflowModelRecommendation.model` para aceptar Haiku sin romper TypeScript en templates y review.
- Pendientes inmediatos:
  - Si se quiere priorizar Haiku en algunos workflows, actualizar recomendaciones concretas dentro de `WORKFLOW_TEMPLATES`; por ahora solo quedo habilitado como opcion disponible.
  - QA manual en wizard y edicion de agente para confirmar el copy final y decidir si Haiku debe aparecer antes o despues de Sonnet/GPT-4o Mini en el selector.
- Riesgos o bloqueos:
  - El modelo ya existe en `litellm_config.yaml`, asi que no hubo que tocar infraestructura; el unico riesgo operativo sigue siendo credito/cuota del provider Anthropic en el entorno donde se use.
- Comandos de verificacion conocidos:
  - `.\\node_modules\\.bin\\eslint.cmd src\\lib\\agents\\agent-config.ts src\\lib\\agents\\workflow-templates.ts`
  - `npm.cmd run typecheck`

## Snapshot sesion 2026-03-16 - Router de fallback inteligente por tiers

- Estado actual: el runtime local ya decide server-side entre tier `cheap` y `strong` con estrategia `cheap-first, escalate-on-signal`, sin delegar la decision al modelo. `/api/chat`, `executeNonStreamingAgentTurn(...)`, el clasificador de WhatsApp y QA proposal comparten una capa de routing tipada; el rollout queda gobernado por env/feature flag y la escalada se limita a una sola vez por turno.
- Ultimos cambios relevantes:
  - `src/lib/agents/agent-config.ts`: nuevo contrato tipado para `ModelTier` y `ModelRoutePolicy`, manteniendo `agents.llm_model` como base backward-compatible.
  - `src/lib/llm/model-routing.ts`: capa shared nueva con `resolveRuntimeModelRoutePolicy(...)`, `isModelRoutingEnabledForOrganization(...)`, `resolveModelRoute(...)`, `sendRoutedChatCompletion(...)`, reason codes y observabilidad de intentos/tokens por intento.
  - `src/app/api/chat/route.ts` y `src/lib/chat/non-stream-executor.ts`: el runtime principal ahora fija el modelo por turno, puede escalar una sola vez en el primer intento tool-heavy/no-stream, elige directo `strong` en seÃ±ales complejas, suma tokens de ambos intentos cuando hay fallback y persiste `model_routing` + `llm_call_metrics` en `messages.metadata`.
  - `src/lib/chat/whatsapp-unified.ts`: el clasificador estructurado de intents ya usa tier cheap por default y solo escala si el JSON sale invalido o con confidence baja.
  - `src/app/api/agents/[agentId]/qa/proposal/route.ts`: QA proposal y su repair path pasan por el router shared con sesgo a tier fuerte para trabajo analitico/estructurado.
  - `src/lib/utils/env.ts` y `.env.local.example`: nuevas envs opcionales `LLM_ROUTER_ENABLED`, `LLM_ROUTER_ROLLOUT_PERCENT`, `LLM_ROUTER_ORG_IDS`, `LITELLM_ROUTER_CHEAP_MODEL` y `LITELLM_ROUTER_STRONG_MODEL`.
  - `src/lib/llm/model-routing.test.ts`: cobertura nueva para cheap default, strong directo por multi-tool, escalada unica por parse failure y kill switch del router.
- Pendientes inmediatos:
  - QA manual en chat web y `/run` con casos reales de chat simple, multi-surface, RAG+tools y tool loop para ajustar thresholds de `direct_strong_*` y `escalate_*`.
  - Revisar si conviene explotar `messages.metadata.model_routing` en reporting/analytics antes de mover el rollout por porcentaje en produccion.
  - Evaluar una segunda fase para persistir overrides por agente/organizacion si finalmente hace falta customizar la policy mas alla de `llm_model` base + env runtime.
- Riesgos o bloqueos:
  - Esta primera version no agrega columnas ni migraciones; por eso la policy persistida por agente todavia no existe como dato propio y se resuelve desde `agents.llm_model` + defaults de runtime.
  - En el camino streaming del chat web no hay escalada post-intento porque el stream ya arranco; hoy solo hay routing previo al primer token, mientras que la escalada reactiva queda aplicada al camino no-stream y al primer intento del tool loop.
  - `usage_records` sigue agregando desde mensajes asistente; el turno ya suma tokens de ambos intentos en el mensaje final, pero el breakdown fino cheap-vs-strong queda por ahora en `messages.metadata.model_routing` y logs, no en una tabla dedicada.
- Comandos de verificacion conocidos:
  - `npm.cmd run test:ts -- src/lib/llm/model-routing.test.ts`
  - `npm.cmd run test:ts -- src/lib/chat/whatsapp-unified.test.ts`
  - `.\\node_modules\\.bin\\eslint.cmd src\\lib\\llm\\model-routing.ts src\\lib\\llm\\model-routing.test.ts src\\app\\api\\chat\\route.ts src\\lib\\chat\\non-stream-executor.ts src\\lib\\chat\\whatsapp-unified.ts src\\app\\api\\agents\\[agentId]\\qa\\proposal\\route.ts src\\lib\\agents\\agent-config.ts src\\lib\\utils\\env.ts`
  - `npm.cmd run typecheck`

## Snapshot sesion 2026-03-16 - Request shaping para bajar costo en chat con tools

- Estado actual: `/api/chat` y `executeNonStreamingAgentTurn(...)` ahora comparten una capa de `request shaping` que reduce contexto accidental antes de llamar al LLM: selecciona un subset dinamico de tools por surface/accion, apaga RAG en turnos operativos claros, compacta el prompt interactivo, recorta historial por budget aproximado y baja `maxTokens` efectivo en turnos tool-heavy sin tocar approvals ni validacion server-side.
- Ultimos cambios relevantes:
  - `src/lib/chat/request-shaping.ts`: nueva capa shared que puntua surfaces con seÃ±ales baratas del ultimo turno + metadata reciente de conversacion, aplica fallback conservador cuando hay ambiguedad, filtra acciones dentro de la surface cuando hay intencion clara, decide `ragMode`, arma prompt compacto, trimmea historial por budget y construye un RAG reducido (`2-3` chunks con cap por chunk).
  - Fix adicional dentro de `src/lib/chat/request-shaping.ts`: se restauro la guia completa de `interactive markers` para las surfaces seleccionadas, porque la version demasiado compacta hacia que el modelo devolviera tablas `FORM_DATA` en texto plano en vez del marker estructurado `[FORM_DATA:...]`.
  - `src/lib/tools/tool-definitions.ts`: el schema expuesto al LLM ya no reutiliza tal cual el Zod server-side; ahora soporta `exposure: "llm_compact"` para mandar descriptions mas cortas y JSON Schema mas flaco, con mayor impacto en surfaces grandes como Google Sheets, mientras la validacion/ejecucion sigue usando Zod completo.
  - `src/app/api/chat/route.ts`, `src/lib/chat/non-stream-executor.ts` y `src/lib/chat/non-stream-persistence.ts`: ambas rutas consumen la capa shared, persisten metadata JSON de observabilidad por mensaje asistente, y loggean `request_shaping` con surfaces seleccionadas, tools expuestas, budget de historial/RAG, iteraciones del tool loop y tokens por llamada/turno.
  - `src/lib/chat/request-shaping.test.ts` y `src/lib/tools/tool-definitions.test.ts`: cobertura nueva para seleccion clara de Gmail, fallback de conocimiento con RAG, ambiguedad multi-surface, trim de historial y compactacion de schemas/tool descriptions.
- Pendientes inmediatos:
  - QA manual con chats reales de Gmail, Calendar, Sheets y Salesforce para medir caida de `tokens_input` en mensajes equivalentes y revisar si alguna heuristica de surface/action queda demasiado agresiva o demasiado conservadora.
  - Decidir si el rollout va protegido por feature flag/log sampling antes de encenderlo para todos los agentes tool-heavy.
  - Mirar las metricas persistidas en mensajes/logs para verificar que en pedidos documentales siga entrando RAG y que en pedidos operativos claros con docs listas el `ragMode` realmente quede `off`.
- Riesgos o bloqueos:
  - La heuristica de selection esta hecha para fallar conservadoramente, pero sigue siendo heuristica; si aparece un prompt muy libre que no mencione la surface y tampoco deje una accion clara, el ahorro dependera del fallback y no de una clasificacion fina.
  - El trim actual usa budget aproximado por caracteres/tokens estimados, no conteo exacto del provider; deberia bajar costo igual, pero conviene contrastarlo con `tokens_input` reales de LiteLLM antes de fijar thresholds.
  - La observabilidad nueva se persiste en `messages.metadata` y logs estructurados sin migracion, asi que sirve para comparar before/after, pero todavia no hay dashboard o reporte agregado en UI.
- Comandos de verificacion conocidos:
  - `npm.cmd run test:ts -- src/lib/chat/request-shaping.test.ts`
  - `npm.cmd run test:ts -- src/lib/tools/tool-definitions.test.ts`
  - `npm.cmd run typecheck`

## Snapshot sesion 2026-03-16 - Google Sheets full operability expansion

- Estado actual: `google_sheets` ahora expone surface ampliada de lectura, tabla, estructura, formato y archivo sin cambiar el contrato operativo existente: lecturas siguen yendo directo en chat, todas las mutaciones siguen pasando por `approval inbox`, y la integracion compartida sigue siendo `google`.
- Ultimos cambios relevantes:
  - `src/lib/integrations/google-scopes.ts`, `src/lib/integrations/google.ts` y `src/lib/integrations/google-workspace.ts`: Sheets ahora exige tambien `https://www.googleapis.com/auth/drive.file`, el cliente server-side suma request helper para Drive y el estado operacional/copy refleja operabilidad completa de lectura + estructura + formato + escritura.
  - `src/lib/integrations/google-agent-tools.ts`, `src/lib/tools/tool-definitions.ts`, `src/lib/integrations/google-agent-runtime.ts` y `src/lib/workflows/action-matrix.ts`: se ampliaron acciones, labels, descriptions, schemas Zod, policies y action-matrix para `get_spreadsheet`, `preview_sheet`, `read_table`, `find_rows`, `append_records`, `update_rows_by_match`, `create_sheet`, `format_range`, `create_spreadsheet`, `copy_spreadsheet`, `delete_*` y el resto del set pedido, manteniendo backward compatibility de `list_sheets`, `read_range`, `append_rows`, `update_range` y `clear_range`.
  - `src/lib/integrations/google-sheets-agent-runtime.ts`: runtime nuevo para lecturas (`spreadsheets.get`, `values.*`) y writes (`values.*`, `spreadsheets.batchUpdate`, Drive `files.copy`) con soporte para tablas por encabezado, estructura de hojas, formato, filtros, validaciones, named ranges, protected ranges, create/copy spreadsheet y borrados dentro del mismo flujo async actual.
  - `src/lib/tools/tool-call-preparation.ts` y `src/lib/tools/tool-call-forms.ts`: preparation/forms ahora reconocen las acciones nuevas, piden faltantes con `needs_form`, parsean payloads estructurados (`records`, `match`, `format`, `rule`, `sortSpecs`) y mantienen el routing `execute_now | requires_approval | needs_form`.
  - `src/components/agents/google-sheets-agent-tools-panel.tsx` y `src/components/settings/google-workspace-connection-form.tsx`: UI actualizada para mostrar la surface ampliada sin cambiar la interaccion existente.
  - `src/lib/tools/tool-call-preparation.test.ts` y `src/lib/integrations/google-gmail-config.test.ts`: cobertura nueva para routing de lecturas/estructurados de Sheets y para el scope nuevo `drive.file`.
- Pendientes inmediatos:
  - QA manual con una integracion Google real para validar end-to-end las acciones nuevas mas sensibles, sobre todo `copy_spreadsheet`, `format_range`, `set_data_validation`, `delete_rows`, `delete_columns` y `delete_sheet`.
  - Sumar tests runtime dedicados de Google Sheets si queremos endurecer mas que el `typecheck` + `tool-call-preparation` actual.
- Riesgos o bloqueos:
  - El runtime nuevo cubre un set amplio de requests de Sheets/Drive y ya paso `typecheck`, pero varias ramas complejas de `batchUpdate` quedaron validadas solo por tipos y no por ejecucion live contra Google real.
  - `read_table` / `find_rows` / `update_rows_by_match` / `delete_rows` asumen encabezados estables y matching exacto (`operator = equals`); es deliberadamente conservador para evitar ambiguedad.
- Comandos de verificacion conocidos:
  - `npm.cmd run test:ts -- src/lib/tools/tool-call-preparation.test.ts`
  - `npm.cmd run test:ts -- src/lib/integrations/google-gmail-config.test.ts`
  - `npm.cmd run typecheck`
  - `.\\node_modules\\.bin\\eslint.cmd src\\lib\\integrations\\google-scopes.ts src\\lib\\integrations\\google.ts src\\lib\\integrations\\google-agent-tools.ts src\\lib\\integrations\\google-agent-runtime.ts src\\lib\\integrations\\google-sheets-agent-runtime.ts src\\lib\\workflows\\action-matrix.ts src\\lib\\tools\\tool-definitions.ts src\\lib\\tools\\tool-call-preparation.ts src\\lib\\tools\\tool-call-forms.ts src\\components\\settings\\google-workspace-connection-form.tsx src\\lib\\integrations\\google-workspace.ts src\\components\\agents\\google-sheets-agent-tools-panel.tsx src\\lib\\tools\\tool-call-preparation.test.ts src\\lib\\integrations\\google-gmail-config.test.ts`

## Snapshot sesion 2026-03-16 - Formularios de Calendar normalizan datetime-local

- Estado actual: los formularios dinamicos de Google Calendar ya no reabren por falso `missing_data` cuando el usuario envia `startIso` / `endIso` en formato `datetime-local`; antes el backend rechazaba esos valores por no venir en RFC3339 completo y ahora los convierte a ISO UTC usando la `timezone` del formulario antes de validar.
- Ultimos cambios relevantes:
  - `src/lib/tools/tool-call-preparation.ts`: nueva normalizacion para `startIso`, `endIso`, `eventStartIso` y `eventEndIso` de `google_calendar`, convirtiendo strings tipo `2026-03-16T07:47` o `2026-03-16T08:21:00` a `toISOString()` real segun la timezone provista.
  - `src/lib/tools/tool-call-preparation.test.ts`: cobertura nueva para `google_calendar_create_event`, verificando que un submit del formulario con `datetime-local` pase a `requires_approval` en vez de volver a `needs_form`.
- Pendientes inmediatos:
  - QA manual en chat web del caso reportado de `create_event` para confirmar que, tras enviar el formulario, el flujo avanza directo a approval inbox y no vuelve a pedir campos ya completos.
  - Validar si conviene aplicar el mismo tratamiento visual en `initialValues` de formularios `datetime-local` cuando el backend ya conoce timestamps completos con `Z`.
- Riesgos o bloqueos:
  - La conversion usa `Intl.DateTimeFormat` e itera contra la timezone declarada; deberia cubrir el caso reportado y offsets normales, pero conviene revalidar manualmente zonas con DST cuando haya QA real.
  - El chat sigue dependiendo del LLM para reconstruir la tool call despues del submit del formulario; este fix corrige el rechazo por formato de fecha/hora, no convierte aun el submit en ejecucion completamente determinista server-side.
- Comandos de verificacion conocidos:
  - `npm.cmd run test:ts -- src/lib/tools/tool-call-preparation.test.ts`
  - `.\\node_modules\\.bin\\eslint.cmd src\\lib\\tools\\tool-call-preparation.ts src\\lib\\tools\\tool-call-preparation.test.ts`
  - `npm.cmd run typecheck`

## Snapshot sesion 2026-03-16 - Chat web abre formularios cuando faltan datos

- Estado actual: el chat web local/sandbox vuelve a abrir formularios dinamicos cuando una tool ya esta identificada pero le faltan datos operativos; la validacion ahora ocurre antes de approvals y side effects, asi que acciones incompletas ya no crean approvals rotas.
- Ultimos cambios relevantes:
  - `src/lib/tools/tool-call-preparation.ts` y `src/lib/tools/tool-call-forms.ts`: nueva capa shared que normaliza argumentos estructurados, valida por schema antes de ejecutar, devuelve `execute_now | requires_approval | needs_form | error` y construye `FORM_DATA` + `pending_chat_form` para Gmail, Google Calendar, Google Sheets y Salesforce.
  - `src/lib/tools/tool-executor.ts`: el ejecutor ahora usa esa preparacion shared, valida antes de `requireApproval(...)` y puede devolver `needs_form` sin crear approval ni escribir side effects.
  - `src/app/api/chat/route.ts`: el system prompt del chat ahora agrega guidance de interactive markers/tool missing data; el loop de tools corta en `needs_form`, persiste el mensaje asistente con `FORM_DATA` y guarda `pending_chat_form` para rehidratacion.
  - `src/lib/chat/chat-form-state.ts`, `src/lib/chat/chat-form-server.ts` y `src/components/chat/message-list.tsx`: nuevo estado tipado `dynamic_form`, rehidratacion desde `pending_chat_form` y render fallback del formulario cuando ya no depende del ultimo mensaje asistente visible.
  - `src/lib/chat/non-stream-executor.ts`: fuera del chat web, `needs_form` cae a mensaje textual corto para mantener el fallback no-UI de esta fase.
  - `src/lib/chat/interactive-markers.ts` y `src/lib/chat/quick-actions.ts`: guidance ampliada para formularios estructurados y soporte de provider `google_sheets`.
  - Cobertura nueva/actualizada en `src/lib/tools/tool-call-preparation.test.ts`, `src/lib/chat/chat-form-state.test.ts` y `src/lib/chat/interactive-markers.test.ts`.
- Pendientes inmediatos:
  - QA manual en chat web con casos reales de Gmail (`crear borrador para jspansecchi`), Google Sheets y Google Calendar para ajustar labels/orden de campos si la UX queda demasiado tecnica.
  - Ver si conviene enriquecer placeholders o ayuda visual en `DynamicChatFormCard` para campos complejos como `values` de Sheets o ventanas horarias de Calendar.
- Riesgos o bloqueos:
  - El prompt ya empuja al LLM a usar formularios, pero el marker estructurado confiable sigue siendo server-driven; si el modelo decide pedir datos en texto libre sin invocar tool ni marker, ese caso todavia depende del prompt y no de enforcement deterministico.
  - Campos con estructura rica como `values` (Sheets) o `datetime-local + timezone` siguen entrando como texto estructurado para minimizar cambio; puede hacer falta pulir coerciones o hints UX tras QA real.
- Comandos de verificacion conocidos:
  - `npm.cmd run lint`
  - `npm.cmd run typecheck`
  - `npm.cmd run test:ts -- src/lib/tools/tool-call-preparation.test.ts`
  - `npm.cmd run test:ts -- src/lib/chat/chat-form-state.test.ts`
  - `npm.cmd run test:ts -- src/lib/chat/interactive-markers.test.ts`

## Snapshot sesion 2026-03-16 - agent-tools separada por boundary server

- Estado actual: `src/lib/db/agent-tools.ts` dejo de arrastrar `server-only` y `service_role` en un mismo modulo compartido; las operaciones user-scoped y service-role quedaron separadas para evitar errores de build por boundary de importacion sin aflojar seguridad.
- Ultimos cambios relevantes:
  - `src/lib/db/agent-tools.ts`: ahora conserva solo lecturas user-scoped (`listAgentTools`, `getAgentToolById`) y ya no importa `createServiceSupabaseClient`.
  - `src/lib/db/agent-tools-service.ts`: nuevo modulo `server-only` con `listAgentToolsWithServiceRole`, `upsertAgentTool` y `deleteAgentTool`.
  - `src/lib/agents/agent-setup-state.ts`, `src/lib/integrations/google-agent-runtime.ts`, `src/app/api/agents/route.ts` y `src/app/api/agents/[agentId]/tools/route.ts`: imports actualizados para consumir el modulo correcto segun el boundary.
- Pendientes inmediatos:
  - Reintentar la build real de Next en un entorno donde `next build` no falle por `spawn EPERM`, para confirmar que desaparece el error de `server-only` sobre `agent-tools.ts`.
- Riesgos o bloqueos:
  - No pude validar `npm.cmd run build` end-to-end en este entorno porque sigue fallando antes con `spawn EPERM`, asi que la confirmacion completa de build queda pendiente.
- Comandos de verificacion conocidos:
  - `.\\node_modules\\.bin\\eslint.cmd src\\lib\\db\\agent-tools.ts src\\lib\\db\\agent-tools-service.ts src\\lib\\agents\\agent-setup-state.ts src\\lib\\integrations\\google-agent-runtime.ts src\\app\\api\\agents\\route.ts src\\app\\api\\agents\\[agentId]\\tools\\route.ts`

## Snapshot sesion 2026-03-16 - Sheets vuelve al planner LLM libre

- Estado actual: Google Sheets ya no entra por la preclasificacion determinista del planner unificado; cuando el agente tiene esa surface habilitada, el provider/action de Sheets vuelve a resolverse por el planner LLM segun el mensaje del usuario y la temperatura configurada del agente.
- Ultimos cambios relevantes:
  - `src/lib/provider-planning/unified-preclassifier.ts`: se retiro el fast-path determinista de Google Sheets para no depender de regex/keywords como criterio principal de intencion.
  - `src/lib/provider-planning/unified-planner.ts` y `src/lib/provider-planning/unified-planner-types.ts`: el planner unificado ahora acepta `plannerTemperature` y deja de fijar `temperature: 0`; usa la temperatura del agente, con fallback no-cero para evitar comportamiento totalmente determinista.
  - `src/lib/provider-planning/unified-orchestrator.ts`: pasa `agent.llm_temperature` al planner unificado y etiqueta errores de dispatch con el provider real (`gmail`, `google_calendar`, `google_sheets`, `salesforce`) para no culpar a Gmail cuando falla otro rail.
  - `src/app/api/chat/route.ts` y `src/lib/chat/non-stream-executor.ts`: consumen ese error tipado y muestran un mensaje acorde al provider real que fallo.
  - `src/lib/provider-planning/unified-planner.test.ts` y `src/lib/provider-planning/unified-orchestrator.test.ts`: cobertura nueva para confirmar que Sheets usa el planner LLM, que la temperatura se propaga y que los errores de Sheets quedan marcados como `google_sheets`.
- Pendientes inmediatos:
  - Reprobar el prompt real de append en Sheets con un agente que tenga Gmail + Sheets habilitados para confirmar que el planner ya interpreta `Crea una fila...` por razonamiento y no por clasificador fijo.
  - Si la UX sigue demasiado rigida, revisar el prompt unificado de Sheets para mejorar guidance semantica sin volver a keywords deterministas.
- Riesgos o bloqueos:
  - El planner sigue necesitando un espacio finito de acciones reales porque la runtime/tooling subyacente no ejecuta acciones arbitrarias; el cambio elimina el clasificador determinista de intencion para Sheets, no el contrato finito de capacidades.
  - Gmail form submissions y algunos rails legacy todavia conservan paths deterministas propios; este ajuste ataca el problema reportado en el planner unificado de Sheets.
- Comandos de verificacion conocidos:
  - `npm.cmd run test:ts -- src/lib/provider-planning/unified-planner.test.ts`
  - `npm.cmd run test:ts -- src/lib/provider-planning/unified-orchestrator.test.ts`
  - `.\\node_modules\\.bin\\eslint.cmd src\\lib\\provider-planning\\unified-preclassifier.ts src\\lib\\provider-planning\\unified-planner.ts src\\lib\\provider-planning\\unified-planner-types.ts src\\lib\\provider-planning\\unified-orchestrator.ts src\\app\\api\\chat\\route.ts src\\lib\\chat\\non-stream-executor.ts src\\lib\\provider-planning\\unified-planner.test.ts src\\lib\\provider-planning\\unified-orchestrator.test.ts`

## Snapshot sesion 2026-03-16 - Sheets entra por preclasificacion determinista

- Estado actual: requests explÃ­citas de Google Sheets ahora pueden fijar `provider = google_sheets` antes de pasar por el planner LLM unificado, evitando que prompts con URL de spreadsheet, `sheetName`, `rangeA1` y `values` terminen mal en Gmail o Salesforce por razonamiento libre del modelo.
- Ultimos cambios relevantes:
  - `src/lib/provider-planning/unified-preclassifier.ts`: nuevo camino determinista `tryPreclassifyGoogleSheets(...)` que reutiliza `planGoogleSheetsToolAction(...)` y devuelve `provider = "google_sheets"` con `actionInput` ya estructurado cuando el mensaje trae datos suficientes.
  - `src/lib/provider-planning/unified-planner.ts`: `preclassifyAcrossProviders(...)` pasa a ser async y se espera antes de invocar el planner LLM; si Sheets ya quedo resuelto de forma determinista, el modelo no decide el provider.
- Pendientes inmediatos:
  - Reprobar el prompt completo de append en Sheets y confirmar que ya no cae en Gmail.
  - Si el flujo queda estable, evaluar extender la misma estrategia determinista a Calendar cuando el mensaje ya trae fecha/hora/rango totalmente estructurado.
- Riesgos o bloqueos:
  - La preclasificacion determinista de Sheets hoy se apoya en la heuristica de `planGoogleSheetsToolAction(...)`; si el usuario escribe un pedido muy libre sin seÃ±ales como fila/rango/pestana, todavia puede volver al planner LLM.
- Comandos de verificacion conocidos:
  - `.\\node_modules\\.bin\\eslint.cmd src\\lib\\provider-planning\\unified-preclassifier.ts`
  - `.\\node_modules\\.bin\\eslint.cmd src\\lib\\provider-planning\\unified-planner.ts`

## Snapshot sesion 2026-03-16 - Sheets missing fields con mensajes utiles

- Estado actual: cuando Google Sheets necesita datos faltantes, el agente ya no expone campos tecnicos crudos como `values`; ahora responde con aclaraciones entendibles para el usuario, especialmente en escrituras como `append_rows`.
- Ultimos cambios relevantes:
  - `src/lib/provider-planning/sheets-adapter.ts`: nuevo mapeo `buildSheetsMissingFieldMessage(...)` para traducir `values`, `sheetName`, `rangeA1` y referencias del spreadsheet a mensajes accionables.
  - `src/lib/provider-planning/sheets-adapter.ts`: el camino `resultMode: "clarify"` ahora devuelve ese mensaje amigable en vez de reenviar `validated.message` literal del pipeline.
- Pendientes inmediatos:
  - Reprobar el caso "crear una fila" y verificar que el agente pida los datos de la fila con un ejemplo claro de `values`.
  - Si la UX sigue siendo muy manual, evaluar un formulario dinamico para Sheets write actions con `sheetName`, `rangeA1` y `values`.
- Riesgos o bloqueos:
  - Este cambio mejora el mensaje, pero no infiere aun `sheetName` ni `rangeA1` por default para escrituras.
- Comandos de verificacion conocidos:
  - `.\\node_modules\\.bin\\eslint.cmd src\\lib\\provider-planning\\sheets-adapter.ts`

## Snapshot sesion 2026-03-16 - Unified orchestrator usa setupState corregido

- Estado actual: el orquestador unificado ya no reabre ciegamente el `setup_state` persistido del agente cuando el chat le pasa una version corregida con integraciones inferidas desde `agent_tools`; esto evita caer en fallback equivocado de Salesforce para pedidos de Google Sheets.
- Ultimos cambios relevantes:
  - `src/lib/provider-planning/unified-orchestrator.ts`: `createUnifiedChatOrchestrator(...)` ahora acepta `setupState` opcional en el input y `resolveExpectedProviders(...)` usa ese estado ya resuelto, en vez de releer siempre `readAgentSetupState(agent)`.
  - `src/app/api/chat/route.ts`: ahora pasa `setupState: agentSetupState` a `orchestrateUnifiedForChat(...)`.
  - `src/lib/chat/non-stream-executor.ts`: la ruta non-stream `/run` tambien pasa `setupState: agentSetupState` al mismo orquestador unificado.
  - `src/lib/agents/agent-setup-state.ts`: `readAgentSetupStateWithToolSelections(...)` ahora puede construir un `setup_state` minimo por defecto si el agente no tenia uno persistido, y luego injerta las integraciones detectadas desde las tools reales.
- Pendientes inmediatos:
  - Reprobar el caso real de Google Sheets en chat web para verificar que el provider detectado ya sea `google_sheets` y no vuelva al fallback de Salesforce.
  - Si el provider ya es correcto pero la accion termina en aclaracion, decidir si queremos inferir `sheetName`/rango por default para `append_rows` o si preferimos abrir siempre formulario con esos campos.
- Riesgos o bloqueos:
  - El setup minimo fallback usa `channel: "web"` cuando el agente no tenia `setup_state`; es suficiente para destrabar tools web/api, pero si en el futuro aparece un caso sin setup_state en otro canal conviene derivar el canal real desde metadata del agente.
- Comandos de verificacion conocidos:
  - `.\\node_modules\\.bin\\eslint.cmd src\\lib\\agents\\agent-setup-state.ts`
  - `.\\node_modules\\.bin\\eslint.cmd src\\lib\\provider-planning\\unified-orchestrator.ts`
  - `.\\node_modules\\.bin\\eslint.cmd src\\app\\api\\chat\\route.ts`
  - `.\\node_modules\\.bin\\eslint.cmd src\\lib\\chat\\non-stream-executor.ts`

## Snapshot sesion 2026-03-16 - Chat auto-recupera integraciones desde tools

- Estado actual: `/api/chat` y `executeNonStreamingAgentTurn(...)` ya recuperan integraciones seleccionadas a partir de las `agent_tools` guardadas, aunque `setup_state.integrations` haya quedado desactualizado; ademas, la ruta de tools ahora sincroniza ese `setup_state` cuando se guarda o elimina una tool.
- Ultimos cambios relevantes:
  - `src/lib/agents/agent-setup-state.ts`: nueva helper `readAgentSetupStateWithToolSelections(...)` que combina `setup_state` con las tools reales del agente usando `listAgentToolsWithServiceRole(...)`.
  - `src/app/api/chat/route.ts`: el chat web deja de depender solo del `setup_state` persistido y pasa a usar `readAgentSetupStateWithToolSelections(...)` antes de decidir si debe orquestar Gmail, Calendar, Sheets o Salesforce.
  - `src/lib/chat/non-stream-executor.ts`: la ruta non-stream `/api/agents/[agentId]/run` usa la misma helper para evitar falsos negativos de integracion cuando el agente tiene tools guardadas pero el `setup_state` esta stale.
  - `src/app/api/agents/[agentId]/tools/route.ts`: al hacer `POST` o `DELETE` de una tool se sincroniza `setup_state.integrations`, agregando o quitando `salesforce`, `gmail`, `google_calendar` o `google_sheets` segun corresponda.
- Pendientes inmediatos:
  - Probar de nuevo el caso real del agente `87b8c16a-5ae6-471b-a9f1-ab4a6390e27a` en chat web sin necesidad de reconfigurar manualmente el setup.
  - Si el agente ya reconoce Sheets pero sigue sin ejecutar "crear fila", revisar el planner de Sheets para clarificar que hoy necesita `sheetName`, rango A1 y `values`, o bien ampliar esa surface para inferir defaults seguros.
- Riesgos o bloqueos:
  - Este cambio corrige el falso "Google Sheets no esta habilitado", pero no agrega nuevas acciones; operaciones como borrar filas completas siguen fuera de la surface actual.
  - Si un agente no tiene `setup_state` en absoluto, la helper no inventa uno nuevo; solo completa integraciones cuando ya existe una base valida.
- Comandos de verificacion conocidos:
  - `.\\node_modules\\.bin\\eslint.cmd src\\lib\\agents\\agent-setup-state.ts`
  - `.\\node_modules\\.bin\\eslint.cmd src\\app\\api\\chat\\route.ts`
  - `.\\node_modules\\.bin\\eslint.cmd src\\lib\\chat\\non-stream-executor.ts`
  - `.\\node_modules\\.bin\\eslint.cmd src\\app\\api\\agents\\[agentId]\\tools\\route.ts`

## Snapshot sesion 2026-03-16 - API /run alineada con Google Sheets

- Estado actual: la ruta non-stream usada por `POST /api/agents/[agentId]/run` ya contempla Google Sheets igual que `/api/chat`, por lo que la API del agente deja de caer en un estado falso de "sin integracion activa" cuando Sheets esta realmente configurado.
- Ultimos cambios relevantes:
  - `src/lib/chat/non-stream-executor.ts`: se agrego `setupStateExpectsGoogleSheetsIntegration(...)` al camino non-stream.
  - `src/lib/chat/non-stream-executor.ts`: `executeNonStreamingAgentTurn(...)` ahora incluye Google Sheets dentro de `hasAnyIntegration`, reutiliza `orchestrateUnifiedForChat(...)` para leer `providerStates.googleSheets.usable` y vuelve a consultar `getGoogleAgentToolRuntime(..., "google_sheets")` cuando hace falta resolver si la integracion quedo configurada.
  - `src/lib/chat/non-stream-executor.ts`: el `promptEnvironment` non-stream ahora propaga `googleSheetsConfigured` y `googleSheetsRuntimeAvailable`; ademas se alinearon `gmailRuntimeAvailable` y `googleCalendarRuntimeAvailable` con el estado real del runtime, igual que en `/api/chat`.
- Pendientes inmediatos:
  - Probar un request real via `/api/agents/[agentId]/run` con un agente que tenga Google Sheets habilitado para confirmar que ya no responde con el fallback de "sin integracion activa".
  - Evaluar si conviene sumar una respuesta explicita para operaciones no soportadas de Sheets, por ejemplo borrar filas completas, ya que hoy la surface expone `list_sheets`, `read_range`, `append_rows`, `update_range` y `clear_range`.
- Riesgos o bloqueos:
  - Aunque la integracion ya se detecte bien en `/run`, "eliminar la ultima fila" sigue sin ser una accion nativa de la tool actual; el fix corrige el falso negativo de integracion, no agrega todavia `delete_row`.
- Comandos de verificacion conocidos:
  - `.\\node_modules\\.bin\\eslint.cmd src/lib/chat/non-stream-executor.ts`

## Snapshot sesion 2026-03-16 - Policy engine determinista + single-LLM unificado

- Estado actual: `/api/chat` y `executeNonStreamingAgentTurn(...)` ya comparten una policy central previa al LLM y un orquestador unificado que filtra providers/acciones por contrato determinista antes del planner, revalida la accion elegida despues del planner y usa el `llm_model` real del agente como planner model en el camino unificado.
- Ultimos cambios relevantes:
  - `src/lib/policy/agent-policy.ts`: nuevo policy engine reutilizable con contratos `AgentPolicyContext` / `AgentPolicyDecision`, outcomes tipados (`allowed`, `redirect_out_of_scope`, `deny_security`, `deny_provider_policy`, `clarify_missing_data`, `approval_required`, `throttled_operational_limit`), deteccion determinista de seÃ±ales de seguridad y filtros de providers/acciones por scope + OAuth scopes.
  - `src/app/api/chat/route.ts` y `src/lib/chat/non-stream-executor.ts`: reemplazo del gate heuristico directo de scope por `evaluatePreAgentMessagePolicy(...)`; ambos caminos ahora cortan igual ante `out_of_scope`, `ambiguous` o intentos claros de prompt-injection / SQL / command / secret exfiltration.
  - `src/lib/chat/non-stream-executor.ts`: deja de orquestar Salesforce/Calendar por caminos separados y pasa a reutilizar `orchestrateUnifiedForChat(...)`, alineando el enforcement de policy entre chat web y non-stream.
  - `src/lib/provider-planning/unified-orchestrator.ts`: ahora construye contexto de policy con runtimes/scopes reales, filtra `enabledProviders` antes del planner, corta temprano si la policy de seguridad dispara, revalida la salida del planner contra la misma policy y pasa `agent.llm_model` al planner unificado.
  - `src/lib/provider-planning/unified-planner.ts` y `src/lib/provider-planning/unified-planner-types.ts`: nuevo `plannerModel` opcional en `UnifiedPlannerInput`; el planner unificado prioriza ese modelo del agente sobre los defaults de manifests para el camino single-LLM.
  - `src/lib/workflows/action-matrix.ts`: contrato endurecido con `requiredOAuthScopes`, `approvalMode`, `operationalLimits`, `securityGuards` y `failureMode`, con defaults y mappings por accion para Gmail, Calendar y Salesforce.
  - `src/lib/provider-planning/types.ts`, `manifest.ts`, `gmail-manifest.ts`, `calendar-manifest.ts`, `salesforce-manifest.ts`: manifests extendidos con `securityGuards` y `operationalLimits` provider-level para que la policy operativa deje de vivir solo en prompts.
  - Tests nuevos/ajustados:
    - `src/lib/policy/agent-policy.test.ts`
    - `src/lib/provider-planning/unified-planner.test.ts`
- Pendientes inmediatos:
  - Extender la misma policy determinista post-planner a los planners/orchestrators provider-specific legacy fuera del camino unificado, para seguir reduciendo divergencias internas.
  - Decidir si la deteccion temprana de scope debe seguir usando el fallback heuristico actual o migrarse despues a una matriz mas rica por â€œintent familyâ€ sin depender de keywords.
  - Si se quiere enforcement real por minuto/ventana de provider (ej. Gmail send/minute), hay que agregar estado de rate limiting por app; en esta fase quedaron cubiertos budgets por turno, approval obligatoria y limites estructurales/schemas.
- Riesgos o bloqueos:
  - `npm.cmd run typecheck` sigue rojo por errores preexistentes en `src/lib/provider-planning/gmail-resolver.ts`; esta slice nueva ya no deja errores propios en typecheck.
  - El gate temprano de scope sigue usando `classifyScopeIntent(...)` como fallback de compatibilidad para detectar casos claros antes del LLM; la fuente de verdad de acciones/permisos ya paso a policy + matrix, pero la clasificacion semantica gruesa todavia no quedo totalmente reemplazada.
- Comandos de verificacion conocidos:
  - `npm.cmd run test:ts -- src/lib/policy/agent-policy.test.ts`
  - `npm.cmd run test:ts -- src/lib/provider-planning/unified-planner.test.ts`
  - `npm.cmd run test:ts -- src/lib/provider-planning/unified-orchestrator.test.ts`
  - `npm.cmd run test:ts -- src/lib/chat/google-gmail-tool-orchestrator.test.ts`
  - `npm.cmd run typecheck`

## Snapshot sesion 2026-03-16 - Gmail planner self-repair no cardinality defaults

- Estado actual: el rail Gmail ya no inventa cardinalidades de `recent_sent_recipients` mediante defaults runtime; cuando el planner devuelve esa resolution request incompleta o deja un `to` no ejecutable, el mismo LLM hace una segunda pasada para reparar el JSON antes de entrar al runtime.
- Ultimos cambios relevantes:
  - `src/lib/chat/google-gmail-tool-planner.ts` ahora expone `createGmailPlanner(...)` y agrega una fase de self-repair LLM cuando la salida cruda del planner Gmail trae `recent_sent_recipients` sin `count` o un `to` placeholder/no ejecutable.
  - `src/lib/provider-planning/unified-planner.ts` agrega el mismo mecanismo de self-repair para el planner unificado cuando el provider elegido es Gmail y la salida viene estructuralmente incompleta.
  - `src/lib/provider-planning/gmail-resolver.ts` deja de asumir un `count` por default si `recent_sent_recipients` llega incompleto; ahora aclara en vez de inventar cardinalidad.
  - `src/lib/chat/google-gmail-tool-planner.ts` deja de inyectar `recent_sent_recipients(count=1)` desde `enrichPlannerRecipientResolution(...)`; el enrichment ahora solo limpia `to` invalido, sin decidir por el modelo.
  - Tests nuevos/ajustados:
    - `src/lib/chat/google-gmail-tool-planner.test.ts` cubre self-repair del planner Gmail y valida que ya no se defaultÃ©e `count`.
    - `src/lib/provider-planning/unified-planner.test.ts` cubre self-repair del planner unificado para Gmail.
    - `src/lib/provider-planning/gmail-resolver.test.ts` valida que sin `count` el resolver aclara en vez de asumir 1 o 5.
- Pendientes inmediatos:
  - Reprobar en UI el caso real de `ultimo destinatario` y confirmar que, si el primer JSON sale incompleto, la segunda pasada del LLM lo repara a `recent_sent_recipients` con cardinalidad explicita sin caer en budget inflado.
  - Si todavia falla, inspeccionar el raw output original y el raw output reparado del planner para ese turno.
- Riesgos o bloqueos:
  - Sigue quedando una instruccion legacy en el prompt Gmail que conviene limpiar en otra pasada para quitar wording demasiado ejemplificado; el cambio funcional principal ya evita que el runtime dependa de esa heuristica.
  - `npm.cmd run typecheck` sigue rojo por errores preexistentes en `.next/types/app/api/debug/route.ts` y `src/lib/provider-planning/gmail-resolver.ts`.
- Comandos de verificacion conocidos:
  - `npm.cmd run test:ts -- src/lib/chat/google-gmail-tool-planner.test.ts`
  - `npm.cmd run test:ts -- src/lib/provider-planning/gmail-resolver.test.ts`
  - `npm.cmd run test:ts -- src/lib/provider-planning/unified-planner.test.ts`
  - `npm.cmd run test:ts -- src/lib/provider-planning/unified-prompt-builder.test.ts`
  - `npm.cmd run test:ts -- src/lib/chat/google-gmail-tool-orchestrator.test.ts`
  - `npm.cmd run test:ts -- src/lib/provider-planning/unified-orchestrator.test.ts`

## Snapshot sesion 2026-03-16 - Gmail missing count default fixed everywhere

- Estado actual: eliminado el ultimo default residual a `5` para `recent_sent_recipients` cuando `count` viene omitido.
- Ultimos cambios relevantes:
  - `src/lib/provider-planning/gmail-resolver.ts` ahora usa `count = 1` como fallback en `recent_sent_recipients` cuando la resolution request no trae `count`.
  - `src/lib/provider-planning/unified-prompt-builder.ts` ahora explicita que referencias singulares como `ultimo destinatario` deben mapearse a `count = 1`, y solo count > 1 cuando el usuario pida varios.
  - `src/lib/provider-planning/gmail-resolver.test.ts` agrega cobertura del caso `recent_sent_recipients` sin `count` que debe resolverse como un solo destinatario.
  - `src/lib/provider-planning/unified-prompt-builder.test.ts` valida que la instruccion `count = 1` para referencias singulares aparezca en el prompt unificado.
- Pendientes inmediatos:
  - Reprobar el flujo real en UI. Si sigue intentando `5`, hay que confirmar si el backend activo esta usando este codigo o si el planner LLM esta emitiendo `count: 5` explicitamente y debemos inspeccionar el raw output del turno.
- Riesgos o bloqueos:
  - `npm.cmd run typecheck` sigue rojo por errores preexistentes en `.next/types/app/api/debug/route.ts` y `src/lib/provider-planning/gmail-resolver.ts`.
- Comandos de verificacion conocidos:
  - `npm.cmd run test:ts -- src/lib/provider-planning/gmail-resolver.test.ts`
  - `npm.cmd run test:ts -- src/lib/provider-planning/unified-prompt-builder.test.ts`
  - `npm.cmd run test:ts -- src/lib/chat/google-gmail-tool-orchestrator.test.ts`

## Snapshot sesion 2026-03-16 - Gmail read budget 5

- Estado actual: el budget de lectura del rail Gmail se ampliÃ³ de `3` a `5` para cubrir el peor caso operativo actual de `recent_sent_recipients`, que ya inspecciona hasta 5 hilos de enviados.
- Ultimos cambios relevantes:
  - `src/lib/provider-planning/gmail-manifest.ts` ahora define `budgetConfig.capabilities.read = 5` para Gmail.
  - `src/lib/provider-planning/gmail-resolver.test.ts` suma cobertura del caso donde el destinatario valido aparece recien en el cuarto hilo enviado y aun asi se resuelve correctamente.
- Pendientes inmediatos:
  - Reprobar el flujo real en UI. Si vuelve a aparecer el mismo log con `remainingByCapability: { search: 0, read: 0, write: 2 }` despues de este cambio, hay que verificar que el proceso backend este corriendo el codigo actualizado.
- Riesgos o bloqueos:
  - `npm.cmd run typecheck` sigue rojo por errores preexistentes en `.next/types/app/api/debug/route.ts` y `src/lib/provider-planning/gmail-resolver.ts`.
- Comandos de verificacion conocidos:
  - `npm.cmd run test:ts -- src/lib/provider-planning/gmail-resolver.test.ts`
  - `npm.cmd run test:ts -- src/lib/chat/google-gmail-tool-orchestrator.test.ts`
  - `npm.cmd run test:ts -- src/lib/provider-planning/unified-orchestrator.test.ts`

## Snapshot sesion 2026-03-16 - Gmail sent recipients alias-safe

- Estado actual: el resolver Gmail ya no exige que los mensajes de `in:sent` coincidan exactamente con `connected_email` en el header `from` para recuperar destinatarios recientes.
- Ultimos cambios relevantes:
  - `src/lib/provider-planning/gmail-resolver.ts` ahora confia en el scope de la query `in:sent` para `recent_sent_recipients` y deja de descartar mensajes enviados desde alias o identidades `send-as`, que antes podian consumir varios `read` y disparar `resolution_recent_recipients_read_budget_exceeded`.
  - `src/lib/provider-planning/gmail-resolver.test.ts` suma cobertura del caso alias-safe: `from = alias@empresa.com`, `connectedEmail = yo@empresa.com`, y aun asi resuelve `to = cliente@example.com`.
- Pendientes inmediatos:
  - Reprobar el flujo real en UI con la cuenta Gmail que estaba fallando para confirmar que `ultimo destinatario` ya sale del primer hilo enviado y deja de agotar `read`.
- Riesgos o bloqueos:
  - Si Gmail devuelve hilos de enviados sin metadata util en `to`, el resolver todavia puede caer en aclaracion o budget por causas reales del provider.
  - `npm.cmd run typecheck` sigue rojo por errores preexistentes en `.next/types/app/api/debug/route.ts` y `src/lib/provider-planning/gmail-resolver.ts`.
- Comandos de verificacion conocidos:
  - `npm.cmd run test:ts -- src/lib/provider-planning/gmail-resolver.test.ts`
  - `npm.cmd run test:ts -- src/lib/chat/google-gmail-tool-orchestrator.test.ts`

## Snapshot sesion 2026-03-16 - Gmail recent recipients default count

- Estado actual: corregido el fallback de `recent_sent_recipients` sin `count`, que podia inflar la resolucion a 5 destinatarios y disparar el mensaje de budget incluso en pedidos singulares como `ultimo destinatario`.
- Ultimos cambios relevantes:
  - `src/lib/chat/google-gmail-tool-planner.ts` ahora sanea `recent_sent_recipients` sin `count` a `count: 1` en vez de `5`.
  - El prompt Gmail refuerza que si la referencia es singular, el planner debe emitir `count = 1`.
  - `src/lib/chat/google-gmail-tool-planner.test.ts` suma cobertura del default `count: 1`.
- Pendientes inmediatos:
  - Reprobar en UI el prompt real del usuario para confirmar que ya no cae en `No me alcanza el budget seguro de Gmail...` cuando el pedido es singular.
- Riesgos o bloqueos:
  - Si el LLM emite explicitamente un `count` alto, el resolver puede seguir cortar por budget; este cambio solo corrige el fallback cuando el `count` viene omitido.
  - `npm.cmd run typecheck` sigue rojo por errores preexistentes en `.next/types/app/api/debug/route.ts` y `src/lib/provider-planning/gmail-resolver.ts`.
- Comandos de verificacion conocidos:
  - `npm.cmd run test:ts -- src/lib/chat/google-gmail-tool-planner.test.ts`
  - `npm.cmd run test:ts -- src/lib/chat/google-gmail-tool-orchestrator.test.ts`

## Snapshot sesion 2026-03-16 - Gmail planner runtime capabilities

- Estado actual: el planner Gmail ahora recibe contexto operativo real de la cuenta conectada para que el LLM razone con permisos/scopes y capacidades efectivas en vez de depender solo de instrucciones abstractas.
- Ultimos cambios relevantes:
  - `src/lib/provider-planning/gmail-manifest.ts` ahora expone `buildGmailPlannerRuntimeData(...)`, con `connectedEmail`, `grantedScopes`, proposito de scopes, acciones read/write habilitadas, capabilities de resolucion y casos explicitos en los que Gmail no debe actuar.
  - `src/lib/chat/google-gmail-tool-planner.ts` ahora inyecta ese `runtime_data` al prompt del planner y refuerza reglas para que el LLM use `resolutionRequests` cuando Gmail puede leer antes de pedir datos manuales; tambien delimita mejor los casos legitimos de `missingFields` / `candidateAction null`.
  - `src/lib/chat/google-gmail-tool-orchestrator.ts` pasa `connectedEmail` y `grantedScopes` reales al planner Gmail.
  - `src/lib/provider-planning/unified-prompt-builder.ts` y `src/lib/provider-planning/unified-orchestrator.ts` aplican el mismo contrato al planner unificado, para que Gmail no razone distinto entre el camino legacy y el unificado.
  - Tests ajustados en `src/lib/chat/google-gmail-tool-planner.test.ts` y `src/lib/provider-planning/unified-prompt-builder.test.ts`.
- Pendientes inmediatos:
  - Validar manualmente en UI el prompt real de usuario con Gmail conectado para confirmar que el planner ahora emite `recent_sent_recipients` y termina prellenando `to` sin agregar heuristicas nuevas.
  - Si el UX aun falla con ese wording, revisar el output crudo del planner LLM en runtime antes de tocar mas contrato.
- Riesgos o bloqueos:
  - `npm.cmd run typecheck` sigue rojo por errores preexistentes en `.next/types/app/api/debug/route.ts` y `src/lib/provider-planning/gmail-resolver.ts`; este cambio no agrego fallas nuevas en las suites puntuales ejecutadas.
- Comandos de verificacion conocidos:
  - `npm.cmd run test:ts -- src/lib/chat/google-gmail-tool-planner.test.ts`
  - `npm.cmd run test:ts -- src/lib/chat/google-gmail-tool-orchestrator.test.ts`
  - `npm.cmd run test:ts -- src/lib/provider-planning/unified-prompt-builder.test.ts`
  - `npm.cmd run test:ts -- src/lib/provider-planning/unified-orchestrator.test.ts`
  - `npm.cmd run typecheck`

## Snapshot sesion 2026-03-16 - Gmail create_draft_email missing actionInput

- Estado actual: diagnosticado el caso reportado donde el chat de Gmail responde `No pude completar los parametros necesarios para create_draft_email...` aun cuando el usuario espera que el LLM complete los datos faltantes.
- Ultimos cambios relevantes:
  - No hubo cambios de codigo; se relevaron `src/lib/chat/google-gmail-tool-planner.ts`, `src/lib/chat/google-gmail-tool-orchestrator.ts` y snapshots previos de `PROGRESS.md`.
  - Confirmado en repo: ese mensaje sale cuando el pipeline decide `resolve` pero el planner devuelve `candidateAction` sin `actionInput`, por lo que el orchestrator corta en `src/lib/chat/google-gmail-tool-orchestrator.ts`.
  - Confirmado en repo: para frases como `ultimo destinatario`, el sistema depende del planner LLM para producir `resolutionRequests: recent_sent_recipients`; no existe fast-path determinista completo para ese wording.
  - Confirmado en repo: aunque el prompt del planner le pide componer `body` y no dejar `to` literal, si el planner no entrega `actionInput` suficiente el resolver no puede reconstruir solo el draft.
- Pendientes inmediatos:
  - Si este UX importa, endurecer el planner Gmail para que en `send_email`/`create_draft_email` siempre emita `actionInput.body` y al menos el skeleton de `actionInput`, aun cuando el destinatario quede delegado a `resolutionRequests`.
  - Evaluar agregar heuristica determinista para `ultimo destinatario` / `ultimos destinatarios` antes de depender del planner LLM.
- Riesgos o bloqueos:
  - El bug es intermitente y semantico: prompts parecidos pueden caer distinto segun la salida estructurada del planner.
- Comandos de verificacion conocidos:
  - `rg -n "No pude completar los parametros necesarios para|ultimo destinatario|Composicion de body" src/lib/chat/google-gmail-tool-orchestrator.ts src/lib/chat/google-gmail-tool-planner.ts`

## Snapshot sesion 2026-03-16 - Unified Planner fase 4 Calendar + cleanup

- Estado actual: `/api/chat` ya usa solo `orchestrateUnifiedForChat()` para cualquier combinacion habilitada de Gmail, Salesforce y Google Calendar; se elimino el wiring secuencial por provider dentro del route.
- Ultimos cambios relevantes:
  - `src/lib/provider-planning/unified-orchestrator.ts` ahora carga runtimes de Google Calendar, Gmail y Salesforce en paralelo, suma Calendar a `enabledProviders`, reutiliza un unico `planUnified()` y despacha al orchestrator/provider correcto.
  - `src/lib/chat/google-calendar-tool-orchestrator.ts` ahora acepta `plannerOverride` opcional, igual que Gmail y Salesforce, para poder reutilizar la logica legacy de runtime, approvals y metadata con la decision del planner unificado.
  - `src/app/api/chat/route.ts` quedo simplificado a una sola entrada de orquestacion cuando existe cualquier integracion habilitada; se removieron las llamadas secuenciales legacy a orchestrators individuales desde este route.
  - Se ampliaron `src/lib/provider-planning/unified-orchestrator.test.ts` con cobertura de Calendar (`planner override` + dispatch) y siguio pasando `src/lib/chat/google-calendar-tool-orchestrator.test.ts`.
- Pendientes inmediatos:
  - Evaluar si conviene migrar `recentContext`/metadata por provider dentro del unified orchestrator para mejorar referencias cross-turn y acciones encadenadas cross-provider.
  - Decidir si el cleanup final debe retirar o mantener los exports publicos legacy de orchestrators para otros callers como `src/lib/chat/non-stream-executor.ts`.
  - Resolver los errores preexistentes de `.next/types/app/api/debug/route.ts` y `src/lib/provider-planning/gmail-resolver.ts` para recuperar `npm.cmd run typecheck`.
- Riesgos o bloqueos:
  - La ruta principal de chat ya quedo unificada, pero todavia existen callers secundarios que siguen importando orchestrators legacy fuera de `/api/chat`; no se tocaron en esta fase para respetar minimal change.
  - `npm.cmd run typecheck` sigue rojo solo por errores preexistentes en `.next/types/app/api/debug/route.ts` y `src/lib/provider-planning/gmail-resolver.ts`; esta slice ya no agrega errores nuevos.
- Comandos de verificacion conocidos:
  - `npm.cmd run test:ts -- src/lib/provider-planning/unified-orchestrator.test.ts`
  - `npm.cmd run test:ts -- src/lib/chat/google-calendar-tool-orchestrator.test.ts`
  - `npm.cmd run test:ts -- src/lib/provider-planning/unified-planner.test.ts`
  - `npm.cmd run typecheck`

## Snapshot sesion 2026-03-16 - Unified Planner fase 3 Salesforce + multi-provider

- Estado actual: `/api/chat` ya usa el camino unificado cuando el agente tiene Gmail y/o Salesforce sin Google Calendar; en esos casos hay una sola decision de planner y luego se despacha al orchestrator/provider correcto.
- Ultimos cambios relevantes:
  - `src/lib/provider-planning/unified-orchestrator.ts` dejo de ser Gmail-only: ahora carga Gmail y Salesforce, construye `enabledProviders`, ejecuta una sola llamada `planUnified()` y despacha segun `provider`.
  - `src/lib/chat/salesforce-tool-orchestrator.ts` ahora acepta `plannerOverride`, igual que Gmail, para reutilizar el flujo legacy de runtime, resolucion, approvals y metadata sin duplicar la logica post-planner.
  - `src/app/api/chat/route.ts` ahora usa `orchestrateUnifiedForChat()` para los casos Gmail-only, Salesforce-only y Gmail+Salesforce cuando Calendar no participa; el fallback secuencial queda solo para caminos con Google Calendar.
  - Se ampliaron tests en `src/lib/provider-planning/unified-orchestrator.test.ts` y `src/lib/chat/salesforce-tool-orchestrator.test.ts` para cubrir overrides y dispatch multi-provider.
- Pendientes inmediatos:
  - Extender `unified-orchestrator.ts` a Google Calendar para completar la fase 4 y retirar el wiring secuencial restante en `/api/chat`.
  - Evaluar enriquecer el planner unificado con `recentContext` por provider dentro del orchestrator unificado para mejorar referencias cross-turn en el modo multi-provider.
  - Resolver los errores preexistentes de `.next/types/app/api/debug/route.ts` y `src/lib/provider-planning/gmail-resolver.ts` para recuperar `npm.cmd run typecheck`.
- Riesgos o bloqueos:
  - El dispatch unificado ya cubre Gmail y Salesforce, pero Google Calendar sigue en fallback legacy y por eso el chat route todavia conserva un branch secuencial.
  - `npm.cmd run typecheck` sigue rojo por problemas preexistentes fuera de esta slice; no aparecieron errores nuevos despues de corregir los tests del unified orchestrator.
- Comandos de verificacion conocidos:
  - `npm.cmd run test:ts -- src/lib/provider-planning/unified-orchestrator.test.ts`
  - `npm.cmd run test:ts -- src/lib/chat/salesforce-tool-orchestrator.test.ts`
  - `npm.cmd run typecheck`

## Snapshot sesion 2026-03-16 - Unified Planner fase 2 Gmail first

- Estado actual: `/api/chat` ya enruta por el camino unificado cuando Gmail es la unica integracion habilitada; los casos multi-provider siguen usando los orchestrators legacy como fallback.
- Ultimos cambios relevantes:
  - Se agrego `src/lib/provider-planning/unified-orchestrator.ts`, que hoy soporta rollout Gmail-only y reutiliza el flujo Gmail existente inyectando `planUnified()` como planner alternativo.
  - `src/lib/chat/google-gmail-tool-orchestrator.ts` ahora acepta un `plannerOverride` opcional, para cambiar el planner sin duplicar la logica de runtime, resolucion, approvals y metadata.
  - `src/app/api/chat/route.ts` ahora usa `orchestrateUnifiedForChat()` solo cuando Gmail esta habilitado en solitario; Salesforce y Google Calendar siguen por el wiring secuencial actual.
  - Se agrego `src/lib/provider-planning/unified-orchestrator.test.ts` y siguieron pasando `src/lib/provider-planning/unified-planner.test.ts` y `src/lib/chat/google-gmail-tool-orchestrator.test.ts`.
- Pendientes inmediatos:
  - Extender `unified-orchestrator.ts` a Salesforce y luego a Google Calendar para retirar el wiring secuencial en `/api/chat`.
  - Completar el despacho real via `execution-dispatcher.ts` en vez de depender del wrapper Gmail-only sobre el orchestrator existente.
  - Resolver o aislar los errores preexistentes de `.next/types/app/api/debug/route.ts` y `src/lib/provider-planning/gmail-resolver.ts` para recuperar `npm.cmd run typecheck`.
- Riesgos o bloqueos:
  - Esta fase valida el planner unificado en produccion solo para el caso Gmail-only; el comportamiento cross-provider todavia no esta activo.
  - `npm.cmd run typecheck` sigue fallando por errores previos fuera de esta slice, asi que la verificacion final quedo apoyada en tests puntuales.
- Comandos de verificacion conocidos:
  - `npm.cmd run test:ts -- src/lib/provider-planning/unified-orchestrator.test.ts`
  - `npm.cmd run test:ts -- src/lib/provider-planning/unified-planner.test.ts`
  - `npm.cmd run test:ts -- src/lib/chat/google-gmail-tool-orchestrator.test.ts`
  - `npm.cmd run typecheck`

## Snapshot sesion 2026-03-16 - Unified Planner fase 1 cerrada

- Estado actual: quedo cerrada la base de Fase 1 del `Unified Planner` en `src/lib/provider-planning`, todavia sin reemplazar el wiring productivo de `/api/chat`.
- Ultimos cambios relevantes:
  - Se mantuvieron verdes los modulos base ya creados del planner unificado: `unified-preclassifier`, `unified-prompt-builder` y `unified-planner`.
  - Se agrego `src/lib/provider-planning/execution-dispatcher.ts` con routing por provider (`gmail`, `salesforce`, `google_calendar`) y su suite `src/lib/provider-planning/execution-dispatcher.test.ts`.
  - `src/lib/provider-planning/decision-pipeline.ts` dejo de definir inline los sets Gmail-specific; ahora reutiliza `GMAIL_PREFILL_ACTIONS` y `GMAIL_OPTIONAL_FIELDS` exportados desde `src/lib/provider-planning/gmail-manifest.ts`.
  - `src/lib/provider-planning/unified-planner.ts` ahora usa el `eventSink` real para telemetry de parse y tiene fallback seguro a respuesta vacia si la unica LLM call falla.
  - Se exportaron helpers minimos de ejecucion/post-pipeline desde orchestrators actuales para preparar la Fase 2 sin duplicar logica: Gmail (`buildGoogleGmailApprovalInboxMessage`, `buildDirectGoogleGmailResponse`, `executeGoogleGmailReadForDispatcher`), Salesforce (`buildSalesforceApprovalInboxMessage`, `executeSalesforceReadForDispatcher`) y Calendar (`buildDirectGoogleCalendarResponse`, `buildGoogleCalendarConfirmationSummary`, `executeGoogleCalendarReadForDispatcher`).
- Pendientes inmediatos:
  - Implementar `unified-orchestrator.ts` y hacer el rollout `Gmail first` en `/api/chat`.
  - Conectar `execution-dispatcher.ts` con el flujo real del unified orchestrator en vez de dejarlo solo como foundation testeada.
  - Resolver o aislar los errores viejos de `src/lib/provider-planning/gmail-resolver.ts` y `.next/types/app/api/debug/route.ts` para recuperar `npm.cmd run typecheck`.
- Riesgos o bloqueos:
  - La Fase 1 ya esta cerrada a nivel foundation/tests, pero todavia no hay cambio funcional en runtime porque `/api/chat` sigue usando los orchestrators secuenciales existentes.
  - `npm.cmd run typecheck` sigue rojo por problemas preexistentes fuera de esta slice; los tests puntuales de provider-planning quedaron verdes.
- Comandos de verificacion conocidos:
  - `npm.cmd run test:ts -- src/lib/provider-planning/decision-pipeline.test.ts`
  - `npm.cmd run test:ts -- src/lib/provider-planning/execution-dispatcher.test.ts`
  - `npm.cmd run test:ts -- src/lib/provider-planning/unified-preclassifier.test.ts`
  - `npm.cmd run test:ts -- src/lib/provider-planning/unified-prompt-builder.test.ts`
  - `npm.cmd run test:ts -- src/lib/provider-planning/unified-planner.test.ts`
  - `npm.cmd run test:ts -- src/lib/chat/google-gmail-tool-planner.test.ts`
  - `npm.cmd run test:ts -- src/lib/chat/google-gmail-tool-orchestrator.test.ts`
  - `npm.cmd run test:ts -- src/lib/chat/salesforce-tool-planner.test.ts`
  - `npm.cmd run test:ts -- src/lib/chat/salesforce-tool-orchestrator.test.ts`
  - `npm.cmd run test:ts -- src/lib/chat/google-calendar-tool-orchestrator.test.ts`
  - `npm.cmd run typecheck`

## Snapshot sesion 2026-03-16 - Unified Planner foundation

- Estado actual: quedo implementada la base de Fase 1 del `Unified Planner` dentro de `src/lib/provider-planning`, sin cambiar todavia el wiring productivo de `/api/chat`.
- Ultimos cambios relevantes:
  - Se agrego `src/lib/provider-planning/unified-planner-types.ts` con `UnifiedPlannerRawOutput`, `EnabledProviderDescriptor`, `UnifiedPlannerInput`, `ProviderRuntimeStates` y `UnifiedOrchestrationResult`, y `src/lib/provider-planning/types.ts` ahora reexporta esos tipos.
  - Se agrego `src/lib/provider-planning/unified-preclassifier.ts`, que reutiliza reglas deterministicas existentes de Gmail y Salesforce; para eso `src/lib/chat/google-gmail-tool-planner.ts` ahora exporta `parseGmailFormSubmission`, `buildRawOutputForFormSubmission` y `buildDeterministicDenylistRawOutput`.
  - Se agrego `src/lib/provider-planning/unified-prompt-builder.ts`, que compone un solo prompt multi-provider usando manifests actuales, action matrix, denylists merged, capabilities merged y schema de salida con `provider`.
  - Se agrego `src/lib/provider-planning/unified-planner.ts`, con preclasificacion cross-provider, una sola llamada LLM, seleccion de modelo (`claude-sonnet-4-6` si Gmail esta habilitado) y fallback para inferir `provider` desde `candidateAction`.
  - Se agregaron tests nuevos: `src/lib/provider-planning/unified-preclassifier.test.ts`, `src/lib/provider-planning/unified-prompt-builder.test.ts` y `src/lib/provider-planning/unified-planner.test.ts`.
- Pendientes inmediatos:
  - Implementar `execution-dispatcher.ts` y extraer/exportar helpers post-pipeline de los orchestrators actuales para poder enrutar por provider.
  - Crear `unified-orchestrator.ts` y empezar el rollout incremental en `/api/chat` segun el plan (`Gmail first`).
  - Evaluar mover los detalles Gmail-specific del decision pipeline (`GMAIL_PREFILL_ACTIONS`, `GMAIL_OPTIONAL_FIELDS`) al manifest/helper del provider para terminar de desacoplarlo.
- Riesgos o bloqueos:
  - La base nueva ya existe pero todavia no esta conectada al runtime productivo; no hubo cambio de comportamiento en chat.
  - `npm.cmd run typecheck` sigue fallando por errores preexistentes en `.next/types/app/api/debug/route.ts` y `src/lib/provider-planning/gmail-resolver.ts`, no por esta slice nueva.
- Comandos de verificacion conocidos:
  - `npm.cmd run test:ts -- src/lib/provider-planning/unified-preclassifier.test.ts`
  - `npm.cmd run test:ts -- src/lib/provider-planning/unified-prompt-builder.test.ts`
  - `npm.cmd run test:ts -- src/lib/provider-planning/unified-planner.test.ts`
  - `npm.cmd run typecheck`

## Snapshot sesion 2026-03-16 - Gmail recipient enrichment paso 5 verificado

- Estado actual: el paso 5 del plan (test de integracion en orchestrator para enrichment de destinatarios faltantes) ya estaba aplicado en el repo y quedo revalidado en esta sesion.
- Ultimos cambios relevantes:
  - `src/lib/chat/google-gmail-tool-orchestrator.test.ts` ya contiene `runEnrichmentTriggersResolutionForMissingRecipientsTest`, que cubre el caso `send_email` sin `to` ni `resolutionRequests` con mensaje `ultimos 2 destinatarios`.
  - La suite verifica que `resolveGmailDecision(...)` sea invocado, lo que confirma que el enrichment post-planner inyecto la `resolutionRequest` faltante y que el decision pipeline enruto el caso a `resolve`.
  - En esta sesion no hizo falta editar el slice Gmail porque el paso 5 ya estaba aterrizado; solo se reejecutaron las verificaciones puntuales.
- Pendientes inmediatos:
  - Si se busca cierre global del repo, siguen presentes errores preexistentes en `npm.cmd run typecheck` dentro de `.next/types/app/api/debug/route.ts` y `src/lib/provider-planning/gmail-resolver.ts`.
- Riesgos o bloqueos:
  - La verificacion puntual de Gmail esta verde, pero el typecheck completo del repo sigue rojo por issues ajenos a este paso.
- Comandos de verificacion conocidos:
  - `npm.cmd run test:ts -- src/lib/chat/google-gmail-tool-planner.test.ts`
  - `npm.cmd run test:ts -- src/lib/chat/google-gmail-tool-orchestrator.test.ts`
  - `npm.cmd run typecheck`

## Snapshot sesion 2026-03-16 - Gmail recipient enrichment paso 4 verificado

- Estado actual: el paso 4 del plan (tests unitarios del enrichment Gmail) ya estaba aplicado en repo y quedo verificado con el runner nativo del proyecto.
- Ultimos cambios relevantes:
  - `src/lib/chat/google-gmail-tool-planner.test.ts` ya contiene la bateria del enrichment para `recent_sent_recipients`, `latest_external_sender`, guards de no-op, `count` default y soporte para `create_draft_email`.
  - `src/lib/chat/google-gmail-tool-orchestrator.test.ts` ya contiene el caso integrado donde un `send_email` sin `to` pero con referencia a ultimos destinatarios fuerza el paso por resolucion.
  - En esta sesion no hizo falta editar codigo funcional del slice; la validacion se hizo ejecutando las dos suites de Gmail y ambas quedaron verdes.
- Pendientes inmediatos:
  - Si se busca cerrar verificacion global del repo, sigue pendiente resolver los errores preexistentes de `npm.cmd run typecheck` en `.next/types/app/api/debug/route.ts` y `src/lib/provider-planning/gmail-resolver.ts`.
- Riesgos o bloqueos:
  - El comando sugerido originalmente con `npx tsx` no sirve en este entorno por policy de PowerShell y acceso al registry; para este repo hay que usar `npm.cmd run test:ts -- <archivo>`.
- Comandos de verificacion conocidos:
  - `npm.cmd run test:ts -- src/lib/chat/google-gmail-tool-planner.test.ts`
  - `npm.cmd run test:ts -- src/lib/chat/google-gmail-tool-orchestrator.test.ts`
  - `npm.cmd run typecheck`

## Snapshot sesion 2026-03-16 - Gmail recipient enrichment paso 3 verificado

- Estado actual: verificado en repo que la integracion del enrichment post-planner de destinatarios Gmail en el orchestrator ya esta aplicada y funcional.
- Ultimos cambios relevantes:
  - `src/lib/chat/google-gmail-tool-orchestrator.ts` ya importa `enrichPlannerRecipientResolution(...)`, ejecuta el enrichment entre planner y `runDecisionPipeline(...)`, emite `planner_recipient_enriched` cuando corresponde y opera luego sobre `enrichedPlanner.rawOutput`.
  - `src/lib/chat/google-gmail-tool-planner.test.ts` y `src/lib/chat/google-gmail-tool-orchestrator.test.ts` cubren el enrichment unitario e integrado; ambas suites pasaron con `npm.cmd run test:ts -- ...`.
  - No hizo falta tocar codigo adicional en esta sesion porque el paso 3 ya estaba aterrizado en los archivos objetivo.
- Pendientes inmediatos:
  - Si el objetivo es cerrar todo el plan, quedan fuera de esta verificacion los problemas globales de typecheck ya existentes en `.next/types/app/api/debug/route.ts` y `src/lib/provider-planning/gmail-resolver.ts`.
- Riesgos o bloqueos:
  - `npm.cmd run typecheck` sigue fallando por errores preexistentes ajenos a esta slice, asi que la verificacion completa del repo no quedo verde.
- Comandos de verificacion conocidos:
  - `npm.cmd run test:ts -- src/lib/chat/google-gmail-tool-planner.test.ts`
  - `npm.cmd run test:ts -- src/lib/chat/google-gmail-tool-orchestrator.test.ts`
  - `npm.cmd run typecheck`

## Snapshot sesion 2026-03-16 - Gmail recipient enrichment paso 2

- Estado actual: completo el enrichment post-planner de destinatarios Gmail para `send_email` y `create_draft_email` cuando falta `to`.
- Ultimos cambios relevantes:
  - `src/lib/chat/google-gmail-tool-planner.ts` ahora exporta `enrichPlannerRecipientResolution(...)`, una funcion pura que detecta referencias en espanol a `latest_external_sender` y `recent_sent_recipients`, respeta guards sobre `to`/`resolutionRequests` existentes y preserva el resultado original cuando no matchea.
  - `src/lib/chat/google-gmail-tool-orchestrator.ts` ejecuta ese enrichment antes del decision pipeline y emite el lifecycle event `planner_recipient_enriched` cuando inyecta una resolution request.
  - `src/lib/chat/google-gmail-tool-planner.test.ts` suma 8 tests unitarios del enrichment y `src/lib/chat/google-gmail-tool-orchestrator.test.ts` cubre el caso integrado donde el enrichment fuerza el paso por `resolve` para completar destinatarios faltantes.
- Pendientes inmediatos:
  - Resolver los errores de `npm.cmd run typecheck` ajenos a este cambio en `.next/types/app/api/debug/route.ts` y `src/lib/provider-planning/gmail-resolver.ts`.
- Riesgos o bloqueos:
  - `npm.cmd run typecheck` sigue fallando por problemas preexistentes fuera del slice tocado; los tests puntuales de Gmail quedaron verdes.
- Comandos de verificacion conocidos:
  - `npm.cmd run test:ts -- src/lib/chat/google-gmail-tool-planner.test.ts`
  - `npm.cmd run test:ts -- src/lib/chat/google-gmail-tool-orchestrator.test.ts`
  - `npm.cmd run typecheck`

## Snapshot sesion 2026-03-16 - Gmail recipient enrichment paso 1

- Estado actual: aplicado solo el paso 1 del plan de enriquecimiento post-planner para Gmail.
- Ultimos cambios relevantes:
  - `src/lib/provider-planning/types.ts` ahora incluye el evento de lifecycle `planner_recipient_enriched` dentro de `ProviderLifecycleEventName`.
  - No se tocaron todavia el planner Gmail, el orchestrator ni los tests; el enrichment funcional sigue pendiente.
- Pendientes inmediatos:
  - Implementar `enrichPlannerRecipientResolution(...)` en `src/lib/chat/google-gmail-tool-planner.ts`.
  - Integrar el enrichment en `src/lib/chat/google-gmail-tool-orchestrator.ts` y cubrirlo con tests unitarios/integracion.
- Riesgos o bloqueos:
  - Ningun bloqueo tecnico para este paso aislado; el evento nuevo todavia no se emite en runtime hasta completar los pasos siguientes.
- Comandos de verificacion conocidos:
  - `npm.cmd run typecheck`

## Snapshot sesion 2026-03-16 - Gmail ultimo destinatario analisis

- Estado actual: analizado el caso donde Gmail deja listo un draft con asunto/cuerpo pero no prellena `to` cuando el prompt mezcla redaccion + referencia al "ultimo destinatario".
- Ultimos cambios relevantes:
  - No hubo cambios de codigo; se reviso el rail actual de `src/lib/chat/google-gmail-tool-planner.ts`, `src/lib/provider-planning/gmail-resolver.ts` y `src/lib/provider-planning/decision-pipeline.ts`.
  - Confirmado en repo: hoy no existe fast-path determinista para "ultimo destinatario"; ese mapping depende del planner LLM via `recent_sent_recipients`, mientras que "ultima persona que me escribio" esta mas explicitamente guiado hacia `latest_external_sender`.
  - Confirmado en repo: el formulario Gmail solo prellena `to` cuando el planner/resolver logra poblar `actionInput.to` antes de `prefill_form`.
- Pendientes inmediatos:
  - Si este UX importa, agregar heuristica determinista o prompt rule mas fuerte para frases tipo `ultimo destinatario`, `ultimo mail enviado` y singular/plural equivalentes.
  - Cubrir con test de orquestador el caso exitoso `recent_sent_recipients(count=1) -> prefill_form` para que no dependa solo del planner.
- Riesgos o bloqueos:
  - Al depender del planner LLM, prompts semanticamente parecidos pueden caer distinto: uno puede resolver destinatario y otro pedir/mostrar form sin `to`.
  - `recent_sent_recipients` tambien puede degradar a aclaracion si no recupera suficientes destinatarios dentro del budget seguro del turno.
- Comandos de verificacion conocidos:
  - `npm.cmd run test:ts -- src/lib/chat/google-gmail-tool-planner.test.ts`
  - `npm.cmd run test:ts -- src/lib/provider-planning/gmail-resolver.test.ts`
  - `npm.cmd run test:ts -- src/lib/chat/google-gmail-tool-orchestrator.test.ts`

## Snapshot sesion 2026-03-15 - Gmail clarify continuation

- Estado actual: Gmail ya puede continuar una aclaracion pendiente sin perder `body`/accion original cuando el usuario responde con opcion, `threadId` o email.
- Ultimos cambios relevantes:
  - `src/lib/chat/conversation-metadata.ts` ahora soporta `pending_gmail_resolution` con TTL para persistir una resolucion Gmail ambigua en curso.
  - `src/lib/provider-planning/gmail-resolver.ts` devuelve opciones estructuradas en clarifies ambiguos (`recent_thread`, `latest_external_sender`) para que el runtime pueda reanudar la misma accion.
  - `src/lib/chat/google-gmail-tool-orchestrator.ts` reanuda esa resolucion pendiente antes de replanning; si el usuario responde `2` o pega el `threadId`, conserva el `body` original y sigue hasta prefill/approval.
- Pendientes inmediatos:
  - QA manual en Gmail real del caso `Enviale un email a la ultima persona que me escribio que diga "Gracias por escribirnos"` seguido por una respuesta `2`.
  - Extender el mismo patron de continuidad a otras aclaraciones Gmail si aparecen casos reales fuera de `thread` ambiguo.
- Riesgos o bloqueos:
  - La reanudacion actual reconoce opcion numerica, `threadId` y email del listado; referencias mas libres tipo `el de Sebastian` todavia no se resuelven.
  - Sigue faltando validacion viva para confirmar que el estado pendiente se limpia correctamente en todos los desvÃ­os UX reales.
- Comandos de verificacion conocidos:
  - `npm.cmd run test:ts -- src/lib/chat/google-gmail-tool-orchestrator.test.ts`
  - `npm.cmd run test:ts -- src/lib/provider-planning/gmail-resolver.test.ts`
  - `npm.cmd run test:ts -- src/lib/chat/google-gmail-tool-planner.test.ts`
  - `npm.cmd run test:ts -- src/lib/chat/conversation-metadata.test.ts`

## Snapshot sesion 2026-03-15 - Gmail phase 2 cierre

- Estado actual: cerrado el submit real de forms Gmail y repuestos los fast-paths deterministas faltantes del planner runtime.
- Ultimos cambios relevantes:
  - `src/lib/chat/google-gmail-tool-orchestrator.ts` ahora pasa `skipFormPrefill: planner.isFormSubmission` al `runDecisionPipeline(...)`, asi que `prefill_form -> submit` ya avanza a `approval_ready`.
  - `src/lib/chat/google-gmail-tool-planner.ts` ahora marca `isFormSubmission` y agrega gates pre-LLM para denylist, referencias relativas, archive/apply_label obvios, reply/contexto reciente, compose standalone, `latest_external_sender` y `recent_sent_recipients`.
  - `src/lib/chat/google-gmail-tool-planner.test.ts` y `src/lib/chat/google-gmail-tool-orchestrator.test.ts` cubren estos casos nuevos.
- Pendientes inmediatos:
  - QA manual con una cuenta Gmail real para confirmar el path completo `prefill_form -> submit -> approval inbox` en `send_email` y `create_draft_reply`.
  - Validar prompts ambiguos en vivo para confirmar que los nuevos fast-paths no capturen casos que deberian caer al planner LLM.
- Riesgos o bloqueos:
  - Los fast-paths nuevos siguen siendo heuristica regex-driven; todavia no tienen validacion live sobre lenguaje mas libre.
  - El cierre operativo de Gmail sigue necesitando QA real contra labels/drafts/archivado visual en Gmail.
- Comandos de verificacion conocidos:
  - `npm.cmd run test:ts -- src/lib/chat/google-gmail-tool-planner.test.ts`
  - `npm.cmd run test:ts -- src/lib/chat/google-gmail-tool-orchestrator.test.ts`

## Snapshot sesion 2026-03-15 - review PLAN GMAIL

- Estado actual: los dos huecos reales del rail Gmail reviewados hoy ya quedaron corregidos y cubiertos con tests.
- Ultimos hallazgos relevantes:
  - `src/lib/chat/google-gmail-tool-orchestrator.ts` ahora pasa `skipFormPrefill: planner.isFormSubmission` al `runDecisionPipeline(...)`, cerrando el ciclo roto `prefill_form -> submit -> approval_ready`.
  - `src/lib/chat/google-gmail-tool-planner.ts` recupero fast-paths deterministas pre-LLM para denylist, referencias relativas a hilo, label/archive obvios, compose/reply obvios y destinatario externo/reciente.
- Pendientes inmediatos:
  - Pasar una seÃ±al explicita de `isFormSubmission` desde el planner/orquestador Gmail hasta `runDecisionPipeline(...)` para saltar el re-prefill y cubrirlo con test de submit real.
  - Reintroducir o cerrar explicitamente los fast-paths deterministas faltantes de la fase 2, o actualizar `PLAN GMAIL.md`/`PROGRESS.md` si esa reduccion fue intencional.
- Riesgos o bloqueos:
  - Hoy el flujo `prefill_form -> submit -> approval_ready` de Gmail puede ciclar en otro `prefill_form`.
  - `PROGRESS.md` venia reportando la fase Gmail como completa, pero el review del repo actual encontro estos huecos.
- Comandos de verificacion conocidos:
  - `npm.cmd run test:ts -- src/lib/chat/google-gmail-tool-planner.test.ts`
  - `npm.cmd run test:ts -- src/lib/chat/google-gmail-tool-orchestrator.test.ts`
  - `npm.cmd run test:ts -- src/lib/provider-planning/gmail-resolver.test.ts`
  - `npm.cmd run test:ts -- src/lib/provider-planning/gmail-adapter.test.ts`

## Estado actual

- La fase 6 de `PLAN GMAIL.md` ya quedo aterrizada: `src/lib/chat/google-gmail-tool-planner.ts` ya no arrastra el union-shape legacy ni depende de `planStructuredGmailRequest(...)`; el rail runtime de Gmail queda centrado en `planGmailPlannerRawOutput(...)` como fuente de verdad sobre `provider-planning`, manteniendo solo gates deterministas puntuales (form submission y `threadId` explicito) antes del LLM.
- La fase 5 de `PLAN GMAIL.md` ya quedo aterrizada: `src/lib/chat/google-gmail-tool-orchestrator.ts` ahora opera sobre `planGmailPlannerRawOutput(...) -> runDecisionPipeline(...) -> resolveGmailDecision(...) -> read/prefill_form/approval_ready`, mantiene la firma externa para `/api/chat`, limpia metadata expirada, persiste `recent_crm_tool_context` / `pending_chat_form` / `pending_crm_action` en los puntos correctos y redirige `confirmo` a `/approvals` sin ejecutar nada inline.
- La fase 4 de `PLAN GMAIL.md` ya quedo aterrizada en `provider-planning`: `runDecisionPipeline(...)` ahora distingue writes Gmail que deben pasar por `prefill_form` (`create_draft_reply`, `send_reply`, `create_draft_email`, `send_email`) de writes que van directo a `approval_ready` (`archive_thread`, `apply_label`), y `prefill_form` ya no consume approval budget.
- La fase 3 de `PLAN GMAIL.md` ya quedo aterrizada en `provider-planning`: `src/lib/provider-planning/gmail-resolver.ts` resuelve `recent_thread`, `latest_external_sender`, `recent_sent_recipients` e `hydrate_thread_reference` usando solo `executeGoogleGmailReadTool(...)`, `recent_crm_tool_context` y el mismo `TurnBudgetTracker` compartido del turno.
- La fase 2 de `PLAN GMAIL.md` ya quedo aterrizada en el planner runtime principal de Gmail: `src/lib/chat/google-gmail-tool-planner.ts` ahora expone `planGmailPlannerRawOutput(...)` sobre `buildGmailManifest(...) + compileProviderPlannerPrompt(...) + sendChatCompletion(...) + parsePlannerRawOutputWithTelemetry(...)`, con sanitizacion de `actionInput` / `resolutionRequests` y fallback no silencioso a `respond`.
- El planner Gmail runtime ya no depende del wrapper legacy `planGoogleGmailToolAction(...)`; los tests del planner tambien quedaron alineados al contrato raw real (`buildGmailPlannerPrompt(...)`, `parseGmailPlannerRawOutputWithConfig(...)`, `planGmailPlannerRawOutput(...)`).
- `src/lib/chat/google-gmail-tool-orchestrator.ts` ya pasa `organizationId`, `agentId` y `conversationId` al planner Gmail para habilitar el path LLM nuevo cuando el heuristico no cierra solo, sin cambiar la firma externa del orquestador ni romper los tests existentes.
- La fase 1 de `PLAN GMAIL.md` ya quedo aplicada en la base compartida de `provider-planning`: Gmail ahora fija `maxApprovalsPerTurn = 1`, el prompt compiler lista acciones habilitadas reales en vez de mezclar `budgetConfig.capabilities` como si fueran acciones, y el contrato de eventos ya soporta `planning_parse_failure` con helper comun de parse + telemetry.
- Salesforce ya tiene resolver tipado real dentro de `provider-planning`: `src/lib/provider-planning/salesforce-resolver.ts` resuelve `leadId`, `caseId`, `opportunityId`, `accountId`, `contactId`, `whoId` y `whatId` usando solo lecturas/runtime existentes, con clarify concreto para `0 matches` o ambiguedad y budget de lectura por turno.
- El chat web de Salesforce ya no depende de `crm-core` para su runtime principal: `src/lib/chat/salesforce-tool-orchestrator.ts` ahora gobierna el flujo con `PlannerRawOutput -> runDecisionPipeline -> ValidatedProviderDecision -> resolver/approval/read`, persiste solo `pending_crm_action` + `recent_crm_tool_context`, redirige `confirmo` a `/approvals` y emite lifecycle events (`planning_started`, `pipeline_validated`, `resolution_started/completed`, `decision_clarify`, `decision_denied`, `approval_created`, `budget_exceeded`).
- La fase 4 del planning contract ya tiene aterrizaje explicito en repo: existe una registry comun de providers estandar/experimentales en `src/lib/provider-planning/registry.ts` que obliga `manifest + planner LLM + resolver tipado + tests` para providers nuevos y valida que cualquier `customHandler` experimental siga devolviendo `ValidatedProviderDecision`.
- Gmail ya no depende de un clasificador cerrado para compose: `src/lib/chat/gmail-intent-extractor.ts` ahora actua como planner estructurado (`goal`, `candidateAction`, `resolutionRequests`, `missingFields`, `confidence`, `policyFlags`) con heuristica local + Haiku, y soporte de escalamiento a Sonnet solo para replanning con evidencia real.
- El flujo de compose/send de Gmail en chat web ya no salta directo a approval: el planner devuelve `compose_candidate`, el orquestador resuelve contexto Gmail dentro del mismo turno con scratchpad efimero y abre siempre un form editable prellenado antes de crear la approval.
- El runtime de forms del chat ya soporta el contrato `definition + initialValues + fieldUi` via marker estructurado `FORM_DATA`, incluyendo `readOnly/hidden` por campo para esconder ids internos (`threadId`, `messageId`, `rfcMessageId`, `action`) y mantener visibles/editables los campos de usuario.
- La resolucion Gmail nueva ya cubre al menos `la ultima conversacion`, `la ultima persona que me escribio` y `mis ultimos 5 destinatarios`, con budget cerrado por turno de `1 search_threads + 3 read_thread`, prefill parcial cuando no alcanza, y sin persistir scratchpad rico fuera del request.
- `search_threads` de Gmail ahora puede pasar query real a Gmail (`q`) cuando el planner/orquestador la necesita, lo que habilita resolucion sobre `in:sent` sin abrir primitivas nuevas de runtime.
- El planner de Gmail ya no confunde pedidos de email nuevo incompletos con replies a un hilo. Un prompt tipo `creame un borrador en Gmail que diga "Hola Agente"` ahora cae como compose standalone y pide destinatario, en vez de exigir `thread_id/message_id` de un hilo inexistente.
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
- Confirmado en repo: Gmail y Google Calendar hoy se orquestan como capacidades separadas en `/api/chat`; el caso compuesto `buscar ultimo destinatario en Gmail -> crear reunion en Calendar -> avisar por Gmail` todavia no existe como workflow inter-app resuelto de punta a punta.
- El modo actual "desde cero" sigue vivo como `Modo avanzado / desde cero` dentro del catalogo, reutilizando el builder actual sin abrir tablas nuevas.
- Google Calendar v1 read-only ya corre en `chat web` via `/api/chat` con planner server-side, runtime real sobre `primary`, validacion de ventana y refresh de token.
- Gmail v1.5 ya corre en `chat web` con el mismo path real de writes validado en Calendar: `approval_items -> workflow_runs/workflow_steps -> event_queue -> worker -> runtime` para `create_draft_reply`, `apply_label` y `archive_thread`, manteniendo lectura segura metadata-only para `search_threads` y `read_thread`.
- Gmail ahora persiste referencia estable `thread_id + message_id + rfc_message_id` en el contexto reciente y en los payloads de approval para que los jobs async no dependan de heuristicas conversacionales.
- Gmail chat ahora puede resolver automaticamente un `thread_id` incompleto antes de una write: si el usuario pide borrador/label/archivar y solo hay `thread_id` reciente, el orquestador hace `read_thread` server-side para obtener `message_id` estable y crea la approval en el mismo turno.
- Analisis del caso `Creame un borrador en Gmail que diga Hola Agente`: el mensaje `Primero necesito leer el hilo real de Gmail...` es comportamiento esperado del planner actual, no un fallo accidental. Hoy Gmail solo soporta `create_draft_reply` sobre un hilo existente; si no hay `recent_crm_tool_context.thread_id` previo (por `read_thread` o por `search_threads` con un unico resultado), el planner devuelve `missing_data` y no crea borradores standalone.
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
- El coordinator ya intenta compensaciones reales cuando falla un step requerido despues de side effects previos: ejecuta reversiÃ³n server-side en orden inverso para steps compensables de Salesforce y solo deja `manual_repair_required` si existe un step no reversible o si alguna compensaciÃ³n falla.
- Google Calendar ya tiene runtime workflow-driven real para writes (`create_event`, `reschedule_event`, `cancel_event`) y la primera compensaciÃ³n segura `create_event -> cancel_created_event` dentro del mismo coordinator.
- El chat web de Google Calendar ya puede materializar approvals reales de write: el planner detecta `create_event`, `reschedule_event` y `cancel_event`, guarda `pending_crm_action`, y deriva la aprobacion a `/approvals` en vez de ejecutar la mutacion inline.
- Google Calendar v1.5 quedo validado end-to-end sobre una integracion real: se creo un evento temporal, aparecio confirmado en Google Calendar, luego se reprogramo y finalmente se cancelo pasando por `approval_items -> event_queue -> worker -> runtime`, con `approval_items.status = approved`, `workflow_runs/status = completed`, `workflow_steps/status = completed` y `event_queue/status = done`.
- El repo ahora tiene una forma reproducible de ejecutar tests TS con aliases via `npm.cmd run test:ts`, y una bateria dedicada `npm.cmd run test:google-calendar` para planner, runtime de lectura, orchestrator y runtime de escritura.

## Ultimos cambios relevantes

### Sesion: fase 6 de `PLAN GMAIL.md`

**Objetivo:** retirar del rail runtime de Gmail el planner/wrapper legacy y dejar `provider-planning` como unica fuente de verdad operativa del path web.

**Cambios implementados:**
- `src/lib/chat/google-gmail-tool-planner.ts` se simplifico al contrato runtime real: conserva `buildGmailPlannerPrompt(...)`, `parseGmailPlannerRawOutputWithConfig(...)` y `planGmailPlannerRawOutput(...)`, elimina la dependencia a `gmail-intent-extractor.ts` y retira el union-shape legacy `planGoogleGmailToolAction(...)`.
- El planner raw mantiene solo los gates deterministas que siguen aportando valor antes del LLM en runtime (`form submission` estructurada y `threadId` explicito), dejando que el resto del rail pase por `provider-planning`.
- `src/lib/chat/google-gmail-tool-planner.test.ts` se reescribio contra el contrato nuevo: prompt compilado, sanitizacion/telemetry del raw output, bypass deterministico para forms y lectura directa por `threadId`.

**Verificacion completada:**
- `npm.cmd run test:ts -- src/lib/chat/google-gmail-tool-planner.test.ts`
- `npm.cmd run test:ts -- src/lib/chat/google-gmail-tool-orchestrator.test.ts`
- `npm.cmd run typecheck`

### Sesion: fase 5 de `PLAN GMAIL.md`

**Objetivo:** reescribir el orquestador web de Gmail para que el rail runtime deje de depender del wrapper legacy y quede gobernado por `provider-planning`.

**Cambios implementados:**
- `src/lib/chat/google-gmail-tool-orchestrator.ts` ahora sigue el orden runtime -> limpieza de metadata expirada -> planner raw -> decision pipeline -> resolver tipado -> `read` / `prefill_form` / `approval_ready`, usando `TurnBudgetTracker`, `buildGmailManifest(...)` y lifecycle events compartidos.
- El orquestador Gmail ahora persiste `recent_crm_tool_context` despues de lecturas reales, guarda `pending_chat_form` cuando la decision cae en `prefill_form`, y crea approval real + `pending_crm_action` solo cuando la decision llega a `approval_ready`.
- `confirmo` deja explicitamente de ejecutar nada: cuando ya existe una approval pendiente devuelve guidance accionable hacia `/approvals` y recuerda el vencimiento/flujo correcto.
- `src/lib/chat/google-gmail-tool-orchestrator.test.ts` se reescribio sobre el contrato nuevo y cubre `read` con persistencia de contexto, `prefill_form`, `approval_ready` y el no-op de `confirmo`.

**Verificacion completada:**
- `npm.cmd run test:ts -- src/lib/chat/google-gmail-tool-orchestrator.test.ts`
- `npm.cmd run typecheck`

### Sesion: fase 4 de `PLAN GMAIL.md`

**Objetivo:** separar explicitamente `prefill_form` del approval budget y dejar listo el contrato normal `prefill_form -> approval_ready` para Gmail antes de reescribir el orquestador de la fase 5.

**Cambios implementados:**
- `src/lib/provider-planning/decision-pipeline.ts` ahora acepta `skipFormPrefill` y `buildPrefillForm`, emite `prefill_form` solo para los compose/send actions de Gmail y deja `consumeApproval()` reservado exclusivamente para `approval_ready`.
- `src/lib/provider-planning/gmail-adapter.ts` ahora preserva `actionInput` desde el planner o desde envios estructurados del form, construye `DynamicFormDefinitionV2` tipado para reply/email standalone y marca `isFormSubmission` para saltar el re-prefill cuando el usuario ya envio el formulario.
- `src/lib/provider-planning/decision-pipeline.test.ts` cubre que `prefill_form` no gasta approval budget y que un form ya enviado entra directo en `approval_ready`.
- `src/lib/provider-planning/gmail-adapter.test.ts` ahora valida el nuevo contrato: compose/send cae en `prefill_form`, `archive_thread` y `apply_label` siguen yendo a `approval_ready`, y la submit estructurada del form conserva `actionInput` y salta directo a approval.

**Verificacion completada:**
- `npm.cmd run test:ts -- src/lib/provider-planning/decision-pipeline.test.ts`
- `npm.cmd run test:ts -- src/lib/provider-planning/gmail-adapter.test.ts`
- `npm.cmd run typecheck`

### Sesion: fase 3 de `PLAN GMAIL.md`

**Objetivo:** crear el resolver tipado de Gmail sobre budget compartido, sin reescribir todavia el orquestador web completo de la fase 5.

**Cambios implementados:**
- `src/lib/provider-planning/gmail-resolver.ts` ahora resuelve `recent_thread`, `latest_external_sender`, `recent_sent_recipients` e `hydrate_thread_reference` sobre el mismo `TurnBudgetTracker` del turno, consumiendo `search` en `search_threads` y `read` en `read_thread` sin abrir budgets paralelos.
- El resolver reutiliza `recent_crm_tool_context` cuando ya existe un hilo unico reciente para evitar elecciones implicitas peligrosas y solo hace `read_thread` adicional cuando realmente faltan `messageId` o `rfcMessageId`.
- Los fallos por budget emiten `budget_exceeded` y terminan en `clarify`; los fallos operativos de Gmail tambien terminan en `clarify` con mensaje explicito, sin degradar a `respond`.
- `src/lib/provider-planning/gmail-resolver.test.ts` cubre contexto reciente, ambiguedad, hidratacion de thread, remitente externo, corte por budget y errores operativos.
- `src/lib/provider-planning/registry.ts` ahora registra `gmail-resolver.test.ts` dentro de la suite contractual obligatoria de Gmail.

**Verificacion completada:**
- `npm.cmd run test:ts -- src/lib/provider-planning/gmail-resolver.test.ts`
- `npm.cmd run typecheck`

### Sesion: fase 2 de `PLAN GMAIL.md`

**Objetivo:** mover el planner runtime de Gmail al contrato real de `provider-planning` sin romper todavia el orquestador web actual ni adelantar el resolver tipado de la fase 3.

**Cambios implementados:**
- `src/lib/chat/google-gmail-tool-planner.ts` ahora expone `buildGmailPlannerPrompt(...)`, `parseGmailPlannerRawOutputWithConfig(...)` y `planGmailPlannerRawOutput(...)`, reutilizando `buildGmailManifest(...)`, `compileProviderPlannerPrompt(...)`, `sendChatCompletion(...)` y `parsePlannerRawOutputWithTelemetry(...)`.
- El planner raw nuevo sanea `resolutionRequests` permitidas de Gmail (`recent_thread`, `latest_external_sender`, `recent_sent_recipients`, `hydrate_thread_reference`), tipa `actionInput` cuando el JSON ya trae datos suficientes y emite `planning_parse_failure` tambien cuando el LLM devuelve una accion no habilitada o inutilizable.
- `planGoogleGmailToolAction(...)` quedo como wrapper backward-compatible: mantiene los fast-paths deterministas del planner legacy y solo consulta al planner raw/LiteLLM cuando esos gates no cierran la decision con seguridad.
- `src/lib/chat/google-gmail-tool-orchestrator.ts` ahora le pasa `organizationId`, `agentId` y `conversationId` al planner Gmail para que el nuevo path LLM quede realmente conectado en runtime actual.
- `src/lib/chat/google-gmail-tool-planner.test.ts` suma cobertura del prompt compilado, sanitizacion del raw output y telemetry sobre accion inutilizable, manteniendo verdes los checks legacy del planner.

**Verificacion completada:**
- `npm.cmd run test:ts -- src/lib/chat/google-gmail-tool-planner.test.ts`
- `npm.cmd run test:ts -- src/lib/chat/google-gmail-tool-orchestrator.test.ts`
- `npm.cmd run typecheck`

**Pendientes inmediatos:**
- En la fase 5, reescribir `src/lib/chat/google-gmail-tool-orchestrator.ts` para operar directo sobre `PlannerRawOutput -> decision pipeline -> resolver -> prefill/approval`, y dejar de depender del wrapper legacy de planner.

**Riesgos / bloqueos:**
- El runtime actual ya puede invocar el planner raw nuevo y el resolver tipado existe, pero el wrapper legacy todavia resuelve compose/read por fuera del pipeline final de `provider-planning`.

### Sesion: fase 1 de `PLAN GMAIL.md`

**Objetivo:** ejecutar la base compartida y la observabilidad inicial del nuevo planning contract de Gmail sin reescribir todavia el planner/orquestador runtime.

**Cambios implementados:**
- `src/lib/provider-planning/gmail-manifest.ts`: Gmail ahora fija `maxApprovalsPerTurn: 1` dentro del budget compartido para alinear el provider con el contrato aprobado.
- `src/lib/provider-planning/prompt-compiler.ts`: el resumen de acciones del planner ahora se construye solo desde `allowedActions` reales; `search/read/write` del budget dejan de aparecer como si fueran acciones del provider.
- `src/lib/provider-planning/types.ts` y `src/lib/provider-planning/planner-raw-output.ts`: se agrego el lifecycle event `planning_parse_failure` y el helper comun `parsePlannerRawOutputWithTelemetry(...)`, que emite telemetry explicita cuando el JSON del planner no parsea.
- `src/lib/chat/salesforce-tool-planner.ts` y `src/lib/chat/salesforce-tool-orchestrator.ts`: el unico caller runtime actual de `parsePlannerRawOutput(...)` ya usa el helper con telemetry, para que el nuevo evento no quede solo definido en tipos.
- Se sumo cobertura en `src/lib/provider-planning/prompt-compiler.test.ts`, nuevo `src/lib/provider-planning/planner-raw-output.test.ts` y `src/lib/chat/salesforce-tool-planner.test.ts`.

**Verificacion completada:**
- `npm.cmd run test:ts -- src/lib/provider-planning/prompt-compiler.test.ts`
- `npm.cmd run test:ts -- src/lib/provider-planning/planner-raw-output.test.ts`
- `npm.cmd run test:ts -- src/lib/chat/salesforce-tool-planner.test.ts`
- `npm.cmd run typecheck`

**Pendientes inmediatos:**
- Fase 2 de `PLAN GMAIL.md`: reemplazar el planner runtime de Gmail por `planGmailPlannerRawOutput(...)` sobre `buildGmailManifest(...) + compileProviderPlannerPrompt(...) + parsePlannerRawOutput(...)`, manteniendo los gates deterministas valiosos antes del LLM.
- Cuando entre ese planner runtime, reutilizar `planning_parse_failure` tambien en Gmail para que el fallback a `respond` nunca quede silencioso en chat web.

**Riesgos / bloqueos:**
- La telemetry de parse failure ya existe y el caller runtime actual de Salesforce la usa, pero Gmail todavia no consume este helper en su path real porque la fase 2 aun no reemplazo su planner/orquestador actual.

### Sesion: hardening final de runtime Salesforce + limpieza legacy crm-core

**Objetivo:** cerrar los dos hallazgos abiertos del review de Salesforce: evitar `read`/`approval_ready` con `actionInput` invalido y retirar el ultimo adapter Salesforce que seguia importando `crm-core`.

**Cambios implementados:**
- `src/lib/chat/salesforce-tool-orchestrator.ts` ahora valida `executeSalesforceCrmToolSchema.safeParse(...)` antes de cualquier `read` o `approval_ready`, no solo despues de `resolve`. Si el `actionInput` tipado sigue incompleto o invalido, el runtime degrada a `clarify`, emite `decision_clarify` con `reason=action_input_invalid` y evita tanto la lectura real como la creacion de approvals invalidas.
- `src/lib/chat/salesforce-tool-orchestrator.test.ts` suma cobertura para ambos bordes: `read` con `actionInput` invalido ya no ejecuta `executeSalesforceToolAction`, y `approval_ready` con `actionInput` invalido ya no llama `createApprovalRequest`.
- Se retiro `src/lib/provider-planning/salesforce-adapter.ts` y su test legacy `src/lib/provider-planning/salesforce-adapter.test.ts`, que eran el ultimo puente Salesforce -> `crm-core` dentro de `provider-planning`.
- `src/lib/provider-planning/registry.ts` ya no usa ese test legacy como contrato de Salesforce; ahora referencia `salesforce-resolver.test.ts` junto con `decision-pipeline.test.ts`.

**Verificacion completada:**
- `npm.cmd run test:ts -- src/lib/chat/salesforce-tool-orchestrator.test.ts`
- `npm.cmd run test:ts -- src/lib/provider-planning/salesforce-resolver.test.ts`
- `npm.cmd run test:ts -- src/lib/provider-planning/decision-pipeline.test.ts`
- `npm.cmd run typecheck`

**Pendientes inmediatos:**
- Correr `npm.cmd run lint` si se quiere un cierre adicional de repo completo para esta slice.
- Seguir retirando legado general de `crm-core` fuera de Salesforce si en una fase futura tambien se busca eliminarlo del repo entero y no solo del path Salesforce activo.

**Riesgos / bloqueos:**
- El planner sigue pudiendo producir `actionInput` parcial de forma intencional para el path `resolve`; el cierre correcto ahora ocurre en runtime antes de side effects, pero no se cambio la semantica del planner raw.

### Sesion: auditoria de aplicacion de `PLAN.md` (Salesforce)

**Objetivo:** revisar si el `PLAN.md` de Salesforce quedo aplicado por completo y si el repo real sostiene esa conclusion con codigo y tests.

**Resultado:**
- El contrato principal si quedo mayormente aterrizado en runtime real: action matrix de lecturas, planner raw, `runDecisionPipeline(...)`, resolver tipado, orquestador propio, metadata nueva (`pending_crm_action` + `recent_crm_tool_context`) y eventos de lifecycle.
- La revision encontro dos desajustes importantes respecto al cierre "completo": `src/lib/chat/salesforce-tool-orchestrator.ts` solo valida `executeSalesforceCrmToolSchema` despues de `resolve`, no en paths directos `read` / `approval_ready`; ademas sigue existiendo `src/lib/provider-planning/salesforce-adapter.ts` importando `crm-core` y manteniendo el mapper backward-compatible a `CrmPlannerDecision`.
- Se verifico localmente que el estado actual sigue tipando y pasando checks base con `npm.cmd run test:ts -- src/lib/chat/salesforce-tool-planner.test.ts`, `npm.cmd run test:ts -- src/lib/provider-planning/salesforce-resolver.test.ts`, `npm.cmd run test:ts -- src/lib/chat/salesforce-tool-orchestrator.test.ts`, `npm.cmd run test:ts -- src/lib/provider-planning/decision-pipeline.test.ts`, `npm.cmd run test:ts -- src/lib/chat/conversation-metadata.test.ts`, `npm.cmd run typecheck` y `npm.cmd run lint`.

**Pendientes inmediatos:**
- Endurecer el orquestador para hacer `safeParse` del `actionInput` tambien en los caminos directos de `read` y `approval_ready`, degradando a `clarify` si faltan campos requeridos.
- Decidir si `src/lib/provider-planning/salesforce-adapter.ts` se elimina o se mueve explicitamente fuera del path Salesforce activo, junto con su referencia en `src/lib/provider-planning/registry.ts`.

**Riesgos / bloqueos:**
- Mientras no se valide el `actionInput` antes de ejecutar lectura o crear approval, un planner que marque alta confianza pero omita ids/campos obligatorios puede producir errores tardios o approvals invalidas en vez de pedir aclaracion.
- Aunque el runtime principal ya no usa `crm-core`, la limpieza legacy no esta cerrada al 100% mientras el adapter Salesforce backward-compatible siga viviendo en `provider-planning`.

### Sesion: Partes 5 y 6 de PLAN.md para limpieza legacy + observabilidad Salesforce

**Objetivo:** cerrar la parte 5 y 6 del `PLAN.md` para Salesforce eliminando residuos runtime/metadata del path legacy y endureciendo la emision/verificacion de eventos del planning contract real.

**Cambios implementados:**
- `src/lib/chat/salesforce-tool-orchestrator.ts`: Salesforce ya no vuelve al planner legacy `planSalesforceToolAction(...)` para construir `actionInput`. El runtime ahora consume `actionInput` opcional desde `PlannerRawOutput`, valida el branch final con el mismo pipeline y mantiene solo `pending_crm_action` + `recent_crm_tool_context` al persistir metadata.
- `src/lib/chat/salesforce-tool-planner.ts`, `src/lib/provider-planning/types.ts`, `src/lib/provider-planning/planner-raw-output.ts` y `src/lib/provider-planning/prompt-compiler.ts`: el contrato raw ahora acepta `actionInput` opcional de forma backward-compatible para todos los providers, y Salesforce lo sanea/usa en runtime sin tocar Gmail ni Calendar.
- `src/lib/chat/conversation-metadata.ts`, `src/lib/chat/chat-form-server.ts` y `src/lib/db/approval-items.ts`: se elimino la lectura backward-compatible de `pending_tool_action` y `recent_salesforce_tool_context` para Salesforce, y tambien la limpieza/escritura residual de esos campos legacy al expirar UI state o resolver approvals.
- `src/lib/chat/salesforce-tool-orchestrator.ts` y `src/lib/provider-planning/salesforce-resolver.ts`: la observabilidad queda aterrizada con metadata minima util para `planning_started`, `pipeline_validated`, `resolution_started`, `resolution_completed`, `decision_clarify`, `approval_created` y `budget_exceeded` incluyendo `candidateAction`, `resultMode`, `depth/requestCount`, budget restante y outcome de resolucion.
- Nueva cobertura en `src/lib/chat/salesforce-tool-planner.test.ts`, `src/lib/chat/salesforce-tool-orchestrator.test.ts`, `src/lib/provider-planning/salesforce-resolver.test.ts` y `src/lib/chat/conversation-metadata.test.ts` para parser raw con `actionInput`, secuencia/metadata de eventos, `budget_exceeded` y ausencia de fallback a metadata legacy de Salesforce.

**Pendientes inmediatos:**
- Validar manualmente en chat web un caso real de `resolve -> approval_ready` y otro de `clarify` ambiguo con una integracion Salesforce conectada para confirmar que el `actionInput` raw del planner llega bien en produccion.
- Decidir si `src/lib/provider-planning/salesforce-adapter.ts` sigue valiendo como referencia de migracion/testing o si conviene retirarlo en una fase posterior ahora que el runtime real ya no depende de ese puente backward-compatible.

**Riesgos / bloqueos:**
- El contrato raw comun ahora permite `actionInput` opcional, pero hoy solo Salesforce lo consume en runtime; si otro provider decide usarlo, conviene agregar validacion/sanitizacion especifica como la de Salesforce antes de ejecutarlo.
- La limpieza legacy es deliberadamente estricta en lectura. Conversaciones viejas con solo `pending_tool_action` o `recent_salesforce_tool_context` ya no se rehidratan; la estrategia acordada en esta fase es no hacer backfill y limpiar oportunistamente al reescribir metadata nueva.

**Verificacion:**
- `npm.cmd run test:ts -- src/lib/chat/salesforce-tool-planner.test.ts`
- `npm.cmd run test:ts -- src/lib/provider-planning/salesforce-resolver.test.ts`
- `npm.cmd run test:ts -- src/lib/chat/salesforce-tool-orchestrator.test.ts`
- `npm.cmd run test:ts -- src/lib/chat/conversation-metadata.test.ts`
- `npm.cmd run typecheck`
- `npm.cmd run lint`

### Sesion: Partes 3 y 4 de PLAN.md para Salesforce resolver + orquestador

**Objetivo:** completar la migracion runtime de Salesforce al planning contract real implementando el resolver tipado dentro de `provider-planning` y reemplazando el orquestador legacy basado en `crm-core` por uno propio gobernado por `ValidatedProviderDecision`, manteniendo la firma externa de `/api/chat`.

**Cambios implementados:**
- `src/lib/provider-planning/salesforce-resolver.ts`: nuevo resolver tipado real para Salesforce que usa solo lookups/runtime existentes, consume budget `read` por cada resolucion real, incrementa depth de resolucion, hidrata `leadId`, `caseId`, `opportunityId`, `accountId`, `contactId`, `whoId` y `whatId`, y degrada a `clarify` con mensajes concretos cuando hay `0 matches`, multiples matches, falta query o budget agotado.
- `src/lib/chat/salesforce-tool-orchestrator.ts`: reescritura completa del orquestador de Salesforce sin `orchestrateCrmForChat` ni `CrmChatAdapter`; ahora hace `plan raw -> pipeline validado -> resolve/read/approval_ready/clarify/denied`, mantiene el contrato externo `{ continue | respond_now }`, persiste solo `pending_crm_action` y `recent_crm_tool_context`, limpia metadata legacy al volver a escribir contexto y nunca ejecuta `confirmo`.
- `src/lib/chat/salesforce-tool-orchestrator.ts`: el cap de `1` approval por turno ahora queda reforzado end-to-end en runtime porque el orquestador comparte el mismo `TurnBudgetTracker` entre validacion inicial, resolucion y branch final a approval.
- `src/lib/chat/salesforce-tool-orchestrator.ts`: se cableo `ProviderEventSink` real para Salesforce con emision de `planning_started`, `pipeline_validated`, `resolution_started`, `resolution_completed`, `decision_clarify`, `decision_denied`, `approval_created` y `budget_exceeded`, incluyendo metadata minima de outcome, depth y budget restante.
- `src/lib/provider-planning/salesforce-resolver.test.ts` y `src/lib/chat/salesforce-tool-orchestrator.test.ts`: nueva cobertura para `0 matches`, `1 match`, ambiguedad, budget agotado, `confirmo` redirigido a `/approvals`, flujo `read` y flujo `resolve -> approval_ready`.

**Pendientes inmediatos:**
- Parte 5 de `PLAN.md`: limpiar compatibilidad legacy restante de Salesforce fuera del path principal, especialmente fallbacks de lectura backward-compatible en `conversation-metadata` y residuos de metadata legacy fuera del orquestador.
- Parte 6 de `PLAN.md`: endurecer/expandir observabilidad de Salesforce con asserts de eventos y metadata mas rica en tests si hace falta, ahora que el runtime real ya emite el set minimo.
- Validar manualmente en chat web un caso real de `resolve -> approval_ready` y otro `resolve ambiguo -> clarify` con una integracion Salesforce conectada para confirmar UX y payloads de approval en vivo.

**Riesgos / bloqueos:**
- El runtime principal de Salesforce ya no usa `crm-core`, pero hoy sigue existiendo un puente tactico: `planSalesforceToolAction(...)` se reutiliza para completar `actionInput` ejecutable mientras el contrato raw todavia no transporta argumentos tipados por si mismo.
- La limpieza de metadata legacy en lectura sigue parcialmente backward-compatible desde `conversation-metadata`; eso evita romper conversaciones viejas, pero significa que la fase 5 todavia no quedo cerrada del todo.

**Verificacion:**
- `npm.cmd run test:ts -- src/lib/provider-planning/salesforce-resolver.test.ts`
- `npm.cmd run test:ts -- src/lib/chat/salesforce-tool-orchestrator.test.ts`
- `npm.cmd run test:ts -- src/lib/chat/salesforce-tool-planner.test.ts`
- `npm.cmd run test:ts -- src/lib/provider-planning/salesforce-adapter.test.ts`
- `npm.cmd run test:ts -- src/lib/provider-planning/decision-pipeline.test.ts`
- `npm.cmd run typecheck`

### Sesion: Parte 2 de PLAN.md para Salesforce planner raw

**Objetivo:** aterrizar el planner raw real de Salesforce sobre `provider-planning` (`manifest + prompt compiler + raw parser`), manteniendo la preclasificacion deterministica y dejando tipadas las `resolutionRequests` del resolver futuro sin romper todavia el runtime legacy basado en `crm-core`.

**Cambios implementados:**
- `src/lib/chat/salesforce-tool-planner.ts`: se agregaron helpers nuevos `buildSalesforcePlannerPrompt(...)`, `parseSalesforcePlannerRawOutput(...)` y `planSalesforcePlannerRawOutput(...)` para compilar el prompt desde `buildSalesforceManifest(...) + compileProviderPlannerPrompt(...)`, usar el `plannerModel` del manifest y parsear `PlannerRawOutput` via `parsePlannerRawOutput(...)`.
- `src/lib/chat/salesforce-tool-planner.ts`: el parser raw de Salesforce ahora sanea y tipa `resolutionRequests` aceptando solo `lookup_person`, `lookup_account`, `lookup_case` y `lookup_opportunity`, descartando requests invalidas en vez de propagar payload libre al resolver futuro.
- `src/lib/chat/salesforce-tool-planner.test.ts`: nueva cobertura para el prompt compilado desde manifest, presencia de contexto no confiable en `userContent`, saneamiento de `resolutionRequests` y degradacion segura cuando el planner devuelve algo no parseable.
- Se mantuvo intacto `planSalesforceToolAction(...)` como path de compatibilidad temporal porque el contrato `PlannerRawOutput` todavia no transporta `arguments` ejecutables y forzar hoy el swap completo sobre `crm-core` seria regresivo hasta completar las partes 3 y 4.

**Pendientes inmediatos:**
- Parte 3 de `PLAN.md`: implementar el resolver tipado real de Salesforce dentro de `provider-planning`, consumiendo `resolutionRequests` ya tipadas y budget por lookup real.
- Parte 4 de `PLAN.md`: reescribir el orquestador de Salesforce para operar con `ValidatedProviderDecision` y dejar de depender de `crm-core` y del planner legacy con `arguments`.

**Riesgos / bloqueos:**
- El planner raw real ya existe y esta cubierto, pero el runtime web de Salesforce sigue apoyandose en el planner legacy porque el contrato nuevo aun no resuelve ni hidrata `actionInput` completo para ejecucion/approval.
- Hasta que entren resolver y orquestador nuevos, los helpers raw son base compartida valida para la migracion pero no la unica fuente de verdad del chat web de Salesforce.

**Verificacion:**
- `npm.cmd run test:ts -- src/lib/chat/salesforce-tool-planner.test.ts`
- `npm.cmd run test:ts -- src/lib/provider-planning/salesforce-adapter.test.ts`
- `npm.cmd run typecheck`

### Sesion: Parte 1 de PLAN.md para Salesforce en provider-planning

**Objetivo:** ejecutar la base compartida de la migracion Salesforce al planning contract real, dejando listas la action matrix explicita de lecturas, la policy de confianza del manifest y el cap separado de approvals por turno.

**Cambios implementados:**
- `src/lib/workflows/action-matrix.ts`: Salesforce ya marca explicitamente como `read` `lookup_records`, `list_leads_recent`, `list_leads_by_status`, `lookup_accounts`, `lookup_opportunities`, `lookup_cases` y `summarize_pipeline`, evitando que esas lecturas caigan por default en `approval_ready`.
- `src/lib/provider-planning/decision-pipeline.ts`: el pipeline ahora usa `manifest.confidencePolicy` con la regla acordada (`< clarifyBelow => clarify`, franja intermedia => `resolve` solo si hay `resolutionRequests`, alta confianza => branch normal) manteniendo `allowedActions`, denylist y scope como gates previos.
- `src/lib/provider-planning/types.ts`, `src/lib/provider-planning/manifest.ts`, `src/lib/provider-planning/turn-budget.ts` y `src/lib/provider-planning/salesforce-manifest.ts`: el budget compartido ahora admite `maxApprovalsPerTurn` separado del budget operativo; Salesforce lo fija en `1`, crear approval no descuenta operaciones y el segundo write approval del turno degrada a `clarify`.
- Se actualizo cobertura dirigida en `src/lib/provider-planning/turn-budget.test.ts`, `src/lib/provider-planning/decision-pipeline.test.ts` y `src/lib/provider-planning/salesforce-adapter.test.ts` para reflejar lecturas Salesforce reales, confidence policy y cap de approvals.

**Pendientes inmediatos:**
- Parte 2 de `PLAN.md`: reemplazar el planner legacy de Salesforce por `PlannerRawOutput` real usando `buildSalesforceManifest(...)`, `compileProviderPlannerPrompt(...)` y `parsePlannerRawOutput(...)`, manteniendo `preclassifySalesforceLeadAction(...)`.
- Cuando entre el resolver/orquestador real, cablear eventos adicionales (`budget_exceeded`, `approval_created`, `resolution_started/completed`) para que la observabilidad no quede solo en tests y tipos.

**Riesgos / bloqueos:**
- El cap de approvals ya existe en la base compartida, pero hoy se valida en el pipeline puro; todavia falta reforzarlo tambien en el orquestador runtime real de Salesforce para cubrir loops conversacionales end-to-end.
- Salesforce sigue usando planner/orquestador legacy en runtime web; este cambio prepara la base compartida y los tests, pero no completa todavia la migracion del path real.

**Verificacion:**
- `npm.cmd run test:ts -- src/lib/provider-planning/turn-budget.test.ts`
- `npm.cmd run test:ts -- src/lib/provider-planning/decision-pipeline.test.ts`
- `npm.cmd run test:ts -- src/lib/provider-planning/salesforce-adapter.test.ts`

### Sesion: Auditoria de adopcion del planning contract estandar

**Objetivo:** contrastar `planning_contract_standard.md` contra el repo real para decidir si el contrato ya quedo aplicado de punta a punta o si todavia vive como capa compartida/adapters alrededor de planners legacy.

**Cambios implementados:**
- No hubo cambios de codigo productivo en esta sesion; se hizo analisis de adopcion repo-real y se fijo recomendacion de siguiente fase.
- Confirmado: la base compartida del contrato ya existe en `src/lib/provider-planning` (`types`, `decision-pipeline`, `turn-budget`, `prompt-compiler`, `event-sink`, `manifest`, `registry`) y los tres providers actuales ya tienen manifiestos/adapters/tests alineados con ese contrato.
- Confirmado: la adopcion runtime todavia es parcial. `runGmailContract`, `runCalendarContract`, `runSalesforceContract`, `compileProviderPlannerPrompt` y `parsePlannerRawOutput` hoy aparecen solo en la capa `provider-planning` y en tests; los orquestadores reales siguen llamando planners/orquestadores legacy (`crm-core`, `planSalesforceToolAction`, `planGoogleCalendarToolAction`, `planGoogleGmailToolAction`, `planStructuredGmailRequest`).
- Confirmado: el contrato esta mas avanzado en Gmail que en Calendar y Salesforce a nivel semantico, pero aun no hay un planner runtime unificado compilado desde manifiesto. Gmail ya usa planner estructurado y resolucion real; Calendar y Salesforce siguen dependiendo de planners legacy adaptados.
- Confirmado: hay gaps concretos frente al contrato estandar. Los manifiestos siguen con `dynamic: null`, la policy de confianza definida en manifiesto todavia no gobierna `runDecisionPipeline`, y los lifecycle events mas ricos (`denylist_blocked`, `resolution_started/completed`, `form_prefilled`, `approval_created`, `budget_exceeded`) existen en tipos pero todavia no aparecen cableados de punta a punta en runtime.

**Pendientes inmediatos:**
- Siguiente paso recomendado: cablear primero Salesforce al contrato runtime real, reemplazando en su planner/orquestador el path legacy por `PlannerRawOutput -> runDecisionPipeline -> ValidatedProviderDecision` sin reescribir aun Gmail.
- En esa misma fase, reutilizar `ProviderEventSink` de verdad en runtime y empezar a emitir al menos `planning_started`, `pipeline_validated`, `decision_clarify`, `decision_denied` y `approval_created` fuera de tests.
- Luego de Salesforce, decidir entre dos opciones de fase siguiente: `A)` integrar Calendar al mismo runtime contract o `B)` endurecer la capa compartida (confidence policy + dynamic data cache + parser/prompt compiler realmente usados) antes de otra migracion.

**Riesgos / bloqueos:**
- El repo ya tiene contrato, registry y adapters, pero todavia no existe un orquestador unico consumiendo `provider-planning` de punta a punta; por eso no conviene asumir que el standard ya quedo aplicado a lo largo de todo el proyecto.
- `runDecisionPipeline` hoy decide por `allowedActions`, denylist, scope, missing fields y action matrix, pero no usa todavia `confidencePolicy` del manifiesto ni depleta budget por capability en la etapa de pipeline.
- El `prompt-compiler` ya protege datos no confiables con delimitadores y tests de prompt injection, pero mientras no se use en planners runtime sigue siendo una pieza preparada mas que una fuente de verdad operativa.

**Verificacion:**
- Revision manual de `planning_contract_standard.md`
- Busquedas repo-wide con `rg` sobre `src/lib/provider-planning`, `src/lib/chat` y orquestadores reales
- Sin ejecucion de tests ni cambios productivos en esta sesion

### Sesion: Fase 4 contract registry para providers nuevos

**Objetivo:** materializar la fase 4 del contrato estandar de planning para que los providers nuevos queden obligados a registrarse con contrato completo y los experimentales no puedan romper el downstream contract aunque usen `customHandler`.

**Cambios implementados:**
- `src/lib/provider-planning/types.ts`: nuevos tipos `ProviderPlanningDefinition`, `StandardProviderPlanningDefinition`, `ExperimentalProviderPlanningDefinition`, `ExperimentalCustomHandler` y `ProviderContractTestSuite` para distinguir providers estandar versus experimentales sin relajar `ValidatedProviderDecision`.
- `src/lib/provider-planning/registry.ts`: nueva registry central de `provider-planning` con los providers actuales (`salesforce`, `gmail`, `google_calendar`), validacion de contrato (`provider` consistente con `manifest`, tests obligatorios, planner LLM + resolver tipado para providers estandar) y helper `executeExperimentalCustomHandler(...)` que parsea el resultado y degrada a `respond` si un experimental devuelve algo invalido.
- `src/lib/provider-planning/registry.ts`: los providers actuales ahora quedan declarados explicitamente como `mode: "standard"`, `planner: "llm"` y `resolver: "typed"`, mientras la via experimental exige `customHandler`.
- `src/lib/provider-planning/registry.test.ts`: nueva cobertura para verificar que la registry enumera los providers soportados, que cada provider registrado pasa la validacion y referencia archivos de test existentes, y que un `customHandler` experimental invalido cae de forma segura a `respond`.

**Pendientes inmediatos:**
- Si entra un provider nuevo real, registrarlo en `src/lib/provider-planning/registry.ts` junto con su manifest/adapter/tests antes de exponerlo en runtime.
- Cuando aparezca el primer provider experimental real, conectar `executeExperimentalCustomHandler(...)` en su orquestador para que el guardrail de `ValidatedProviderDecision` quede aplicado tambien en runtime y no solo como utilidad compartida.

**Riesgos / bloqueos:**
- La registry nueva fija el contrato y el checklist de tests, pero todavia no hay un orquestador unico que consuma estas definiciones de punta a punta; hoy el enforcement fuerte vive en la capa compartida y en sus tests.
- `executeExperimentalCustomHandler(...)` hace fallback seguro a `respond`, pero no loguea ni emite eventos por si solo; el primer uso runtime deberia conectarlo con `ProviderEventSink` para observabilidad completa.

**Verificacion:**
- `npm.cmd run test:ts -- src/lib/provider-planning/registry.test.ts`
- `npm.cmd run typecheck`

### Sesion: Fase 3 adapter de planning contract para Google Calendar

**Objetivo:** conectar el planner legacy de Google Calendar al contrato estandar de provider planning sin reescribir el planner actual ni romper el orquestador existente.

**Cambios implementados:**
- `src/lib/provider-planning/calendar-manifest.ts`: nuevo manifiesto estatico para `google_calendar`, con denylist vacia, `resolverCapabilities` derivadas de las read actions habilitadas, politica de confianza `0.5/0.7`, review-before-approval, budget `{ check: 1, list: 1, write: 2 }`, `maxTotalUnits = 6`, `maxDepth = 3` y modelo planner `claude-haiku-4-5-20251001`.
- `src/lib/provider-planning/calendar-adapter.ts`: nuevo adapter puro que mapea `GoogleCalendarPlannerDecision -> PlannerRawOutput`, corre `runDecisionPipeline(...)`, emite lifecycle events y vuelve a mapear `ValidatedProviderDecision -> GoogleCalendarPlannerDecision`.
- `src/lib/provider-planning/calendar-adapter.ts`: para `missing_data`, el adapter usa una accion permitida de fallback solo para que el pipeline estandar pueda devolver `clarify`; hoy el planner legacy de Calendar no incluye `candidateAction` en ese branch.
- `src/lib/provider-planning/calendar-adapter.test.ts`: nueva cobertura para `read`, `approval_ready`, `respond`, `clarify`, backward compatibility de `read/approval_ready`, accion no permitida que cae en `respond` y eventos `planning_started/pipeline_validated`.
- `src/lib/workflows/action-matrix.ts`: no requirio cambio en esta sesion porque `check_availability` y `list_events` ya estaban registradas como `read` en el workspace actual.

**Pendientes inmediatos:**
- Cablear este adapter dentro del orquestador/planner de Calendar cuando toque la fase de integracion runtime, para que la ruta de chat use el contrato estandar.
- Evaluar si conviene enriquecer el planner legacy para que `missing_data` preserve tambien la accion candidata y asi eliminar el fallback interno del adapter.

**Riesgos / bloqueos:**
- El mapper backward-compatible puede reconstruir el payload completo solo cuando recibe `fallbackInput`; sin esa pista preserva de forma segura `action` y `requiresConfirmation`, suficiente para esta fase de contrato pero no para una integracion runtime completa.
- `missing_data` sigue viniendo del planner legacy sin accion candidata. El fallback actual mantiene el pipeline deterministico y los tests verdes, pero a futuro convendria exponer esa intencion de forma explicita en el planner.

**Verificacion:**
- `npm.cmd run test:ts -- src/lib/provider-planning/calendar-adapter.test.ts`
- `npm.cmd run test:ts -- src/lib/provider-planning/decision-pipeline.test.ts`
- `npm.cmd run test:ts -- src/lib/provider-planning/salesforce-adapter.test.ts`
- `npm.cmd run test:ts -- src/lib/provider-planning/gmail-adapter.test.ts`
- `npm.cmd run typecheck`

### Sesion: Gmail planner libre con resolucion efimera y forms prellenados

**Objetivo:** evolucionar Gmail desde el extractor cerrado actual a un planner estructurado capaz de interpretar requests abiertas, resolver contexto real de Gmail dentro del turno y terminar siempre en un form editable antes de approval para compose/send.

**Cambios implementados:**
- `src/lib/chat/gmail-intent-extractor.ts`: reemplazo del extractor chico por planner estructurado con contrato `goal/candidateAction/resolutionRequests/missingFields/confidence/policyFlags`, heuristicas locales para casos comunes y fallback a LiteLLM (`Haiku` primero, `Sonnet` solo para replanning con evidencia real).
- `src/lib/chat/google-gmail-tool-planner.ts`: Gmail ahora distingue entre `compose_candidate` y ejecucion final. Las requests abiertas de draft/send/reply ya no crean approval directa; preparan un compose parcial con referencias a resolver y los formularios enviados siguen materializando `write`/`write_standalone` tipadas.
- `src/lib/chat/google-gmail-tool-orchestrator.ts`: nueva capa de resolucion efimera dentro del turno para Gmail con scratchpad en memoria, budget cerrado (`1 search + 3 reads`), resolucion de `recent_thread`, `latest_external_sender` y `recent_sent_recipients`, prefill parcial seguro y apertura obligatoria de form antes de approval.
- `src/lib/integrations/google-gmail-agent-runtime.ts`: `search_threads` ahora pasa `query` a Gmail como `q` cuando corresponde, manteniendo el mismo primitive pero habilitando resoluciones reales sobre `in:sent` para destinatarios recientes.
- `src/lib/chat/interactive-markers.ts`, `src/components/chat/dynamic-chat-form-card.tsx`, `src/components/chat/message-list.tsx` y `src/components/chat/chat-window.tsx`: soporte nuevo para forms estructurados `FORM_DATA` con `initialValues` y `fieldUi`, incluyendo campos `hidden/readOnly` para ids internos y submit compatible con el flujo actual.
- `src/lib/chat/chat-form-server.ts`: `pending_chat_form` ya no se limpia automaticamente en el refresh del rail, para que el estado minimo del form siga disponible mientras el usuario lo edita.
- Cobertura actualizada en `src/lib/chat/interactive-markers.test.ts`, `src/lib/chat/google-gmail-tool-planner.test.ts` y `src/lib/chat/google-gmail-tool-orchestrator.test.ts` para markers estructurados, compose abierto (`ultimos 5 destinatarios`) y el nuevo split `compose form -> approval`.

**Pendientes inmediatos:**
- Validar manualmente en una cuenta Gmail real los tres caminos nuevos: `ultima persona que me escribio`, `ultimos 5 destinatarios` y `ultima conversacion`, incluyendo prefill parcial y clarificaciones.
- Completar la policy layer hibrida con mensajes/flags mas uniformes si el producto quiere exponer `policyFlags` tambien en UX, no solo usarlos internamente para denylist.
- Si la UX lo necesita, conectar `pending_chat_form` a una superficie server-driven adicional; hoy el form ya persiste en metadata minima, pero el render visible sigue dependiendo del marker en el mensaje.

**Riesgos / bloqueos:**
- `search_threads` seguia siendo originalmente inbox-biased; aunque ahora soporta `q`, la calidad final de resolucion para `in:sent` depende de QA real con cuentas Gmail conectadas.
- La resolucion de destinatarios recientes falla cerrado por budget. Si 3 lecturas no alcanzan para los 5 unicos pedidos, el sistema prellena parcial y avisa, pero no sigue expandiendo el plan.
- El scratchpad rico vive solo en memoria del turno. Si mas adelante se quiere rehidratar resolucion compleja despues de reload/navegacion, hara falta decidir si `pending_chat_form` debe cargar tambien evidencia resumida.

**Verificacion:**
- `npm.cmd run test:ts -- src/lib/chat/interactive-markers.test.ts`
- `npm.cmd run test:ts -- src/lib/chat/google-gmail-tool-planner.test.ts`
- `npm.cmd run test:ts -- src/lib/chat/google-gmail-tool-orchestrator.test.ts`
- `npm.cmd run typecheck`

### Sesion: Gmail adjuntos con bucket real y guardrail tenant-safe

**Objetivo:** destrabar el envio de emails con archivos adjuntos en Gmail corrigiendo la causa operativa del bucket faltante y endureciendo el runtime para no aceptar paths de otra organizacion.

**Cambios implementados:**
- `supabase/migrations/20260315113000_create_chat_attachments_bucket.sql`: nueva migracion revisable para crear el bucket privado `chat-attachments` con limite de 5MB y MIME types permitidos; antes solo existia como SQL suelto en `supabase-blocks`.
- `src/app/api/upload/chat-attachments/route.ts`: ahora detecta explicitamente el caso `bucket not found` y devuelve un error claro en vez de un 500 generico al subir adjuntos.
- `src/lib/integrations/google-gmail-agent-runtime.ts`: validacion nueva `assertAttachmentPathsBelongToOrganization(...)` para exigir que cada `attachmentPath` empiece con `organizationId/` antes de descargar con `service_role`, cerrando leakage cross-tenant por payload editado o input malicioso.
- `src/lib/integrations/google-gmail-agent-runtime.ts`: la descarga de adjuntos tambien detecta el bucket faltante y devuelve un mensaje operativo explicito para Gmail cuando el storage no esta provisionado.
- `src/lib/integrations/google-gmail-agent-runtime.ts`: el armado MIME para adjuntos se endurecio a `multipart/mixed` mas RFC-safe, con cuerpo `text/plain` en base64, filenames saneados y cierre de boundary explicito para reducir el riesgo de que Gmail acepte el mail pero ignore el attachment.
- `src/lib/integrations/google-gmail-agent-runtime.ts`: el runtime de writes Gmail ahora deja trazabilidad explicita de adjuntos (`attachmentCount`, `attachmentFileNames`) en `output_payload` y loguea `gmail.write_action.attachments_ready` justo antes del send/draft para diagnosticar si el worker realmente descargo e incluyo los archivos.
- `src/lib/integrations/google-gmail-agent-runtime.test.ts`: nueva cobertura para la validacion de ownership de adjuntos por organizacion.
- `src/lib/integrations/google-gmail-agent-runtime.test.ts`: nueva cobertura para verificar que el `raw` de emails nuevos y replies con adjunto realmente incluya la parte `multipart/mixed` y el `filename` esperado.
- `package.json` y `scripts/worker-service.ts`: el worker local ahora carga `.env.local` y usa `PORT=3001` por default, evitando el doble bloqueo que hacia que `npm run worker` fallara por env faltante y luego por choque con `next dev` en `3000`.

**Pendientes inmediatos:**
- Aplicar la nueva migracion en el entorno Supabase donde se esta probando Gmail para que el bucket quede creado de verdad.
- Revalidar en vivo un `send_email` o `send_reply` con adjunto real una vez aplicada la migracion.

**Riesgos / bloqueos:**
- Sin aplicar la migracion al entorno real, el repo ya queda corregido pero los uploads de adjuntos seguiran fallando por infraestructura faltante.
- La verificacion siguio siendo local; falta QA real en Gmail para confirmar entrega visual final del adjunto en inbox/sent.

**Verificacion:**
- `npm.cmd run test:ts -- src/lib/integrations/google-gmail-agent-runtime.test.ts`
- `npm.cmd run test:ts -- src/lib/chat/google-gmail-tool-orchestrator.test.ts`
- `npm.cmd run test:ts -- src/lib/chat/google-gmail-tool-planner.test.ts`
- `npm.cmd run typecheck`

### Sesion: Gmail preserva links y adjuntos enviados desde forms del chat

**Objetivo:** corregir el caso donde un email iniciado desde el chat con `links` y `attachments` en el form terminaba enviando solo el cuerpo, perdiendo tanto el link agregado como el adjunto subido.

**Cambios implementados:**
- `src/components/chat/chat-window.tsx` ahora serializa los campos `file` usando las rutas reales devueltas por `/api/upload/chat-attachments` en vez de mezclar metadata local + paths duplicados.
- `src/lib/chat/interactive-markers.ts` permite priorizar valores de archivo ya subidos al construir el mensaje estructurado que recibe el planner.
- `src/lib/chat/google-gmail-tool-planner.ts` ahora propaga `links` y `attachmentPaths` tambien en el camino reply (`create_draft_reply` / `send_reply`) cuando los datos entran por form.
- `src/lib/chat/google-gmail-tool-orchestrator.ts` conserva esos mismos campos al resolver `thread_id/message_id` antes de crear la approval, evitando que se pierdan entre planner y workflow payload.
- Se agrego cobertura en `interactive-markers`, `google-gmail-tool-planner` y `google-gmail-tool-orchestrator` para validar que links y adjuntos sobreviven desde el form hasta el payload final de Gmail.

**Pendientes inmediatos:**
- Validar manualmente en un agente web con cuenta Gmail real que el destinatario reciba tanto el link agregado al body como el archivo adjunto en `send_email` y `send_reply`.

**Riesgos / bloqueos:**
- La verificacion quedo local y tipada; todavia falta QA vivo contra Gmail real para confirmar el comportamiento visual final en inbox/sent.

**Verificacion:**
- `npm.cmd run test:ts -- src/lib/chat/interactive-markers.test.ts`
- `npm.cmd run test:ts -- src/lib/chat/google-gmail-tool-planner.test.ts`
- `npm.cmd run test:ts -- src/lib/chat/google-gmail-tool-orchestrator.test.ts`
- `npm.cmd run typecheck`

---

### Sesion: Gmail distingue mejor borrador nuevo vs reply

**Objetivo:** corregir el caso deployado donde un pedido de borrador nuevo en Gmail respondia erroneamente `Primero necesito leer el hilo real de Gmail...` aunque no habia ningun hilo a responder.

**Cambios implementados:**
- `src/lib/chat/google-gmail-tool-planner.ts`: nuevo detector `isStandaloneComposeIntent(...)` para tratar mensajes de composicion (`email/mail/correo/gmail`) sin contexto de reply ni hilo reciente como `email nuevo`, incluso si todavia no traen destinatario.
- `src/lib/chat/google-gmail-tool-planner.ts`: la deteccion de standalone ya no depende solo de emails explicitos o del clasificador LLM; ahora evita caer en la rama de `reply` cuando el usuario esta intentando redactar un correo nuevo incompleto.
- `src/lib/chat/google-gmail-tool-planner.test.ts`: nueva cobertura para `creame un borrador en Gmail que diga "Hola Agente"` verificando que el planner responda `missing_data` pidiendo destinatario/email en vez de `thread_id`.

**Pendientes inmediatos:**
- Desplegar este cambio y revalidar en el agente web productivo el prompt corto de borrador nuevo.
- Si aparece otro phrasing ambiguo, ampliar los tests con variantes como `redacta un mail` o `prepara un correo`.

**Riesgos / bloqueos:**
- El comportamiento sigue siendo conservador cuando ya existe `recent_crm_tool_context` de Gmail: pedidos cortos como `crea un borrador que diga "Hola"` seguiran interpretandose como reply al hilo reciente, que hoy es la semantica cubierta por tests.

**Verificacion:**
- `npm.cmd run test:ts -- src/lib/chat/google-gmail-tool-planner.test.ts`
- `npm.cmd run typecheck`

---

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
- Seguir afinando keywords de clasificacion conversacional para casos mixtos o resÃºmenes demasiado neutros, donde el enforcement aun puede caer en `operations` o dejar pasar ambigÃ¼edad.

**Riesgos / bloqueos:**
- Gmail y Calendar quedaron mejor cubiertos para summaries explicitos, pero siguen sin tener un mapping 100% duro por accion porque varias mutaciones pueden pertenecer a scopes distintos segun el contexto del negocio.
- El gate sigue siendo conservador: cuando las seÃ±ales empatan o son muy vagas, no fuerza un rechazo automatico solo con estos hints y todavia depende del clasificador general.

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
- Decidir si en una fase posterior conviene eliminar tambien la posibilidad de persistir prompts custom desalineados para agentes scope-managed, en vez de solo seÃ±alarlos y ofrecer volver al compilado.

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

**Estado:** Se completÃ³ el retiro real de HubSpot en runtime, tooling y schema operativo.

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

**Fase 1 â€” Desacoplamiento de templates**
- `src/lib/chat/quick-actions.ts`: `ChatQuickActionProvider` ampliado a `"gmail" | "google_calendar" | "whatsapp"`; `isCrmChat` â†’ `hasConnectedIntegrations`; `provider` singular â†’ `providers[]` plural. Todos los callers actualizados.
- `src/lib/chat/starter-intents.ts`: Eliminados catÃ¡logos por template (`SALESFORCE_STARTER_INTENT_CATALOG_BY_TEMPLATE`, `HUBSPOT_STARTER_INTENT_CATALOG_BY_TEMPLATE`). Nuevo `STARTER_INTENTS_BY_INTEGRATION` con entradas para Salesforce, HubSpot, Gmail y Google Calendar. `resolveInitialChatStarterIntents` ahora itera sobre `setupState.integrations`.
- `src/lib/chat/quick-actions-server.ts`: `resolveChatQuickActions` ya no lee `template_id`; itera sobre `setupState.integrations` y resuelve quick actions por integraciÃ³n conectada. Soporte nativo para Gmail y Google Calendar.
- `src/lib/agents/n8n-workflow-selector.ts`: Eliminada referencia a `template_id === "whatsapp_reminder_follow_up"`; Gmail/Google Calendar ya suman `wOAuthTokenRefresh` cuando aplica.
- `src/lib/chat/quick-actions.test.ts`: Test actualizado para usar setup states con integrations explÃ­citas en vez de templateId.

**Fase 2 â€” Sistema de Automatizaciones**
- `supabase-blocks/15-agent-automations.sql`: MigraciÃ³n SQL para tabla `agent_automations` con RLS, Ã­ndices y trigger de `updated_at`. Pendiente ejecutar en Supabase.
- `src/lib/db/agent-automations.ts`: CRUD completo (list, get, create, update, soft-delete). Funciones worker usan `createServiceSupabaseClient`.
- `src/lib/agents/automation-suggestions.ts`: Pure function `getAutomationSuggestions(integrations)` con 8 sugerencias predefinidas por combinaciÃ³n de integraciones.
- `src/app/api/agents/[agentId]/automations/route.ts`: GET + POST automations.
- `src/app/api/agents/[agentId]/automations/[automationId]/route.ts`: PATCH + DELETE (soft delete).
- `src/app/api/agents/[agentId]/automations/recommended/route.ts`: GET sugerencias por integraciÃ³n del agente.
- `src/app/api/workers/automations/route.ts`: Worker que evalÃºa automatizaciones con `trigger_type = 'schedule'` y encola eventos en `event_queue`.
- `src/lib/utils/cron-matcher.ts`: Evaluador de expresiones cron 5 campos sin dependencias externas. Soporta `*`, valores simples, listas, rangos y pasos.
- `src/components/agents/automations/automation-list.tsx`: Lista de automatizaciones con toggle enable/disable y secciÃ³n de sugerencias. Se auto-carga via fetch.
- `src/components/agents/automations/automation-modal.tsx`: Modal 3 pasos (Trigger â†’ AcciÃ³n â†’ Revisar) para crear automatizaciones cron.
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
- `src/lib/chat/google-gmail-tool-planner.ts` ahora consulta un clasificador pequeÃ±o con Haiku antes del fallback regex para detectar mejor intents cortos como `crea un borrador que diga "Hola"`; el orquestador de Gmail ya espera el planner async y la cobertura de tests se ampliÃ³ para ese caso breve con contexto reciente de hilo.
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
- Se agrego `src/lib/workflows/compensation.ts` como ejecutor server-side de compensaciones y `src/lib/workflows/approval-request.ts` ahora declara `compensation_action` cuando la write tiene una reversiÃ³n segura conocida.
- HubSpot y Salesforce sumaron compensaciones iniciales reales para `create_contact` y `create_task`: HubSpot archiva el objeto creado y Salesforce lo elimina; `create_lead`, `create_case`, `create_deal` y writes equivalentes siguen cayendo en reparacion manual.
- `src/lib/workflows/execution.ts` y `src/lib/db/approval-items.ts` ahora disparan compensaciÃ³n tanto en fallos de ejecuciÃ³n como en rechazos/expiraciones de approval cuando el run ya tenia side effects previos.
- La trazabilidad de compensaciÃ³n queda persistida por step dentro de `output_payload.compensation` con `action`, `status`, `startedAt`, `finishedAt`, `providerRequestKey` y resultado/error, ademÃ¡s de `compensation_status`.
- `src/lib/integrations/google-agent-tools.ts` ya define contratos de write para Calendar, `src/lib/integrations/google-calendar-agent-runtime.ts` ejecuta mutaciones reales sobre `primary`, y `src/lib/workflows/execution.ts` ya soporta `provider = google_calendar` dentro de `workflow.step.execute`.
- El contrato de compensaciÃ³n ahora reconoce `google_calendar:create_event` como reversible y `src/lib/workflows/compensation.ts` puede cancelar el evento creado cuando un step requerido posterior falla.
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
- DiseÃ±ar la `approval inbox` web y el badge/counter de pendientes reutilizando el shell actual, pero con modelo propio y sin depender solo de `notifications`.
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
- La trazabilidad temporal de compensaciÃ³n se persiste dentro de `output_payload.compensation` porque el schema actual no tiene columnas dedicadas para timestamps de compensaciÃ³n; si esa data necesita consulta SQL directa, hara falta migracion futura.
- El review clasifica acciones en automaticas vs escritura usando heuristicas por nombre de tool (`search/read/list/check/get`); alcanza para UX inicial, pero no reemplaza una matriz formal por accion.
- El wizard ahora bloquea la creacion si una integracion requerida no figura operativa, pero no crea todavia una experiencia de "guardar como draft incompleto" diferenciada para workflows con requeridas faltantes.
- `npm.cmd run build` falla en este entorno con `spawn EPERM`, asi que no quedo verificada la build de Next end-to-end.
- La ejecucion directa de `node src/...test.ts` sigue fallando por resolucion ESM/path aliases del repo; usar `npm.cmd run test:ts -- <archivo>` o `npm.cmd run test:google-calendar`.
- Gmail sigue siendo metadata-only para lectura: `search_threads` continua filtrando localmente sobre hilos recientes y `read_thread` no expone body completo ni HTML, aunque ahora la misma superficie tambien soporte writes asistidas.
- El rail web de Gmail ya quedo centrado en `provider-planning`, pero aun falta QA vivo contra una cuenta real para confirmar que el planner raw simplificado conserva el comportamiento esperado fuera del entorno local.
- El cierre operativo de Gmail v1.5 ya quedo implementado y verificado localmente, pero todavia falta QA vivo contra una cuenta real para confirmar scopes, labels existentes y comportamiento visual real de drafts/archivado en Gmail.
- El planner de fechas relativas cubre v1 (`hoy`, `manana`, `pasado manana`, `esta semana`, weekdays, ISO date, `despues de eso`), pero no lenguaje temporal mas complejo.
- La deteccion de timezone desde Google se hace best-effort: si Google devuelve valores invalidos o falla la consulta, se conserva el fallback actual sin bloquear el runtime.

## Comandos de verificacion conocidos

- `npm.cmd run lint`
- `npm.cmd run typecheck`
- `npm.cmd run test:ts -- src/lib/provider-planning/gmail-resolver.test.ts`
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
## Snapshot sesion 2026-03-16 - Google Sheets shared surface v1 en progreso

- Estado actual: Google Sheets ya quedo cableado como tercera surface compartida de `google` en scopes, settings, wizard, detalle del agente, tooling, runtime server-side, planner/orchestrator de chat y parte del orquestador unificado; faltaba cerrar los puntos async/contractuales y esta sesion los avanzo.
- Ultimos cambios relevantes:
  - `src/lib/integrations/google-scopes.ts`, `src/lib/integrations/google.ts`, `src/lib/integrations/google-workspace.ts`: nueva surface `google_sheets`, scope requerido de Sheets y soporte de request/runtime compartido sin nuevos secretos ni nueva fila `integrations`.
  - `supabase/migrations/20260316090000_add_google_sheets_agent_tool_type.sql`: corrige el drift real del repo para que `agent_tools.tool_type` acepte `google_sheets`.
  - `src/lib/integrations/google-agent-tools.ts`, `src/lib/integrations/google-agent-runtime.ts`, `src/lib/integrations/google-agent-tool-selection.ts`, `src/lib/integrations/google-sheets-agent-runtime.ts`: contratos, diagnosticos y runtime tipado para `list_sheets`, `read_range`, `append_rows`, `update_range`, `clear_range`, con normalizacion de URL/ID, limites v1 y writes siempre mediadas por approval.
  - `src/lib/agents/google-sheets-agent-integration.ts`, `src/lib/agents/wizard-integrations.ts`, `src/lib/agents/agent-setup.ts`, `src/app/api/agents/route.ts`, `src/app/api/agents/[agentId]/tools/route.ts`: setup/checklist/tooling del agente ya reconoce `google_sheets` como integracion separada sobre la misma conexion org-level `google`.
  - `src/components/settings/google-workspace-connection-form.tsx`, `src/app/(app)/settings/integrations/page.tsx`, `src/components/agents/google-sheets-agent-tools-panel.tsx`, `src/components/agents/agent-detail-config-panel.tsx`, `src/components/agents/agent-detail-workspace.tsx`, `src/app/(app)/agents/[agentId]/page.tsx`, `src/components/agents/wizard/agent-creation-wizard.tsx`: UI de Settings, wizard y detalle de agente ya muestra Sheets con notice, estado operativo y panel de tool alineado con Gmail/Calendar.
  - `src/lib/chat/google-sheets-tool-planner.ts`, `src/lib/chat/google-sheets-tool-orchestrator.ts`, `src/lib/provider-planning/sheets-manifest.ts`, `src/lib/provider-planning/sheets-adapter.ts`, `src/lib/provider-planning/registry.ts`, `src/lib/provider-planning/unified-orchestrator.ts`, `src/app/api/chat/route.ts`: lectura directa en chat, clarificaciones por faltantes, approval inbox para writes y registro del provider `google_sheets` en el planning/orchestration unificado.
  - `src/lib/workflows/action-matrix.ts`, `src/lib/workflows/execution.ts`, `src/app/api/agents/[agentId]/setup/route.ts`, `src/lib/provider-planning/execution-dispatcher.ts`, `src/lib/provider-planning/unified-orchestrator.test.ts`: cierre adicional para workflow async de Sheets, action matrix con scopes/limits/approval mode, setup PATCH del agente y test coverage del orchestrator unificado.
- Pendientes inmediatos:
  - Correr `npm.cmd run typecheck` y corregir cualquier error residual de compilacion introducido por `google_sheets`, especialmente en tests y en consumers del orchestrator unificado.
  - Revisar si hay mas superficies cerradas por enums/provider strings en approvals, dispatcher o tests de planner unificado que todavia no incluyan `google_sheets`.
  - Evaluar si hace falta sumar tests dedicados para runtime/orchestrator/action-matrix de Sheets mas alla de la cobertura del orchestrator unificado.
- Riesgos o bloqueos:
  - Esta slice toca varios puntos de contrato tipado; el mayor riesgo inmediato es TypeScript rojo por firmas parciales en tests/helpers auxiliares, no por un hueco funcional ya identificado.
  - No se agrego integracion con Google Drive ni resolucion por nombre de archivo; v1 sigue requiriendo URL o `spreadsheetId` explicito por request.
  - No se agregaron quick actions ni starter intents especificos para Sheets a proposito, para evitar prompts ambiguos sin spreadsheet fijo.
- Comandos de verificacion conocidos:
  - `npm.cmd run test:ts -- src/lib/provider-planning/unified-orchestrator.test.ts`
  - `npm.cmd run typecheck`

## Snapshot sesion 2026-03-16 - Diagnostico LiteLLM Anthropic billing

- Estado actual: el error de `claude-sonnet-4-6` no parece venir de cache local ni de estado viejo de la app; una llamada directa a LiteLLM local siguio devolviendo rechazo de billing desde Anthropic.
- Ultimos cambios relevantes:
  - No hubo cambios de codigo.
  - Se verifico `litellm_config.yaml`: `claude-sonnet-4-6` sigue mapeado a `anthropic/claude-sonnet-4-6` con `ANTHROPIC_API_KEY`.
  - Se reprobo la llamada directa a `http://localhost:4000/chat/completions` con `model=claude-sonnet-4-6`; Anthropic respondio `Your credit balance is too low to access the Anthropic API`.
- Pendientes inmediatos:
  - Confirmar en Anthropic Console que el credito cargado corresponde a la cuenta/workspace dueÃ±a de la `ANTHROPIC_API_KEY` usada por el proyecto.
  - Si el saldo ya figura correcto en Anthropic, reiniciar el contenedor `agentbuilder-litellm` y reintentar.
  - Si sigue fallando, validar si la carga fue para Claude app/subscription y no para Anthropic API credits.
- Riesgos o bloqueos:
  - No hubo acceso a `docker logs` ni `docker ps` por permisos locales del daemon, asi que el chequeo fino del contenedor quedo bloqueado desde sandbox.
  - El mensaje exacto viene del proveedor, asi que mientras Anthropic siga devolviendo billing no se resolvera solo desde la UI.
- Comandos de verificacion conocidos:
  - `Invoke-RestMethod -Method Post -Uri http://localhost:4000/chat/completions -Headers @{ Authorization = 'Bearer sk-agentbuilder-internal'; 'Content-Type' = 'application/json' } -Body '{"model":"claude-sonnet-4-6","messages":[{"role":"user","content":"Respond only with ok"}],"max_tokens":16}'`
## Snapshot sesion 2026-03-17 - Parte 6 cleanup final structure-first

- Estado actual: el repo retiro el soporte operativo a `remote_managed` / OpenAI Assistants, elimino los modulos legacy `declarative-chat-planner` y `calendar-intent-extractor`, y dejo el runtime estructurado como unico camino operativo soportado.
- Ultimos cambios relevantes:
  - `src/app/api/agents/route.ts` y `src/app/api/agents/[agentId]/route.ts`: se elimino la creacion/sync de assistants remotos; crear y editar agentes vuelve a ser estrictamente local + structured runtime.
  - `src/components/settings/integrations-accordion.tsx` y `src/app/(app)/settings/integrations/page.tsx`: se retiro la UI de OpenAI Assistants/importacion remota; Settings queda alineado con WhatsApp, Google Workspace y Salesforce.
  - `src/lib/agents/connection-policy.ts`, `src/app/api/chat/route.ts`, `src/lib/chat/chat-form-server.ts` y superficies QA/chat: desaparece la clasificacion `remote_managed`; el producto ya no bifurca por assistants remotos.
  - `supabase/migrations/20260317193000_retire_openai_assistants_runtime.sql`: migracion revisable que revoca integraciones OpenAI legacy, borra secretos/conexiones remotas y deja `agent_connections.provider_type` restringido a `whatsapp`.
- Pendientes inmediatos:
  - Actualizar referencias historicas en `PROGRESS_HISTORY.md` solo si hace falta para auditoria narrativa; el estado vivo ya quedo reflejado aqui.
  - Correr la migracion nueva en Supabase y regenerar tipos de DB si se quiere reflejar el nuevo constraint en `src/types/database.ts`.
- Riesgos o bloqueos:
  - Hasta regenerar tipos, `src/types/database.ts` puede seguir permitiendo shape historico de `agent_connections`, aunque la migracion nueva cierre el contrato real en DB.
  - `PROGRESS.md` y `PROGRESS_HISTORY.md` conservan menciones historicas al planner retirado; son contexto historico, no codigo activo.
- Comandos de verificacion conocidos:
  - `npm.cmd run test:ts -- src/lib/chat/declarative-capability-resolver.test.ts src/lib/chat/declarative-chat-read-engine.test.ts src/lib/llm/semantic-generation.test.ts`
  - `.\\node_modules\\.bin\\eslint.cmd src\\app\\api\\agents\\route.ts src\\app\\api\\agents\\[agentId]\\route.ts src\\app\\api\\chat\\route.ts src\\lib\\agents\\connection-policy.ts src\\components\\settings\\integrations-accordion.tsx "src\\app\\(app)\\settings\\integrations\\page.tsx" src\\components\\agents\\agent-form.tsx src\\components\\agents\\agent-detail-workspace.tsx src\\components\\agents\\agent-detail-workspace-main.tsx src\\components\\agents\\agent-form-summary.tsx src\\components\\agents\\agent-connection-panel.tsx src\\app\\api\\agents\\[agentId]\\qa\\route.ts src\\app\\api\\agents\\[agentId]\\qa\\proposal\\route.ts src\\app\\api\\agents\\[agentId]\\qa\\whatsapp-import\\route.ts src\\app\\api\\agents\\[agentId]\\qa\\whatsapp-source\\route.ts src\\lib\\chat\\chat-form-server.ts "src\\app\\(app)\\agents\\[agentId]\\chat\\page.tsx"`

## Snapshot sesion 2026-03-17 - Fix follow-up Gmail vs Sheets

- Estado actual: los follow-ups cortos y referenciales en chat ahora reutilizan el contexto conversacional reciente para resolver la surface correcta; un caso como `El ultimo que me enviaron` deja de desviarse a Google Sheets cuando la conversacion venia hablando de Gmail.
- Ultimos cambios relevantes:
  - `src/lib/chat/request-shaping.ts`: se agregaron heuristicas minimas de contexto para follow-ups referenciales sin cues explicitas, reutilizando los ultimos mensajes para desempatar la surface antes del runtime estructurado.
  - `src/lib/chat/request-shaping.test.ts`: nueva prueba que reproduce el caso de Gmail con ruido previo de `pending_chat_form` en Sheets y valida que quede seleccionado `gmail`.
  - `src/components/settings/integrations-accordion.tsx`: se corrigio una import faltante de `getMetadataString` que estaba rompiendo el `typecheck` global.
- Pendientes inmediatos:
  - Observar en QA si conviene extender la heuristica a otros follow-ups ambiguos multi-surface sin sobreactuar sobre contexto viejo.
- Riesgos o bloqueos:
  - La heuristica contextual se limita a mensajes recientes y solo entra cuando el turno actual es corto/referencial y no trae cues explicitas; si aparecen falsos positivos, el ajuste deberia ir por ponderacion, no por abrir mas surfaces.
- Comandos de verificacion conocidos:
  - `npm.cmd run test:ts -- src/lib/chat/request-shaping.test.ts`
  - `npm.cmd run typecheck`

## Snapshot sesion 2026-03-17 - Gap analysis runtime de agentes backend-first

- Estado actual: se relevo el repo contra la arquitectura objetivo de runtime backend-first con planner barato, acciones abstractas, execution graph, resolver engine y fallback LLM controlado. El repo ya tiene base util reutilizable (`src/lib/engine`, `src/lib/workflows`, `action-matrix`, approvals, allocator de budgets, provider gateway, audit/usage), pero todavia funciona como conjunto de slices verticales por provider/surface y no como runtime transversal por nodos con estados explicitos.
- Ultimos cambios relevantes:
  - No hubo cambios de producto ni runtime; la sesion fue de contraste tecnico/arquitectura.
  - Se confirmo que `src/lib/engine/types.ts` ya define contratos iniciales (`ActionPlan`, `ResolverResult`, `PolicyDecision`), pero siguen acoplados a `provider + action` concretos y a tipos de params todavia insuficientes para un runtime universal.
  - Se confirmo que `src/lib/engine/runtime.ts` ya provee un secuenciador generico por `steps`, pero no modela todavia node states explicitos (`success`, `retry`, `needs_llm`, `needs_user`, `failed`, `blocked`) ni reentry formal por nodo.
  - Se confirmo que `src/lib/chat/capability-graph.ts` y `src/lib/chat/declarative-chat-read-engine.ts` concentran mucha resolucion/planning de forma deterministica y provider-specific; esto sirve como baseline funcional, pero no reemplaza un resolver engine extensible por tipo (`entity`, `reference`, `time`, `computed`, `unknown`).
  - Se confirmo que `src/lib/engine/workflow-action-runtime.ts` + `src/lib/workflows/execution.ts` ya resuelven approval/workflow async con idempotencia, retries y compensacion inicial, pero el executor sigue seleccionado por provider concreto y no por accion abstracta + adapter registry.
  - Se confirmo que observabilidad/costos ya tienen piezas reales (`src/lib/engine/observability.ts`, `src/lib/db/usage-records.ts`, `src/lib/db/audit.ts`, stage timings en `/api/chat`), aunque falta trazabilidad uniforme por nodo/runtime event y pricing future-proof a nivel accion abstracta y fallback LLM.
- Pendientes inmediatos:
  - DiseÃ±ar y empezar una capa runtime nueva, transversal, sin romper slices actuales: action catalog abstracto, node registry, resolver engine, policy engine y adapter contracts.
  - Mantener el capability graph/runtime actual como compatibilidad mientras el nuevo runtime absorbe primero 2 o 3 acciones universales de punta a punta (`search_email`, `send_email`, `create_event` o equivalente).
  - Evitar abrir una abstraccion total de una vez: primero contratos y execution graph minimo viable; despues migracion incremental de providers.
- Riesgos o bloqueos:
  - El mayor riesgo no es tecnico sino de alcance: hoy el repo ya resuelve Gmail/Calendar/Sheets/Salesforce con contratos verticales; intentar reemplazar todo de golpe romperia paths reales ya verificados.
  - El capability graph actual usa heuristicas de texto y resolucion incrustada; mientras siga siendo el entrypoint principal, el objetivo de planner LLM chico + actions universales no queda cumplido.
  - `usage_records` y observabilidad actuales miden bastante bien chat/LLM, pero no estan todavia modelados como costo por nodo/resolver/fallback/side effect del runtime futuro.
- Comandos de verificacion conocidos:
  - No se corrieron comandos de verificacion nuevos en esta sesion; se hizo inspeccion de codigo y docs del repo.
## Snapshot sesion 2026-03-20 - Google Drive surface punto 1 (migracion SQL)

- Estado actual: quedo creada la migracion base para habilitar `google_drive` en `public.agent_tools.tool_type`. El resto del plan de Google Drive todavia no fue implementado en esta slice.
- Ultimos cambios relevantes:
  - Nueva migracion `supabase/migrations/20260320_add_google_drive_agent_tool_type.sql`.
  - La constraint `agent_tools_tool_type_check` ahora incluye `google_drive`, siguiendo el mismo patron ya usado para `google_sheets`.
- Pendientes inmediatos:
  - Correr la migracion en Supabase y verificar insert de `tool_type = 'google_drive'`.
  - Continuar con el punto 2 del plan: scopes y surface `google_drive` en `src/lib/integrations/google-scopes.ts`.
- Riesgos o bloqueos:
  - Esta sesion solo cubre el contrato de DB; sin los cambios de runtime/setup/UI, `google_drive` todavia no queda utilizable desde producto.
- Comandos de verificacion conocidos:
  - Aplicar la migracion SQL en Supabase.
  - Verificar manualmente un insert controlado en `public.agent_tools` con `tool_type = 'google_drive'`.
## Snapshot sesion 2026-03-20 - Google Drive surface punto 2 (scopes)

- Estado actual: `google_drive` ya existe como surface de Google en la capa de scopes. El sistema ahora conoce sus permisos requeridos (`drive.readonly` + `drive.file`) y puede pedir/verificar esos scopes igual que hace con Gmail, Calendar y Sheets.
- Ultimos cambios relevantes:
  - `src/lib/integrations/google-scopes.ts`: agregado `GOOGLE_DRIVE_REQUIRED_SCOPES`.
  - `src/lib/integrations/google-scopes.ts`: agregado `google_drive` a `GOOGLE_SURFACES` y por lo tanto al tipo `GoogleSurface`.
  - `src/lib/integrations/google-scopes.ts`: `getRequiredGoogleScopesForSurface()` ahora resuelve explicitamente el case `google_drive`.
  - `src/lib/integrations/google-gmail-config.test.ts`: nueva cobertura para validar los scopes requeridos de Drive.
- Pendientes inmediatos:
  - Continuar con el punto 3 del plan: acciones, config y schemas de `google_drive` en `src/lib/integrations/google-agent-tools.ts`.
  - Extender los consumers/UI que hoy asumen solo Gmail/Calendar/Sheets para exponer la nueva surface en settings, wizard y runtime.
- Riesgos o bloqueos:
  - Esta slice solo cubre el contrato de scopes; `google_drive` todavia no queda utilizable desde producto hasta completar tooling, runtime, setup y chat.
- Comandos de verificacion conocidos:
  - `npm.cmd run test:ts -- src/lib/integrations/google-gmail-config.test.ts`
## Snapshot sesion 2026-03-20 - Google Drive surface punto 3 (tool actions, config y schemas)

- Estado actual: `google_drive` ya quedo modelado en la capa de contratos de tooling. El repo ahora tiene acciones tipadas, config de agente, schemas Zod por accion, unions read/write, defaults y helpers de labels/descripciones para Drive. Todavia falta cablearlo en selection, runtime, tool definitions, setup, chat y UI.
- Ultimos cambios relevantes:
  - `src/lib/integrations/google-agent-tools.ts`: agregado `GOOGLE_DRIVE_TOOL_ACTIONS` con las 11 acciones planificadas (`search_files`, `list_folder`, `get_file_metadata`, `get_file_content`, `create_folder`, `move_file`, `rename_file`, `copy_file`, `share_file`, `trash_file`, `upload_file`).
  - `src/lib/integrations/google-agent-tools.ts`: agregados `GOOGLE_DRIVE_READ_TOOL_ACTIONS`, `GOOGLE_DRIVE_WRITE_TOOL_ACTIONS`, `GOOGLE_DRIVE_DESTRUCTIVE_TOOL_ACTIONS` y los tipos `GoogleDriveToolAction`, `GoogleDriveReadToolAction`, `GoogleDriveWriteToolAction`.
  - `src/lib/integrations/google-agent-tools.ts`: agregado `GoogleDriveAgentToolConfig`, `googleDriveAgentToolConfigSchema`, `getDefaultGoogleDriveAgentToolConfig()` y `parseGoogleDriveAgentToolConfig()`.
  - `src/lib/integrations/google-agent-tools.ts`: agregados schemas Zod por accion y las unions `executeGoogleDriveReadToolSchema` / `executeGoogleDriveWriteToolSchema`.
  - `src/lib/integrations/google-agent-tools.ts`: guardrails cerrados para Drive: `get_file_content` limita export MIME seguros y `maxBytes` hasta 500 KB; `upload_file` limita MIME textuales seguros y contenido hasta 1 MB; `search_files` y `list_folder` aceptan flags de shared drives.
  - Verificacion local: `cmd /c npm run typecheck` y `cmd /c npx eslint src/lib/integrations/google-agent-tools.ts` pasaron.
- Pendientes inmediatos:
  - Continuar con el punto 4 del plan: `src/lib/integrations/google-agent-tool-selection.ts` para detectar/configurar diagnosticos de `google_drive`.
  - Cablear luego estos schemas en `tool-definitions`, `tool-call-preparation`, `tool-executor` y el runtime Drive real.
- Riesgos o bloqueos:
  - En esta capa solo quedaron definidos los contratos; la confirmacion humana de `share_file` / `trash_file` y el fail-closed real por scopes/permisos de Google todavia dependen de las siguientes capas.
  - `drive.file` sigue siendo restrictivo por definicion: aunque la accion exista en schema, la ejecucion futura debe cerrar con error seguro si Google no permite operar sobre ese archivo.
- Comandos de verificacion conocidos:
  - `cmd /c npm run typecheck`
  - `cmd /c npx eslint src/lib/integrations/google-agent-tools.ts`
## Snapshot sesion 2026-03-20 - Google Drive surface punto 4 (tool selection)

- Estado actual: la capa de `google-agent-tool-selection` ya reconoce `google_drive` igual que Gmail, Calendar y Sheets. Ahora puede detectar tools Drive con config valida y calcular sus diagnosticos base para seleccionar la tool preferida, leer `allowed_actions` y marcar duplicados o desalineacion con la integracion activa.
- Ultimos cambios relevantes:
  - `src/lib/integrations/google-agent-tool-selection.ts`: agregado import de `parseGoogleDriveAgentToolConfig`.
  - `src/lib/integrations/google-agent-tool-selection.ts`: agregado `isGoogleDriveAgentTool()` para validar `tool_type = "google_drive"` con config parseable.
  - `src/lib/integrations/google-agent-tool-selection.ts`: agregado `getGoogleDriveAgentToolDiagnostics()` con el mismo shape de retorno que las otras surfaces (`selectedTool`, `selectedAllowedActions`, `hasDuplicateTools`, `hasMisalignedTools`).
  - Verificacion local: `cmd /c npx eslint src/lib/integrations/google-agent-tool-selection.ts` paso sin errores.
- Pendientes inmediatos:
  - Continuar con el punto 5 del plan: extender `src/lib/integrations/google-agent-runtime.ts` para soportar `google_drive` en policies, runtime selection y resolucion de config.
  - Cablear luego estos diagnosticos nuevos en los consumers de runtime y setup que hoy asumen solo Gmail/Calendar/Sheets.
- Riesgos o bloqueos:
  - Esta slice solo cubre la deteccion/seleccion de tools; Drive todavia no queda ejecutable hasta completar runtime, tool definitions, executor, setup, chat y UI.
  - Si algun consumer aun usa unions cerradas a tres surfaces, TypeScript o el runtime pueden seguir excluyendo Drive hasta el punto 5 en adelante.
- Comandos de verificacion conocidos:
  - `cmd /c npx eslint src/lib/integrations/google-agent-tool-selection.ts`
## Snapshot sesion 2026-03-20 - Google Drive surface punto 5 (agent runtime central)

- Estado actual: `src/lib/integrations/google-agent-runtime.ts` ya reconoce `google_drive` como cuarta surface Google. El runtime central ahora puede resolver diagnosticos, config tipada, policies y errores seguros de Drive igual que hace con Gmail, Calendar y Sheets.
- Ultimos cambios relevantes:
  - `src/lib/integrations/google-agent-runtime.ts`: agregado `GoogleDriveToolAction` y `GoogleDriveAgentToolConfig` a las unions centrales (`GoogleAgentAction`, `GoogleAgentRuntimeSuccess.config`).
  - `src/lib/integrations/google-agent-runtime.ts`: agregado `GOOGLE_DRIVE_ACTION_POLICIES`, usando `isGoogleDriveReadAction()` para derivar acceso `read/write`.
  - `src/lib/integrations/google-agent-runtime.ts`: `share_file` y `trash_file` quedaron marcadas con `requiresConfirmation = true`, y el resto de writes Drive tambien requiere confirmacion por policy.
  - `src/lib/integrations/google-agent-runtime.ts`: `getGoogleActionPolicy()` ahora tiene overload para `google_drive`.
  - `src/lib/integrations/google-agent-runtime.ts`: `buildActionPolicies()`, `getAllGoogleActionPolicies()`, `getGoogleAgentToolRuntime()` y `getGoogleAgentToolRuntimeWithServiceRole()` ya soportan `google_drive`.
  - `src/lib/integrations/google-agent-runtime.ts`: se factorizaron helpers internos para surface label, diagnosticos y parse de config, reduciendo ramas duplicadas al sumar Drive.
- Pendientes inmediatos:
  - Continuar con el punto 6 del plan: agregar `requestGoogleDriveUpload<T>()` en `src/lib/integrations/google.ts`.
  - Implementar luego el runtime real de Drive en `src/lib/integrations/google-drive-agent-runtime.ts` y cablearlo en `tool-definitions` / `tool-executor`.
- Riesgos o bloqueos:
  - Esta slice solo deja listo el runtime central de seleccion/policies; todavia no ejecuta acciones Drive reales hasta completar los puntos 6, 7, 9, 10 y 11.
  - La policy central exige confirmacion para writes Drive, pero el fail-closed real ante scopes/permisos de Google depende del ejecutor Drive pendiente.
- Comandos de verificacion conocidos:
  - `cmd /c npx eslint src/lib/integrations/google-agent-runtime.ts`
  - `cmd /c npm run typecheck`
## Snapshot sesion 2026-03-20 - Google Drive surface punto 6 (HTTP helper upload)

- Estado actual: `src/lib/integrations/google.ts` ya expone un helper dedicado para uploads de Google Drive. La base comun de integraciones Google ahora soporta tanto requests JSON a Drive como requests al upload endpoint `https://www.googleapis.com/upload/drive/v3` sin forzar `Content-Type: application/json`.
- Ultimos cambios relevantes:
  - `src/lib/integrations/google.ts`: agregado `GOOGLE_DRIVE_UPLOAD_API_BASE_URL`.
  - `src/lib/integrations/google.ts`: agregado `requestGoogleDriveUpload<T>()`, con el mismo contrato que los demas helpers (`accessToken`, `path`, `init`, `context`) y reutilizando `executeGoogleRequest`.
  - `requestGoogleDriveUpload<T>()` conserva el header `Authorization` pero deja que el caller defina `Content-Type`, necesario para multipart uploads de Drive.
- Pendientes inmediatos:
  - Continuar con el punto 7 del plan: implementar `src/lib/integrations/google-drive-agent-runtime.ts`.
  - Cablear luego el runtime Drive en `tool-definitions`, `tool-call-preparation` y `tool-executor`.
- Riesgos o bloqueos:
  - Esta slice solo agrega el helper HTTP; todavia no existe la ejecucion real de `upload_file` ni el fail-closed final por scopes/permisos de Google.
- Comandos de verificacion conocidos:
  - `cmd /c npx eslint src/lib/integrations/google.ts`
  - `cmd /c npm run typecheck`
