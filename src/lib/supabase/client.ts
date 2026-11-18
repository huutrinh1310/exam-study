"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../database.types";
import { getSupabaseConfig } from "./config";

export function createSupabaseBrowserClient(): SupabaseClient<Database> | null {
  const result = getSupabaseConfig();
  if (!result.ok) {
    return null;
  }

  return createBrowserClient<Database>(
    result.config.supabaseUrl,
    result.config.anonKey,
  );
}
