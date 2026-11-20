import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDatabase, type Database } from "../src/client";
import { checkCorpus, type CheckedCorpus } from "../src/corpus/check";
import { readCorpusVersion } from "../src/corpus/files";
import { importCorpus } from "../src/corpus/import";
import { HISTORY_ACCOUNTS, historyFixtures } from "../src/demo-history/fixture";
import { seedHistory } from "../src/demo-history/seed";
import { runMigrations } from "../src/migrations";
import { readAccountHistory } from "../src/races/history";
import { readRaceForEntrant } from "../src/races/results";
import { createTemporaryDatabase, type TemporaryDatabase } from "./test-database";

let database: TemporaryDatabase;
let pool: pg.Pool;
let db: Database;
let corpus: CheckedCorpus;
beforeAll(async () => {
  const checked = checkCorpus(await readCorpusVersion("2026-10-25.2"));
  if (!checked.ok) throw new Error("Fixture corpus refused");
  corpus = checked.corpus;
  database = await createTemporaryDatabase();
  await runMigrations({ connectionString: database.url });
  pool = new pg.Pool({ connectionString: database.url });
  db = createDatabase(pool);
});
afterAll(async () => { await pool?.end(); await database?.drop(); });

async function snapshot() {
  const rows = await pool.query("select (select jsonb_agg(a order by id) from accounts a) accounts, (select jsonb_agg(r order by id) from races r) races, (select jsonb_agg(e order by id) from race_entrants e) entrants, (select jsonb_agg(s order by race_id, entrant_id) from race_results s) results");
  return rows.rows;
}

describe("insert-only synthetic demo history", () => {
  it("imports texts, prepares deterministic engine histories, and reopens private results", async () => {
    expect((await importCorpus(db, corpus)).ok).toBe(true);
    const initial = await Promise.all([seedHistory(db, corpus), seedHistory(db, corpus)]);
    expect(initial.map((report) => report.created).sort()).toEqual([0, 6]);
    expect(initial.map((report) => report.unchanged).sort()).toEqual([0, 6]);
    expect(historyFixtures(corpus)).toEqual(historyFixtures(corpus));
    for (const account of HISTORY_ACCOUNTS) {
      const history = await readAccountHistory(db, { accountId: account.id });
      expect(history?.rows).toHaveLength(6);
      const statuses = new Set(history!.rows.map((row) => row.outcome));
      expect(statuses.has("finished")).toBe(true);
      expect(statuses.has("timed_out")).toBe(true);
      if (account.login.endsWith("bruno")) expect(statuses.has("abandoned")).toBe(true);
      for (const row of history!.rows) {
        const detail = await readRaceForEntrant(db, row.raceId, account.id);
        expect(detail?.entrants).toHaveLength(2);
        expect(detail?.entrants.filter((e) => e.isSelf)).toHaveLength(1);
        expect(detail?.entrants.map((e) => e.result?.rank)).toEqual([1, 2]);
        expect(await readRaceForEntrant(db, row.raceId, "00000000-0000-4000-8000-000000000001")).toBeUndefined();
      }
    }
    // Every persisted measure/counter/rank is the final reducer output, never a fabricated score.
    for (const fixture of historyFixtures(corpus)) {
      const stored = await pool.query("select * from race_results where race_id=$1 order by rank", [fixture.id]);
      for (const [i, result] of fixture.simulation.end.results.entries()) {
        expect(stored.rows[i]).toMatchObject({ net_wpm: result.measures.netWpm, raw_wpm: result.measures.rawWpm,
          accuracy: result.measures.accuracy, correct_inputs: String(result.counters.correctInserts), rank: result.rank });
      }
    }
  });

  it("reruns and concurrent reruns do not change any account or immutable snapshot", async () => {
    const before = await snapshot();
    const imported = await importCorpus(db, corpus);
    expect(imported.ok && imported.report.outcome).toBe("unchanged");
    expect(await seedHistory(db, corpus)).toEqual({ created: 0, unchanged: 6 });
    expect(await Promise.all([seedHistory(db, corpus), seedHistory(db, corpus)])).toEqual([
      { created: 0, unchanged: 6 }, { created: 0, unchanged: 6 },
    ]);
    expect(await snapshot()).toEqual(before);
  });

  it("preserves unrelated real data", async () => {
    const inserted = await pool.query("insert into accounts(display_name, login, login_canonical) values ('Real player', 'real-player', 'real-player') returning *");
    await pool.query("insert into races(id, round_no, state, rules_version, text_snapshot, config_snapshot, countdown_at, started_at, ended_at, owner_id, lease_expires_at) select gen_random_uuid(), round_no, state, rules_version, text_snapshot, '{}', countdown_at, started_at, ended_at, owner_id, lease_expires_at from races limit 1");
    const before = await snapshot();
    await seedHistory(db, corpus);
    expect(await snapshot()).toEqual(before);
    expect((await pool.query("select * from accounts where id=$1", [inserted.rows[0].id])).rows).toEqual(inserted.rows);
    expect((await readAccountHistory(db, { accountId: inserted.rows[0].id }))?.rows).toEqual([]);
  });

  it("refuses a modified snapshot and rolls back missing earlier races in the same batch", async () => {
    const fixtures = historyFixtures(corpus);
    await pool.query("delete from races where id=$1", [fixtures[0]!.id]);
    await pool.query("update race_results set raw_wpm=raw_wpm+1 where race_id=$1", [fixtures[5]!.id]);
    const before = await snapshot();
    await expect(seedHistory(db, corpus)).rejects.toThrow("History race conflict");
    expect(await snapshot()).toEqual(before);
  });

  it("refuses a changed demo password before writing anything", async () => {
    await pool.query("update accounts set password_hash=null where id=$1", [HISTORY_ACCOUNTS[0].id]);
    const before = await snapshot();
    await expect(seedHistory(db, corpus)).rejects.toThrow("History demo account conflict");
    expect(await snapshot()).toEqual(before);
  });

  it("refuses a real account using a reserved login and rolls back the first demo account", async () => {
    await pool.query("delete from races where config_snapshot->>'seed'='demo-history-v1'");
    await pool.query("delete from accounts where id=any($1::uuid[])", [HISTORY_ACCOUNTS.map((a) => a.id)]);
    await pool.query("insert into accounts(display_name,login,login_canonical) values ('Existing real user',$1,$1)", [HISTORY_ACCOUNTS[1].login]);
    const before = await snapshot();
    await expect(seedHistory(db, corpus)).rejects.toThrow("History demo account conflict");
    expect(await snapshot()).toEqual(before);
  });
});
