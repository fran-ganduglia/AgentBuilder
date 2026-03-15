import "server-only";

import { enqueueEvent } from "@/lib/db/event-queue";
import { createServiceSupabaseClient } from "@/lib/supabase/service";

type PlanLimitNotificationInput = {
  organizationId: string;
  currentUsage: number;
  planLimit: number;
};

export async function insertPlanLimitNotification(
  input: PlanLimitNotificationInput
): Promise<void> {
  try {
    if (input.planLimit <= 0) return;

    const percentage = (input.currentUsage / input.planLimit) * 100;
    if (percentage < 80) return;

    const type = percentage >= 100 ? "plan.limit_reached" : "plan.limit_warning";
    const title = percentage >= 100
      ? "Limite de sesiones alcanzado"
      : "Uso de sesiones al 80%";
    const body = percentage >= 100
      ? `Has alcanzado el limite de ${input.planLimit} sesiones/mes. Actualiza tu plan para seguir atendiendo nuevas conversaciones.`
      : `Has usado ${input.currentUsage} de ${input.planLimit} sesiones disponibles este mes.`;

    const serviceClient = createServiceSupabaseClient();

    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

    const { data: existing } = await serviceClient
      .from("notifications")
      .select("id")
      .eq("organization_id", input.organizationId)
      .eq("type", type)
      .gte("created_at", monthStart)
      .limit(1);

    if (existing && existing.length > 0) return;

    const { error } = await serviceClient.from("notifications").insert({
      organization_id: input.organizationId,
      type,
      title,
      body,
      resource_type: "plan",
    });

    if (error) {
      console.error("notifications.insert_error", {
        type,
        error: error.message,
      });
      return;
    }

    await enqueueEvent({
      organizationId: input.organizationId,
      eventType: type,
      entityType: "plan",
      entityId: input.organizationId,
      idempotencyKey: `${type}:${input.organizationId}:${monthStart}`,
      payload: {
        organization_id: input.organizationId,
        current_usage: input.currentUsage,
        plan_limit: input.planLimit,
        usage_percentage: Math.round(percentage * 100) / 100,
        period_start: monthStart,
      },
    });
  } catch (error) {
    console.error("notifications.unexpected_error", {
      error: error instanceof Error ? error.message : "unknown",
    });
  }
}
