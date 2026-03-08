import "server-only";

import { createServiceSupabaseClient } from "@/lib/supabase/service";
import type { Json } from "@/types/database";

type AuditLogInput = {
  organizationId: string;
  userId: string | null;
  action: string;
  resourceType: string;
  resourceId: string | null;
  oldValue?: Json;
  newValue?: Json;
  ipAddress?: string;
  userAgent?: string;
};

export async function insertAuditLog(input: AuditLogInput): Promise<void> {
  try {
    const serviceClient = createServiceSupabaseClient();

    const { error } = await serviceClient.from("audit_logs").insert({
      organization_id: input.organizationId,
      user_id: input.userId,
      action: input.action,
      resource_type: input.resourceType,
      resource_id: input.resourceId,
      old_value: input.oldValue ?? null,
      new_value: input.newValue ?? null,
      ip_address: input.ipAddress ?? null,
      user_agent: input.userAgent ?? null,
    });

    if (error) {
      console.error("audit.insert_error", {
        action: input.action,
        resourceType: input.resourceType,
        error: error.message,
      });
    }
  } catch (error) {
    console.error("audit.unexpected_error", {
      action: input.action,
      error: error instanceof Error ? error.message : "unknown",
    });
  }
}
