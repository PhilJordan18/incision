"use client";

import { useActionState, useState } from "react";
import { EyeIcon, EyeOffIcon } from "@/components/icons/icons";
import { SubmitButton } from "@/components/submit-button";
import { FieldError } from "@/components/ui/field-error";
import { fieldLabel, primaryButton, textField } from "@/components/ui/styles";
import type { Dictionary } from "@/i18n/dictionaries";
import type { SignInErrorKey } from "@/server/auth/sign-in-errors";
import { type CredentialsFormState, signInWithCredentials } from "./actions";

type CredentialsFormProps = {
  readonly callbackUrl: string;
  /** Error carried by an Auth.js redirect, shown until the next submission. */
  readonly initialError?: SignInErrorKey;
  readonly t: Dictionary["signIn"];
};

export function CredentialsForm({ callbackUrl, initialError, t }: CredentialsFormProps) {
  const [state, formAction] = useActionState<CredentialsFormState, FormData>(signInWithCredentials, { error: initialError });
  const [passwordVisible, setPasswordVisible] = useState(false);
  const loginError = state.fieldErrors?.login;
  const passwordError = state.fieldErrors?.password;

  return (
    <form action={formAction} noValidate className="flex flex-col gap-4">
      {state.error !== undefined && (
        <p role="alert" className="flex gap-2 rounded-bouton border border-erreur bg-erreur-fond px-4 py-3 text-erreur">
          <span aria-hidden="true">⚠</span>
          {t.errors[state.error]}
        </p>
      )}
      <input type="hidden" name="callbackUrl" value={callbackUrl} />
      <div className="flex flex-col gap-1.5">
        <label htmlFor="login" className={fieldLabel}>
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
          className={textField}
        />
        {loginError !== undefined && <FieldError id="login-error" message={t.errors[loginError]} />}
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="password" className={fieldLabel}>
          {t.passwordLabel}
        </label>
        <div className="relative">
          <input
            id="password"
            name="password"
            type={passwordVisible ? "text" : "password"}
            autoComplete="current-password"
            required
            maxLength={256}
            aria-invalid={passwordError !== undefined}
            aria-describedby={passwordError !== undefined ? "password-error" : undefined}
            className={`${textField} pr-14`}
          />
          <button
            type="button"
            onClick={() => setPasswordVisible((visible) => !visible)}
            aria-pressed={passwordVisible}
            aria-label={t.showPassword}
            className="absolute top-1 right-1 grid size-11 place-items-center rounded-bouton text-brume hover:text-ecume"
          >
            {passwordVisible ? <EyeOffIcon /> : <EyeIcon />}
          </button>
        </div>
        {passwordError !== undefined && <FieldError id="password-error" message={t.errors[passwordError]} />}
      </div>
      <SubmitButton label={t.submit} pendingLabel={t.submitting} className={`${primaryButton} w-full`} />
    </form>
  );
}
