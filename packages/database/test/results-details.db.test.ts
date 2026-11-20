import { randomUUID } from "node:crypto";
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { createDatabase, type Database } from "../src/client";
import { runMigrations } from "../src/migrations";
import { readRaceForEntrant, readRoomRaceForMember } from "../src/races/results";
import { createRoomWithHost } from "../src/rooms/create-room";
import * as schema from "../src/schema";
import { createTemporaryDatabase, type TemporaryDatabase } from "./test-database";

let database: TemporaryDatabase;
let pool: pg.Pool;
let db: Database;
beforeAll(async () => {
  database = await createTemporaryDatabase();
  await runMigrations({ connectionString: database.url });
  pool = new pg.Pool({ connectionString: database.url });
  db = createDatabase(pool);
});
afterEach(async () => {
  await pool.query("update lobbies set host_member_id=null");
  await pool.query("delete from lobbies");
  await pool.query("delete from races");
  await pool.query("delete from accounts");
});
afterAll(async () => { await pool?.end(); await database?.drop(); });

async function account() {
  return (await pool.query<{ id: string }>("insert into accounts(display_name) values ('Test sailor') returning id")).rows[0]!.id;
}
const category = { bonuses: false, errorMode: "mandatory" };
async function result(accountId: string, options: {
  netWpm?: number; config?: object; endedAt?: string; state?: "finished" | "interrupted";
  outcome?: "finished" | "timed_out" | "abandoned"; total?: number; correct?: number; noResult?: boolean;
} = {}) {
  const raceId = randomUUID();
  const entrantId = randomUUID();
  await pool.query(`insert into races(id,round_no,state,rules_version,text_snapshot,config_snapshot,
    countdown_at,started_at,ended_at,interruption_reason,owner_id,lease_expires_at)
    values ($1,1,$2,1,'sea',$3,'2026-10-25T09:00:00Z','2026-10-25T09:00:03Z',$4,$5,$1,'2026-10-25T11:00:00Z')`,
  [raceId, options.state ?? "finished", options.config ?? category, options.endedAt ?? "2026-10-25T10:00:00Z",
    options.state === "interrupted" ? "server_stopped" : null]);
  await pool.query("insert into race_entrants(id,race_id,account_id,ordinal,display_name_snapshot) values ($1,$2,$3,1,'Test sailor')", [entrantId, raceId, accountId]);
  if (!options.noResult) await pool.query(`insert into race_results(race_id,entrant_id,outcome,rank,elapsed_ms,position,length,
    correct_inputs,total_inputs,net_wpm,raw_wpm,accuracy,abandonment_reason)
    values ($1,$2,$3,1,1000,$4,3,$5,$6,$7,$7,99.999,$8)`, [raceId, entrantId, options.outcome ?? "finished",
    options.outcome === undefined || options.outcome === "finished" ? 3 : 1,
    options.correct ?? 3, options.total ?? 4, options.netWpm ?? 50, options.outcome === "abandoned" ? "voluntary" : null]);
  return raceId;
}
async function record(raceId: string, accountId: string) { return (await readRaceForEntrant(db, raceId, accountId))?.personalRecord; }

