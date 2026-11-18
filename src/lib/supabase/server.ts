import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Database } from "../database.types";
import { requireSupabaseConfig, SupabaseConfigurationError } from "./config";

export { SupabaseConfigurationError };

export async function createSupabaseServerClient({
  writeCookies = false,
}: { writeCookies?: boolean } = {}) {
  const { supabaseUrl, anonKey } = requireSupabaseConfig();
  const cookieStore = await cookies();

  return createServerClient<Database>(supabaseUrl, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        if (!writeCookies) {
          return;
        }

        cookiesToSet.forEach(({ name, value, options }) => {
          cookieStore.set(name, value, options);
        });
      },
    },
  });
}
