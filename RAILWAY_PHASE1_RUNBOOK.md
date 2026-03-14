# Railway Phase 1 Runbook

## Objetivo

Mover el scheduling productivo de `n8n Cloud` a un unico proceso persistente en `Railway Hobby` sin mover UI, API ni webhooks fuera de `Vercel`.

## Servicio a crear en Railway

Crear un solo servicio apuntando al mismo repo:

1. `worker`

Debe correr como proceso persistente, no como job one-off.

## Start command

```bash
npm run worker
```

## Health checks

Configurar en el servicio:

- path: `/health`
- expected status: `200`

El proceso tambien responde `200` en `/`, pero `/health` es la ruta explicitamente recomendada.

## Variables de entorno minimas

Copiar en el servicio las variables server-side que hoy usa la app para processors y workers:

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
- `APP_BASE_URL` debe seguir apuntando a la URL publica principal de la app.
- No copiar variables locales de `n8n` (`N8N_ENCRYPTION_KEY`, `N8N_BASIC_AUTH_*`, `REDIS_HOST`, etc.) salvo que todavia las uses para otra operacion externa al worker.

## Preflight antes del deploy

1. Confirmar que `npm run typecheck` y `npm run lint` pasan en la rama a desplegar.
2. Confirmar que `REDIS_URL` permite conexiones salientes desde Railway.
3. Confirmar que `SUPABASE_SERVICE_ROLE_KEY` corresponde al mismo proyecto donde vive `event_queue`.
4. Confirmar que `WORKERS_ENABLED=true` en Railway.
5. Confirmar que `APP_BASE_URL` sigue siendo la base publica real de la app.

## Orden recomendado de despliegue

1. Deployar `worker`.
2. Esperar health `200` en `/health`.
3. Generar un evento real en `event_queue`.
4. Verificar que `worker` lo procese sin esperar 30s.
5. Recien despues pausar workflows equivalentes en `n8n`.

## Validacion de queue

Validar en logs de `worker`:

- arranque de health server
- suscripcion Redis a `event_queue:notify`
- procesamiento de batches `events`, `rag` o `webhooks`

Casos a probar:

1. Insertar un `workflow.step.execute` y verificar consumo inmediato.
2. Insertar un `document.uploaded` y verificar que corra RAG desde Railway.
3. Insertar un evento de webhook async y verificar delivery desde Railway.

## Validacion de maintenance

Validar en logs de `worker`:

- corrida inicial de jobs periodicos
- `approvals`
- `oauth-refresh`
- `deletion`
- `integrations`

El modo Hobby-first usa frecuencias gruesas para mantener costo bajo en un solo proceso.

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

Cuando `worker` ya procese bien queue, pausar en `n8n Cloud`:

- `rag-processor`
- `event-queue-worker`
- `webhook-delivery`

Cuando el mismo `worker` ya procese bien maintenance, pausar tambien:

- `approval-expiration-worker`
- `integration-health`
- `oauth-token-refresh`
- `deletion-worker`
- cualquier schedule de WhatsApp/CRM que ya haya sido migrado

## Criterio de salida de Fase 1

La fase queda operativamente cerrada cuando:

1. `worker` esta sano en Railway.
2. Los eventos nuevos se procesan desde Railway con wake-up por Redis.
3. El sweep de 30s recupera pendientes si Redis falla.
4. `n8n` deja de ser el scheduler principal de cola y mantenimiento base.
5. El consumo del trial de `n8n Cloud` cae al pausar los workflows reemplazados.

## Rollback simple

Si Railway falla durante el cutover:

1. volver a activar en `n8n` los workflows pausados con `npm run workers:resume` o desde la UI
2. dejar `WORKERS_ENABLED=true` para no apagar los endpoints de compatibilidad
3. revisar logs de Railway antes de reintentar el cambio
