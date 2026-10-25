import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createDatabase, type Database } from "../src/client";
import { runMigrations } from "../src/migrations";
import { readAccountHistory } from "../src/races/history";
import { readRaceForEntrant } from "../src/races/results";
import * as schema from "../src/schema";
import { createTemporaryDatabase, type TemporaryDatabase } from "./test-database";

let database: TemporaryDatabase;
let pool: pg.Pool;
let db: Database;
let accountId: string;
let outsider: string;
const ids: string[] = [];
beforeAll(async () => {
  database = await createTemporaryDatabase();
  await runMigrations({ connectionString: database.url });
  pool = new pg.Pool({ connectionString: database.url });
  db = createDatabase(pool);
  const accounts = await pool.query<{ id: string }>("insert into accounts(display_name) values ('History'), ('Other') returning id");
  accountId = accounts.rows[0]!.id;
  outsider = accounts.rows[1]!.id;
  for (let n = 1; n <= 45; n++) {
    ids.push(await seedRace(n, accountId));
  }
  await seedRace(99, outsider);
});
afterAll(async () => {
  await pool?.end();
  await database?.drop();
});

/** Real persisted immutable rows, no runtime or corpus writes. */
async function seedRace(n: number, account: string): Promise<string> {
  const id = `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
  const ended = `2026-10-25T10:00:01.${String(Math.floor(n / 2)).padStart(6, "0")}Z`;
  await pool.query(
    `insert into races(id, round_no, state, rules_version, text_snapshot, config_snapshot, countdown_at, started_at, ended_at, owner_id, lease_expires_at)
     values ($1, $2, 'finished', 1, 'sea', '{}', '2026-10-25T09:59:57Z', '2026-10-25T10:00:00Z', $3, $1, $3)`, [id, n, ended],
  );
  const entrant = await pool.query<{ id: string }>(
    "insert into race_entrants(race_id, account_id, ordinal, display_name_snapshot) values ($1, $2, 1, 'History') returning id", [id, account],
  );
  const outcome = n % 3 === 0 ? "abandoned" : n % 3 === 1 ? "timed_out" : "finished";
  await pool.query(
    `insert into race_results(race_id, entrant_id, outcome, rank, elapsed_ms, position, length, correct_inputs, total_inputs, net_wpm, raw_wpm, accuracy, abandonment_reason)
     values ($1, $2, $3, 1, 1000, $4, 3, 2, 2, 24, 24, 100, $5)`,
    [id, entrant.rows[0]!.id, outcome, outcome === "finished" ? 3 : 2, outcome === "abandoned" ? "voluntary" : null],
  );
  return id;
}

describe("private paginated race history", () => {
  it("traverses equal and microsecond-different timestamps in both directions", async () => {
    const first = (await readAccountHistory(db, { accountId }))!;
    const second = (await readAccountHistory(db, { accountId, cursor: first.older }))!;
    const third = (await readAccountHistory(db, { accountId, cursor: second.older }))!;
    expect(first.rows).toHaveLength(20);
    expect(second.rows).toHaveLength(20);
    expect(third.rows).toHaveLength(5);
    expect([...first.rows, ...second.rows, ...third.rows].map((r) => r.raceId)).toEqual([...ids].reverse());
    expect(first.newer).toBeUndefined();
    expect(third.older).toBeUndefined();
    expect((await readAccountHistory(db, { accountId, cursor: third.newer }))!.rows).toEqual(second.rows);
    expect((await readAccountHistory(db, { accountId, cursor: second.newer }))!.rows).toEqual(first.rows);
    expect(new Set(first.rows.map((r) => r.outcome))).toEqual(new Set(["finished", "timed_out", "abandoned"]));
  });

  it("never changes account through a forged cursor, and reopens a roomless snapshot", async () => {
    const lobby = await pool.query<{ id: string }>("insert into lobbies(code, capacity) values ('HSTR23', 4) returning id");
    await pool.query("update races set lobby_id=$1 where id=$2", [lobby.rows[0]!.id, ids[0]]);
    await pool.query("delete from lobbies where id=$1", [lobby.rows[0]!.id]);
    const other = (await readAccountHistory(db, { accountId: outsider }))!;
    expect(other.rows).toHaveLength(1);
    const own = (await readAccountHistory(db, { accountId, cursor: `older|${other.rows[0]!.endedAt}|${other.rows[0]!.raceId}` }))!;
    expect(own.rows.every((row) => ids.includes(row.raceId))).toBe(true);
    expect(await readRaceForEntrant(db, ids[0]!, outsider)).toBeUndefined();
    expect((await readRaceForEntrant(db, ids[0]!, accountId))?.state).toBe("finished");
    expect((await readAccountHistory(db, { accountId: "00000000-0000-4000-8000-999999999999" }))?.rows).toEqual([]);
  });

  it("keeps exactly one full page terminal, with no false older link", async () => {
    const cursor = `older|2026-10-25T10:00:01.000010Z|${ids[20]}`;
    const page = (await readAccountHistory(db, { accountId, cursor }))!;
    expect(page.rows).toHaveLength(20);
    expect(page.older).toBeUndefined();
    expect(page.newer).toBeDefined();
  });

  it("rejects malformed cursor before query construction; selects once for valid input", async () => {
    const select = vi.spyOn(db, "select");
    expect(await readAccountHistory(db, { accountId, cursor: ["a", "b"] })).toBeNull();
    expect(select).not.toHaveBeenCalled();
    await readAccountHistory(db, { accountId });
    expect(select).toHaveBeenCalledTimes(1);
    select.mockRestore();
  });

  it("ignores new arrivals while traversing older pages and excludes interrupted/active races", async () => {
    const first = (await readAccountHistory(db, { accountId }))!;
    await seedRace(100, accountId);
    const next = (await readAccountHistory(db, { accountId, cursor: first.older }))!;
    expect(next.rows.map((row) => row.raceId)).toEqual([...ids].reverse().slice(20, 40));
    // Preserve a stored result deliberately: state, not the presence of a result alone, decides inclusion.
    await pool.query("update races set state='interrupted', interruption_reason='server_stopped' where id=$1", [ids[0]]);
    await pool.query("update races set state='racing', ended_at=null where id=$1", [ids[1]]);
    const last = (await readAccountHistory(db, { accountId, cursor: next.older }))!;
    expect(last.rows.map((row) => row.raceId)).not.toContain(ids[0]);
    expect(last.rows.map((row) => row.raceId)).not.toContain(ids[1]);
  });

  it("measures the real account-filtered plan on a representative local fixture", async () => {
    for (let n = 1000; n < 2000; n++) await seedRace(n, n % 20 === 0 ? accountId : outsider);
    await pool.query("analyze races; analyze race_entrants; analyze race_results");
    const queries: { sql: string; params: unknown[] }[] = [];
    const observed = drizzle({ client: pool, schema, logger: { logQuery: (sql, params) => { queries.push({ sql, params }); } } });
    expect((await readAccountHistory(observed, { accountId }))?.rows).toHaveLength(20);
    expect(queries).toHaveLength(1);
    type Plan = { "Node Type": string; "Index Name"?: string; "Actual Rows": number; Plans?: Plan[] };
    const measured = await pool.query<{ "QUERY PLAN": { Plan: Plan; "Execution Time": number }[] }>(
      `explain (analyze, buffers, format json) ${queries[0]!.sql}`, queries[0]!.params,
    );
    const plan = measured.rows[0]!["QUERY PLAN"][0]!;
    const flatten = (node: Plan): Plan[] => [node, ...(node.Plans ?? []).flatMap(flatten)];
    expect(plan.Plan["Actual Rows"]).toBe(21);
    const indexes = flatten(plan.Plan).flatMap((node) => node["Index Name"] ? [node["Index Name"]] : []);
    expect(indexes).toContain("race_entrants_account_race_unique");
    // Evidence, not a timing assertion: machine load is not a correctness requirement.
    console.info("[history plan]", { races: 1047, returned: 21, indexes, executionMs: plan["Execution Time"] });
  });
});
