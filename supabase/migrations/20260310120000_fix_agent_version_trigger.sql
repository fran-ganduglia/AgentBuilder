-- Fix: trigger create_agent_version() usaba OLD.current_version directamente,
-- lo que causaba duplicate key si current_version estaba desincronizado.
-- Ahora calcula el próximo version_number desde los datos reales en agent_versions.

CREATE OR REPLACE FUNCTION public.create_agent_version()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_changed_by      UUID;
  v_changed_by_type TEXT;
  v_config          JSONB;
  v_version_number  INTEGER;
BEGIN
  v_changed_by := auth.uid();

  IF v_changed_by IS NULL THEN
    v_changed_by_type := 'system';
  ELSE
    v_changed_by_type := 'user';
  END IF;

  -- Self-healing: calcula desde datos reales, no depende de current_version
  SELECT COALESCE(MAX(version_number), 0) + 1
    INTO v_version_number
    FROM agent_versions
   WHERE agent_id = OLD.id;

  -- Whitelist explícita: NUNCA to_jsonb(OLD)
  v_config := jsonb_build_object(
    'system_prompt',              OLD.system_prompt,
    'llm_provider',               OLD.llm_provider,
    'llm_model',                  OLD.llm_model,
    'llm_temperature',            OLD.llm_temperature,
    'max_tokens',                 OLD.max_tokens,
    'tone',                       OLD.tone,
    'language',                   OLD.language,
    'memory_enabled',             OLD.memory_enabled,
    'memory_window',              OLD.memory_window,
    'max_conversations_per_day',  OLD.max_conversations_per_day,
    'description',                OLD.description,
    'avatar',                     OLD.avatar
  );

  INSERT INTO agent_versions (
    agent_id, organization_id, version_number,
    config, system_prompt, llm_model, llm_provider,
    changed_by, changed_by_type
  ) VALUES (
    OLD.id, OLD.organization_id, v_version_number,
    v_config, OLD.system_prompt, OLD.llm_model, OLD.llm_provider,
    v_changed_by, v_changed_by_type
  );

  NEW.current_version := v_version_number + 1;
  RETURN NEW;
END;
$$;

-- Sincronizar current_version para agentes con versiones existentes
UPDATE agents a
SET current_version = sub.next_version
FROM (
  SELECT agent_id, MAX(version_number) + 1 AS next_version
  FROM agent_versions
  GROUP BY agent_id
) sub
WHERE a.id = sub.agent_id
  AND a.deleted_at IS NULL;

-- Inicializar current_version para agentes sin versiones (reset a 1)
UPDATE agents
SET current_version = 1
WHERE deleted_at IS NULL
  AND id NOT IN (SELECT DISTINCT agent_id FROM agent_versions);
