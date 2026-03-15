begin;

create temporary table tmp_hubspot_integrations on commit drop as
select id, organization_id
from public.integrations
where type = 'hubspot';

delete from public.event_queue
where event_type = 'workflow.step.execute'
  and idempotency_key like 'workflow.step.execute:%'
  and exists (
    select 1
    from public.workflow_steps ws
    where ws.id::text = split_part(public.event_queue.idempotency_key, ':', 3)
      and ws.organization_id = public.event_queue.organization_id
      and ws.provider = 'hubspot'
  );

delete from public.workflow_runs
where organization_id in (select organization_id from tmp_hubspot_integrations)
  and (
    trigger_event_type like 'hubspot.%'
    or coalesce(metadata ->> 'tool_name', '') = 'hubspot_crm'
    or coalesce(metadata ->> 'integration_id', '') in (
      select id::text
      from tmp_hubspot_integrations
    )
  );

delete from public.workflow_steps
where provider = 'hubspot';

delete from public.approval_items
where provider = 'hubspot';

delete from public.provider_budget_allocations
where provider = 'hubspot';

delete from public.agent_tools
where tool_type = 'hubspot'
   or (
     tool_type = 'crm'
     and coalesce(config ->> 'provider', '') = 'hubspot'
   );

delete from public.integrations
where id in (select id from tmp_hubspot_integrations);

drop index if exists public.idx_integrations_one_hubspot_per_org;

alter table public.integrations
  drop constraint if exists integrations_type_check;

alter table public.integrations
  add constraint integrations_type_check
  check (type in ('whatsapp', 'email', 'google', 'webhook', 'crm', 'openai', 'salesforce'));

alter table public.agent_tools
  drop constraint if exists agent_tools_tool_type_check;

alter table public.agent_tools
  add constraint agent_tools_tool_type_check
  check (tool_type in (
    'crm',
    'whatsapp',
    'salesforce',
    'gmail',
    'google_calendar'
  ));

commit;
