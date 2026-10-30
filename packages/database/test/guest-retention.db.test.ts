import { randomUUID } from "node:crypto";
import { asDuration, collectWpmObservation, computeMeasures, createWpmSeries, freezeStoredWpmSeries } from "@incision/domain";
import pg from "pg";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { createDatabase, type Database } from "../src/client";
import { createGuestSession } from "../src/identity/guest-sessions";
import { runMigrations } from "../src/migrations";
import { finalizeRace, startRace, type RaceResultRow } from "../src/races/lifecycle";
import { readRaceForEntrant } from "../src/races/results";
import { maintainGuestRetention } from "../src/identity/guest-retention";
import { closeRoom } from "../src/rooms/host-actions";
import { parseRoomCode } from "@incision/domain";
import { createTemporaryDatabase, type TemporaryDatabase } from "./test-database";

let database: TemporaryDatabase;
let pool: pg.Pool;
let db: Database;
beforeAll(async () => {
  database = await createTemporaryDatabase(); await runMigrations({ connectionString: database.url });
  pool = new pg.Pool({ connectionString: database.url, max: 6 }); db = createDatabase(pool);
});
afterEach(async () => {
  await pool.query("update lobbies set host_member_id=null");
  await pool.query("delete from lobbies"); await pool.query("delete from races");
  await pool.query("delete from guest_sessions"); await pool.query("delete from accounts");
});
afterAll(async () => { await pool?.end(); await database?.drop(); });

async function fixture(accountParticipates = true) {
  const accountId = randomUUID(), guestId = randomUUID(), lobbyId = randomUUID();
  await pool.query("insert into accounts(id,display_name) values($1,'Account')", [accountId]);
  await pool.query("insert into lobbies(id,code,capacity) values($1,'ABCDEF',30)", [lobbyId]);
  await pool.query("insert into lobby_settings(lobby_id,text_language,error_mode,word_count) values($1,'en','mandatory',200)", [lobbyId]);
  const hostId = (await pool.query<{ id: string }>(`insert into lobby_members(lobby_id,account_id,role,display_name,display_name_canonical)
    values($1,$2,$3,'Account','account') returning id`, [lobbyId, accountId, accountParticipates ? "participant" : "spectator"])).rows[0]!.id;
  await pool.query("update lobbies set host_member_id=$2 where id=$1", [lobbyId, hostId]);
  await createGuestSession(db, { id: guestId, secretDigest: "a".repeat(64) });
  const guestMemberId = (await pool.query<{ id: string }>(`insert into lobby_members(lobby_id,guest_session_id,role,display_name,display_name_canonical)
    values($1,$2,'participant','SecretNickname','secretnickname') returning id`, [lobbyId, guestId])).rows[0]!.id;
  const input = { accountId, lobbyId, settingsRevision: 0, ownerId: randomUUID(), text: "abcd", config: { errorMode: "mandatory", bonuses: false, wordCount: 200 },
    rulesVersion: 1, create: () => ({ ok: true as const, race: null }) };
  return { input, accountId, guestId, guestMemberId, lobbyId };
}

async function started(accountParticipates = true) {
  const f = await fixture(accountParticipates); const result = await startRace(db, f.input);
  if (!result.ok) throw new Error(result.error);
  const results: RaceResultRow[] = result.entrants.map((entrant, index) => {
    const elapsedMs = 10_000 + index * 1000;
    const counters = { correctInserts: 4, totalInserts: 5 };
    const terminal = { elapsed: asDuration(elapsedMs), counters };
    const sample = collectWpmObservation(createWpmSeries(), { kind: "finalize", ...terminal });
    if (!sample.ok) throw new Error(sample.refusal);
    const series = freezeStoredWpmSeries(sample.series, terminal);
    if (!series.ok) throw new Error(series.refusal);
    return { entrantId: entrant.entrantId, rank: index + 1, outcome: "finished", elapsedMs,
      position: 4, length: 4, correctInputs: 4, totalInputs: 5, ...computeMeasures(counters, asDuration(elapsedMs)),
      wpmSeries: series.value, keyErrors: { version: 1, keys: [{ grapheme: index ? "PRIVATE" : "a", count: 1 }] } };
  });
  return { ...f, race: result.race, entrants: result.entrants, results };
}

