import { parseDisplayName, parseLogin } from "@incision/domain";
import type { Database } from "../client";
import { accounts } from "../schema";
import { findLocalCredentials } from "./accounts";
import { hashPassword, verifyPassword } from "./password";

export type DemoAccount = { readonly login: string; readonly password: string; readonly displayName: string };

/**
 * Fictitious local accounts for demonstrations and E2E tests (TEST-03), without any
 * privilege. Their passwords are public on purpose (README) and used nowhere else;
 * they are not secrets and never protect anything but these accounts.
 */
export const DEMO_ACCOUNTS: readonly DemoAccount[] = [
  { login: "demo-alice", password: "brume-alice-4817", displayName: "Alice (demo)" },
  { login: "demo-bruno", password: "brume-bruno-2096", displayName: "Bruno (demo)" },
];

export type DemoSeedOutcome = "created" | "unchanged" | "conflict";

/**
 * Creates the missing demo accounts; idempotent. An existing account with the same login
 * is never modified: it is "unchanged" when the demo password opens it, otherwise it is
 * not this demo account and is reported as a "conflict".
 */
export async function seedDemoAccounts(
  db: Database,
  demoAccounts: readonly DemoAccount[] = DEMO_ACCOUNTS,
): Promise<ReadonlyMap<string, DemoSeedOutcome>> {
  const outcomes = new Map<string, DemoSeedOutcome>();
  for (const demo of demoAccounts) {
    outcomes.set(demo.login, await seedDemoAccount(db, demo));
  }
  return outcomes;
}

async function seedDemoAccount(db: Database, demo: DemoAccount): Promise<DemoSeedOutcome> {
  const login = parseLogin(demo.login);
  const displayName = parseDisplayName(demo.displayName);
  if (!login.ok || !displayName.ok) {
    throw new Error(`Invalid demo account definition: ${demo.login}`);
  }
  const inserted = await db
    .insert(accounts)
    .values({
      login: login.value.login,
      loginCanonical: login.value.canonical,
      displayName: displayName.value,
      passwordHash: await hashPassword(demo.password),
    })
    .onConflictDoNothing({ target: accounts.loginCanonical })
    .returning({ id: accounts.id });
  if (inserted.length > 0) {
    return "created";
  }
  const existing = await findLocalCredentials(db, login.value.canonical);
  const isDemo = existing?.passwordHash != null && (await verifyPassword(demo.password, existing.passwordHash));
  return isDemo ? "unchanged" : "conflict";
}
