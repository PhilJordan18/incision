import { parseArgs } from "node:util";
import pg from "pg";
import { createDatabase } from "../src/client";
import { checkCorpus } from "../src/corpus/check";
import { readCorpusVersion } from "../src/corpus/files";
import { importCorpus } from "../src/corpus/import";
import { seedHistory } from "../src/demo-history/seed";
import { isLocalDatabase } from "../src/local-database";
import { describeDatabaseError } from "../src/pool";

// Explicit local target only: no .env loading, production mode, migration, create/drop or reset.
async function main() {
  const { values } = parseArgs({ options: { version: { type: "string" }, folder: { type: "string" } }, strict: true });
  const connectionString = process.env.DEMO_HISTORY_DATABASE_URL;
  if (!connectionString || !isLocalDatabase(connectionString)) throw new Error("An explicit local DEMO_HISTORY_DATABASE_URL is required");
  if (!values.version) throw new Error("--version is required");
  const checked = checkCorpus(await readCorpusVersion(values.version, values.folder));
  if (!checked.ok || checked.corpus.version !== values.version) throw new Error("History corpus refused");
  const client = new pg.Client({ connectionString, connectionTimeoutMillis: 10_000, application_name: "incision-demo-history" });
  await client.connect();
  try {
    const db = createDatabase(client);
    const imported = await importCorpus(db, checked.corpus);
    if (!imported.ok) throw new Error("History corpus import refused");
    // Separate idempotent phases. A history conflict leaves the successfully imported corpus;
    // it never replaces conflicting accounts/results. Correct the target, never delete real data.
    const report = await seedHistory(db, checked.corpus);
    console.log("[demo-history]", { corpus: imported.report.outcome, ...report });
  } finally {
    await client.end();
  }
}
main().catch((error: unknown) => {
  console.error("[demo-history] failed:", describeDatabaseError(error));
  process.exitCode = 1;
});
