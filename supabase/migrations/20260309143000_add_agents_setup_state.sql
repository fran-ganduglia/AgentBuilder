ALTER TABLE public.agents
ADD COLUMN IF NOT EXISTS setup_state JSONB;

COMMENT ON COLUMN public.agents.setup_state IS
  'Estado resumible del onboarding guiado del agente (template, canal, progreso y checklist).';
