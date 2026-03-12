do $$
declare
  provider_type_constraint_name text;
begin
  if exists (
    select 1
    from public.integrations
    where type = 'whatsapp'
      and deleted_at is null
    group by organization_id
    having count(*) > 1
  ) then
    raise exception 'No se puede aplicar la migracion: hay mas de una integracion WhatsApp activa por organizacion.';
  end if;

  if exists (
    select 1
    from public.agent_connections
    where provider_type = 'whatsapp'
    group by organization_id, agent_id
    having count(*) > 1
  ) then
    raise exception 'No se puede aplicar la migracion: hay agentes con mas de una conexion WhatsApp.';
  end if;

  if exists (
    select 1
    from public.agent_connections
    where provider_type = 'whatsapp'
    group by provider_agent_id
    having count(*) > 1
  ) then
    raise exception 'No se puede aplicar la migracion: hay phone_number_id de WhatsApp conectados en mas de un registro.';
  end if;

  select con.conname
  into provider_type_constraint_name
  from pg_constraint con
  join pg_class rel on rel.oid = con.conrelid
  join pg_namespace nsp on nsp.oid = rel.relnamespace
  where nsp.nspname = 'public'
    and rel.relname = 'agent_connections'
    and con.contype = 'c'
    and lower(pg_get_constraintdef(con.oid)) like '%provider_type%openai%';

  if provider_type_constraint_name is not null then
    execute format(
      'alter table public.agent_connections drop constraint %I',
      provider_type_constraint_name
    );
  end if;

  if not exists (
    select 1
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join pg_namespace nsp on nsp.oid = rel.relnamespace
    where nsp.nspname = 'public'
      and rel.relname = 'agent_connections'
      and con.conname = 'agent_connections_provider_type_check'
  ) then
    execute $sql$
      alter table public.agent_connections
      add constraint agent_connections_provider_type_check
      check (provider_type in ('openai', 'whatsapp'))
    $sql$;
  end if;
end
$$;

create unique index if not exists idx_integrations_one_whatsapp_per_org
  on public.integrations (organization_id)
  where type = 'whatsapp' and deleted_at is null;

create unique index if not exists idx_agent_connections_one_whatsapp_per_agent
  on public.agent_connections (organization_id, agent_id)
  where provider_type = 'whatsapp';

create unique index if not exists idx_agent_connections_unique_whatsapp_source
  on public.agent_connections (provider_agent_id)
  where provider_type = 'whatsapp';