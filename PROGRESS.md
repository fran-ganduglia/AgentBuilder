## 2026-03-08

- Se agrego verificacion server-side contra contrasenas comprometidas usando el modelo k-anonymity de Pwned Passwords en auth/register y auth/reset-password, sin enviar la contrasena completa a terceros.
- Si la contrasena aparece en filtraciones conocidas, ahora el registro y el cambio de contrasena responden con un rechazo explicito para obligar a elegir una clave no comprometida.
- Se elimino la carpeta temporal .next-stale-20260308-145939 para no contaminar lint con artefactos obsoletos.
- Verificacion completada: npm.cmd run typecheck, npm.cmd run lint y npm.cmd run build OK.

## 2026-03-08

- Se aislo una carpeta .next inconsistente en .next-stale-20260308-145939 y se regenero un build limpio para corregir un runtime mezclado que intentaba cargar chunks inexistentes/obsoletos en login y home.
- Verificacion completada tras limpiar artefactos: npm.cmd run build OK.

## 2026-03-08

- Se corrigio el runtime de autenticacion en Route Handlers creando src/lib/supabase/route.ts para aplicar cookies de Supabase sobre el NextResponse final en login, logout y reset-password.
- /api/auth/login ahora captura errores no controlados y deja trazas seguras de auth.login.unhandled_error en lugar de responder con un 500 opaco.
- Verificacion completada tras el fix: npm.cmd run typecheck, npm.cmd run lint y npm.cmd run build OK.

## 2026-03-08

- Se corrigio el acceso desde la landing y las paginas auth para que una sesion previa no redirija automaticamente a dashboard; ahora /login y /register piden confirmacion explicita o cierre de sesion si habia una cuenta activa.
- Se creo /api/auth/login con validacion same-origin + JSON, rate limit por IP y sanitizacion compartida para centralizar el inicio de sesion en servidor.
- Se unificaron reglas de credenciales en src/lib/auth/credentials.ts: sanitizacion de email/nombres, politica de contrasenas fuertes (minimo 15 caracteres, bloqueo de claves comunes y datos obvios) y reutilizacion en register, login, forgot-password y reset-password.
- Verificacion completada: npm.cmd run typecheck y npm.cmd run lint OK.

## 2026-03-08

- Se implemento el aislamiento de conversaciones por usuario usando conversations.initiated_by en chat page, DB helpers y /api/chat.
- El reset de contrasena ahora valida same-origin + JSON, usa la sesion/cookies del recovery flow en el PATCH y el formulario cliente inicializa la sesion desde code, token_hash o access_token del enlace.
- El worker de deletion_requests ahora procesa solo filas efectivamente reclamadas y el deletion processor paso a soft delete para users, agents, agent_documents y organizations, manteniendo solo limpieza derivada segura.
- Se unifico validacion de mutaciones JSON/same-origin en request-security.ts y se aplico en auth/register, auth/logout, organizations y agents/[agentId].
- Verificacion completada: npm run lint y npm run typecheck OK.
## 2026-03-08

- Se realizo una code review del repo contra CLAUDE.md sin cambios funcionales.
- Hallazgos principales: el chat reutiliza conversaciones activas por agente a nivel organizacion en lugar de por usuario, el reset de contrasena PATCH usa un cliente service_role sin sesion de recovery, y el worker de deletion_requests mezcla hard deletes con un claim no atomico.
- Tambien se detectaron desalineaciones menores en validaciones de mutaciones (CSRF/content-type) frente a las reglas documentadas.
## 2026-03-08 ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â Workers + Observability + MVP Essentials

