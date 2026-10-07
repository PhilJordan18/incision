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

/** Too many recent failures for this login, this login at this address, or this address. */
export class TooManyAttempts extends CredentialsSignin {
  override code = "rate_limited";
}

/** Too many password checks running at this moment; an immediate retry may pass. */
export class ServerBusy extends CredentialsSignin {
  override code = "busy";
}

/**
 * Failures before a pause, per 15 minutes. Per login and address: slows guessing one
 * account. Per login, from anywhere: a higher cap, so that strangers cannot easily lock a
 * shared account such as the public demo ones. Per address: slows spraying many
 * accounts, loose because a whole class can share one school address. Address attempts:
 * every checked attempt, successful or not, so that one address cannot occupy the
 * server with correct sign-ins to the public demo accounts.
 */
export const CREDENTIAL_LIMITS = {
  loginAtAddress: { maxFailures: 5, windowMs: 15 * 60_000 },
  login: { maxFailures: 50, windowMs: 15 * 60_000 },
  address: { maxFailures: 100, windowMs: 15 * 60_000 },
  addressAttempts: { maxFailures: 200, windowMs: 15 * 60_000 },
} as const;

/**
 * Sign-in checks (account lookup and scrypt) running at once: in the process, below
 * libuv's 4 threads, which DNS and file access share; and per address, so that one
 * address cannot take them all. Checked before the first await.
 */
export const CONCURRENT_CHECKS = { process: 3, perAddress: 2 } as const;

const credentialsInputSchema = z.object({
  // Lenient: the login is trimmed and checked by parseLogin; this only bounds the input.
  login: z.string().min(1).max(LOGIN_MAX_LENGTH * 2),
  password: z.string().min(1).max(PASSWORD_MAX_LENGTH),
});

type Limiters = {
  readonly loginAtAddress: AttemptLimiter;
  readonly login: AttemptLimiter;
  readonly address: AttemptLimiter;
  readonly addressAttempts: AttemptLimiter;
};

/** Checks in progress, in the whole process and per address key. */
export type CheckSlots = {
  inFlight: number;
  readonly perAddress: Map<string, number>;
  readonly max: { readonly process: number; readonly perAddress: number };
};

export type CredentialsDependencies = {
  readonly findCredentials: (loginCanonical: string) => Promise<LocalCredentials | undefined>;
  readonly limiters: Limiters;
  readonly verifications: CheckSlots;
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
  /** Forgiven when no password turned out wrong: a success or a server failure. */
  const failureKeys = [
    [limiters.loginAtAddress, `${loginKey}\u0000${addressKey}`],
    [limiters.login, loginKey],
    [limiters.address, addressKey],
  ] as const;
  if (
    failureKeys.some(([limiter, key]) => limiter.isBlocked(key)) ||
    limiters.addressAttempts.isBlocked(addressKey)
  ) {
    throw new TooManyAttempts();
  }
  const addressChecks = verifications.perAddress.get(addressKey) ?? 0;
  if (verifications.inFlight >= verifications.max.process || addressChecks >= verifications.max.perAddress) {
    throw new ServerBusy();
  }
  // Counted before the first await, so parallel attempts see each other at once.
  for (const [limiter, key] of failureKeys) {
    limiter.recordFailure(key);
  }
  limiters.addressAttempts.recordFailure(addressKey);
  verifications.inFlight += 1;
  verifications.perAddress.set(addressKey, addressChecks + 1);
  let wrongPassword = false;
  let checked = false;
  try {
    const parsedLogin = parseLogin(login);
    const account = parsedLogin.ok ? await findCredentials(parsedLogin.value.canonical) : undefined;
    const valid =
      account?.passwordHash != null ? await verifyPassword(password, account.passwordHash) : await verifyAgainstDecoy(password);
    checked = true;
    if (!valid || account === undefined) {
      wrongPassword = true;
      throw new InvalidCredentials();
    }
    return { id: account.accountId };
  } finally {
    verifications.inFlight -= 1;
    const remaining = (verifications.perAddress.get(addressKey) ?? 1) - 1;
    if (remaining > 0) {
      verifications.perAddress.set(addressKey, remaining);
    } else {
      verifications.perAddress.delete(addressKey);
    }
    // A wrong password keeps counting; a success or a server failure gives no information.
    if (!wrongPassword) {
      for (const [limiter, key] of failureKeys) {
        limiter.forgive(key);
      }
    }
    // Only a check that really ran costs the address an attempt.
    if (!checked) {
      limiters.addressAttempts.forgive(addressKey);
    }
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
      addressAttempts: new AttemptLimiter(CREDENTIAL_LIMITS.addressAttempts),
    },
    verifications: { inFlight: 0, perAddress: new Map(), max: CONCURRENT_CHECKS },
  };
  return processGlobal.incisionCredentialChecks;
}