const parsed = parseRoomCode("ABCDEF");
if (!parsed.ok) throw new Error("Invalid fixture code");
const code = parsed.code;

describe("guest and closed-room retention", () => {
  it("purges old rooms while preserving account data, photos, results and collective series", async () => {
    const f = await started(); await finalizeRace(db, f.race, f.results);
    await pool.query("insert into profile_photos(account_id,webp) values($1,decode('524946460000000057454250','hex'))", [f.accountId]);
    const before = await readRaceForEntrant(db, f.race.raceId, f.accountId);
    const accounts = (await pool.query("select * from accounts")).rows;
    const photos = (await pool.query("select * from profile_photos")).rows;
    const metrics = (await pool.query("select * from race_results order by entrant_id")).rows;
    const series = (await pool.query("select * from race_wpm_series order by entrant_id")).rows;
    expect(await closeRoom(db, { accountId: f.accountId, code })).toEqual({ ok: true, lobbyId: f.lobbyId });
    expect((await pool.query("select * from guest_sessions")).rows).toEqual([]);
    await pool.query("update lobbies set created_at=now()-interval '25 hours',closed_at=now()-interval '23 hours'");
    const report = await maintainGuestRetention(db, () => new Set());
    expect(report.purgedRooms).toEqual([f.lobbyId]);
    expect((await pool.query("select * from lobbies")).rows).toEqual([]);
    expect(await readRaceForEntrant(db, f.race.raceId, f.accountId)).toEqual(before);
    expect((await pool.query("select * from accounts")).rows).toEqual(accounts);
    expect((await pool.query("select * from profile_photos")).rows).toEqual(photos);
    expect((await pool.query("select * from race_results order by entrant_id")).rows).toEqual(metrics);
    expect((await pool.query("select * from race_wpm_series order by entrant_id")).rows).toEqual(series);
    expect((await maintainGuestRetention(db, () => new Set())).purgedRooms).toEqual([]);
  });

  it("never purges an open room or rewrites its 200-word setting", async () => {
    const f = await fixture(); await pool.query("update lobbies set created_at=now()-interval '3 days'");
    const before = (await pool.query("select * from lobby_settings")).rows;
    expect((await maintainGuestRetention(db, () => new Set())).purgedRooms).toEqual([]);
    expect((await pool.query("select * from lobby_settings")).rows).toEqual(before);
    expect((await pool.query("select id from lobbies")).rows).toEqual([{ id: f.lobbyId }]);
  });

  it("retires an expired unwatched guest without renewing or removing the account", async () => {
    const f = await fixture();
    await pool.query("update guest_sessions set created_at=now()-interval '2 days',last_seen_at=now()-interval '25 hours',expires_at=now()-interval '1 hour'");
    const report = await maintainGuestRetention(db, () => new Set());
    expect(report.departed).toEqual([{ lobbyId: f.lobbyId, memberId: f.guestMemberId, closed: false }]);
    expect((await pool.query("select * from guest_sessions")).rows).toEqual([]);
    expect((await pool.query("select id from accounts")).rows).toEqual([{ id: f.accountId }]);
  });

  it("removes guest-only race metadata on room purge and retains recent closed rooms", async () => {
    const f = await started(false); await finalizeRace(db, f.race, f.results);
    await closeRoom(db, { accountId: f.accountId, code });
    expect((await maintainGuestRetention(db, () => new Set())).purgedRooms).toEqual([]);
    await pool.query("update lobbies set created_at=now()-interval '25 hours',closed_at=now()-interval '23 hours'");
    expect((await maintainGuestRetention(db, () => new Set())).purgedRooms).toEqual([f.lobbyId]);
    for (const table of ["races", "race_entrants", "race_results", "race_wpm_series", "race_key_errors"]) {
      expect((await pool.query(`select * from ${table}`)).rows).toEqual([]);
    }
  });
});