### Fase 1: Workers Asincronos
- CREAR src/lib/workers/auth.ts: validateCronRequest() valida CRON_SECRET en header Authorization.
- CREAR src/lib/workers/event-queue.ts: claimEvents(), markDone(), markFailed() via service_role con lock optimista.
- CREAR src/lib/workers/text-chunker.ts: chunkText() ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â funcion pura que divide texto en chunks ~500 tokens con ~50 overlap.
- CREAR src/lib/workers/text-extractor.ts: extractText() ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â soporta .txt/.md/.csv directo, .pdf via pdf-parse, .docx via mammoth.
- CREAR src/lib/workers/rag-processor.ts: orquesta descarga desde Storage ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ extraccion ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ chunking ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ embeddings ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ INSERT document_chunks ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ UPDATE agent_documents status.
- CREAR src/lib/workers/webhook-crypto.ts: signPayload() con HMAC-SHA256, decryptWebhookSecret() via RPC.
- CREAR src/lib/workers/webhook-deliverer.ts: entrega webhooks con firma, retry con backoff exponencial, INSERT webhook_deliveries.
- CREAR src/lib/workers/deletion-processor.ts: hard delete por entity_type (user/conversation/agent/org) con orden correcto de dependencias.
- CREAR src/app/api/workers/rag/route.ts: POST, valida cron, reclama eventos document.uploaded, procesa batch de 5.
- CREAR src/app/api/workers/webhooks/route.ts: POST, valida cron, reclama eventos de webhook, entrega batch de 5.
- CREAR src/app/api/workers/deletion/route.ts: POST, valida cron, procesa deletion_requests pendientes.
- CREAR vercel.json: cron jobs para rag (cada minuto), webhooks (cada minuto), deletion (cada 5 min).
- Deps nuevas: pdf-parse, mammoth (justificadas para formatos PDF y DOCX).
- CRON_SECRET agregado a env.ts y .env.local.example.

### Fase 2: Observability
- CREAR src/app/api/usage/route.ts: GET uso org actual.
- CREAR src/app/api/usage/history/route.ts: GET tendencias mensuales (max 12 meses).
- CREAR src/app/api/usage/agents/route.ts: GET desglose por agente.
- AGREGAR getAllAgentsUsage() en src/lib/db/usage.ts: uso por agente con latencia promedio.
- CREAR src/app/(app)/usage/page.tsx: pagina dedicada de observability (admin only).
- CREAR src/components/usage/usage-summary-cards.tsx: mensajes, tokens, costo, progreso de plan.
- CREAR src/components/usage/agent-usage-table.tsx: tabla por agente con mensajes, tokens, costo, latencia.
- CREAR src/components/usage/usage-trend-chart.tsx: chart SVG simple de barras sin dependencias externas.
- CREAR src/components/usage/plan-limit-banner.tsx: banner reutilizable 80%/100% con link a billing.
- Sidebar actualizado con link "Uso" (admin only).

### Fase 3: MVP Essentials
- CREAR src/app/(auth)/forgot-password/page.tsx + forgot-password-form.tsx: solicitud de reset.
- CREAR src/app/api/auth/reset-password/route.ts: POST para solicitar, PATCH para actualizar, rate limit 5/hora.
- CREAR src/app/(auth)/reset-password/page.tsx + reset-password-form.tsx: formulario de nueva contrasena.
- CREAR src/app/(app)/settings/page.tsx: nombre org editable, info de plan, fecha trial.
- CREAR src/components/settings/organization-form.tsx: form de edicion de nombre con toast.
- CREAR src/app/api/organizations/route.ts: PATCH nombre, admin only, audit log, origin validation.
- CREAR src/app/(app)/settings/billing/page.tsx: plan actual, uso vs limites, comparacion de planes.
- CREAR src/components/settings/plan-comparison.tsx: tabla comparativa de planes con indicador "Actual".
- CREAR src/app/not-found.tsx: 404 con link a dashboard.
- CREAR src/app/error.tsx: error boundary global con boton reintentar.
- CREAR src/app/(app)/unauthorized/page.tsx: acceso denegado por rol.
- CREAR src/components/ui/skeleton.tsx: componente base reutilizable para loading states.
- CREAR loading.tsx para: dashboard, agents, agents/[agentId], agents/[agentId]/chat, usage.
- CREAR src/components/ui/toast.tsx + toast-provider.tsx: toasts con auto-dismiss, tipos success/error/info.
- CREAR src/lib/hooks/use-toast.ts: hook useToast() con context.
- ToastProvider integrado en src/app/(app)/layout.tsx.
- Sidebar actualizado: responsive con hamburger menu mobile, links Uso y Configuracion.

