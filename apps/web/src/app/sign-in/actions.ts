"use server";

import { OAUTH_PROVIDERS } from "@incision/database";
import { LOGIN_MAX_LENGTH, PASSWORD_MAX_LENGTH } from "@incision/domain";
import { redirect } from "next/navigation";
import { AuthError, CredentialsSignin } from "next-auth";
import { z } from "zod";
import { signIn } from "@/auth";
import { safeRedirectPath } from "@/server/auth/safe-redirect";
import type { SignInErrorKey } from "@/server/auth/sign-in-errors";

const FIELD_ERRORS = ["loginRequired", "loginTooLong", "passwordRequired", "passwordTooLong"] as const;
type FieldError = (typeof FIELD_ERRORS)[number];

const credentialsFormSchema = z.object({
  login: z.string().trim().min(1, "loginRequired").max(LOGIN_MAX_LENGTH, "loginTooLong"),
  password: z.string().min(1, "passwordRequired").max(PASSWORD_MAX_LENGTH, "passwordTooLong"),
});

export type CredentialsFormState = {
  readonly error?: SignInErrorKey;
  readonly fieldErrors?: { readonly login?: FieldError; readonly password?: FieldError };
  /** Typed login, sent back so the field keeps it; the password never is. */
  readonly login?: string;
};

/**
 * Local sign-in (TEST-03). Next.js only runs server actions for same-origin POSTs
 * (Origin checked against Host), which protects this form against CSRF.
 */
export async function signInWithCredentials(_previous: CredentialsFormState, formData: FormData): Promise<CredentialsFormState> {
  const login = stringField(formData, "login");
  const password = stringField(formData, "password");
  const fieldErrors = validateFields(login, password);
  if (fieldErrors !== undefined) {
    return { fieldErrors, login };
  }
  try {
    await signIn("credentials", { login, password, redirectTo: safeRedirectPath(formData.get("callbackUrl")) });
  } catch (error: unknown) {
    // A successful sign-in throws Next's redirect, which must propagate.
    if (!(error instanceof AuthError)) {
      throw error;
    }
    return { error: credentialsErrorKey(error), login };
  }
  return { login };
}

function validateFields(login: string, password: string): CredentialsFormState["fieldErrors"] {
  const parsed = credentialsFormSchema.safeParse({ login, password });
  if (parsed.success) {
    return undefined;
  }
  const errorOf = (field: "login" | "password") => {
    const message = parsed.error.issues.find((issue) => issue.path[0] === field)?.message;
    return FIELD_ERRORS.find((known) => known === message);
  };
  return { login: errorOf("login"), password: errorOf("password") };
}

function credentialsErrorKey(error: AuthError): SignInErrorKey {
  if (error instanceof CredentialsSignin) {
    return error.code === "rate_limited" ? "rateLimited" : "invalidCredentials";
  }
  // Database or configuration failure: not the user's credentials.
  return "unavailable";
}

const providerSchema = z.enum(OAUTH_PROVIDERS);

/** Starts a GitHub or Discord sign-in: Auth.js answers with a redirect to the provider. */
export async function signInWithProvider(formData: FormData): Promise<void> {
  const provider = providerSchema.safeParse(formData.get("provider"));
  if (!provider.success) {
    redirect("/sign-in?error=Configuration");
  }
  try {
    await signIn(provider.data, { redirectTo: safeRedirectPath(formData.get("callbackUrl")) });
  } catch (error: unknown) {
    if (error instanceof AuthError) {
      redirect("/sign-in?error=Configuration");
    }
    throw error;
  }
}

function stringField(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}
