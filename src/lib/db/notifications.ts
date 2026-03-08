import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { Notification } from "@/types/app";

type DbResult<T> = { data: T | null; error: string | null };

const MAX_NOTIFICATIONS = 20;

export async function listNotifications(
  organizationId: string,
  onlyUnread = true
): Promise<DbResult<Notification[]>> {
  const supabase = await createServerSupabaseClient();

  let query = supabase
    .from("notifications")
    .select("*")
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false })
    .limit(MAX_NOTIFICATIONS);

  if (onlyUnread) {
    query = query.eq("is_read", false);
  }

  const { data, error } = await query;

  if (error) {
    return { data: null, error: error.message };
  }

  return { data: data as Notification[], error: null };
}

export async function countUnreadNotifications(
  organizationId: string
): Promise<DbResult<number>> {
  const supabase = await createServerSupabaseClient();

  const { count, error } = await supabase
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", organizationId)
    .eq("is_read", false);

  if (error) {
    return { data: null, error: error.message };
  }

  return { data: count ?? 0, error: null };
}

export async function markAsRead(
  notificationId: string,
  organizationId: string
): Promise<DbResult<Notification>> {
  const supabase = await createServerSupabaseClient();

  const { data, error } = await supabase
    .from("notifications")
    .update({ is_read: true })
    .eq("id", notificationId)
    .eq("organization_id", organizationId)
    .select("*")
    .single();

  if (error) {
    return { data: null, error: error.message };
  }

  return { data: data as Notification, error: null };
}

export async function markAllAsRead(
  organizationId: string
): Promise<DbResult<number>> {
  const supabase = await createServerSupabaseClient();

  const { data, error } = await supabase
    .from("notifications")
    .update({ is_read: true })
    .eq("organization_id", organizationId)
    .eq("is_read", false)
    .select("id");

  if (error) {
    return { data: null, error: error.message };
  }

  return { data: data?.length ?? 0, error: null };
}