### Verificacion
- npm run typecheck: 0 errores.
- npm run lint: 0 errores.
- npm run build: exitoso, todas las rutas generadas correctamente.

## 2026-03-08

- Completado Milestone 1 ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â Agent Runtime: implementados los 11 items faltantes de la auditoria.
- CREAR src/lib/utils/errors.ts: clase AppError con tipos, factory createAppError y helper toErrorResponse.
- CREAR src/lib/db/audit.ts: insertAuditLog() via service_role, non-fatal (nunca rompe flujos).
- CREAR src/lib/db/usage-writer.ts: recordUsage() que upsertea usage_records por org+agent+periodo mensual.
- CREAR src/lib/db/notifications-writer.ts: insertPlanLimitNotification() con deduplicacion mensual (80% y 100%).
- FIX CRITICO #1: /api/chat ahora llama recordUsage() e insertPlanLimitNotification() en onComplete.
- FIX CRITICO #3: /api/chat verifica user_agent_permissions para roles operador y viewer antes de permitir chat.
- FIX CRITICO #2 documentado: agents.is_active no existe en el schema real; el check agent.status !== "active" ya cubre el kill switch.
- /api/agents/[agentId] DELETE: soft delete con audit log, solo admin.
- /api/agents/[agentId] PATCH: crea agent_versions snapshot y actualiza current_version, con audit log.
- /api/users/invite: audit log despues de crear perfil, rate limit 10/hora por org via Redis (fail-open).
- /api/agents/[agentId]/documents POST: rate limit 20/hora por org via Redis (fail-open).
- softDeleteAgent() agregada a src/lib/db/agents.ts.
- npm run typecheck paso sin errores.
- npm run lint paso sin errores.

## 2026-03-08

- Se agrego el script typecheck y el script ci:verify en package.json.
- Se creo .github/workflows/ci.yml con jobs separados de lint, typecheck y build en Ubuntu usando variables de entorno placeholder para validacion de CI.
- Se actualizo README.md con los checks locales y la estrategia de CI como fuente de verdad para build.
- npm.cmd run lint paso sin errores.
- npm.cmd run typecheck paso sin errores.
- No se reintento npm.cmd run build local porque el bloqueo de workers de Next.js en este entorno Windows ya fue aislado previamente.

## 2026-03-08

- Se migro el script lint a ESLint CLI para evitar la dependencia de next lint deprecado.
- Se actualizaron eslint.config.mjs y los ignores para excluir .next, next-env.d.ts y archivos temporales del chequeo.
- Se agrego una Content-Security-Policy minima en next.config.ts junto con los demas headers de seguridad.
- Se corrigieron textos con encoding roto en la metadata y la landing publica.
- Se endurecio .github/workflows/ci.yml con permissions de solo lectura y envs compartidas a nivel workflow.
- Se actualizo README.md para reflejar la nueva base de seguridad.
- npm.cmd run lint paso con ESLint CLI.
- npm.cmd run typecheck paso sin errores.
- No se reintento npm.cmd run build local porque el problema de workers de Next.js en este entorno Windows sigue siendo un issue separado ya aislado.

## 2026-03-08

- Se realizo una auditoria funcional del proyecto para identificar que falta para un MVP usable.
- Conclusion general: el core de auth, agentes, chat, invitaciones, notificaciones y documentos existe, pero faltan procesos async e integraciones operativas para que varias capacidades funcionen end-to-end.
- Se identificaron como gaps principales: workers para event_queue/RAG/usage, UI real de documentos, historial de conversaciones, billing y validacion final de build en entorno Linux/CI.

## 2026-03-08

