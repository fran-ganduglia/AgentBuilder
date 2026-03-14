# proyecto-amigos

## Checks

Usa estos comandos como referencia local y en CI:

- `npm run lint`
- `npm run typecheck`
- `npm run build`
- `npm run ci:verify`

## CI

Se agrego un workflow en `.github/workflows/ci.yml` que corre `lint`, `typecheck` y `build` por separado en Ubuntu.

La idea es que CI sea la referencia de build mientras el entorno local de Windows siga fallando con workers internos de Next.js.

## Seguridad

`next.config.ts` ahora incluye una `Content-Security-Policy` minima junto con el resto de headers base de seguridad.

## Integraciones

Variables operativas minimas para produccion:

- `APP_BASE_URL`
- `INTEGRATION_SECRETS_ENCRYPTION_KEY`
- `CRON_SECRET`
- `WORKERS_ENABLED`
- `SALESFORCE_CLIENT_ID`
- `SALESFORCE_CLIENT_SECRET`
- `SALESFORCE_LOGIN_URL`
- `SALESFORCE_OAUTH_SCOPES`
- `SALESFORCE_API_VERSION`

### Salesforce deploy checklist

1. Aplicar la migracion `supabase/migrations/20260311213000_enable_salesforce_integrations.sql` antes de desplegar la UI o las rutas de Salesforce.
2. Configurar la Connected App de Salesforce con callback exacto `${APP_BASE_URL}/api/integrations/salesforce/callback`.
3. Mantener scopes minimos `api refresh_token` salvo que un caso real pida ampliar permisos.
4. Verificar que `CRON_SECRET` exista en el entorno y que el scheduler oficial en `n8n` dispare `/api/workers/integrations` cada 5 minutos.
5. Completar OAuth happy path, refresh de token y revocacion manual en un sandbox de Salesforce antes de habilitarlo a clientes.

## Scheduler operativo

La arquitectura operativa actual queda partida entre `Vercel` y `Railway`:

- `Vercel` mantiene UI, API Routes, webhooks entrantes e inserts en `event_queue`
- `Railway` corre procesos persistentes `worker:queue` y `worker:maintenance`
- `event_queue` sigue siendo la source of truth; Redis solo despierta al worker por `event_queue:notify`

Kill switch operativo:

- si queres frenar todos los endpoints `/api/workers/*`, definir `WORKERS_ENABLED=false`
- si tambien queres dejar de consumir ejecuciones del trial de `n8n`, correr `npm run workers:pause`
- para reactivar temporalmente los workflows importados en `n8n`, correr `npm run workers:resume`

Procesos Railway:

- `npm run worker:queue`
- `npm run worker:maintenance`
- configurar health check en `/health`

Contrato operativo minimo:

- al insertar un evento asincrono, el backend debe hacer `INSERT event_queue` y luego `PUBLISH event_queue:notify`
- `worker:queue` escucha `event_queue:notify` y ademas ejecuta un sweep completo cada 30 segundos
- ambos procesos exponen `GET /health` en `$PORT` y soportan `SIGTERM`/`SIGINT`
- las rutas `/api/workers/*` quedan como compatibilidad/legado; Railway pasa a ser el scheduler principal

Runbook concreto de despliegue y cutover: `RAILWAY_PHASE1_RUNBOOK.md`

`n8n` queda como legado transitorio:

- `event-queue-worker.json`, `rag-processor.json` y `webhook-delivery.json` ya pueden apagarse al mover la carga a Railway
- `approval-expiration-worker.json` e `integration-health.json` pueden mantenerse mientras se valida `worker:maintenance`
- los JSON de `n8n/workflows` siguen siendo utiles como fallback operativo durante la migracion

En desarrollo local, si `n8n` corre en Docker y la app Next corre nativa con `npm run dev`, usar:

- `appBaseUrl = http://host.docker.internal:3000`

El `compose.yaml` ya declara `extra_hosts: host.docker.internal:host-gateway` para el servicio `n8n` y fija ese mismo host como `APP_BASE_URL` dentro del contenedor.

### Salesforce runtime v1

- `/api/chat` ya puede planificar lecturas Salesforce automaticamente para agentes con `agent_tools` habilitada.
- Las escrituras (`create_task`, `create_lead`, `create_case`, `update_case`, `update_opportunity`) requieren confirmacion conversacional estricta: el usuario debe responder exactamente `confirmo` dentro de la misma conversacion antes de ejecutar.
- Si la integracion queda `revoked`, `reauth_required` o sin secretos validos, el chat responde con degradacion segura en lugar de intentar operar igual.

### Drill corto recomendado para Fase -1

1. Revocacion manual: revocar una integracion desde `Settings > Integraciones` y confirmar que la UI quede en estado `Revocado`, se desactiven `agent_tools` asociados y aparezca una `notification`.
2. Reauth requerida: forzar un `401/403` del proveedor o borrar el secreto remoto y confirmar que primero se intente refresh de token, y que solo despues quede en `reauth_required` si no se puede recuperar.
3. Secreto faltante: eliminar la fila de `integration_secrets` en un entorno de prueba, esperar la corrida de `n8n` hacia `/api/workers/integrations` y verificar que la integracion quede en `reauth_required` con alerta visible.
4. Budget/error de proveedor: disparar llamadas repetidas o una credencial invalida contra el proveedor y confirmar que la respuesta al usuario sea segura, sin exponer detalles internos, y que quede trazabilidad en `audit_logs`.
5. Confirmacion de escritura: pedir al agente una accion de escritura, validar que el primer turno pida confirmacion, responder `confirmo` y verificar que el cambio impacte en Salesforce y se audite como `provider.salesforce.*`.
