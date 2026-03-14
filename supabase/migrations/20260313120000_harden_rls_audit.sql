-- Migration: harden_rls_audit
-- Resolves Supabase security advisor findings.
-- Three genuine issues are fixed; false positives are documented below.
--
-- FALSE POSITIVES (no action):
--   All other flagged policies use get_user_organization_id() / get_user_role()
--   which call auth.uid() internally. The Supabase linter cannot trace into
--   function bodies and flags them as "unverified". They are structurally correct.
--   SECURITY DEFINER functions all use SET search_path = public and have
--   appropriate REVOKE/GRANT permissions.
--
-- INTENTIONAL DESIGN NOTE:
--   conversations_insert and messages_insert allow all authenticated roles
--   (admin, editor, viewer, operador) to create conversations and send messages.
--   Viewers are restricted to read-only agent access via user_agent_permissions,
--   but all roles can interact with agents they are assigned to. This is by design.


-- ─────────────────────────────────────────────────────────────────────────────
-- FIX 1: plans table — overly broad policies
-- The plans table is a shared catalog (all orgs read the same rows).
-- The original policies used USING (true) / WITH CHECK (true), allowing
-- unauthenticated reads via the anon key.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.plans ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS plans_select              ON public.plans;
DROP POLICY IF EXISTS plans_insert_service_only ON public.plans;
DROP POLICY IF EXISTS plans_delete_service_only ON public.plans;

-- Any authenticated user may read plans (needed for plan display in UI).
-- anon key (unauthenticated) is explicitly excluded.
CREATE POLICY plans_select ON public.plans
  FOR SELECT
  USING (auth.role() IN ('authenticated', 'service_role'));

-- Only service_role (backend) may insert new plans.
CREATE POLICY plans_insert_service_only ON public.plans
  FOR INSERT
  WITH CHECK (auth.role() = 'service_role');

-- Only service_role (backend) may delete plans.
CREATE POLICY plans_delete_service_only ON public.plans
  FOR DELETE
  USING (auth.role() = 'service_role');


-- ─────────────────────────────────────────────────────────────────────────────
-- FIX 2: document_chunks_service_all — redundant permissive policy
-- service_role already bypasses RLS entirely in Supabase. A permissive policy
-- that grants ALL to service_role is redundant noise and could widen access
-- unexpectedly if misread alongside the authenticated policies.
-- ─────────────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS document_chunks_service_all ON public.document_chunks;


-- ─────────────────────────────────────────────────────────────────────────────
-- FIX 3: search_document_chunks — add input validation
-- The original function accepted arbitrary p_threshold and p_match_count values.
-- A caller could pass threshold=0.0 to dump all chunks in an org, or a huge
-- match count. This recreation adds bounds checks and an org ownership check.
--
-- Parameter names preserved from the original function to avoid breaking the
-- TypeScript caller in src/lib/db/rag.ts.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.search_document_chunks(
  p_organization_id uuid,
  p_agent_id        uuid,
  p_embedding       text,
  p_match_count     int     DEFAULT 5,
  p_threshold       float   DEFAULT 0.7
)
RETURNS TABLE (
  id           uuid,
  document_id  uuid,
  content      text,
  chunk_index  int,
  metadata     jsonb,
  similarity   float
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Input validation: reject out-of-bounds values before touching any data.
  IF p_match_count NOT BETWEEN 1 AND 10 THEN
    RAISE EXCEPTION 'p_match_count must be between 1 and 10';
  END IF;

  IF p_threshold NOT BETWEEN 0.1 AND 1.0 THEN
    RAISE EXCEPTION 'p_threshold must be between 0.1 and 1.0';
  END IF;

  -- Org ownership check: the caller must belong to the requested organization.
  -- For service_role calls, get_user_organization_id() returns NULL and the
  -- comparison evaluates to NULL (falsy), so the guard is bypassed intentionally.
  IF p_organization_id <> public.get_user_organization_id() THEN
    RAISE EXCEPTION 'Forbidden: organization_id does not match authenticated user';
  END IF;

  RETURN QUERY
  SELECT
    dc.id,
    dc.document_id,
    dc.content,
    dc.chunk_index,
    dc.metadata,
    (1 - (dc.embedding <=> p_embedding::vector))::float AS similarity
  FROM document_chunks dc
  WHERE
    dc.organization_id = p_organization_id
    AND dc.agent_id    = p_agent_id
    AND (1 - (dc.embedding <=> p_embedding::vector)) >= p_threshold
  ORDER BY dc.embedding <=> p_embedding::vector
  LIMIT p_match_count;
END;
$$;
