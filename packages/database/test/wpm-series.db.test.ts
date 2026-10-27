import { randomUUID } from "node:crypto";
import { asDuration, collectWpmObservation, computeMeasures, createWpmSeries, freezeStoredWpmSeries, type StoredWpmSeries } from "@incision/domain";
import pg from "pg";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { createDatabase, type Database } from "../src/client";
import { runMigrations } from "../src/migrations";
import { finalizeRace, interruptOwnRace, type RaceOwnership, type RaceResultRow } from "../src/races/lifecycle";
import { readRaceForEntrant, readRoomRaceForMember } from "../src/races/results";
import { createTemporaryDatabase, type TemporaryDatabase } from "./test-database";

let database: TemporaryDatabase;
let pool: pg.Pool;
let db: Database;
beforeAll(async () => {
  database = await createTemporaryDatabase(); await runMigrations({ connectionString: database.url });
  pool = new pg.Pool({ connectionString: database.url, max: 4 }); db = createDatabase(pool);
});
afterEach(async () => {
  await pool.query("update lobbies set host_member_id = null");
  await pool.query("delete from lobbies"); await pool.query("delete from races"); await pool.query("delete from accounts");
});
afterAll(async () => { await pool.end(); await database.drop(); });

function realSeries(elapsedMs: number, correctInputs: number, totalInputs: number): StoredWpmSeries {
  const first = collectWpmObservation(createWpmSeries(), { kind: "observe", elapsed: asDuration(0), counters: { totalInserts: 0, correctInserts: 0 } });
  if (!first.ok) throw new Error(first.refusal);
  const terminal = { elapsed: asDuration(elapsedMs), counters: { correctInserts: correctInputs, totalInserts: totalInputs } };
  const last = collectWpmObservation(first.series, { ...terminal, kind: "finalize" });
  if (!last.ok) throw new Error(last.refusal);
  const frozen = freezeStoredWpmSeries(last.series, terminal);
  if (!frozen.ok) throw new Error(frozen.refusal);
  return frozen.value;
}

async function fixture() {
  // SQL fixture, not a second implementation of the room/start business rules.
  const accounts: string[] = [];
  for (const name of ["Alice", "Bob", "Spectator", "Stranger"]) {
    accounts.push((await pool.query<{ id: string }>("insert into accounts(display_name) values($1) returning id", [name])).rows[0]!.id);
  }
  const lobbyId = (await pool.query<{ id: string }>("insert into lobbies(code, visibility, capacity) values ('ABCDEF', 'code', 30) returning id")).rows[0]!.id;
  const members: string[] = [];
  for (const [index, accountId] of accounts.slice(0, 3).entries()) {
    members.push((await pool.query<{ id: string }>("insert into lobby_members(lobby_id, account_id, display_name, display_name_canonical, role) values($1,$2,$3,lower($3),$4) returning id",
      [lobbyId, accountId, ["Alice", "Bob", "Spectator"][index], index === 2 ? "spectator" : "participant"])).rows[0]!.id);
  }
  const ownerId = randomUUID();
  const raceId = (await pool.query<{ id: string }>(`insert into races(lobby_id,round_no,rules_version,text_snapshot,config_snapshot,countdown_at,owner_id,lease_expires_at)
    values($1,1,1,'abcd','{}',statement_timestamp(),$2,statement_timestamp()+interval '30 seconds') returning id`, [lobbyId, ownerId])).rows[0]!.id;
  await pool.query("update lobbies set phase='countdown', current_race_id=$2, host_member_id=$3 where id=$1", [lobbyId, raceId, members[0]]);
  const results: RaceResultRow[] = [];
  for (const index of [0, 1]) {
    const entrantId = (await pool.query<{ id: string }>("insert into race_entrants(race_id,member_id,account_id,ordinal,display_name_snapshot) values($1,$2,$3,$4,$5) returning id",
      [raceId, members[index], accounts[index], index + 1, ["Alice", "Bob"][index]])).rows[0]!.id;
    const elapsedMs = 10_000 + index * 123;
    const counters = { correctInserts: 4, totalInserts: 5 };
    results.push({ entrantId, rank: index + 1, outcome: "finished", position: 4, length: 4, elapsedMs,
      correctInputs: 4, totalInputs: 5, ...computeMeasures(counters, asDuration(elapsedMs)), wpmSeries: realSeries(elapsedMs, 4, 5) });
  }
  const ownership: RaceOwnership = { raceId, lobbyId, ownerId, ownerEpoch: 1 };
  return { ownership, results, accounts };
}

async function counts(raceId: string) {
  return (await pool.query<{ state: string; results: number; series: number }>(`select state,
    (select count(*)::int from race_results where race_id=r.id) as results,
    (select count(*)::int from race_wpm_series where race_id=r.id) as series from races r where r.id=$1`, [raceId])).rows[0];
}