- Se integro Redis de forma server-only en src/lib/redis.ts sin agregar dependencias nuevas.
- /api/auth/register ahora usa Redis para rate limiting distribuido en lugar de un Map en memoria.
- Si Redis falla o REDIS_URL no esta disponible, el rate limit hace fail-open y el registro no se cae completo.
- npm.cmd run lint paso sin errores.
- npm.cmd run typecheck paso sin errores.
## 2026-03-08

- /api/chat ahora aplica rate limiting distribuido por organizacion usando Redis antes de ejecutar llamadas costosas al LLM.
- Se agrego memoria corta de conversacion en Redis con TTL de 6 horas y limite de 20 mensajes, con fallback seguro a Postgres si Redis falla o devuelve datos invalidos.
- El historial cacheado se actualiza al guardar el mensaje del usuario y al persistir la respuesta final del asistente al cerrar el stream.
- src/lib/redis.ts ahora expone helpers JSON minimos para GET/SET con TTL sin agregar dependencias externas.
- npm.cmd run lint paso sin errores.
- npm.cmd run typecheck paso sin errores.

## 2026-03-08

- src/lib/db/usage.ts ahora usa createServiceSupabaseClient() para leer usage_records, organizations, plans, conversations y messages desde server-only.
- Se alineo la lectura de metricas con el mismo patron privilegiado que ya usaba recordUsage() para escritura.
- Esto evita que el dashboard y la vista de agente dependan de RLS sobre usage_records para mostrar metricas a roles no admin.
- npm.cmd run lint paso sin errores.
- npm.cmd run typecheck paso sin errores.

## 2026-03-08

- Se optimizo /api/chat para reducir tiempo hasta el primer token solapando checks de plan y resolucion de conversacion, y tambien el guardado del mensaje del usuario con la carga del historial y el armado de contexto RAG.
- Se agrego log server-side chat.pre_stream_ready para medir la latencia previa al streaming sin registrar contenido sensible.
- sendStreamingChatCompletion() ahora usa timeout explicito de 15 segundos, alineado con la variante no streaming, para evitar esperas largas cuando LiteLLM o el proveedor se cuelgan.
- npm.cmd run lint paso sin errores.
- npm.cmd run typecheck paso sin errores.

## 2026-03-08

- Se agrego timeout de 500 ms a las conexiones Redis server-only para evitar que handshakes o respuestas lentas bloqueen rutas sensibles.
- /api/chat ahora pone presupuesto duro a Redis (150 ms) y al armado de contexto RAG (1200 ms); si alguno tarda demasiado, el chat sigue con fallback seguro en lugar de demorar la respuesta.
- La carga de historial desde Redis y Postgres ahora corre en paralelo para reducir el tiempo hasta el primer token cuando la cache remota no ayuda.
- npm.cmd run lint paso sin errores.
- npm.cmd run typecheck paso sin errores.

## 2026-03-08

- Se migro la persistencia post-stream de /api/chat a next/server after() para que el guardado del mensaje del asistente, el registro de uso y las notificaciones de limite se ejecuten de forma confiable despues de completar la respuesta.
- src/lib/db/messages.ts ahora admite guardar llm_model, response_time_ms, tokens_input y tokens_output, y agrega una variante con service_role para persistencia backend sin depender de cookies de sesion.
- Con esto, usage_records deja de depender de un callback suelto no esperado por el ciclo de vida del request, que era el principal sospechoso para el dashboard en cero.
- npm.cmd run lint paso sin errores.
- npm.cmd run typecheck paso sin errores.

## 2026-03-08

- Se corrigio el orden de la persistencia post-stream en /api/chat para que recordUsage() y las notificaciones de plan se ejecuten antes de la escritura opcional de memoria corta en Redis.
- Con esto, un timeout o fallo de Redis ya no deberia impedir que usage_records se actualice y que el dashboard refleje mensajes, tokens y costo.
- npm.cmd run lint paso sin errores.
- npm.cmd run typecheck paso sin errores.

## 2026-03-08

