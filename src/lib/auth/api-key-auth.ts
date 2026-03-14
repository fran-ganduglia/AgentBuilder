import "server-only";

import { createServiceSupabaseClient } from "@/lib/supabase/service";

type OrganizationKeyRow = {
  id: string;
  is_active: boolean;
  deleted_at: string | null;
};

export async function validateApiKey(
  apiKey: string
): Promise<{ organizationId: string } | null> {
  if (!apiKey || apiKey.trim().length === 0) {
    return null;
  }

  const serviceClient = createServiceSupabaseClient();

  const { data, error } = await serviceClient
    .from("organizations")
    .select("id, is_active, deleted_at")
    .eq("api_key", apiKey)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  const row = data as OrganizationKeyRow;

  if (!row.is_active || row.deleted_at !== null) {
    return null;
  }

  return { organizationId: row.id };
}
