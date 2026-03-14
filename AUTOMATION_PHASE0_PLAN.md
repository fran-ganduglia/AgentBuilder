# Automation Phase 0 Plan

## Purpose

This document locks the shared foundation required before any ecosystem moves to `v1.5` writes or multi-system automation. The current repo already has workflow-first setup metadata, `event_queue`, provider budgets, worker routes, and per-provider runtimes, but it does not yet have the common execution substrate for approvals, sagas, or workflow-step idempotency.

Phase 0 is therefore a prerequisite, not an optional refinement.

## Closed decisions

- Human approval for the first production version lives in a web `approval inbox`.
- Pending approvals must be visible in-app through a badge/counter in the main shell and relevant workflow/agent surfaces.
- Every approval has a configurable timeout per action.
- When an approval expires, the step fails as `failed_due_to_expired_approval`; the saga compensates when safe or moves to `manual_repair_required`.
- Multi-system workflows use saga coordination, never distributed transactions.
- WhatsApp remains constrained by the 24h customer care window and Meta-approved templates.
- Zapier stays late in the roadmap and is not an early breadth accelerator.
- `agent` continues to represent the configurable workflow instance in the first version.
- `autonomous` remains out of production.
- The Phase 0 migration in `supabase/migrations/20260313223000_add_workflow_phase0_foundation.sql` is the approved schema baseline for this foundation.
- The official recurring scheduler for Phase 0 workers is `n8n`, not Vercel Cron.

## Current repo baseline

What already exists and should be reused:

- `setup_state` persists workflow-first metadata on `agents`.
- `event_queue` already provides async job claiming, retries, and event idempotency.
- `provider-budgets.ts` already records provider quota usage in Redis.
- Notification UI already has a top-level unread badge in the app shell.
- Google Workspace, HubSpot, Salesforce, and WhatsApp already have partial runtime slices.
- The reviewed schema draft in `supabase/migrations/20260313223000_add_workflow_phase0_foundation.sql` chooses database persistence for allocator admissions via `provider_budget_allocations`.
- `n8n/workflows/event-queue-worker.json` and `n8n/workflows/integration-health.json` already provide the pattern for authenticated worker scheduling via `APP_BASE_URL` + `CRON_SECRET`.

What is still missing:

- A workflow-run model with persisted step state.
- Approval persistence and explicit expiration handling.
- Shared async orchestration for writes.
- A formal action capability matrix by provider/action.
- Shared budget admission control before provider calls.
- Step-level idempotency and compensation tracking.
- The dedicated `n8n` workflow for `/api/workers/approvals`.

### Concrete gap map in this repo

These are the main implementation gaps confirmed in code today:

- `src/lib/integrations/provider-budgets.ts` records usage in Redis after provider calls; it is not yet an admission allocator that decides `allow|queue|throttle|reject` before execution.
- `src/lib/workers/event-queue.ts` already supports generic async claiming and retries, but it does not yet persist workflow-run lifecycle, per-step state transitions, or approval waiting semantics.
- `src/components/layout/app-header.tsx` and `src/app/(app)/layout.tsx` already implement a notification badge pattern that can be reused for approval pending counts, but approvals still need their own inbox, queries, and API routes instead of piggybacking on `notifications`.
- `src/types/database.ts` does not yet expose the new Phase 0 tables from the approved migration, so generated Supabase types need regeneration after the migration is applied in the target environment.
- No server-side DB modules exist yet for `workflow_runs`, `workflow_steps`, `approval_items`, or `provider_budget_allocations`.
- No API routes or worker entrypoints exist yet for approval inbox reads/resolution, approval expiration sweeps, or workflow-step execution over the new tables.

## Hard gate before execution work

No ecosystem should gain `v1.5` write execution or workflow-driven writes until a reviewed and approved SQL migration exists.

At minimum, that migration must introduce:

- `workflow_runs`
- `workflow_steps`
- `approval_items`
- budget allocator state persistence
- minimal columns or foreign keys required to relate `agents` or instance-level operations to workflow runs and approvals

The approved migration uses a dedicated table, `provider_budget_allocations`, instead of Redis-only ephemeral state so admission, reservation, and release remain auditable per workflow step.

Do not rely on implicit tables, ad hoc JSON state, or purely in-memory step tracking for this phase.

## Required Phase 0 capabilities

### 1. Action matrix

Define a formal provider/action matrix with, at minimum:

- `access`
- `sync`
- `async`
- `requiresConfirmation`
- `workflowTriggerable`
- `allowedPresets`
- `approvalTimeoutMs`

This matrix becomes the source of truth for UX labels, approval policy, runtime gating, and future enforcement.

### 2. Automation presets

Persist and enforce the formal preset model:

- `copilot`
- `assisted`
- `autonomous`

`autonomous` stays disabled for production admission even if represented in config.

### 3. Approval inbox and in-app visibility

The web app needs a dedicated approval surface with:

- `pending`
- `approved`
- `rejected`
- `expired`

Each approval item must show:

- summarized payload
- risk level
- context
- expiration timestamp
- related workflow run
- related workflow step

