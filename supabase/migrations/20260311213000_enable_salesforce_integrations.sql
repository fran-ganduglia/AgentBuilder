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
check (type in ('whatsapp', 'email', 'google', 'webhook', 'crm', 'openai', 'salesforce'));