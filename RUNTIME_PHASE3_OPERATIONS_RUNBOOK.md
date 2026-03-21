# Runtime Fase 3 - Observability y Operación

## Dashboards mínimos

- Throughput: runs iniciados por ventana, segmentados por `surface`, `channel` y `agent_id`.
- Error rate: proporción de `runtime_runs` en `failed`, `blocked` o `manual_repair_required`, más corte por `node`.
- Latency: promedio y percentil 95 desde `started_at` hasta `finished_at`.
- Retries: cantidad de eventos de runtime con `status=retry`, segmentados por `node`, `provider` y `action_type`.
- Approval backlog: `approval_items.status=pending`, edad del más viejo y volumen por `risk_level`.
- Worker backlog: `event_queue` para `runtime.queue.dispatch` en `pending`, `processing` y `failed`.
- Costo LLM: suma de `runtime_runs.estimated_cost_usd` y breakdown por tokens de planner/postprocess.
- Costo/provider usage: uso por `provider`, `provider_request_id`, approvals encoladas y side effects write/destructive.

## Alertas mínimas

- Error rate alta por nodo: cuando un nodo supera el umbral y tiene muestra suficiente.
- Crecimiento anormal de `blocked`: comparar ventana actual vs ventana anterior.
- Crecimiento anormal de `needs_user`: comparar ventana actual vs ventana anterior.
- Backlog de approvals: volumen alto o edad del approval más viejo por encima del SLO.
- Backlog de runtime queue: `runtime.queue.dispatch` acumulado o estancado.
- Caída de provider: `circuit_open`, `unhealthy` o fallas repetidas por `provider`.
- Costo LLM diario anómalo: costo diario estimado por encima del baseline reciente.

## Runbooks

### Provider outage

1. Confirmar si la alerta proviene de `provider_outage` por `circuit_open` o por fallas repetidas.
2. Revisar `runtime_events` filtrando por `provider`, `reason`, `provider_request_id` y `trace_id`.
3. Verificar estado de la integración y scopes; si es un fallo externo, degradar el surface afectado o pausar el adapter por feature flag.
4. Validar backlog en `event_queue` y approvals asociadas antes de reabrir tráfico.

### Retry storm

1. Filtrar `runtime_events` por `status=retry` y agrupar por `node`, `provider` y `action_type`.
2. Identificar si el origen es throttle, timeout o bug determinístico del runtime.
3. Si el patrón es determinístico, bloquear o degradar el action type hasta corregir el bug.
4. Si el patrón es externo, dejar actuar al circuit breaker y reducir concurrencia/capacidad temporalmente.

### Approval backlog

1. Revisar `approval_items.status=pending` por edad, `risk_level`, agente y organización.
2. Confirmar si hay operadores disponibles y si el canal de inbox está funcionando.
3. Resolver approvals vencidos o atascados; si expiraron, revisar si quedaron runs en `blocked` o `manual_repair_required`.
4. Si el backlog persiste, reducir writes de riesgo medio/alto o forzar degradación parcial.

### Budget exhaustion

1. Revisar `runtime_runs.estimated_cost_usd` y tokens de planner/postprocess en la ventana actual.
2. Comparar con la ventana anterior para separar spike real de un error de medición.
3. Verificar qué `agent_id`, `surface` o `provider` está generando el salto.
4. Aplicar policy más restrictiva, bajar volumen de surfaces costosas o mover tráfico a fallback seguro.

### Stuck runtime runs

1. Buscar `runtime_runs` en `waiting_approval`, `waiting_async_execution`, `needs_user` o `blocked`.
2. Reconstruir la timeline con `runtime_events` ordenados por `created_at`.
3. Revisar linkage a `approval_item_id`, `workflow_run_id`, `workflow_step_id` e `idempotency_key`.
4. Si el problema fue de dispatch, destrabar `event_queue`; si fue un gap lógico, dejar el run en `manual_repair_required`.

### Compensación fallida

1. Revisar workflow/runs fallidos con pasos previos mutados y `compensation_status=failed` o `manual_repair_required`.
2. Validar qué side effect quedó parcialmente aplicado usando `provider_request_id` e `idempotency_key`.
3. Ejecutar reparación manual documentada por proveedor y dejar evidencia en audit log.
4. No reintentar side effects reales sin confirmar idempotencia y estado externo actual.

## Trazabilidad requerida por side effect

Cada side effect del runtime debe poder mapearse, como mínimo, a:

- actor: `actor_user_id`
- trigger: `runtime_surface`, `runtime_channel`, `conversation_id`, `trigger_message_id`
- approval: `approval_item_id`
- workflow/runtime run: `runtime_run_id`, `workflow_run_id`, `workflow_step_id`
- provider request: `provider`, `provider_request_id`
- idempotency: `idempotency_key`

## Verificación recomendada

- `npm.cmd run typecheck`
- `npm.cmd run test:ts -- src/lib/runtime/observability.test.ts`
- `npm.cmd run test:ts -- src/lib/runtime/operations.test.ts`
