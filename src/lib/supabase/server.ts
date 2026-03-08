import { createServerClient, type SetAllCookies } from "@supabase/ssr";
import { cookies } from "next/headers";
import { env } from "@/lib/utils/env";
import type { Database } from "@/types/database";
import type { DatabaseClient } from "@/lib/supabase/service";

export async function createServerSupabaseClient(): Promise<DatabaseClient> {
  const cookieStore = await cookies();

  return createServerClient<Database>(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet: Parameters<SetAllCookies>[0]) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options);
            });
          } catch {
            // Server Components no pueden escribir cookies directamente.
            // Las cookies de sesion las escribe el middleware en cada request.
          }
        },
      },
    }
  ) as unknown as DatabaseClient;
}
