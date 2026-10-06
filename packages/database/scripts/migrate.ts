import { existsSync } from "node:fs";
import { assertMigrationTarget } from "../src/migration-target";
import { runMigrations } from "../src/migrations";
import { describeDatabaseError } from "../src/pool";

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
  assertMigrationTarget(connectionString);
  const { applied } = await runMigrations({ connectionString });
  console.log(`[migrate] ${applied} migration(s) applied`);
}

main().catch((error: unknown) => {
  console.error("[migrate] failed:", describeDatabaseError(error));
  process.exit(1);
});
