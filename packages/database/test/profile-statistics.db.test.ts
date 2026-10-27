import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDatabase, type Database } from "../src/client";
import { runMigrations } from "../src/migrations";
import { readAccountStatistics } from "../src/races/profile-statistics";
import * as schema from "../src/schema";
import { createTemporaryDatabase, type TemporaryDatabase } from "./test-database";

let database: TemporaryDatabase;
let pool: pg.Pool;
let db: Database;
let own: string;
let other: string;
let empty: string;
beforeAll(async () => {
  database = await createTemporaryDatabase();
  await runMigrations({ connectionString: database.url });
  pool = new pg.Pool({ connectionString: database.url }); db = createDatabase(pool);
  const accounts = await pool.query<{ id: string }>("insert into accounts(display_name) values ('Profile'), ('Other'), ('Empty') returning id");
  [own, other, empty] = accounts.rows.map((row) => row.id) as [string, string, string];
});
afterAll(async () => { await pool?.end(); await database?.drop(); });

async function seed(input: { n: number; account?: string; outcome?: "finished" | "timed_out" | "abandoned";
  state?: "finished" | "interrupted"; wpm: number; accuracy?: number; rank?: number; opponent?: boolean }) {
  const { n, account = own, outcome = "finished", state = "finished", wpm, accuracy = 90, rank = 1, opponent = true } = input;
  const id = `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
  const ended = `2026-10-25T10:00:01.${String(Math.floor(n / 2)).padStart(6, "0")}Z`;
  await pool.query(`insert into races(id, round_no, state, rules_version, text_snapshot, config_snapshot,
    countdown_at, started_at, ended_at, owner_id, lease_expires_at, interruption_reason)
    values ($1,$2,$3,1,'sea','{}','2026-10-25T09:59:57Z','2026-10-25T10:00:00Z',$4,$1,$4,$5)`,
  [id, n, state, ended, state === "interrupted" ? "server_stopped" : null]);
  const entrant = await pool.query<{ id: string }>(`insert into race_entrants(race_id,account_id,ordinal,display_name_snapshot)
    values ($1,$2,1,'Profile') returning id`, [id, account]);
  if (opponent) await pool.query(`insert into race_entrants(race_id,account_id,ordinal,display_name_snapshot)
    values ($1,$2,2,'Other')`, [id, account === own ? other : own]);
  await pool.query(`insert into race_results(race_id,entrant_id,outcome,rank,elapsed_ms,position,length,
    correct_inputs,total_inputs,net_wpm,raw_wpm,accuracy,abandonment_reason)
    values ($1,$2,$3,$4,1000,$5,3,2,2,$6,$6,$7,$8)`,
  [id, entrant.rows[0]!.id, outcome, rank, outcome === "finished" ? 3 : 2, wpm, accuracy, outcome === "abandoned" ? "voluntary" : null]);
  return id;
}

describe("private account profile projection", () => {
  it("distinguishes empty history from real measurements", async () => {
    expect(await readAccountStatistics(db, empty)).toEqual({ summary: { raceCount: 0, victories: 0,
      averageNetWpm: null, averageAccuracy: null, bestNetWpm: null }, trend: [] });
  });

  it("counts finished races, not just finishers; excludes interruption and another account", async () => {
    await seed({ n: 1, wpm: 40 });
    await seed({ n: 2, wpm: 80, rank: 2, accuracy: 100 });
    await seed({ n: 3, wpm: 20, outcome: "timed_out", accuracy: 60 });
    await seed({ n: 4, wpm: 0, outcome: "abandoned", accuracy: 0 });
    await seed({ n: 5, wpm: 100, opponent: false, accuracy: 100 });
    await seed({ n: 6, wpm: 999, state: "interrupted" });
    await seed({ n: 7, account: other, wpm: 999 });
    const result = await readAccountStatistics(db, own);
    expect(result.summary).toEqual({ raceCount: 5, victories: 1, averageNetWpm: 48, averageAccuracy: 70, bestNetWpm: 100 });
    expect(result.trend.map((point) => point.netWpm)).toEqual([40, 80, 20, 0, 100]);
    expect((await readAccountStatistics(db, other)).summary.raceCount).toBe(1);
  });

  it("returns only the latest 30, ordered by microseconds and id, but retains lifetime counts", async () => {
    const ids: string[] = [];
    for (let n = 100; n < 135; n++) ids.push(await seed({ n, account: empty, wpm: n }));
    const queries: string[] = [];
    const observed = drizzle({ client: pool, schema, logger: { logQuery: (query) => { queries.push(query); } } });
    const result = await readAccountStatistics(observed, empty);
    expect(result.summary).toMatchObject({ raceCount: 35, victories: 35, bestNetWpm: 134, averageNetWpm: 117 });
    expect(result.trend.map((point) => point.raceId)).toEqual(ids.slice(-30));
    expect(queries).toHaveLength(1); // Summary and trend share one statement snapshot.
    expect(queries[0]).not.toContain(empty); // Identity remains a query parameter.
  });
});