describe("atomic, authorized WPM series persistence", () => {
  it("writes once with results, reads exact measures for entrants and active room spectators only", async () => {
    const { ownership, results, accounts } = await fixture();
    expect(await finalizeRace(db, ownership, results)).toEqual({ won: true, alreadyDone: false });
    expect(await counts(ownership.raceId)).toEqual({ state: "finished", results: 2, series: 2 });
    const view = await readRaceForEntrant(db, ownership.raceId, accounts[0]!);
    expect(view?.entrants.map((entrant) => entrant.result?.wpmSeries)).toEqual(results.map((result) => result.wpmSeries));
    expect(JSON.stringify(view)).not.toContain(accounts[1]!);
    expect(await readRaceForEntrant(db, ownership.raceId, accounts[2]!)).toBeUndefined();
    expect(await readRoomRaceForMember(db, { ...ownership, accountId: accounts[3]! })).toBeUndefined();
    expect((await readRoomRaceForMember(db, { ...ownership, accountId: accounts[2]! }))?.entrants[0]?.result?.wpmSeries).toEqual(results[0]?.wpmSeries);
    // Idempotent retry recognises the previous write, never writes the newly supplied payload.
    expect(await finalizeRace(db, ownership, results.map((result) => ({ ...result, wpmSeries: { unavailable: "not_collected" } })))).toEqual({ won: true, alreadyDone: true });
    expect(await counts(ownership.raceId)).toEqual({ state: "finished", results: 2, series: 2 });
    const stored = await pool.query<{ series: unknown }>("select series from race_wpm_series where race_id=$1 and entrant_id=$2", [ownership.raceId, results[0]!.entrantId]);
    expect(stored.rows[0]?.series).toEqual(results[0]?.wpmSeries);
  });

  it("rolls back phase, all results and all series for a mismatched terminal series", async () => {
    const { ownership, results } = await fixture();
    const broken = results.map((result, index) => index ? { ...result, wpmSeries: realSeries(result.elapsedMs + 1, 4, 5) } : result);
    await expect(finalizeRace(db, ownership, broken)).rejects.toThrow("FINAL_SAMPLE_MISMATCH");
    expect(await counts(ownership.raceId)).toEqual({ state: "countdown", results: 0, series: 0 });
    expect(await finalizeRace(db, ownership, results)).toEqual({ won: true, alreadyDone: false });
  });

  it("refuses missing/null series rather than silently treating a live finalisation as historical", async () => {
    const { ownership, results } = await fixture();
    for (const value of [undefined, null]) {
      const broken = results.map((result) => ({ ...result, wpmSeries: value }));
      // Simulate a JavaScript/old-release caller bypassing the required TypeScript contract.
      await expect(finalizeRace(db, ownership, broken as unknown as RaceResultRow[])).rejects.toThrow("shape");
      expect(await counts(ownership.raceId)).toEqual({ state: "countdown", results: 0, series: 0 });
    }
  });

  it("supports explicit uncollected producers without fabricating zero or terminal-only history", async () => {
    const { ownership, results, accounts } = await fixture();
    await finalizeRace(db, ownership, results.map((result) => ({ ...result, wpmSeries: { unavailable: "not_collected" } })));
    expect(await counts(ownership.raceId)).toEqual({ state: "finished", results: 2, series: 0 });
    expect((await readRaceForEntrant(db, ownership.raceId, accounts[0]!))?.entrants.every((entrant) => entrant.result?.wpmSeries === undefined)).toBe(true);
  });

  it("rejects a different owner/generation, and interruption leaves neither results nor series", async () => {
    const { ownership, results } = await fixture();
    expect(await finalizeRace(db, { ...ownership, ownerEpoch: 2 }, results)).toEqual({ won: false });
    expect(await finalizeRace(db, { ...ownership, ownerId: randomUUID() }, results)).toEqual({ won: false });
    await interruptOwnRace(db, ownership, "server_stopped");
    expect(await finalizeRace(db, ownership, results)).toEqual({ won: false });
    expect(await counts(ownership.raceId)).toEqual({ state: "interrupted", results: 0, series: 0 });
  });

  it("serialises competing finalisations behind the held room lock without duplicating series", async () => {
    const { ownership, results } = await fixture();
    const blocker = await pool.connect();
    await blocker.query("begin"); await blocker.query("select id from lobbies where id=$1 for update", [ownership.lobbyId]);
    const first = finalizeRace(db, ownership, results);
    const second = finalizeRace(db, ownership, results);
    try {
      let blocked = false;
      for (let i = 0; i < 100; i++) {
        const check = await pool.query<{ value: number }>("select count(*)::int as value from pg_stat_activity where datname=current_database() and wait_event_type='Lock'");
        if ((check.rows[0]?.value ?? 0) >= 2) { blocked = true; break; }
        await new Promise((resolve) => setTimeout(resolve, 5));
      }
      expect(blocked).toBe(true);
    } finally { await blocker.query("rollback"); blocker.release(); }
    expect((await Promise.all([first, second])).map((result) => result.won && result.alreadyDone).sort()).toEqual([false, true]);
    expect(await counts(ownership.raceId)).toEqual({ state: "finished", results: 2, series: 2 });
  });

  it("bounds JSON in SQL and refuses a corrupt stored row on authorized reads", async () => {
    const { ownership, results, accounts } = await fixture(); await finalizeRace(db, ownership, results);
    for (const series of [null, { version: 2, points: [0] }, { version: 1, points: [] }, { version: 1, points: Array(513).fill(0) }]) {
      await expect(pool.query("update race_wpm_series set series=$2::jsonb where race_id=$1", [ownership.raceId, JSON.stringify(series)])).rejects.toMatchObject({ code: "23514" });
    }
    await expect(pool.query("insert into race_wpm_series(race_id,entrant_id,series) values($1,$2,$3)", [ownership.raceId, randomUUID(), JSON.stringify(results[0]!.wpmSeries)])).rejects.toMatchObject({ code: "23503" });
    await pool.query("update race_wpm_series set series=jsonb_set(series,'{points,1,measures,netWpm}','0') where race_id=$1", [ownership.raceId]);
    // Outsiders are refused before parsing, even when the stored series is corrupt.
    expect(await readRaceForEntrant(db, ownership.raceId, accounts[3]!)).toBeUndefined();
    await expect(readRaceForEntrant(db, ownership.raceId, accounts[0]!)).rejects.toThrow("INVALID_SERIES");
  });
});
