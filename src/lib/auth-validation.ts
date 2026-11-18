import { z } from "zod";

export const MAX_FILE_BYTES = 4 * 1024 * 1024;
const MAX_REDIRECT_LENGTH = 2_048;
const emailSchema = z.string().trim().min(1).max(254).email();
const passwordSchema = z.string().min(8).max(72);

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1).max(72),
});

export const signupSchema = z
  .object({
    email: emailSchema,
    password: passwordSchema,
    confirmPassword: z.string().min(1).max(72),
  })
  .refine(({ password, confirmPassword }) => password === confirmPassword, {
    path: ["confirmPassword"],
    message: "Passwords do not match.",
  });

export const updatePasswordSchema = z
  .object({
    password: passwordSchema,
    confirmPassword: z.string().min(1).max(72),
  })
  .refine(({ password, confirmPassword }) => password === confirmPassword, {
    path: ["confirmPassword"],
    message: "Passwords do not match.",
  });

export const uuidSchema = z.uuid();

export function isUuid(value: unknown): value is string {
  return uuidSchema.safeParse(value).success;
}

function isSafeLocalPath(value: string): boolean {
  if (
    value.length === 0 ||
    value.length > MAX_REDIRECT_LENGTH ||
    !value.startsWith("/") ||
    value.startsWith("//") ||
    value.includes("\\") ||
    /[\u0000-\u001f\u007f]/.test(value)
  ) {
    return false;
  }

  let decoded = value;
  for (let depth = 0; depth < MAX_REDIRECT_LENGTH; depth += 1) {
    let next: string;
    try {
      next = decodeURIComponent(decoded);
    } catch {
      return false;
    }

    if (next === decoded) {
      break;
    }
    decoded = next;
  }

  if (
    !decoded.startsWith("/") ||
    decoded.startsWith("//") ||
    decoded.includes("\\") ||
    /[\u0000-\u001f\u007f]/.test(decoded)
  ) {
    return false;
  }

  try {
    return new URL(value, "https://local.invalid").origin === "https://local.invalid";
  } catch {
    return false;
  }
}

export function safeRedirectPath(
  value: unknown,
  fallback = "/",
): string {
  const safeFallback =
    fallback !== value && isSafeLocalPath(fallback) ? fallback : "/";
  return typeof value === "string" && isSafeLocalPath(value)
    ? value
    : safeFallback;
}

export type UploadValidation =
  | { ok: true; file: File }
  | { ok: false; error: string };

export function validateUploadFile(value: unknown): UploadValidation {
  if (!(value instanceof File)) {
    return { ok: false, error: "Choose an .xlsx workbook to upload." };
  }

  if (!value.name.toLocaleLowerCase().endsWith(".xlsx")) {
    return { ok: false, error: "Only .xlsx workbooks are supported." };
  }

  if (value.size > MAX_FILE_BYTES) {
    return { ok: false, error: "Workbook exceeds the 4 MB upload limit." };
  }

  return { ok: true, file: value };
}
