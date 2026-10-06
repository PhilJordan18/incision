import { existsSync } from "node:fs";
import { parseArgs } from "node:util";
import pg from "pg";
import { createDatabase } from "../src/client";
import { DEMO_ACCOUNTS, seedDemoAccounts } from "../src/identity/demo-accounts";
import { isLocalDatabase } from "../src/local-database";
import { describeDatabaseError } from "../src/pool";
import { usesVerifiedTls } from "../src/tls";

// Usage: npm run db:seed:demo -w @incision/database [-- --remote]
// Creates the fictitious demo accounts of the README; never run by the application.
// Local runs read DATABASE_URL_UNPOOLED from the root .env. A remote database (production)
// needs --remote and verified TLS: see docs/DEPLOYMENT.md, "Demo accounts".
async function main(): Promise<void> {
  const { values } = parseArgs({ options: { remote: { type: "boolean", default: false } }, strict: true });
  const rootEnv = new URL("../../../.env", import.meta.url);
  if (process.env.CI === undefined && existsSync(rootEnv)) {
    process.loadEnvFile(rootEnv);
  }
  const connectionString = process.env.DATABASE_URL_UNPOOLED;
  if (!connectionString) {
    throw new Error("DATABASE_URL_UNPOOLED is not set");
  }
  if (!isLocalDatabase(connectionString)) {
    if (!values.remote) {
      throw new Error("Refusing to seed a remote database without --remote");
    }
    if (!usesVerifiedTls(connectionString)) {
      throw new Error("A remote database must use verified TLS (sslmode=verify-full)");
    }
  }

  const client = new pg.Client({ connectionString, connectionTimeoutMillis: 10_000, application_name: "incision-seed" });
  await client.connect();
  try {
    const outcomes = await seedDemoAccounts(createDatabase(client));
    for (const [login, outcome] of outcomes) {
      console.log(`[seed] ${login}: ${outcome}`);
    }
    if ([...outcomes.values()].includes("conflict")) {
      throw new Error(`An existing account uses a demo login (${DEMO_ACCOUNTS.length} expected); it was left untouched`);
    }
  } finally {
    await client.end();
  }
}

main().catch((error: unknown) => {
  console.error("[seed] failed:", describeDatabaseError(error));
  process.exit(1);
});