Pending approvals must also surface in-app through a badge/counter in the shell and workflow-related views so approvals do not expire silently.

### 4. Approval expiration policy

Approval waiting must always terminate.

Rules:

- timeout is configurable per action, with a safe default
- expiration moves the step to `failed_due_to_expired_approval`
- the saga attempts compensation if a safe compensation exists
- otherwise the run ends in `manual_repair_required`
- a step must never remain in `waiting_approval` indefinitely

### 5. Async execution engine

All workflow-driven writes must move behind one async engine with:

- idempotent jobs
- bounded retries
- persisted status transitions

Target statuses:

- `queued`
- `running`
- `waiting_approval`
- `blocked`
- `failed`
- `completed`
- `partially_completed`
- `manual_repair_required`

### 6. Saga coordinator

Each workflow must execute as a saga with explicit step metadata:

- `stepId`
- `provider`
- `action`
- `required`
- `approvalPolicy`
- `compensationAction`

Rules:

- optional step failure can keep the workflow alive as partial completion
- required step failure triggers compensation for previously completed reversible steps
- if no safe compensation exists, end in `manual_repair_required`

### 7. Provider budget allocator

Current provider budgets record usage after the fact. Phase 0 upgrades this into admission control per organization and provider, aware of shared consumption across concurrent workflow runs.

Allocator decisions:

- `allow`
- `queue`
- `throttle`
- `reject`

This decision must happen before consuming provider quota.

### 8. Idempotency per step

Base format:

- `{workflowRunId}:{stepId}:{attempt}`

Persist for each step:

- workflow step status
- step idempotency key
- provider request key

Send provider idempotency headers or keys when supported. When not supported, deduplicate locally before issuing the mutation.

### 9. Provider error normalization

Normalize provider failures into a shared contract:

- `reauth_required`
- `scope_missing`
- `rate_limited`
- `provider_error`
- `validation_error`
- `budget_exhausted`

### 10. Base metrics

Phase 0 only requires directly measurable operational metrics:

- jobs per workflow run
- steps executed
- approvals requested/approved/rejected/expired
- provider rate limits
- provider budget denials
- step latency

Full saga observability can come later.

## Acceptance criteria

- No workflow-driven write happens outside the async engine.
- Every `assisted` action can generate a web approval item.
- Every approval expires with defined behavior.
- The app shell exposes pending approval count without opening the inbox.
- Every multi-step execution persists per-step state, per-step idempotency, and compensation traceability.
- The budget allocator can block or queue jobs before provider quota is consumed.

## Cross-system coordination

Every multi-system workflow should be modeled as a saga with:

- `stepId`
- `provider`
- `action`
- `required`
- `approvalPolicy`
- `compensationAction`

Execution rules:

- optional step failure keeps the workflow alive as partial completion
- required step failure compensates previously completed reversible steps
- if no safe compensation exists, the run ends in `manual_repair_required`
- do not assume universal rollback across Gmail, CRM, Calendar, or messaging providers
- prioritize early workflows where the first steps are reads or low-risk writes

## Ecosystem roadmap

### Order

1. Shared Phase 0 foundation plus approved migration
2. HubSpot and Salesforce
3. Google Calendar
4. Gmail
5. WhatsApp cross-system
6. Slack and Teams
7. Notion
8. Zapier

### HubSpot and Salesforce first

These ecosystems already have the nearest thing to assisted writes, so they should be the first to migrate from chat confirmation into the common async engine, approval inbox, and step idempotency model.

### Google Calendar before Gmail

Calendar writes fit the approval and idempotency model earlier than Gmail send flows. Gmail should only reach `send_reply` after drafts, labels, archive actions, and approval-safe orchestration exist.

### WhatsApp after the common engine

WhatsApp should join the shared engine as a channel that triggers or receives workflow results, but outbound automation must remain constrained by the Meta 24h window and approved templates.

## Ecosystem gaps by provider

### Gmail

Current baseline:

- `search_threads`
- `read_thread`
- metadata-only
- web chat only
- no full body, no attachment download, no writes

Missing before workflow readiness:

- `create_draft_reply`
- `apply_label`
- `archive_thread`
- stable thread/message references for async jobs
- triggers for new mail, unanswered thread, or SLA breach
- approval inbox support for drafts and mailbox mutations
- local idempotency to avoid duplicate drafts or labels

Phases:

- `v1.5`: draft + label + archive with approval inbox
- `v2`: inbound triggers and workflows
- `v3`: `send_reply` only for tightly constrained workflows

### Google Calendar

Current baseline:

- `check_availability`
- `list_events`
- web chat only
- no writes

Missing before workflow readiness:

- `create_event`
- `reschedule_event`
- `cancel_event`
- robust lookup and disambiguation
- attendees, buffers, timezone, and scheduling conflict handling
- approval inbox support for mutations
- triggers for upcoming meetings, no-shows, and reschedules
- idempotency for create and reschedule flows

Phases:

- `v1.5`: writes with web approval
- `v2`: saga with CRM, Gmail, and WhatsApp
- `v3`: hybrid automated booking

### HubSpot

Current baseline:

