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
 * Failures before a pause, per 15 minutes. Per login and address: slows guessing one
 * account. Per login, from anywhere: a higher cap, so that strangers cannot easily lock a
 * shared account such as the public demo ones. Per address: slows spraying many
 * accounts, loose because a whole class can share one school address.
 */
export const CREDENTIAL_LIMITS = {
  loginAtAddress: { maxFailures: 5, windowMs: 15 * 60_000 },
  login: { maxFailures: 50, windowMs: 15 * 60_000 },
  address: { maxFailures: 100, windowMs: 15 * 60_000 },
} as const;

/**
 * Password checks running at once in the process. scrypt runs in libuv's small thread
 * pool, shared with DNS and file access: a burst must not starve them.
 */
export const MAX_CONCURRENT_VERIFICATIONS = 8;

const credentialsInputSchema = z.object({
  // Lenient: the login is trimmed and checked by parseLogin; this only bounds the input.
  login: z.string().min(1).max(LOGIN_MAX_LENGTH * 2),
  password: z.string().min(1).max(PASSWORD_MAX_LENGTH),
});

type Limiters = { readonly loginAtAddress: AttemptLimiter; readonly login: AttemptLimiter; readonly address: AttemptLimiter };

export type CredentialsDependencies = {
  readonly findCredentials: (loginCanonical: string) => Promise<LocalCredentials | undefined>;
  readonly limiters: Limiters;
  /** Process-wide count of password checks in progress. */
  readonly verifications: { inFlight: number; readonly max: number };
};

/**
 * Auth.js `authorize` for local accounts (AUTH-01, SEC-03). An unknown login, a login
 * that cannot exist and a wrong password all cost one scrypt derivation and end with the
 * same error. Nothing about the input is logged. Every limit is checked and the attempt
 * counted before the first `await`, so parallel attempts cannot slip past them.
 */
export async function authorizeCredentials(
  input: Partial<Record<string, unknown>>,
  request: Request,
  { findCredentials, limiters, verifications }: CredentialsDependencies,
): Promise<{ id: string }> {
  const parsed = credentialsInputSchema.safeParse(input);
  if (!parsed.success) {
    throw new InvalidCredentials();
  }
  const { login, password } = parsed.data;
  const loginKey = login.trim().toLowerCase();
  // Set by the custom server from the TCP peer or the trusted proxy (server.ts).
  const addressKey = addressLimitKey(request.headers.get(CLIENT_ADDRESS_HEADER) ?? "unknown");
  const keys = [
    [limiters.loginAtAddress, `${loginKey}\u0000${addressKey}`],
    [limiters.login, loginKey],
    [limiters.address, addressKey],
  ] as const;
  if (verifications.inFlight >= verifications.max || keys.some(([limiter, key]) => limiter.isBlocked(key))) {
    throw new TooManyAttempts();
  }
  for (const [limiter, key] of keys) {
    limiter.recordFailure(key);
  }
  verifications.inFlight += 1;
  try {
    const parsedLogin = parseLogin(login);
    const account = parsedLogin.ok ? await findCredentials(parsedLogin.value.canonical) : undefined;
    const valid =
      account?.passwordHash != null ? await verifyPassword(password, account.passwordHash) : await verifyAgainstDecoy(password);
    if (!valid || account === undefined) {
      throw new InvalidCredentials();
    }
    for (const [limiter, key] of keys) {
      limiter.forgive(key);
    }
    return { id: account.accountId };
  } finally {
    verifications.inFlight -= 1;
  }
}

const processGlobal = globalThis as typeof globalThis & {
  incisionCredentialChecks?: Pick<CredentialsDependencies, "limiters" | "verifications">;
};

/**
 * One set of counters per process: Next bundles the sign-in page's action and the
 * /api/auth route separately, and each must not get its own budget.
 */
export function credentialChecks(): Pick<CredentialsDependencies, "limiters" | "verifications"> {
  processGlobal.incisionCredentialChecks ??= {
    limiters: {
      loginAtAddress: new AttemptLimiter(CREDENTIAL_LIMITS.loginAtAddress),
      login: new AttemptLimiter(CREDENTIAL_LIMITS.login),
      address: new AttemptLimiter(CREDENTIAL_LIMITS.address),
    },
    verifications: { inFlight: 0, max: MAX_CONCURRENT_VERIFICATIONS },
  };
  return processGlobal.incisionCredentialChecks;
}
