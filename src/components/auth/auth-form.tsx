"use client";

import Link from "next/link";
import { useActionState } from "react";
import {
  loginAction,
  requestPasswordResetAction,
  signupAction,
} from "@/app/auth/actions";
import type { AuthActionState } from "@/lib/action-types";

export type AuthMode = "login" | "signup" | "forgot";

type AuthFormProps = {
  mode: AuthMode;
  next: string;
  setupError?: string;
  notice?: string;
};

function SubmitButton({
  pending,
  label,
}: {
  pending: boolean;
  label: string;
}) {
  return (
    <button type="submit" disabled={pending}>
      {pending ? "Please wait…" : label}
    </button>
  );
}

function FormStatus({
  state,
  notice,
}: {
  state: AuthActionState;
  notice?: string;
}) {
  return (
    <>
      {notice ? <p role="status">{notice}</p> : null}
      {state.error ? <p role="alert">{state.error}</p> : null}
      {state.message ? <p role="status">{state.message}</p> : null}
    </>
  );
}

export default function AuthForm({
  mode,
  next,
  setupError,
  notice,
}: AuthFormProps) {
  const [loginState, loginFormAction, loginPending] = useActionState(
    loginAction,
    {},
  );
  const [signupState, signupFormAction, signupPending] = useActionState(
    signupAction,
    {},
  );
  const [resetState, resetFormAction, resetPending] = useActionState(
    requestPasswordResetAction,
    {},
  );

  const isLogin = mode === "login";
  const isSignup = mode === "signup";
  const state = isLogin ? loginState : isSignup ? signupState : resetState;
  const formAction = isLogin
    ? loginFormAction
    : isSignup
      ? signupFormAction
      : resetFormAction;
  const pending = isLogin
    ? loginPending
    : isSignup
      ? signupPending
      : resetPending;
  const submitLabel = isLogin
    ? "Sign in"
    : isSignup
      ? "Create account"
      : "Send reset link";

  return (
    <>
      <FormStatus state={state} notice={notice} />
      {setupError ? (
        <p className="warning-status" role="alert">{setupError}</p>
      ) : (
        <form action={formAction}>
          <input type="hidden" name="next" value={next} />
          <label htmlFor="auth-email">Email</label>
          <input
            id="auth-email"
            name="email"
            type="email"
            autoComplete="email"
            required
            maxLength={254}
          />
          {mode !== "forgot" ? (
            <>
              <label htmlFor="auth-password">Password</label>
              <input
                id="auth-password"
                name="password"
                type="password"
                autoComplete={isSignup ? "new-password" : "current-password"}
                minLength={isSignup ? 8 : undefined}
                maxLength={72}
                required
              />
            </>
          ) : null}
          {isSignup ? (
            <>
              <label htmlFor="auth-confirm-password">Confirm password</label>
              <input
                id="auth-confirm-password"
                name="confirmPassword"
                type="password"
                autoComplete="new-password"
                minLength={8}
                maxLength={72}
                required
              />
            </>
          ) : null}
          <SubmitButton pending={pending} label={submitLabel} />
        </form>
      )}
      <nav aria-label="Account options">
        {mode !== "login" ? (
          <p>
            <Link href={`/auth?mode=login&next=${encodeURIComponent(next)}`}>
              Sign in
            </Link>
          </p>
        ) : null}
        {mode !== "signup" ? (
          <p>
            <Link href={`/auth?mode=signup&next=${encodeURIComponent(next)}`}>
              Create an account
            </Link>
          </p>
        ) : null}
        {mode !== "forgot" ? (
          <p>
            <Link href={`/auth?mode=forgot&next=${encodeURIComponent(next)}`}>
              Forgot password?
            </Link>
          </p>
        ) : null}
      </nav>
    </>
  );
}
