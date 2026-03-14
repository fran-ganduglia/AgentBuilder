-- Función 1: incrementar total_messages en usage_records de forma atómica
-- Devuelve el total acumulado de mensajes de la organización en el periodo
CREATE OR REPLACE FUNCTION increment_usage_messages(
  p_organization_id uuid,
  p_agent_id        uuid,
  p_period_start    text,
  p_period_end      text,
  p_llm_provider    text
) RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_org_total bigint;
BEGIN
  INSERT INTO usage_records (
    organization_id,
    agent_id,
    period_start,
    period_end,
    llm_provider,
    total_messages
  )
  VALUES (
    p_organization_id,
    p_agent_id,
    p_period_start::date,
    p_period_end::date,
    p_llm_provider,
    1
  )
  ON CONFLICT (organization_id, agent_id, period_start, llm_provider)
  DO UPDATE SET
    total_messages = usage_records.total_messages + 1,
    updated_at     = NOW();

  SELECT COALESCE(SUM(total_messages), 0)
    INTO v_org_total
    FROM usage_records
   WHERE organization_id = p_organization_id
     AND period_start    = p_period_start::date;

  RETURN v_org_total;
END;
$$;

REVOKE ALL ON FUNCTION increment_usage_messages(uuid, uuid, text, text, text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION increment_usage_messages(uuid, uuid, text, text, text) TO service_role;

-- Función 2: incrementar message_count en conversations de forma atómica
CREATE OR REPLACE FUNCTION increment_conversation_message_count(
  p_id      uuid,
  p_org_id  uuid
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE conversations
     SET message_count = COALESCE(message_count, 0) + 1
   WHERE id              = p_id
     AND organization_id = p_org_id;
END;
$$;

REVOKE ALL ON FUNCTION increment_conversation_message_count(uuid, uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION increment_conversation_message_count(uuid, uuid) TO service_role;
