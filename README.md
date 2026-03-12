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
- `SALESFORCE_CLIENT_ID`
- `SALESFORCE_CLIENT_SECRET`
- `SALESFORCE_LOGIN_URL`
- `SALESFORCE_OAUTH_SCOPES`
- `SALESFORCE_API_VERSION`

### Salesforce deploy checklist

1. Aplicar la migracion `supabase/migrations/20260311213000_enable_salesforce_integrations.sql` antes de desplegar la UI o las rutas de Salesforce.
2. Configurar la Connected App de Salesforce con callback exacto `${APP_BASE_URL}/api/integrations/salesforce/callback`.
3. Mantener scopes minimos `api refresh_token` salvo que un caso real pida ampliar permisos.
4. Verificar que `vercel.json` publique el cron `/api/workers/integrations` cada 5 minutos y que `CRON_SECRET` exista en el entorno.
5. Completar OAuth happy path, refresh de token y revocacion manual en un sandbox de Salesforce antes de habilitarlo a clientes.

### Salesforce runtime v1

- `/api/chat` ya puede planificar lecturas Salesforce automaticamente para agentes con `agent_tools` habilitada.
- Las escrituras (`create_task`, `create_lead`, `create_case`, `update_case`, `update_opportunity`) requieren confirmacion conversacional estricta: el usuario debe responder exactamente `confirmo` dentro de la misma conversacion antes de ejecutar.
- Si la integracion queda `revoked`, `reauth_required` o sin secretos validos, el chat responde con degradacion segura en lugar de intentar operar igual.

### Drill corto recomendado para Fase -1

1. Revocacion manual: revocar una integracion desde `Settings > Integraciones` y confirmar que la UI quede en estado `Revocado`, se desactiven `agent_tools` asociados y aparezca una `notification`.
2. Reauth requerida: forzar un `401/403` del proveedor o borrar el secreto remoto y confirmar que primero se intente refresh de token, y que solo despues quede en `reauth_required` si no se puede recuperar.
3. Secreto faltante: eliminar la fila de `integration_secrets` en un entorno de prueba, esperar el cron `/api/workers/integrations` y verificar que la integracion quede en `reauth_required` con alerta visible.
4. Budget/error de proveedor: disparar llamadas repetidas o una credencial invalida contra el proveedor y confirmar que la respuesta al usuario sea segura, sin exponer detalles internos, y que quede trazabilidad en `audit_logs`.
5. Confirmacion de escritura: pedir al agente una accion de escritura, validar que el primer turno pida confirmacion, responder `confirmo` y verificar que el cambio impacte en Salesforce y se audite como `provider.salesforce.*`.
