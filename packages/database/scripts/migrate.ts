import { existsSync } from "node:fs";
import { describeDatabaseError, usesVerifiedTls } from "../src";
import { runMigrations } from "../src/migrations";

// Usage: DATABASE_URL_UNPOOLED=... node --import tsx packages/database/scripts/migrate.ts
// Local runs read the root .env; the deployment workflow passes the variable to this step only.
async function main(): Promise<void> {
  const rootEnv = new URL("../../../.env", import.meta.url);
  if (process.env.CI === undefined && existsSync(rootEnv)) {
    process.loadEnvFile(rootEnv);
  }
  const connectionString = process.env.DATABASE_URL_UNPOOLED;
  if (!connectionString) {
    throw new Error("DATABASE_URL_UNPOOLED is not set");
  }
  const host = new URL(connectionString).hostname;
  // A transaction pooler would keep the session advisory lock on a shared backend.
  if (host.includes("-pooler")) {
    throw new Error("DATABASE_URL_UNPOOLED points to a pooled endpoint; use the direct Neon URL");
  }
  if (!["localhost", "127.0.0.1", "::1"].includes(host) && !usesVerifiedTls(connectionString)) {
    throw new Error("DATABASE_URL_UNPOOLED must use verified TLS (sslmode=verify-full) for a remote database");
  }
  const { applied } = await runMigrations({ connectionString });
  console.log(`[migrate] ${applied} migration(s) applied`);
}

main().catch((error: unknown) => {
  console.error("[migrate] failed:", describeDatabaseError(error));
  process.exit(1);
});