- lookup plus create/update for contacts, companies, deals, tasks, and meetings
- assisted writes confirmed in chat

Missing before workflow readiness:

- move writes into the async engine
- approval inbox
- real create/update idempotency
- instance-level config for pipeline, owner, and thresholds
- triggers for new lead, stale deal, and overdue task
- documented compensation or manual repair paths

Phases:

- `v1.5`: workflow-ready with approval inbox
- `v2`: automated reactivation and follow-up

### Salesforce

Current baseline:

- lookup plus create/update for leads, contacts, tasks, cases, and opportunities
- assisted writes confirmed in chat

Missing before workflow readiness:

- move writes into the async engine
- approval inbox
- idempotency per step
- instance-level config for owners, statuses, priorities, and objects
- triggers for new lead, SLA risk, and stalled opportunity
- compensation or manual repair guidance for non-reversible mutations

Phases:

- `v1.5`: workflow-ready with approval inbox
- `v2`: coordinated pipeline and case workflows with other channels

### WhatsApp

Current baseline:

- real channel
- webhook plus async auto-reply
- n8n follow-up, broadcast, and reengagement flows

Missing before workflow readiness:

- unify the channel with the shared workflow engine
- approvals for downstream CRM and Calendar actions
- budget and rate-limit coordination with the rest of the system
- stronger outbound proactive modeling

Hard restriction:

- outside the 24h window since the user's last message, outbound is allowed only with Meta-approved templates
- this applies to follow-ups, reminders, and campaigns

Phases:

- `v1.5`: assisted CRM and Calendar actions initiated from the channel
- `v2`: proactive workflows only within Meta rules

### Slack

Current baseline:

- no native integration yet

Missing before workflow readiness:

- OAuth v2
- events
- basic read/write support
- optional future support as a secondary approval surface

Phases:

- `v1`: internal channel
- `v2`: helpdesk and secondary approval surface

### Teams

Current baseline:

- no native integration yet

Missing before workflow readiness:

- Graph/app registration
- events
- read/write support
- enterprise permission handling

Phases:

- `v1`: internal channel
- `v2`: incident workflows and secondary approval surface

### Notion

Current baseline:

- no native integration yet

Missing before workflow readiness:

- OAuth
- structured retrieval
- page/database row create/update
- use as both knowledge source and result sink

Phases:

- `v1`: reliable read support
- `v2`: write-back for summaries, notes, and playbooks

### Zapier

Decision:

- remains late

Role:

- expansion layer once native triggers and actions are mature

Missing before workflow readiness:

- signed endpoints
- trigger/action bridge
- bridge idempotency and auditability

Phases:

- `v1`: expose triggers and actions
- `v2`: bridge toward non-native ecosystems

## Ecosystem readiness targets

Each ecosystem is considered automation-ready only when it has:

- useful read capability
- at least one write integrated with the approval inbox
- participation in the async engine
- normalized provider errors
- budget allocator enforcement
- step-level idempotency

Each multi-system workflow must demonstrate:

- step tracking
- approval timeout handling
- pending approval badge visibility
- partial completion
- compensation or `manual_repair_required`

## Implementation notes for this repo

- Prefer new server-side query modules under `src/lib/db` for workflow runs, steps, and approval items.
- Keep orchestration in server-side API routes, workers, and `src/lib/workers`; do not move execution logic into UI components.
- Reuse the existing shell/header badge patterns for pending approvals, but approvals should have their own data model and inbox surface rather than piggybacking only on generic notifications.
- Reuse `event_queue` only if it can safely back the new engine semantics; otherwise add workflow-specific persistence without bypassing tenant boundaries.
- Once the migration is approved, mirror the final table and column definitions into `SCHEMA.md` before or together with implementation.

## Next concrete deliverables

1. Keep `SCHEMA.md` aligned with the approved migration and final Phase 0 contracts.
2. Add server-side DB access modules for runs, steps, approvals, and allocator admissions.
3. Add approval inbox read/write APIs plus the pending counter endpoint for the app shell.
4. Introduce the shared action matrix and enforce it in provider runtimes and workflow UX.
5. Implement the async execution engine and saga coordinator on top of persisted run/step state.
6. Migrate HubSpot and Salesforce assisted writes into the common engine as the first `v1.5` ecosystems.

### Recommended implementation slices

To keep the change set reviewable, Phase 0 should land in these slices:

1. `Schema + types`: apply the approved migration in the real Supabase environment, regenerate `src/types/database.ts`, and add typed DB modules in `src/lib/db`.
2. `Approval surface`: add approval inbox queries, resolution mutations, expiration handling, and a dedicated pending counter for the existing shell badge pattern.
3. `Runtime contracts`: add the formal action matrix plus shared status, approval, idempotency, and normalized error types in server-side modules.
4. `Execution engine`: persist workflow runs and steps, wire bounded retries, and make approval waits and expiration transitions first-class.
5. `Budget admission`: upgrade provider budgets from post-fact recording to pre-call admission with `provider_budget_allocations` persistence.
6. `First ecosystems`: move HubSpot and Salesforce assisted writes into the engine before touching Calendar and Gmail writes.
