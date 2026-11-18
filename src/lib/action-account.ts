import type { SupabaseClient, User } from "@supabase/supabase-js";
import type { Database } from "./database.types";
import {
  createSupabaseServerClient,
  SupabaseConfigurationError,
} from "./supabase/server";

export type ActionAccountResult =
  | { ok: true; client: SupabaseClient<Database>; user: User }
  | { ok: false; error: string };

export async function getActionAccount(): Promise<ActionAccountResult> {
  let client: SupabaseClient<Database>;
  try {
    client = await createSupabaseServerClient({ writeCookies: true });
  } catch (error) {
    if (error instanceof SupabaseConfigurationError) {
      return { ok: false, error: error.message };
    }
    throw error;
  }

  try {
    const { data, error } = await client.auth.getUser();
    if (error) {
      if (
        error.name === "AuthSessionMissingError" ||
        error.status === 401 ||
        error.code === "session_not_found" ||
        error.code === "refresh_token_not_found"
      ) {
        return { ok: false, error: "Please sign in to continue." };
      }
      return { ok: false, error: `Could not verify your account: ${error.message}` };
    }
    if (!data.user) {
      return { ok: false, error: "Please sign in to continue." };
    }
    if (!data.user.email_confirmed_at) {
      return {
        ok: false,
        error: "Verify your email address before using this feature.",
      };
    }
    return { ok: true, client, user: data.user };
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error
          ? `Could not verify your account: ${error.message}`
          : "Could not verify your account because of a network error.",
    };
  }
}
