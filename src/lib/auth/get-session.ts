import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { AppUser, Organization, Role, UserProfile } from "@/types/app";

type SessionResult = {
  user: AppUser;
  organizationId: string;
  role: Role;
} | null;

type SessionProfile = Pick<
  UserProfile,
  "id" | "email" | "full_name" | "organization_id" | "role" | "is_active" | "deleted_at"
>;

type SessionOrganization = Pick<Organization, "id" | "is_active" | "deleted_at">;

export async function getSession(): Promise<SessionResult> {
  const supabase = await createServerSupabaseClient();

  const {
    data: { user: authUser },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !authUser) {
    return null;
  }

  const { data: profileData, error: profileError } = await supabase
    .from("users")
    .select("id, email, full_name, organization_id, role, is_active, deleted_at")
    .eq("id", authUser.id)
    .single();

  const profile = profileData as SessionProfile | null;

  if (profileError || !profile) {
    return null;
  }

  if (!profile.is_active || profile.deleted_at !== null) {
    return null;
  }

  const { data: organizationData, error: organizationError } = await supabase
    .from("organizations")
    .select("id, is_active, deleted_at")
    .eq("id", profile.organization_id)
    .single();

  const organization = organizationData as SessionOrganization | null;

  if (
    organizationError ||
    !organization ||
    !organization.is_active ||
    organization.deleted_at !== null
  ) {
    return null;
  }

  const role = profile.role as Role;

  const appUser: AppUser = {
    id: profile.id,
    email: profile.email,
    fullName: profile.full_name ?? "",
    organizationId: profile.organization_id,
    role,
  };

  return {
    user: appUser,
    organizationId: profile.organization_id,
    role,
  };
}

export async function signOut(): Promise<never> {
  const supabase = await createServerSupabaseClient();
  await supabase.auth.signOut();
  redirect("/login");
}
