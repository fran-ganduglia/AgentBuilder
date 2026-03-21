import "server-only";

import { createServiceSupabaseClient } from "@/lib/supabase/service";
import {
  buildRuntimeMigrationSnapshot,
  type RuntimeMigrationSnapshotV1,
  type RuntimeMigrationMessageRecordV1,
} from "@/lib/runtime/migration-snapshot";
import { readRuntimeKillSwitchConfig, type RuntimeKillSwitchConfigV1 } from "@/lib/runtime/runtime-kill-switch";
import type { Json } from "@/types/database";

type DbResult<T> = { data: T | null; error: string | null };

export async function getOrganizationRuntimeKillSwitchConfig(
  organizationId: string
): Promise<DbResult<RuntimeKillSwitchConfigV1>> {
  const supabase = createServiceSupabaseClient();
  const { data, error } = await supabase
    .from("organizations")
    .select("settings")
    .eq("id", organizationId)
    .maybeSingle();

  if (error) {
    return { data: null, error: error.message };
  }

  return {
    data: readRuntimeKillSwitchConfig((data?.settings ?? null) as Json | null),
    error: null,
  };
}

export async function getRuntimeMigrationSnapshot(input: {
  organizationId: string;
  windowHours?: number;
}): Promise<
  DbResult<{
    killSwitch: RuntimeKillSwitchConfigV1;
    snapshot: RuntimeMigrationSnapshotV1;
  }>
> {
  const supabase = createServiceSupabaseClient();
  const windowHours = Math.max(1, input.windowHours ?? 24 * 7);
  const since = new Date(Date.now() - windowHours * 60 * 60 * 1000).toISOString();

  const [{ data: organizationData, error: organizationError }, { data: messagesData, error: messagesError }] =
    await Promise.all([
      supabase
        .from("organizations")
        .select("settings")
        .eq("id", input.organizationId)
        .maybeSingle(),
      supabase
        .from("messages")
        .select("created_at, metadata")
        .eq("organization_id", input.organizationId)
        .eq("role", "assistant")
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(500),
    ]);

  const error = organizationError?.message ?? messagesError?.message ?? null;
  if (error) {
    return { data: null, error };
  }

  const messages: RuntimeMigrationMessageRecordV1[] = (messagesData ?? []).map((row) => ({
    createdAt: row.created_at,
    metadata: (row.metadata ?? null) as Json | null,
  }));

  return {
    data: {
      killSwitch: readRuntimeKillSwitchConfig((organizationData?.settings ?? null) as Json | null),
      snapshot: buildRuntimeMigrationSnapshot({
        messages,
        windowHours,
      }),
    },
    error: null,
  };
}