- Se corrigio el filtro del periodo actual en src/lib/db/usage.ts y en checkPlanLimits() de /api/chat: ahora se compara por igualdad exacta de period_start y period_end en lugar de usar lt(period_end), que excluia siempre el registro del mes actual.
- Esta correccion alinea la lectura con recordUsage(), que guarda usage_records con period_end exactamente igual al primer dia del mes siguiente.
- npm.cmd run lint paso sin errores.
- npm.cmd run typecheck paso sin errores.

## 2026-03-08

- Se reemplazo la lectura de metricas en src/lib/db/usage.ts para calcular mensajes, tokens, costo y latencia directamente desde messages del asistente en lugar de depender de usage_records.
- Esto vuelve funcionales el dashboard y la vista por agente incluso si la agregacion async de usage_records sigue siendo inconsistente.
- getUsageHistory() tambien fue alineado para agrupar por created_at de messages y estimar costo desde tokens persistidos.
- npm.cmd run lint paso sin errores.
- npm.cmd run typecheck paso sin errores.

## 2026-03-08

- Se reparo src/lib/db/usage-writer.ts para que recordUsage() deje de sumar incrementalmente y pase a reconciliar de forma deterministica el uso mensual real desde messages del asistente antes de upsertear usage_records.
- El upsert de usage_records ahora incluye total_conversations y usa la clave logica organization_id + agent_id + period_start + llm_provider.
- /api/chat ahora valida limites con getOrganizationUsage(), evitando depender de lectura RLS sobre usage_records y de agregados potencialmente desfasados en tiempo real.
- Se mantiene el dashboard leyendo desde messages por seguridad, mientras usage_records queda reparado como capa agregada para limites, notificaciones y analitica backend.
- npm.cmd run lint paso sin errores.
- npm.cmd run typecheck paso sin errores.

## 2026-03-08

- Se devolvio src/lib/db/usage.ts a usage_records como fuente del dashboard y de la vista por agente, pero ahora con backfill server-side previo desde messages para garantizar consistencia antes de leer.
- Se agrego backfillUsageRecordsForOrganization() en src/lib/db/usage-writer.ts, que reconstruye usage_records por organizacion, agente, provider y mes a partir de messages del asistente.
- recordUsage() ahora dispara ese backfill del mes actual en lugar de sumar incrementalmente, dejando usage_records deterministico y alineado con la fuente real.
- /api/chat vuelve a verificar limites contra usage_records usando service_role y el periodo correcto, sin depender de RLS de usage_records.
- npm.cmd run lint paso sin errores.
- npm.cmd run typecheck paso sin errores.

## 2026-03-08

- Se optimizo la lectura del dashboard y de la vista por agente: usage.ts ya no hace backfill completo del mes actual en cada request, sino que usa ensureUsageRecordsCurrentForOrganization() para reconstruir solo si usage_records esta desactualizada respecto del ultimo mensaje del asistente.
- recordUsage() mantiene la reconciliacion deterministica del mes actual despues de cada respuesta del chat, por lo que el path caliente sigue corrigiendo usage_records sin depender del dashboard.
- getUsageHistory() conserva backfill explicito para rangos historicos, donde la consistencia vale mas que micro-optimizar una vista poco frecuente.
- npm.cmd run lint paso sin errores.
- npm.cmd run typecheck paso sin errores.

## 2026-03-08

- npm run dev ahora levanta el proxy LiteLLM via docker compose up -d litellm antes de iniciar Next.js.
- Se agrego compose.yaml con un servicio litellm que monta litellm_config.yaml, expone el puerto 4000 y carga credenciales desde .env.local.
- .env.local.example ahora documenta ANTHROPIC_API_KEY y GEMINI_API_KEY, ademas de OPENAI_API_KEY, para completar las tres provider keys del proxy.


## 2026-03-08

- Se corrigio la indentacion del bloque claude-sonnet-4-6 en litellm_config.yaml; model y api_key habian quedado fuera de litellm_params, lo que dejaba al contenedor LiteLLM en restart loop durante el startup.


## 2026-03-08

