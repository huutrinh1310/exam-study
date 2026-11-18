"use server";

import { redirect } from "next/navigation";
import {
  loginSchema,
  safeRedirectPath,
  signupSchema,
  updatePasswordSchema,
} from "@/lib/auth-validation";
import type { AuthActionState } from "@/lib/action-types";
import {
  createSupabaseServerClient,
  SupabaseConfigurationError,
} from "@/lib/supabase/server";
import { getSupabaseConfig } from "@/lib/supabase/config";

function formString(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

async function createAuthClient() {
  try {
    return {
      client: await createSupabaseServerClient({ writeCookies: true }),
      error: undefined,
    };
  } catch (error) {
    if (error instanceof SupabaseConfigurationError) {
      return { client: undefined, error: error.message };
    }
    throw error;
  }
}

function trustedCallbackUrl(next: string): string | undefined {
  const config = getSupabaseConfig();
  if (!config.ok) {
    return undefined;
  }

  const url = new URL("/auth/callback", config.config.siteUrl);
  url.searchParams.set("next", safeRedirectPath(next));
  return url.toString();
}

function operationError(error: unknown, fallback: string): AuthActionState {
  return {
    error:
      error instanceof Error
        ? `${fallback}: ${error.message}`
        : `${fallback}. Check your connection and try again.`,
  };
}

export async function loginAction(
  _previous: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const parsed = loginSchema.safeParse({
    email: formString(formData, "email"),
    password: formString(formData, "password"),
  });
  if (!parsed.success) {
    return { error: "Enter a valid email address and password." };
  }

  const { client, error } = await createAuthClient();
  if (!client) {
    return { error: error ?? "Supabase is unavailable." };
  }

  try {
    const result = await client.auth.signInWithPassword(parsed.data);
    if (result.error) {
      return { error: result.error.message };
    }
    if (!result.data.user.email_confirmed_at) {
      return { error: "Verify your email address before signing in." };
    }
  } catch (caught) {
    return operationError(caught, "Could not sign in");
  }

  redirect(safeRedirectPath(formString(formData, "next"), "/library"));
}

export async function signupAction(
  _previous: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const parsed = signupSchema.safeParse({
    email: formString(formData, "email"),
    password: formString(formData, "password"),
    confirmPassword: formString(formData, "confirmPassword"),
  });
  if (!parsed.success) {
    return { error: "Enter a valid email and matching passwords of at least 8 characters." };
  }

  const callbackUrl = trustedCallbackUrl(
    safeRedirectPath(formString(formData, "next"), "/library"),
  );
  if (!callbackUrl) {
    return {
      error:
        "Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, and NEXT_PUBLIC_SITE_URL.",
    };
  }

  const { client, error } = await createAuthClient();
  if (!client) {
    return { error: error ?? "Supabase is unavailable." };
  }

  try {
    const { error: signupError } = await client.auth.signUp({
      email: parsed.data.email,
      password: parsed.data.password,
      options: { emailRedirectTo: callbackUrl },
    });
    if (signupError) {
      return { error: signupError.message };
    }
  } catch (caught) {
    return operationError(caught, "Could not create your account");
  }

  return {
    message: "Check your email for a verification link to finish creating your account.",
  };
}

export async function requestPasswordResetAction(
  _previous: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const email = formString(formData, "email");
  const parsedEmail = loginSchema.shape.email.safeParse(email);
  if (!parsedEmail.success) {
    return { error: "Enter a valid email address." };
  }

  const callbackUrl = trustedCallbackUrl("/auth/reset");
  if (!callbackUrl) {
    return {
      error:
        "Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, and NEXT_PUBLIC_SITE_URL.",
    };
  }

  const { client, error } = await createAuthClient();
  if (!client) {
    return { error: error ?? "Supabase is unavailable." };
  }

  try {
    const { error: resetError } = await client.auth.resetPasswordForEmail(
      parsedEmail.data,
      { redirectTo: callbackUrl },
    );
    if (resetError) {
      return { error: resetError.message };
    }
  } catch (caught) {
    return operationError(caught, "Could not request a password reset");
  }

  return {
    message: "If an account exists for that email, a password reset link is on its way.",
  };
}

export async function updatePasswordAction(
  _previous: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const parsed = updatePasswordSchema.safeParse({
    password: formString(formData, "password"),
    confirmPassword: formString(formData, "confirmPassword"),
  });
  if (!parsed.success) {
    return { error: "Enter matching passwords of at least 8 characters." };
  }

  const { client, error } = await createAuthClient();
  if (!client) {
    return { error: error ?? "Supabase is unavailable." };
  }

  try {
    const { data, error: userError } = await client.auth.getUser();
    if (userError) {
      return { error: `Could not verify your account: ${userError.message}` };
    }
    if (!data.user?.email_confirmed_at) {
      return { error: "Open the password reset link from your verified email first." };
    }

    const { error: updateError } = await client.auth.updateUser({
      password: parsed.data.password,
    });
    if (updateError) {
      return { error: updateError.message };
    }
  } catch (caught) {
    return operationError(caught, "Could not update your password");
  }

  redirect("/library");
}

export async function signOutAction(): Promise<void> {
  const { client, error } = await createAuthClient();
  if (!client) {
    throw new Error(error ?? "Supabase is unavailable.");
  }

  try {
    const { error: signoutError } = await client.auth.signOut();
    if (signoutError) {
      throw new Error(signoutError.message);
    }
  } catch (caught) {
    throw new Error(operationError(caught, "Could not sign out").error);
  }

  redirect("/auth?mode=login&next=%2Flibrary");
}
