do $$
begin
  if exists (
    select 1
    from public.integrations
    where type = 'google'
      and deleted_at is null
    group by organization_id
    having count(*) > 1
  ) then
    raise exception 'No se puede aplicar la migracion: hay mas de una integracion Google activa por organizacion.';
  end if;
end
$$;

create unique index if not exists idx_integrations_one_google_per_org
  on public.integrations (organization_id)
  where type = 'google' and deleted_at is null;
