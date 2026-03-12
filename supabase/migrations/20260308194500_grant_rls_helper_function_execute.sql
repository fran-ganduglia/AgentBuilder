grant execute on function public.get_user_organization_id() to authenticated;
grant execute on function public.get_user_role() to authenticated;

revoke execute on function public.get_user_organization_id() from anon;
revoke execute on function public.get_user_role() from anon;
