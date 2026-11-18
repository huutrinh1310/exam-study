import { NextResponse } from "next/server";
import { safeRedirectPath } from "@/lib/auth-validation";
import { getSupabaseConfig } from "@/lib/supabase/config";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const config = getSupabaseConfig();
  if (!config.ok) {
    return new Response(config.error, { status: 503 });
  }

  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  if (!code) {
    const failureUrl = new URL("/auth?mode=login&error=callback", config.config.siteUrl);
    return NextResponse.redirect(failureUrl);
  }

  const supabase = await createSupabaseServerClient({ writeCookies: true });
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    const failureUrl = new URL("/auth?mode=login&error=callback", config.config.siteUrl);
    return NextResponse.redirect(failureUrl);
  }

  const redirectPath = safeRedirectPath(requestUrl.searchParams.get("next"));
  return NextResponse.redirect(new URL(redirectPath, config.config.siteUrl));
}
