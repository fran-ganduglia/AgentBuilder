create or replace function public.claim_event_queue_events(
  p_event_types text[],
  p_limit integer default 10
)
returns setof public.event_queue
language sql
security definer
set search_path = public
as $$
  with candidates as (
    select event_queue.id
    from public.event_queue
    where event_queue.status = 'pending'
      and event_queue.event_type = any(p_event_types)
      and (
        event_queue.process_after is null
        or event_queue.process_after <= timezone('utc', now())
      )
      and coalesce(event_queue.attempts, 0) < coalesce(event_queue.max_attempts, 25)
    order by event_queue.created_at asc
    for update skip locked
    limit greatest(coalesce(p_limit, 10), 1)
  )
  update public.event_queue
  set status = 'processing',
      attempts = coalesce(public.event_queue.attempts, 0) + 1,
      error_message = null
  from candidates
  where public.event_queue.id = candidates.id
  returning public.event_queue.*;
$$;

revoke all on function public.claim_event_queue_events(text[], integer) from public;
revoke all on function public.claim_event_queue_events(text[], integer) from anon;
revoke all on function public.claim_event_queue_events(text[], integer) from authenticated;
grant execute on function public.claim_event_queue_events(text[], integer) to service_role;