- /api/chat ahora espera que el stream de LiteLLM confirme esponse.ok y entregue esponse.body antes de responder al cliente, evitando 200 engaÃƒÆ’Ã‚Â¯Ãƒâ€šÃ‚Â¿Ãƒâ€šÃ‚Â½osos cuando el proveedor falla antes de iniciar el stream.
- sendStreamingChatCompletion() expone onReady, ademas de onComplete, para separar errores de arranque del stream de errores posteriores durante la persistencia async.


## 2026-03-08

- Se resolvio el error Cannot find module './611.js' apartando una carpeta .next corrupta/bloqueada por procesos viejos de 
ext dev; el runtime estaba intentando cargar chunks con artefactos inconsistentes del build previo.


## 2026-03-08

- Se cambio el backfill de usage_records a upsert con conflicto en organization_id,agent_id,period_start,llm_provider para evitar errores por recomputaciones concurrentes del mismo mes durante chat y dashboard.


## 2026-03-08

- Se unifico la experiencia principal en /dashboard: ahora reutiliza los componentes de uso, muestra resumen operativo para todos y analitica detallada solo para admins.
- /usage paso a redirigir a /dashboard para mantener compatibilidad sin duplicar la navegacion.
- Se elimino la tab duplicada Uso de la sidebar y se ignora .next-backup-* en ESLint para evitar ruido de artefactos temporales.


## 2026-03-08

- Se estabilizo la carga del dashboard admin: ahora usa getDashboardUsageData() para reconstruir usage_records una sola vez y leer resumen, historia y uso por agente desde un snapshot consistente.
- Tambien se agrego un banner de error visible en /dashboard cuando fallan metricas, en lugar de esconder silenciosamente los bloques de datos.


## 2026-03-08

- Se mejoro UsageTrendChart: ahora rellena meses faltantes con cero, muestra etiquetas mes+aÃƒÆ’Ã‚Â±o, agrega escala visual con grid y resumen del periodo para que la tendencia mensual sea legible y consistente.


## 2026-03-08

- Se mejoro UsageTrendChart: ahora rellena meses faltantes con cero, muestra etiquetas mes+aÃƒÆ’Ã‚Â±o, agrega escala visual con grid y resumen del periodo para que la tendencia mensual sea legible y consistente.


## 2026-03-08

- Se corrigio el corrimiento por zona horaria en UsageTrendChart: ahora agrupa y etiqueta meses por clave YYYY-MM y renderiza labels en UTC, evitando que marzo se muestre como febrero con valores incorrectos.


## 2026-03-08

- Se agregaron nuevos graficos al dashboard admin: Costo por mes y Tokens in/out por mes, reutilizando la misma serie historica de usage_records sin sumar nuevas queries.
- Se extrajo logica compartida de series mensuales y etiquetas a src/lib/utils/usage-chart.ts para mantener consistencia entre mensajes, costo y tokens.


## 2026-03-08

- Se corrigio un warning de React en usage-cost-chart.tsx: los ticks del eje podian redondearse al mismo valor y generar keys duplicadas; ahora la key combina indice y valor.


## 2026-03-08

- Se agregaron filtros de analitica al dashboard admin: presets de rango 3M/6M/12M y selector por agente via search params, sin dependencias nuevas.
- El filtro de agente se valida server-side contra la organizacion antes de consultar analitica, y ahora historia + tabla por agente respetan el rango y el agente seleccionado.


## 2026-03-08

- Se corrigieron keys duplicadas en los ejes de usage-trend-chart y usage-tokens-chart: los ticks redondeados podian repetir valores, asi que ahora usan una key compuesta por indice y valor.




## 2026-03-08

- Se rediseÃƒÆ’Ã‚Â±o la landing de / con una hero mas trabajada, bloques de valor y una vista previa visual para que la pagina se sienta mas pulida en desktop y mobile.
- Se agrego acceso claro a /login desde la cabecera y desde los CTA principales de la landing; si ya hay sesion activa, el CTA principal ahora lleva directo a /dashboard.
- Se mejoro la presentacion global con metadata mas descriptiva, tipografia Manrope y una base visual mas consistente en src/app/layout.tsx y src/app/globals.css.