describe("private persisted result details", () => {
  it("reads exact cumulative errors, including zero and the safe integer boundary, not rounded accuracy", async () => {
    const id = await account();
    for (const [total, correct] of [[0, 0], [8, 3], [Number.MAX_SAFE_INTEGER, 0], [Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER - 1]]) {
      const raceId = await result(id, { total, correct });
      expect((await readRaceForEntrant(db, raceId, id))?.entrants[0]?.result?.errors).toBe(total! - correct!);
    }
  });
  it("handles first, strictly improved, tied and lower records with no display rounding", async () => {
    const id = await account();
    const first = await result(id, { netWpm: 0, endedAt: "2026-10-25T09:10:00Z" });
    expect((await record(first, id))?.status).toBe("first");
    const improved = await result(id, { netWpm: 40.003, endedAt: "2026-10-25T09:20:00Z" });
    expect((await record(improved, id))?.status).toBe("improved");
    const fine = await result(id, { netWpm: 40.004, endedAt: "2026-10-25T09:30:00Z" });
    expect((await record(fine, id))?.status).toBe("improved");
    const tied = await result(id, { netWpm: 40.004, endedAt: "2026-10-25T09:40:00Z" });
    expect((await record(tied, id))?.status).toBe("tied");
    const below = await result(id, { netWpm: 40.003, endedAt: "2026-10-25T09:50:00Z" });
    expect((await record(below, id))?.status).toBe("below");
    // A later better performance must not erase the old badge on reload.
    await result(id, { netWpm: 100 });
    expect((await record(first, id))?.status).toBe("first");
    expect((await record(fine, id))?.status).toBe("improved");
  });
  it("keeps all four D-12 categories separate", async () => {
    const id = await account();
    for (const bonuses of [false, true]) for (const errorMode of ["mandatory", "free"]) {
      const config = { bonuses, errorMode };
      const raceId = await result(id, { config });
      expect(await record(raceId, id)).toEqual({ status: "first", category: config });
      const next = await result(id, { config, endedAt: "2026-10-25T10:01:00Z" });
      expect((await record(next, id))?.status).toBe("tied");
    }
  });
  it("excludes time-outs, abandons and interruptions from records and previous bests", async () => {
    const id = await account();
    for (const outcome of ["timed_out", "abandoned"] as const) {
      const past = await result(id, { outcome, netWpm: 100, endedAt: "2026-10-25T09:20:00Z" });
      expect(await record(past, id)).toBeUndefined();
      expect((await readRaceForEntrant(db, past, id))?.entrants[0]?.result?.errors).toBe(1);
    }
    const interrupted = await result(id, { state: "interrupted", netWpm: 100, endedAt: "2026-10-25T09:20:00Z" });
    expect(await record(interrupted, id)).toBeUndefined();
    expect((await readRaceForEntrant(db, interrupted, id))?.entrants[0]?.result).toBeUndefined();
    expect((await record(await result(id), id))?.status).toBe("first");
  });
  it("never defaults an unknown current category or a string boolean, or invents evidence from legacy history", async () => {
    const id = await account();
    for (const config of [{}, { bonuses: "false", errorMode: "mandatory" }, { bonuses: false, errorMode: "unknown" }]) {
      expect(await record(await result(id, { config, endedAt: "2026-10-25T09:10:00Z" }), id)).toEqual({ status: "unavailable" });
    }
    expect(await record(await result(id), id)).toEqual({ status: "unavailable" });
  });
  it("uses PostgreSQL microseconds; equal-time courses do not impose an arbitrary UUID order", async () => {
    const id = await account();
    await result(id, { netWpm: 50, endedAt: "2026-10-25T10:00:00.000001Z" });
    const current = await result(id, { netWpm: 51, endedAt: "2026-10-25T10:00:00.000002Z" });
    await result(id, { netWpm: 99, endedAt: "2026-10-25T10:00:00.000002Z" });
    expect((await record(current, id))?.status).toBe("improved");
  });
  it("preserves private access and does not use another account's record or expose its history", async () => {
    const id = await account(); const other = await account();
    await result(other, { netWpm: 500, endedAt: "2026-10-25T09:20:00Z" });
    const raceId = await result(id);
    expect((await record(raceId, id))?.status).toBe("first");
    expect(await readRaceForEntrant(db, raceId, other)).toBeUndefined();
    expect(await readRaceForEntrant(db, randomUUID(), other)).toBeUndefined();
    expect(await readRaceForEntrant(db, "invalid", other)).toBeUndefined();
    const view = await readRaceForEntrant(db, raceId, id);
    expect(view).not.toHaveProperty("config");
    expect(view?.entrants[0]).not.toHaveProperty("personalRecord");
  });
  it("retains the absent left-joined result instead of fabricating zero counters", async () => {
    const id = await account(); const raceId = await result(id, { noResult: true });
    const view = await readRaceForEntrant(db, raceId, id);
    expect(view?.entrants[0]?.result).toBeUndefined();
    expect(view?.personalRecord).toBeUndefined();
  });
  it("uses at most three queries and shares exact errors, not private records, with an authorised room spectator", async () => {
    const queries: string[] = [];
    const observed = drizzle({ client: pool, schema, logger: { logQuery(query) { queries.push(query); } } });
    const spectator = await account(); const runner = await account();
    const room = await createRoomWithHost(db, { accountId: spectator, role: "spectator", visibility: "code", capacity: 30, randomIndex: () => 0 });
    if (!room.ok) throw new Error(room.error);
    const raceId = await result(runner);
    await pool.query("update races set lobby_id=$1 where id=$2", [room.room.id, raceId]);
    await pool.query("update lobbies set phase='results',current_race_id=$2 where id=$1", [room.room.id, raceId]);
    const view = await readRoomRaceForMember(observed, { lobbyId: room.room.id, raceId, accountId: spectator });
    expect(view?.entrants[0]?.result?.errors).toBe(1);
    expect(view?.personalRecord).toBeUndefined();
    expect(queries).toHaveLength(2);
    queries.length = 0;
    expect((await readRaceForEntrant(observed, raceId, runner))?.personalRecord?.status).toBe("first");
    expect(queries).toHaveLength(3);
    expect(await readRoomRaceForMember(db, { lobbyId: room.room.id, raceId, accountId: runner })).toBeUndefined();
  });
});
