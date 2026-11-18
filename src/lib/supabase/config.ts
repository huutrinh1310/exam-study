export interface SupabaseConfig {
  supabaseUrl: string;
  anonKey: string;
  siteUrl: string;
}

export type SupabaseConfigResult =
  | { ok: true; config: SupabaseConfig }
  | { ok: false; error: string };

function parseOrigin(value: string, label: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${label} must be a valid URL origin.`);
  }

  const isLocalHttp =
    url.protocol === "http:" &&
    (url.hostname === "localhost" ||
      url.hostname === "127.0.0.1" ||
      url.hostname === "[::1]");
  if (
    (url.protocol !== "https:" && !isLocalHttp) ||
    url.username !== "" ||
    url.password !== "" ||
    url.pathname !== "/" ||
    url.search !== "" ||
    url.hash !== ""
  ) {
    throw new Error(`${label} must be an HTTPS origin (or local HTTP origin).`);
  }

  return url.origin;
}

export function getSupabaseConfig(): SupabaseConfigResult {
  const rawUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  const rawSiteUrl = process.env.NEXT_PUBLIC_SITE_URL?.trim();

  if (!rawUrl || !anonKey || !rawSiteUrl) {
    return {
      ok: false,
      error:
        "Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, and NEXT_PUBLIC_SITE_URL.",
    };
  }

  try {
    const supabaseUrl = parseOrigin(rawUrl, "NEXT_PUBLIC_SUPABASE_URL");
    const siteUrl = parseOrigin(rawSiteUrl, "NEXT_PUBLIC_SITE_URL");
    if (process.env.NODE_ENV === "production" && !siteUrl.startsWith("https://")) {
      return {
        ok: false,
        error: "NEXT_PUBLIC_SITE_URL must use HTTPS in production.",
      };
    }

    return { ok: true, config: { supabaseUrl, anonKey, siteUrl } };
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error ? error.message : "Supabase configuration is invalid.",
    };
  }
}

export class SupabaseConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SupabaseConfigurationError";
  }
}

export function requireSupabaseConfig(): SupabaseConfig {
  const result = getSupabaseConfig();
  if (!result.ok) {
    throw new SupabaseConfigurationError(result.error);
  }
  return result.config;
}
