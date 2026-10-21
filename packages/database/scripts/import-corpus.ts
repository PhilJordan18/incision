import { existsSync } from "node:fs";
import { parseArgs } from "node:util";
import pg from "pg";
import { createDatabase } from "../src/client";
import { checkCorpus } from "../src/corpus/check";
import { CorpusFileError, readCorpusVersion } from "../src/corpus/files";
import { importCorpus } from "../src/corpus/import";
import { isLocalDatabase } from "../src/local-database";
import { describeDatabaseError } from "../src/pool";

// Usage: npm run db:import:corpus -w @incision/database -- --version <version> [--folder <corpus folder>]
// Imports packages/database/corpus/<version>/ into the LOCAL database and activates it (F-02.3a).
// Local only: a remote (production) import is a separate, authorised process (docs/DEPLOYMENT.md).
// The local guard prevents a mistake, it is not a security boundary (a localhost tunnel passes).
// Reads DATABASE_URL_UNPOOLED from the root .env, as the demo seed does.
async function main(): Promise<void> {
  const { values } = parseArgs({ options: { version: { type: "string" }, folder: { type: "string" } }, strict: true });
  if (values.version === undefined) {
    throw new Error("--version <version> is required (a folder of packages/database/corpus/)");
  }
  const rootEnv = new URL("../../../.env", import.meta.url);
  if (process.env.CI === undefined && existsSync(rootEnv)) {
    process.loadEnvFile(rootEnv);
  }
  const connectionString = process.env.DATABASE_URL_UNPOOLED;
  if (!connectionString) {
    throw new Error("DATABASE_URL_UNPOOLED is not set");
  }
  if (!isLocalDatabase(connectionString)) {
    throw new Error("Refusing to import a corpus into a remote database: this script is for local and test databases only");
  }

  const checked = checkCorpus(await readCorpusVersion(values.version, values.folder));
  if (!checked.ok) {
    const { code, language, passageId, detail } = checked.refusal;
    throw new Error(`corpus ${values.version} refused: ${code}${language === undefined ? "" : ` (${language})`}${passageId === undefined ? "" : ` ${passageId}`}: ${detail}`);
  }
  if (checked.corpus.version !== values.version) {
    throw new Error(`the files of folder ${values.version} say version ${checked.corpus.version}`);
  }

  const client = new pg.Client({ connectionString, connectionTimeoutMillis: 10_000, application_name: "incision-corpus-import" });
  await client.connect();
  try {
    const result = await importCorpus(createDatabase(client), checked.corpus);
    if (!result.ok) {
      throw new Error(`corpus ${values.version} refused: ${result.refusal.code}: ${result.refusal.detail}`);
    }
    const { outcome, active, retained, spare, compatibleWithDefaults, newPassages, keptPassages, retiredPassages } = result.report;
    // Re-importing an older version never reactivates it: going back means importing a new version.
    console.log(`[corpus] ${values.version}: ${outcome}, ${active ? "active" : "NOT active (another version is)"}`);
    console.log(`[corpus] retained fr ${retained.fr}, en ${retained.en}; spare fr ${spare.fr}, en ${spare.en}`);
    console.log(`[corpus] serve the default settings: fr ${compatibleWithDefaults.fr}, en ${compatibleWithDefaults.en}`);
    console.log(`[corpus] passages new ${newPassages}, kept ${keptPassages}; retired from the previous version ${retiredPassages}`);
  } finally {
    await client.end();
  }
}

main().catch((error: unknown) => {
  console.error("[corpus] failed:", error instanceof CorpusFileError ? `${error.code} ${error.message}` : describeDatabaseError(error));
  process.exit(1);
});
