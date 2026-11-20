import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runMigrations } from "../src/migrations";
import { createTemporaryDatabase, type TemporaryDatabase } from "./test-database";

const exec = promisify(execFile);
let database: TemporaryDatabase;
beforeAll(async () => { database = await createTemporaryDatabase(); await runMigrations({ connectionString: database.url }); });
afterAll(async () => { await database?.drop(); });
function run(target: string) {
  return exec(process.execPath, ["--import", "tsx", fileURLToPath(new URL("../scripts/seed-history.ts", import.meta.url)), "--version", "2026-10-25.2"], {
    env: { ...process.env, DEMO_HISTORY_DATABASE_URL: target }, timeout: 25_000,
  });
}

describe("explicit local history seed command", () => {
  it("refuses a missing target and a remote target, including a pg host override", async () => {
    for (const target of ["", "postgresql://unused@example.invalid/demo", "postgresql://unused@localhost/demo?host=example.invalid"]) {
      await expect(run(target)).rejects.toMatchObject({ code: 1 });
    }
  });
  it("imports corpus, accounts and engine history through the real CLI, then reruns unchanged", async () => {
    expect((await run(database.url)).stdout).toContain("created: 6");
    expect((await run(database.url)).stdout).toContain("unchanged: 6");
    const client = new pg.Client({ connectionString: database.url });
    await client.connect();
    try {
      const stored = await client.query("select (select count(*) from race_corpus_versions) versions, (select count(*) from race_passages) passages, (select count(*) from accounts) accounts, (select count(*) from races) races, (select count(*) from race_results) results");
      expect(stored.rows[0]).toMatchObject({ versions: "1", accounts: "2", races: "6", results: "12" });
      expect(Number(stored.rows[0].passages)).toBeGreaterThan(2);
    } finally { await client.end(); }
  });
});
