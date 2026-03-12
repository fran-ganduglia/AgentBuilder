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
    and rel.relname = 'integrations'
    and con.contype = 'c'
    and pg_get_constraintdef(con.oid) like '%type IN%';

  if constraint_name is not null then
    execute format('alter table public.integrations drop constraint %I', constraint_name);
  end if;
end
$$;

alter table public.integrations
add constraint integrations_type_check
check (type in ('whatsapp', 'email', 'google', 'webhook', 'crm', 'openai'));

create table if not exists public.agent_connections (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  agent_id uuid not null,
  integration_id uuid not null,
  provider_agent_id text not null,
  provider_type text not null
    check (provider_type in ('openai')),
  sync_status text not null default 'connected'
    check (sync_status in ('connected', 'syncing', 'error', 'disconnected')),
  last_synced_at timestamptz,
  last_sync_error text,
  remote_updated_at timestamptz,
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),

  unique (organization_id, integration_id, provider_agent_id),
  unique (organization_id, agent_id, integration_id),

  foreign key (agent_id, organization_id)
    references public.agents(id, organization_id) on delete cascade,
  foreign key (integration_id, organization_id)
    references public.integrations(id, organization_id) on delete cascade
);

create index if not exists idx_agent_connections_org_agent
  on public.agent_connections(organization_id, agent_id);

create index if not exists idx_agent_connections_org_integration
  on public.agent_connections(organization_id, integration_id);

create index if not exists idx_agent_connections_org_status
  on public.agent_connections(organization_id, sync_status);

drop trigger if exists trigger_agent_connections_updated_at on public.agent_connections;
create trigger trigger_agent_connections_updated_at
  before update on public.agent_connections
  for each row execute function public.set_updated_at();

alter table public.agent_connections enable row level security;

drop policy if exists agent_connections_select on public.agent_connections;
create policy agent_connections_select on public.agent_connections
  for select using (
    organization_id = public.get_user_organization_id()
  );

drop policy if exists agent_connections_insert on public.agent_connections;
create policy agent_connections_insert on public.agent_connections
  for insert with check (
    organization_id = public.get_user_organization_id()
    and public.get_user_role() = 'admin'
  );

drop policy if exists agent_connections_update on public.agent_connections;
create policy agent_connections_update on public.agent_connections
  for update
  using (
    organization_id = public.get_user_organization_id()
    and public.get_user_role() = 'admin'
  )
  with check (
    organization_id = public.get_user_organization_id()
    and public.get_user_role() = 'admin'
  );

drop policy if exists agent_connections_delete on public.agent_connections;
create policy agent_connections_delete on public.agent_connections
  for delete using (
    organization_id = public.get_user_organization_id()
    and public.get_user_role() = 'admin'
  );