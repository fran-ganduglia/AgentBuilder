alter table public.agent_connections enable row level security;

drop policy if exists agent_connections_select on public.agent_connections;
create policy agent_connections_select on public.agent_connections
  for select
  using (
    organization_id = public.get_user_organization_id()
    and public.get_user_role() in ('admin', 'editor')
  );
