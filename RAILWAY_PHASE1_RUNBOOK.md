# Railway Phase 1 Runbook

## Objetivo

Mover el scheduling productivo de `n8n Cloud` a dos procesos persistentes en `Railway` sin mover UI, API ni webhooks fuera de `Vercel`.

## Servicios a crear en Railway

Crear dos servicios separados apuntando al mismo repo:

1. `worker-queue`
2. `worker-maintenance`

Cada uno debe correr como proceso persistente, no como job one-off.

## Start commands

### worker-queue

```bash
npm run worker:queue
```

### worker-maintenance

```bash
npm run worker:maintenance
```

## Health checks

Configurar en ambos servicios:

- path: `/health`
- expected status: `200`

Los procesos tambien responden `200` en `/`, pero `/health` es la ruta explicitamente recomendada.

## Variables de entorno minimas

Copiar en ambos servicios las variables server-side que hoy usa la app para processors y workers:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `APP_BASE_URL`
- `INTEGRATION_SECRETS_ENCRYPTION_KEY`
- `LITELLM_BASE_URL`
- `LITELLM_API_KEY`
- `REDIS_URL`
- `OPENAI_API_KEY`
- `CRON_SECRET`
- `WORKERS_ENABLED=true`
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `HUBSPOT_CLIENT_ID`
- `HUBSPOT_CLIENT_SECRET`
- `SALESFORCE_CLIENT_ID`
- `SALESFORCE_CLIENT_SECRET`
- `SALESFORCE_LOGIN_URL`
- `SALESFORCE_OAUTH_SCOPES`
- `SALESFORCE_API_VERSION`

Notas:

- `CRON_SECRET` debe existir tambien en Railway aunque el proceso se invoque internamente.
- `APP_BASE_URL` debe seguir apuntando a la URL publica de `Vercel`, no a Railway.
- No copiar variables locales de `n8n` (`N8N_ENCRYPTION_KEY`, `N8N_BASIC_AUTH_*`, `REDIS_HOST`, etc.) salvo que todavia las uses para otra operacion externa al worker.

## Preflight antes del deploy

1. Confirmar que `npm run typecheck` y `npm run lint` pasan en la rama a desplegar.
2. Confirmar que `REDIS_URL` permite conexiones salientes desde Railway.
3. Confirmar que `SUPABASE_SERVICE_ROLE_KEY` corresponde al mismo proyecto donde vive `event_queue`.
4. Confirmar que `WORKERS_ENABLED=true` en Railway y en Vercel.
5. Confirmar que `APP_BASE_URL` sigue siendo la base publica real de la app.

## Orden recomendado de despliegue

1. Deployar `worker-queue`.
2. Esperar health `200` en `/health`.
3. Deployar `worker-maintenance`.
4. Esperar health `200` en `/health`.
5. Generar un evento real en `event_queue`.
6. Verificar que `worker-queue` lo procese sin esperar 30s.
7. Recien despues pausar workflows equivalentes en `n8n`.

## Validacion de queue

Validar en logs de `worker-queue`:

- arranque de health server
- suscripcion Redis a `event_queue:notify`
- procesamiento de batches `events`, `rag` o `webhooks`

Casos a probar:

1. Insertar un `workflow.step.execute` y verificar consumo inmediato.
2. Insertar un `document.uploaded` y verificar que corra RAG desde Railway.
3. Insertar un evento de webhook async y verificar delivery desde Railway.

## Validacion de fallback

Simular que Redis no despierta al worker:

1. dejar un evento pendiente en `event_queue`
2. confirmar que el worker igual lo toma por sweep dentro de 30 segundos

Esto valida que Redis solo despierta y que Postgres sigue siendo la fuente de verdad.

## Validacion de shutdown

Con un batch en curso:

1. reiniciar el servicio en Railway o enviar stop
2. confirmar en logs que entra en shutdown
3. confirmar que deja de reclamar jobs nuevos
4. confirmar que termina el batch actual o sale por timeout acotado

## Cutover de n8n

Cuando `worker-queue` ya procese bien en Railway, pausar en `n8n Cloud`:

- `rag-processor`
- `event-queue-worker`
- `webhook-delivery`

Cuando `worker-maintenance` ya procese bien en Railway, pausar tambien:

- `approval-expiration-worker`
- `integration-health`
- `oauth-token-refresh`
- `deletion-worker`
- cualquier schedule de WhatsApp/CRM que ya haya sido migrado

## Criterio de salida de Fase 1

La fase queda operativamente cerrada cuando:

1. `worker-queue` y `worker-maintenance` estan sanos en Railway.
2. Los eventos nuevos se procesan desde Railway con wake-up por Redis.
3. El sweep de 30s recupera pendientes si Redis falla.
4. `n8n` deja de ser el scheduler principal de cola y mantenimiento base.
5. El consumo del trial de `n8n Cloud` cae al pausar los workflows reemplazados.

## Rollback simple

Si Railway falla durante el cutover:

1. volver a activar en `n8n` los workflows pausados con `npm run workers:resume` o desde la UI
2. dejar `WORKERS_ENABLED=true` para no apagar los endpoints de compatibilidad
3. revisar logs de Railway antes de reintentar el cambio
