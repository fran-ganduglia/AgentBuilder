import "server-only";

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
      ? "Limite de mensajes alcanzado"
      : "Uso de mensajes al 80%";
    const body = percentage >= 100
      ? `Has alcanzado el limite de ${input.planLimit} mensajes/mes. Actualiza tu plan para continuar.`
      : `Has usado ${input.currentUsage} de ${input.planLimit} mensajes disponibles este mes.`;

    const serviceClient = createServiceSupabaseClient();

    // Deduplicate: check if notification of same type exists this month
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
    }
  } catch (error) {
    console.error("notifications.unexpected_error", {
      error: error instanceof Error ? error.message : "unknown",
    });
  }
}
