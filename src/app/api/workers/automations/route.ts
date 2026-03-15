import { NextResponse } from "next/server";
import {
  classifyAutomationScope,
  readAutomationInstructionFields,
  readAutomationTriggerConfig,
  shouldBlockAutomationForScope,
} from "@/lib/agents/automation-contract";
import { readAgentSetupState } from "@/lib/agents/agent-setup-state";
import { listActiveAgentsByIds } from "@/lib/db/agents";
import {
  areWorkersEnabled,
  getWorkerUnauthorizedResponse,
  getWorkersDisabledResponse,
  validateCronRequest,
  withWorkerCompatibilityHeaders,
} from "@/lib/workers/auth";
import {
  listScheduledAutomationsForWorker,
  markAutomationRun,
} from "@/lib/db/agent-automations";
import { enqueueEvent } from "@/lib/db/event-queue";
import { matchesCronSchedule } from "@/lib/utils/cron-matcher";

export async function GET(request: Request) {
  if (!validateCronRequest(request)) {
    return getWorkerUnauthorizedResponse();
  }

  if (!areWorkersEnabled()) {
    return getWorkersDisabledResponse();
  }

  const result = await listScheduledAutomationsForWorker();
  if (result.error || !result.data) {
    return NextResponse.json({ error: result.error ?? "Error al cargar automatizaciones" }, { status: 500 });
  }

  const agentsResult = await listActiveAgentsByIds(
    result.data.map((automation) => automation.agent_id)
  );
  if (agentsResult.error || !agentsResult.data) {
    return NextResponse.json(
      { error: agentsResult.error ?? "Error al cargar agentes de automatizaciones" },
      { status: 500 }
    );
  }

  const agentsById = new Map(agentsResult.data.map((agent) => [agent.id, agent]));
  const now = new Date();
  let triggered = 0;
  let skipped = 0;
  let blocked = 0;

  const setupStateByAgentId = new Map(
    agentsResult.data.map((agent) => [agent.id, readAgentSetupState(agent)])
  );

  for (const automation of result.data) {
    const agent = agentsById.get(automation.agent_id);

    if (!agent || agent.organization_id !== automation.organization_id) {
      await markAutomationRun(automation.id, "failed");
      skipped++;
      continue;
    }

    if (agent) {
      const setupState = setupStateByAgentId.get(agent.id);

      if (setupState) {
        const instructionFields = readAutomationInstructionFields(
          automation.action_config
        );
        const scopeDecision = classifyAutomationScope({
          agentScope: setupState.agentScope,
          name: automation.name,
          description: automation.description,
          instruction: instructionFields.instruction,
          expectedOutput: instructionFields.expectedOutput,
          deliveryTarget: instructionFields.deliveryTarget,
        });
        const scopeBlock = shouldBlockAutomationForScope(scopeDecision);

        if (scopeBlock.blocked) {
          await markAutomationRun(automation.id, "failed");
          blocked++;
          continue;
        }
      }
    }

    const triggerConfig = readAutomationTriggerConfig(
      automation.trigger_config as Record<string, unknown>
    );
    if (!triggerConfig.cron) {
      skipped++;
      continue;
    }

    const cron = triggerConfig.cron;
    const timezone = triggerConfig.timezone;

    const lastRun = automation.last_run_at ? new Date(automation.last_run_at) : null;

    if (!matchesCronSchedule(cron, now, timezone, lastRun)) {
      skipped++;
      continue;
    }

    try {
      await Promise.all([
        enqueueEvent({
          organizationId: automation.organization_id,
          eventType: "automation.triggered",
          entityType: "agent_automation",
          entityId: automation.id,
          payload: {
            automation_id: automation.id,
            agent_id: automation.agent_id,
            action_type: automation.action_type,
          },
          idempotencyKey: `automation:${automation.id}:${now.toISOString().slice(0, 16)}`,
        }),
        markAutomationRun(automation.id, "success"),
      ]);
      triggered++;
    } catch {
      await markAutomationRun(automation.id, "failed");
    }
  }

  if (triggered === 0 && skipped === result.data.length) {
    return withWorkerCompatibilityHeaders(new NextResponse(null, { status: 204 }));
  }

  return withWorkerCompatibilityHeaders(
    NextResponse.json({ data: { processed: triggered, skipped, blocked } })
  );
}
