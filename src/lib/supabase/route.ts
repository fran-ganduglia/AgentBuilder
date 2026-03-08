import { createServerClient, type SetAllCookies } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { env } from "@/lib/utils/env";
import type { Database } from "@/types/database";
import type { DatabaseClient } from "@/lib/supabase/service";

type PendingCookie = Parameters<SetAllCookies>[0][number];

export async function createRouteHandlerSupabaseClient(): Promise<{
  supabase: DatabaseClient;
  applyCookies: (response: NextResponse) => NextResponse;
}> {
  const cookieStore = await cookies();
  const pendingCookies: PendingCookie[] = [];

  const supabase = createServerClient<Database>(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet: Parameters<SetAllCookies>[0]) {
          pendingCookies.push(...cookiesToSet);
        },
      },
    }
  ) as unknown as DatabaseClient;

  function applyCookies(response: NextResponse): NextResponse {
    pendingCookies.forEach(({ name, value, options }) => {
      response.cookies.set(name, value, options);
    });

    return response;
  }

  return {
    supabase,
    applyCookies,
  };
}