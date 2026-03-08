"use client";

import { createBrowserClient } from "@supabase/ssr";
import { env } from "@/lib/utils/env";
import type { Database } from "@/types/database";

type BrowserSupabaseClient = ReturnType<typeof createBrowserClient<Database>>;

let client: BrowserSupabaseClient | undefined;

export function createBrowserSupabaseClient(): BrowserSupabaseClient {
  if (client !== undefined) return client;

  client = createBrowserClient<Database>(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );

  return client;
}
