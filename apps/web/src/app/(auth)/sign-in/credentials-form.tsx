"use client";

import { LOGIN_MAX_LENGTH, PASSWORD_MAX_LENGTH } from "@incision/domain";
import { useActionState, useEffect, useRef, useState } from "react";
import { EyeIcon, EyeOffIcon } from "@/components/icons/icons";
import { SubmitButton } from "@/components/submit-button";
import { FieldError } from "@/components/ui/field-error";
import { FormAlert } from "@/components/ui/form-alert";
import { fieldLabel, primaryButton, textField } from "@/components/ui/styles";
import type { Dictionary } from "@/i18n/dictionaries";
import { type CredentialsFormState, signInWithCredentials } from "./actions";

type CredentialsFormProps = {
  readonly callbackUrl: string;
  readonly t: Dictionary["signIn"];
};

/**
 * Local sign-in form. The client length limits are twice the server's: a pasted value too
 * long is kept and explained by the server, not silently cut.
 */
export function CredentialsForm({ callbackUrl, t }: CredentialsFormProps) {
  const [state, formAction] = useActionState<CredentialsFormState, FormData>(signInWithCredentials, {});
  const [passwordVisible, setPasswordVisible] = useState(false);
  const loginRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const loginError = state.fieldErrors?.login;
  const passwordError = state.fieldErrors?.password;

  // After a refused submission, move the keyboard focus to the first field to fix.
  useEffect(() => {
    if (loginError !== undefined) {
      loginRef.current?.focus();
    } else if (passwordError !== undefined) {
      passwordRef.current?.focus();
    }
  }, [state, loginError, passwordError]);

  return (
    <form action={formAction} noValidate className="flex flex-col gap-4">
      {state.error !== undefined && <FormAlert message={t.errors[state.error]} />}
      <input type="hidden" name="callbackUrl" value={callbackUrl} />
      <div className="flex flex-col gap-1.5">
        <label htmlFor="login" className={fieldLabel}>
          {t.loginLabel}
        </label>
        <input
          ref={loginRef}
          id="login"
          name="login"
          type="text"
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          required
          maxLength={LOGIN_MAX_LENGTH * 2}
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
            ref={passwordRef}
            id="password"
            name="password"
            type={passwordVisible ? "text" : "password"}
            autoComplete="current-password"
            required
            maxLength={PASSWORD_MAX_LENGTH * 2}
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
