import Link from "next/link";
import { connection } from "next/server";
import PasswordResetForm from "@/components/auth/password-reset-form";
import { getSupabaseConfig } from "@/lib/supabase/config";

export default async function ResetPasswordPage() {
  await connection();
  const config = getSupabaseConfig();

  return (
    <>
      <span className="eyebrow">Account security</span>
      <h1>Choose a new password</h1>
      <p>Use a new password you can remember. We’ll confirm the change securely.</p>
      <PasswordResetForm setupError={config.ok ? undefined : config.error} />
      <nav aria-label="Account options"><p><Link href="/auth?mode=login&next=%2Flibrary">Back to sign in</Link></p></nav>
    </>
  );
}
