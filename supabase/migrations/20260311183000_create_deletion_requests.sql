CREATE TABLE IF NOT EXISTS public.deletion_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  requested_by UUID,
  entity_type TEXT NOT NULL
    CONSTRAINT deletion_requests_entity_type_check
    CHECK (entity_type IN ('user', 'conversation', 'agent', 'organization')),
  entity_id UUID NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CONSTRAINT deletion_requests_status_check
    CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  reason TEXT,
  processed_at TIMESTAMPTZ,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.deletion_requests IS
  'Solicitudes de borrado diferido y derecho al olvido procesadas por workers.';

COMMENT ON COLUMN public.deletion_requests.requested_by IS
  'Usuario que solicito el borrado. Puede ser NULL para procesos internos.';

CREATE INDEX IF NOT EXISTS idx_deletion_requests_org
  ON public.deletion_requests(organization_id);

CREATE INDEX IF NOT EXISTS idx_deletion_requests_status
  ON public.deletion_requests(status)
  WHERE status = 'pending';

ALTER TABLE public.deletion_requests ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'deletion_requests'
      AND policyname = 'deletion_requests_admin'
  ) THEN
    CREATE POLICY deletion_requests_admin ON public.deletion_requests
      FOR ALL
      USING (
        organization_id = public.get_user_organization_id()
        AND public.get_user_role() = 'admin'
      )
      WITH CHECK (
        organization_id = public.get_user_organization_id()
        AND public.get_user_role() = 'admin'
      );
  END IF;
END $$;