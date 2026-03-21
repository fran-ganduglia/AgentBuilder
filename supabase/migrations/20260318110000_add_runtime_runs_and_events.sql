create table public.runtime_runs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  agent_id uuid not null,
  conversation_id uuid,
  request_id text not null,
  trace_id text not null,
  status text not null default 'running'
    check (
      status in (
        'running',
        'success',
        'retry',
        'needs_llm',
        'needs_user',
        'failed',
        'blocked',
        'waiting_approval',
        'waiting_async_execution',
        'completed_with_degradation',
        'manual_repair_required'
      )
    ),
  planner_model text,
  planner_confidence numeric(5,4),
  action_plan jsonb not null default '{}'::jsonb,
  current_action_index int not null default 0 check (current_action_index >= 0),
  checkpoint_node text,
  llm_calls int not null default 0 check (llm_calls >= 0),
  tokens_input int not null default 0 check (tokens_input >= 0),
  tokens_output int not null default 0 check (tokens_output >= 0),
  estimated_cost_usd numeric(12,6) not null default 0,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (id, organization_id),
  unique (organization_id, request_id),
  unique (organization_id, trace_id),

  foreign key (agent_id, organization_id)
    references public.agents(id, organization_id) on delete cascade,
  foreign key (conversation_id, organization_id)
    references public.conversations(id, organization_id) on delete set null
);

create index idx_runtime_runs_org_started
  on public.runtime_runs(organization_id, started_at desc);
create index idx_runtime_runs_org_status_started
  on public.runtime_runs(organization_id, status, started_at desc);
create index idx_runtime_runs_org_agent_started
  on public.runtime_runs(organization_id, agent_id, started_at desc);
create index idx_runtime_runs_org_conversation
  on public.runtime_runs(organization_id, conversation_id)
  where conversation_id is not null;

create trigger trigger_runtime_runs_updated_at
  before update on public.runtime_runs
  for each row execute function public.set_updated_at();

create table public.runtime_events (
  id uuid primary key default gen_random_uuid(),
  runtime_run_id uuid not null,
  organization_id uuid not null,
  action_id text,
  node text,
  status text,
  reason text,
  latency_ms int,
  provider text,
  provider_request_id text,
  approval_item_id uuid,
  workflow_run_id uuid,
  workflow_step_id uuid,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),

  foreign key (runtime_run_id, organization_id)
    references public.runtime_runs(id, organization_id) on delete cascade,
  foreign key (approval_item_id, organization_id)
    references public.approval_items(id, organization_id) on delete set null,
  foreign key (workflow_run_id, organization_id)
    references public.workflow_runs(id, organization_id) on delete set null,
  foreign key (workflow_step_id, organization_id)
    references public.workflow_steps(id, organization_id) on delete set null
);

create index idx_runtime_events_org_run_created
  on public.runtime_events(organization_id, runtime_run_id, created_at asc);
create index idx_runtime_events_org_action_created
  on public.runtime_events(organization_id, action_id, created_at desc)
  where action_id is not null;
create index idx_runtime_events_org_node_created
  on public.runtime_events(organization_id, node, created_at desc)
  where node is not null;
create index idx_runtime_events_org_provider_created
  on public.runtime_events(organization_id, provider, created_at desc)
  where provider is not null;

alter table public.runtime_runs enable row level security;
alter table public.runtime_events enable row level security;

create policy runtime_runs_select on public.runtime_runs
  for select using (organization_id = public.get_user_organization_id());

create policy runtime_events_select on public.runtime_events
  for select using (organization_id = public.get_user_organization_id());
