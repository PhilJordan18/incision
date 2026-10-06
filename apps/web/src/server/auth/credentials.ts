import { type LocalCredentials, verifyAgainstDecoy, verifyPassword } from "@incision/database";
import { LOGIN_MAX_LENGTH, PASSWORD_MAX_LENGTH, parseLogin } from "@incision/domain";
import { CredentialsSignin } from "next-auth";
import { z } from "zod";
import { addressLimitKey, CLIENT_ADDRESS_HEADER } from "../http/client-address";
import { AttemptLimiter } from "./attempt-limiter";

/** Wrong login or password, indistinguishably (`?code=` of Auth.js redirects). */
export class InvalidCredentials extends CredentialsSignin {
  override code = "invalid_credentials";
}

/** Too many recent failures for this login or this address. */
export class TooManyAttempts extends CredentialsSignin {
  override code = "rate_limited";
}

/**
 * Failures before a pause. Per login: slows guessing one account. Per address: slows
 * spraying many accounts, loose because a whole class can share one school address.
 */
export const CREDENTIAL_LIMITS = {
  login: { maxFailures: 5, windowMs: 15 * 60_000 },
  address: { maxFailures: 100, windowMs: 15 * 60_000 },
} as const;

const credentialsInputSchema = z.object({
  login: z.string().min(1).max(LOGIN_MAX_LENGTH + 32),
  password: z.string().min(1).max(PASSWORD_MAX_LENGTH),
});

export type CredentialsDependencies = {
  readonly findCredentials: (loginCanonical: string) => Promise<LocalCredentials | undefined>;
  readonly limiters: { readonly login: AttemptLimiter; readonly address: AttemptLimiter };
};

/**
 * Auth.js `authorize` for local accounts (AUTH-01, SEC-03). An unknown login, a login
 * that cannot exist and a wrong password all cost one scrypt derivation and end with the
 * same error. Nothing about the input is logged.
 */
export async function authorizeCredentials(
  input: Partial<Record<string, unknown>>,
  request: Request,
  { findCredentials, limiters }: CredentialsDependencies,
): Promise<{ id: string }> {
  const parsed = credentialsInputSchema.safeParse(input);
  if (!parsed.success) {
    throw new InvalidCredentials();
  }
  const { login, password } = parsed.data;
  const loginKey = login.trim().toLowerCase();
  // Set by the custom server from the TCP peer or the trusted proxy (server.ts).
  const addressKey = addressLimitKey(request.headers.get(CLIENT_ADDRESS_HEADER) ?? "unknown");
  if (limiters.login.isBlocked(loginKey) || limiters.address.isBlocked(addressKey)) {
    throw new TooManyAttempts();
  }

  const parsedLogin = parseLogin(login);
  const account = parsedLogin.ok ? await findCredentials(parsedLogin.value.canonical) : undefined;
  const valid =
    account?.passwordHash != null ? await verifyPassword(password, account.passwordHash) : await verifyAgainstDecoy(password);
  if (!valid || account === undefined) {
    limiters.login.recordFailure(loginKey);
    limiters.address.recordFailure(addressKey);
    throw new InvalidCredentials();
  }
  return { id: account.accountId };
}

const processGlobal = globalThis as typeof globalThis & {
  incisionCredentialLimiters?: CredentialsDependencies["limiters"];
};

/**
 * One set of counters per process: Next bundles the sign-in page's action and the
 * /api/auth route separately, and each must not get its own budget.
 */
export function credentialLimiters(): CredentialsDependencies["limiters"] {
  processGlobal.incisionCredentialLimiters ??= {
    login: new AttemptLimiter(CREDENTIAL_LIMITS.login),
    address: new AttemptLimiter(CREDENTIAL_LIMITS.address),
  };
  return processGlobal.incisionCredentialLimiters;
}
