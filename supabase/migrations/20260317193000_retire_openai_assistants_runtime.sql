begin;

update public.agent_connections
set
  sync_status = 'disconnected',
  last_sync_error = 'retired_openai_assistants_runtime',
  last_synced_at = now(),
  metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
    'retired_at', now(),
    'retired_reason', 'openai_assistants_runtime_removed'
  )
where provider_type = 'openai';

update public.integrations
set
  is_active = false,
  metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
    'auth_status', 'revoked',
    'revoked_at', now(),
    'revoked_reason', 'openai_assistants_runtime_removed'
  )
where type = 'openai'
  and deleted_at is null;

delete from public.integration_secrets
where integration_id in (
  select id
  from public.integrations
  where type = 'openai'
);

delete from public.agent_connections
where provider_type = 'openai';

do $$
declare
  constraint_name text;
begin
  select con.conname
    into constraint_name
  from pg_constraint con
  join pg_class rel on rel.oid = con.conrelid
  join pg_namespace nsp on nsp.oid = rel.relnamespace
  where nsp.nspname = 'public'
    and rel.relname = 'agent_connections'
    and con.contype = 'c'
    and lower(pg_get_constraintdef(con.oid)) like '%provider_type%'
    and lower(pg_get_constraintdef(con.oid)) like '%openai%';

  if constraint_name is not null then
    execute format(
      'alter table public.agent_connections drop constraint %I',
      constraint_name
    );
  end if;
end $$;

alter table public.agent_connections
  add constraint agent_connections_provider_type_check
  check (provider_type in ('whatsapp'));

commit;
