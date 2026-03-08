import "server-only";

import { createHmac } from "crypto";
import { createServiceSupabaseClient } from "@/lib/supabase/service";

export function signPayload(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("hex");
}

export async function decryptWebhookSecret(
  webhookId: string
): Promise<string | null> {
  const supabase = createServiceSupabaseClient();

  // Call Supabase RPC to decrypt the secret using pgcrypto
  // This function must exist in the database as SECURITY DEFINER, callable only by service_role
  // Since it may not be in generated types, use type assertion
  const { data, error } = await (supabase.rpc as CallableFunction)(
    "decrypt_webhook_secret",
    { webhook_id: webhookId }
  );

  if (error || !data) {
    console.error("webhook.decrypt_error", {
      webhookId,
      error: (error as { message?: string } | null)?.message ?? "no data",
    });
    return null;
  }

  return data as string;
}
