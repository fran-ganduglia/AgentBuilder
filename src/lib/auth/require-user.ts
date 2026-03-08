import { redirect } from "next/navigation";
import { getSession } from "./get-session";
import type { AppUser } from "@/types/app";

export async function requireUser(): Promise<AppUser> {
  const session = await getSession();

  if (!session) {
    redirect("/login");
  }

  return session.user;
}
