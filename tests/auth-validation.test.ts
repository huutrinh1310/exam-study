import { describe, expect, it } from "vitest";
import {
  isUuid,
  loginSchema,
  safeRedirectPath,
  signupSchema,
  updatePasswordSchema,
  validateUploadFile,
} from "../src/lib/auth-validation";

describe("safeRedirectPath", () => {
  it("allows local paths and preserves their query and fragment", () => {
    expect(safeRedirectPath("/library?sort=recent#top")).toBe(
      "/library?sort=recent#top",
    );
  });

  it.each([
    "//attacker.example",
    "https://attacker.example/path",
    "/\\attacker.example",
    "/%2f%2fattacker.example",
    "/%252f%252fattacker.example",
    "/%5c%5cattacker.example",
  ])("rejects unsafe redirect %s", (redirect) => {
    expect(safeRedirectPath(redirect)).toBe("/");
  });

  it("uses a safe fallback for missing or malformed redirects", () => {
    expect(safeRedirectPath(undefined)).toBe("/");
    expect(safeRedirectPath("https://attacker.example", "/library")).toBe(
      "/library",
    );
  });
});

describe("auth form schemas", () => {
  it("accepts trimmed valid credentials and rejects invalid email or password", () => {
    expect(
      loginSchema.safeParse({
        email: "  student@example.com ",
        password: "exam-password",
      }),
    ).toMatchObject({
      success: true,
      data: { email: "student@example.com", password: "exam-password" },
    });
    expect(
      loginSchema.safeParse({ email: "not-an-email", password: "" }).success,
    ).toBe(false);
  });

  it("requires matching, sufficiently long password confirmation", () => {
    expect(
      signupSchema.safeParse({
        email: "student@example.com",
        password: "exam-password",
        confirmPassword: "exam-password",
      }).success,
    ).toBe(true);
    expect(
      signupSchema.safeParse({
        email: "student@example.com",
        password: "short",
        confirmPassword: "different",
      }).success,
    ).toBe(false);
    expect(
      updatePasswordSchema.safeParse({
        password: "exam-password",
        confirmPassword: "exam-password",
      }).success,
    ).toBe(true);
  });
});

describe("request validation", () => {
  it("validates UUIDs before database calls", () => {
    expect(isUuid("00000000-0000-4000-8000-000000000001")).toBe(true);
    expect(isUuid("not-a-uuid")).toBe(false);
  });

  it("accepts XLSX uploads through 4 MiB and rejects larger or non-XLSX files", () => {
    const atLimit = new File(
      [new Uint8Array(4 * 1024 * 1024)],
      "questions.xlsx",
      { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" },
    );
    const overLimit = new File(
      [new Uint8Array(4 * 1024 * 1024 + 1)],
      "questions.xlsx",
    );
    const wrongType = new File([new Uint8Array(10)], "questions.csv");

    expect(validateUploadFile(atLimit)).toMatchObject({ ok: true });
    expect(validateUploadFile(overLimit)).toMatchObject({
      ok: false,
      error: expect.stringMatching(/4 MB/i),
    });
    expect(validateUploadFile(wrongType)).toMatchObject({
      ok: false,
      error: expect.stringMatching(/\.xlsx/i),
    });
  });
});
