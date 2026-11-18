"use client";

import { useActionState } from "react";
import { updatePasswordAction } from "@/app/auth/actions";
import type { AuthActionState } from "@/lib/action-types";

export default function PasswordResetForm({
  setupError,
}: {
  setupError?: string;
}) {
  const [state, formAction, pending] = useActionState<AuthActionState, FormData>(
    updatePasswordAction,
    {},
  );

  return (
    <>
      {setupError ? <p className="warning-status" role="alert">{setupError}</p> : null}
      {state.error ? <p role="alert">{state.error}</p> : null}
      {state.message ? <p role="status">{state.message}</p> : null}
      {!setupError ? (
        <form action={formAction}>
          <label htmlFor="new-password">New password</label>
          <input
            id="new-password"
            name="password"
            type="password"
            autoComplete="new-password"
            minLength={8}
            maxLength={72}
            required
          />
          <label htmlFor="confirm-new-password">Confirm new password</label>
          <input
            id="confirm-new-password"
            name="confirmPassword"
            type="password"
            autoComplete="new-password"
            minLength={8}
            maxLength={72}
            required
          />
          <button type="submit" disabled={pending}>
            {pending ? "Updating…" : "Update password"}
          </button>
        </form>
      ) : null}
    </>
  );
}
