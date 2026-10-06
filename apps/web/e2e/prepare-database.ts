// Rebuilds the disposable E2E database before the server starts (playwright.config.ts):
// drop, create, migrate, seed the demo accounts. Local servers only.
import { createDatabase, isLocalDatabase } from "@incision/database";
import { seedDemoAccounts } from "@incision/database/demo-accounts";
import { runMigrations } from "@incision/database/migrations";
import pg from "pg";

const E2E_DATABASE_NAME = /^incision_e2e\w*$/;

async function main(): Promise<void> {
  const url = new URL(process.env.E2E_DATABASE_URL ?? "");
  const name = url.pathname.slice(1);
  if (!isLocalDatabase(url.toString()) || !E2E_DATABASE_NAME.test(name)) {
    throw new Error("E2E_DATABASE_URL must name a local incision_e2e* database: it is dropped at every run");
  }
  const server = new URL(url);
  server.pathname = "/postgres";
  const admin = new pg.Client({ connectionString: server.toString() });
  await admin.connect();
  try {
    await admin.query(`drop database if exists "${name}" with (force)`);
    await admin.query(`create database "${name}"`);
  } finally {
    await admin.end();
  }

  await runMigrations({ connectionString: url.toString() });
  const client = new pg.Client({ connectionString: url.toString() });
  await client.connect();
  try {
    const outcomes = await seedDemoAccounts(createDatabase(client));
    console.log(`[e2e] database ${name} ready, demo accounts: ${[...outcomes.values()].join(", ")}`);
  } finally {
    await client.end();
  }
}

main().catch((error: unknown) => {
  console.error("[e2e] database preparation failed:", error instanceof Error ? error.message : error);
  process.exit(1);
});
