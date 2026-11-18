import { getSupabaseConfig } from "@/lib/supabase/config";
import { safeRedirectPath } from "@/lib/auth-validation";
import AuthForm, { type AuthMode } from "@/components/auth/auth-form";

type AuthPageProps = {
  searchParams: Promise<{ mode?: string; next?: string; error?: string }>;
};

const authMessages: Record<string, string> = {
  "verification-required": "Verify your email address before signing in.",
  callback: "That authentication link could not be verified. Request a new one and try again.",
};

export default async function AuthPage({ searchParams }: AuthPageProps) {
  const params = await searchParams;
  const mode: AuthMode =
    params.mode === "signup" || params.mode === "forgot"
      ? params.mode
      : "login";
  const config = getSupabaseConfig();

  return (
    <section>
      <h1>
        {mode === "signup"
          ? "Create your account"
          : mode === "forgot"
            ? "Reset your password"
            : "Sign in"}
      </h1>
      <p>
        {mode === "signup"
          ? "Create a private space for your questions and practice."
          : mode === "forgot"
            ? "We’ll send a secure link to the email address on your account."
            : "Pick up where you left off in your study workspace."}
      </p>
      <AuthForm
        mode={mode}
        next={safeRedirectPath(params.next, "/library")}
        setupError={config.ok ? undefined : config.error}
        notice={params.error ? authMessages[params.error] : undefined}
      />
    </section>
  );
}
