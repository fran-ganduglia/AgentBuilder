create table public.runtime_usage_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  agent_id uuid not null,
  runtime_run_id uuid not null,
  action_type text,
  provider text,
  usage_kind text not null
    check (
      usage_kind in (
        'runtime_run',
        'action_executed',
        'approval_enqueued',
        'llm_planner_call',
        'llm_repair_call',
        'llm_postprocess_call',
        'provider_call',
        'side_effect_write'
      )
    ),
  quantity int not null default 1 check (quantity >= 0),
  tokens_input int not null default 0 check (tokens_input >= 0),
  tokens_output int not null default 0 check (tokens_output >= 0),
  estimated_cost_usd numeric(12,6) not null default 0 check (estimated_cost_usd >= 0),
  surface text,
  approval_item_id uuid,
  workflow_run_id uuid,
  workflow_step_id uuid,
  provider_request_id text,
  metadata jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now(),

  foreign key (agent_id, organization_id)
    references public.agents(id, organization_id) on delete cascade,
  foreign key (runtime_run_id, organization_id)
    references public.runtime_runs(id, organization_id) on delete cascade
);

create index idx_runtime_usage_events_org_occurred
  on public.runtime_usage_events(organization_id, occurred_at desc);
create index idx_runtime_usage_events_org_kind_occurred
  on public.runtime_usage_events(organization_id, usage_kind, occurred_at desc);
create index idx_runtime_usage_events_org_run_occurred
  on public.runtime_usage_events(organization_id, runtime_run_id, occurred_at asc);
create index idx_runtime_usage_events_org_provider_occurred
  on public.runtime_usage_events(organization_id, provider, occurred_at desc)
  where provider is not null;
create index idx_runtime_usage_events_org_action_occurred
  on public.runtime_usage_events(organization_id, action_type, occurred_at desc)
  where action_type is not null;

alter table public.runtime_usage_events enable row level security;

create policy runtime_usage_events_select on public.runtime_usage_events
  for select using (
    organization_id = public.get_user_organization_id()
    and public.get_user_role() = 'admin'
  );
