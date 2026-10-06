"use client";

import { useActionState } from "react";
import type { Dictionary } from "@/i18n/dictionaries";
import type { SignInErrorKey } from "@/server/auth/sign-in-errors";
import { SubmitButton } from "@/components/submit-button";
import { type CredentialsFormState, signInWithCredentials } from "./actions";

type CredentialsFormProps = {
  readonly callbackUrl: string;
  /** Error carried by an Auth.js redirect, shown until the next submission. */
  readonly initialError?: SignInErrorKey;
  readonly t: Dictionary["signIn"];
};

const FIELD_CLASS =
  "min-h-11 w-full rounded-md border border-foreground/50 bg-background px-3 py-2 text-foreground focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-blue-600 aria-invalid:border-red-700 dark:aria-invalid:border-red-300";

export function CredentialsForm({ callbackUrl, initialError, t }: CredentialsFormProps) {
  const [state, formAction] = useActionState<CredentialsFormState, FormData>(signInWithCredentials, { error: initialError });
  const loginError = state.fieldErrors?.login;
  const passwordError = state.fieldErrors?.password;

  return (
    <form action={formAction} noValidate className="flex flex-col gap-4">
      {state.error !== undefined && (
        <p role="alert" className="rounded-md border border-red-700 px-3 py-2 text-red-700 dark:border-red-300 dark:text-red-300">
          {t.errors[state.error]}
        </p>
      )}
      <input type="hidden" name="callbackUrl" value={callbackUrl} />
      <div className="flex flex-col gap-1">
        <label htmlFor="login" className="font-medium">
          {t.loginLabel}
        </label>
        <input
          id="login"
          name="login"
          type="text"
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          required
          maxLength={64}
          defaultValue={state.login}
          aria-invalid={loginError !== undefined}
          aria-describedby={loginError !== undefined ? "login-error" : undefined}
          className={FIELD_CLASS}
        />
        {loginError !== undefined && (
          <p id="login-error" className="text-sm text-red-700 dark:text-red-300">
            {t.errors[loginError]}
          </p>
        )}
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="password" className="font-medium">
          {t.passwordLabel}
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          maxLength={256}
          aria-invalid={passwordError !== undefined}
          aria-describedby={passwordError !== undefined ? "password-error" : undefined}
          className={FIELD_CLASS}
        />
        {passwordError !== undefined && (
          <p id="password-error" className="text-sm text-red-700 dark:text-red-300">
            {t.errors[passwordError]}
          </p>
        )}
      </div>
      <SubmitButton label={t.submit} pendingLabel={t.submitting} />
    </form>
  );
}
