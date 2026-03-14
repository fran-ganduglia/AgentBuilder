create table public.workflow_runs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  agent_id uuid not null,
  conversation_id uuid,
  created_by uuid,
  trigger_source text not null
    check (trigger_source in ('chat', 'api', 'webhook', 'schedule', 'provider_event', 'manual', 'worker')),
  trigger_event_type text,
  workflow_template_id text,
  automation_preset text not null
    check (automation_preset in ('copilot', 'assisted', 'autonomous')),
  status text not null default 'queued'
    check (status in ('queued', 'running', 'waiting_approval', 'blocked', 'failed', 'completed', 'partially_completed', 'manual_repair_required', 'cancelled')),
  current_step_id text,
  started_at timestamptz,
  finished_at timestamptz,
  last_transition_at timestamptz not null default now(),
  failure_code text,
  failure_message text,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (id, organization_id),

  foreign key (agent_id, organization_id)
    references public.agents(id, organization_id) on delete cascade,
  foreign key (conversation_id, organization_id)
    references public.conversations(id, organization_id) on delete set null,
  foreign key (created_by, organization_id)
    references public.users(id, organization_id) on delete set null
);

create index idx_workflow_runs_org_status
  on public.workflow_runs(organization_id, status, created_at desc);
create index idx_workflow_runs_org_agent
  on public.workflow_runs(organization_id, agent_id, created_at desc);
create index idx_workflow_runs_org_conversation
  on public.workflow_runs(organization_id, conversation_id)
  where conversation_id is not null;

create trigger trigger_workflow_runs_updated_at
  before update on public.workflow_runs
  for each row execute function public.set_updated_at();

create table public.workflow_steps (
  id uuid primary key default gen_random_uuid(),
  workflow_run_id uuid not null,
  organization_id uuid not null,
  step_id text not null,
  step_index int not null check (step_index >= 1),
  provider text not null,
  action text not null,
  status text not null default 'queued'
    check (status in ('queued', 'running', 'waiting_approval', 'blocked', 'failed', 'failed_due_to_expired_approval', 'completed', 'skipped', 'manual_repair_required')),
  is_required boolean not null default true,
  approval_policy text not null default 'none'
    check (approval_policy in ('none', 'required')),
  approval_timeout_ms int
    check (approval_timeout_ms is null or approval_timeout_ms > 0),
  attempt int not null default 1 check (attempt >= 1),
  max_attempts int not null default 3 check (max_attempts >= 1),
  idempotency_key text not null,
  provider_request_key text,
  compensation_action text,
  compensation_status text not null default 'not_required'
    check (compensation_status in ('not_required', 'pending', 'completed', 'failed', 'manual_repair_required')),
  input_payload jsonb not null default '{}',
  output_payload jsonb,
  error_code text,
  error_message text,
  queued_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (id, organization_id),
  unique (workflow_run_id, step_id, attempt),
  unique (organization_id, idempotency_key),

  foreign key (workflow_run_id, organization_id)
    references public.workflow_runs(id, organization_id) on delete cascade
);

create index idx_workflow_steps_org_run
  on public.workflow_steps(organization_id, workflow_run_id, step_index, attempt desc);
create index idx_workflow_steps_org_status
  on public.workflow_steps(organization_id, status, queued_at desc);
create index idx_workflow_steps_org_provider_action
  on public.workflow_steps(organization_id, provider, action);

create trigger trigger_workflow_steps_updated_at
  before update on public.workflow_steps
  for each row execute function public.set_updated_at();

create table public.approval_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  workflow_run_id uuid not null,
  workflow_step_id uuid not null,
  agent_id uuid not null,
  requested_by uuid,
  resolved_by uuid,
  provider text not null,
  action text not null,
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected', 'expired')),
  risk_level text not null default 'medium'
    check (risk_level in ('low', 'medium', 'high')),
  summary text not null,
  payload_summary jsonb not null default '{}',
  context jsonb not null default '{}',
  resolution_note text,
  expires_at timestamptz not null,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (id, organization_id),
  unique (workflow_step_id),

  foreign key (workflow_run_id, organization_id)
    references public.workflow_runs(id, organization_id) on delete cascade,
  foreign key (workflow_step_id, organization_id)
    references public.workflow_steps(id, organization_id) on delete cascade,
  foreign key (agent_id, organization_id)
    references public.agents(id, organization_id) on delete cascade,
  foreign key (requested_by, organization_id)
    references public.users(id, organization_id) on delete set null,
  foreign key (resolved_by, organization_id)
    references public.users(id, organization_id) on delete set null
);

create index idx_approval_items_org_status_expires
  on public.approval_items(organization_id, status, expires_at);
create index idx_approval_items_org_agent_status
  on public.approval_items(organization_id, agent_id, status, created_at desc);
create index idx_approval_items_pending
  on public.approval_items(expires_at)
  where status = 'pending';

create trigger trigger_approval_items_updated_at
  before update on public.approval_items
  for each row execute function public.set_updated_at();

create table public.provider_budget_allocations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  workflow_run_id uuid not null,
  workflow_step_id uuid not null,
  provider text not null,
  method_key text not null,
  window_key text not null,
  decision text not null
    check (decision in ('allow', 'queue', 'throttle', 'reject')),
  status text not null default 'reserved'
    check (status in ('reserved', 'consumed', 'released', 'expired', 'rejected')),
  units int not null default 1 check (units >= 1),
  reserved_at timestamptz not null default now(),
  consumed_at timestamptz,
  released_at timestamptz,
  expires_at timestamptz,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (id, organization_id),
  unique (workflow_step_id, method_key, window_key),

  foreign key (workflow_run_id, organization_id)
    references public.workflow_runs(id, organization_id) on delete cascade,
  foreign key (workflow_step_id, organization_id)
    references public.workflow_steps(id, organization_id) on delete cascade
);

create index idx_provider_budget_allocations_org_provider_status
  on public.provider_budget_allocations(organization_id, provider, status, reserved_at desc);
create index idx_provider_budget_allocations_org_run
  on public.provider_budget_allocations(organization_id, workflow_run_id, reserved_at desc);
create index idx_provider_budget_allocations_active_window
  on public.provider_budget_allocations(provider, method_key, window_key, status)
  where status in ('reserved', 'consumed');

create trigger trigger_provider_budget_allocations_updated_at
  before update on public.provider_budget_allocations
  for each row execute function public.set_updated_at();

alter table public.workflow_runs enable row level security;
alter table public.workflow_steps enable row level security;
alter table public.approval_items enable row level security;
alter table public.provider_budget_allocations enable row level security;

create policy workflow_runs_select on public.workflow_runs
  for select using (organization_id = public.get_user_organization_id());

create policy workflow_steps_select on public.workflow_steps
  for select using (organization_id = public.get_user_organization_id());

create policy approval_items_select on public.approval_items
  for select using (
    organization_id = public.get_user_organization_id()
    and public.get_user_role() in ('admin', 'editor', 'operador')
  );

create policy approval_items_update on public.approval_items
  for update
  using (
    organization_id = public.get_user_organization_id()
    and public.get_user_role() in ('admin', 'editor', 'operador')
  )
  with check (
    organization_id = public.get_user_organization_id()
    and public.get_user_role() in ('admin', 'editor', 'operador')
  );

create policy provider_budget_allocations_select on public.provider_budget_allocations
  for select using (
    organization_id = public.get_user_organization_id()
    and public.get_user_role() = 'admin'
  );
