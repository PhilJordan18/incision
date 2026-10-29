import { randomUUID } from "node:crypto";
import { asDuration, collectWpmObservation, computeMeasures, createWpmSeries, freezeStoredWpmSeries } from "@incision/domain";
import pg from "pg";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { createDatabase, type Database } from "../src/client";
import { createGuestSession } from "../src/identity/guest-sessions";
import { runMigrations } from "../src/migrations";
import { finalizeRace, interruptOwnRace, startRace, type RaceResultRow } from "../src/races/lifecycle";
import { readRaceForEntrant, readRoomRaceForGuest } from "../src/races/results";
import { readAccountStatistics } from "../src/races/profile-statistics";
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

describe("anonymous guest persistence for races with account participants", () => {
  it("stores only a race-local anonymous identity from the start, while keeping the live mapping in memory", async () => {
    const f = await started();
    const live = f.entrants.find((e) => e.accountId === null)!;
    expect(live).toMatchObject({ memberId: f.guestMemberId, displayName: "SecretNickname", kind: "human" });
    const row = (await pool.query("select * from race_entrants where id=$1", [live.entrantId])).rows[0];
    expect(row).toMatchObject({ account_id: null, member_id: null, kind: "guest", bot_level: null, display_name_snapshot: `#${live.ordinal}` });
    for (const value of [f.guestId, f.guestMemberId, "SecretNickname", "a".repeat(64)]) expect(JSON.stringify(row)).not.toContain(value);
    expect((await pool.query("select * from race_entrants where account_id=$1", [f.accountId])).rows[0]?.display_name_snapshot).toBe("Account");
  });

  it("rejects durable guest identifiers, names, bot levels and account links at the SQL boundary", async () => {
    const f = await started(); const guest = f.entrants.find((e) => e.accountId === null)!;
    for (const [column, value] of [["member_id", f.guestMemberId], ["account_id", f.accountId],
      ["display_name_snapshot", "SecretNickname"], ["bot_level", "beginner"]]) {
      // Column names are this fixed test list, never user data.
      await expect(pool.query(`update race_entrants set ${column}=$2 where id=$1`, [guest.entrantId, value]))
        .rejects.toMatchObject({ constraint: "race_entrants_identity_kind" });
    }
  });

  it("persists collective series but never guest-private errors; account history and victory remain correct after room deletion", async () => {
    const f = await started();
    expect(await finalizeRace(db, f.race, f.results)).toEqual({ won: true, alreadyDone: false });
    const view = await readRaceForEntrant(db, f.race.raceId, f.accountId);
    const anonymous = view?.entrants.find((e) => e.anonymous);
    expect(anonymous).toMatchObject({ kind: "human", isSelf: false, displayName: "#2" });
    expect(anonymous?.result?.wpmSeries).toEqual(f.results[1]?.wpmSeries);
    expect(view?.personalKeyErrors).toEqual(f.results[0]?.keyErrors);
    const errors = (await pool.query("select entrant_id,aggregate from race_key_errors")).rows;
    expect(errors).toEqual([{ entrant_id: f.results[0]!.entrantId, aggregate: f.results[0]!.keyErrors }]);
    for (const value of [f.guestId, f.guestMemberId, "SecretNickname", "PRIVATE"]) expect(JSON.stringify(view)).not.toContain(value);
    expect(await readRaceForEntrant(db, f.race.raceId, f.guestId)).toBeUndefined();
    const stats = await readAccountStatistics(db, f.accountId);
    expect(stats.summary.victories).toBe(1);
    await pool.query("delete from lobbies where id=$1", [f.lobbyId]);
    await pool.query("delete from guest_sessions where id=$1", [f.guestId]);
    expect(await readRaceForEntrant(db, f.race.raceId, f.accountId)).toEqual(view);
    expect(await readAccountStatistics(db, f.accountId)).toEqual(stats);
  });

  it("finalizes concurrent retries once and never persists newly supplied guest errors", async () => {
    const f = await started();
    const replies = await Promise.all([finalizeRace(db, f.race, f.results), finalizeRace(db, f.race, f.results)]);
    expect(replies).toContainEqual({ won: true, alreadyDone: false });
    expect(replies).toContainEqual({ won: true, alreadyDone: true });
    expect((await pool.query("select count(*)::int as n from race_results")).rows[0]?.n).toBe(2);
    expect((await pool.query("select count(*)::int as n from race_wpm_series")).rows[0]?.n).toBe(2);
    expect((await pool.query("select count(*)::int as n from race_key_errors")).rows[0]?.n).toBe(1);
    expect(await finalizeRace(db, f.race, [])).toEqual({ won: true, alreadyDone: true });
  });

  it("draws a fresh anonymous entrant identity for each race instead of reusing the guest session", async () => {
    const f = await started();
    await finalizeRace(db, f.race, f.results);
    // Fixture advances to the next waiting phase; no admission or runtime is exercised.
    await pool.query("update lobbies set phase='waiting' where id=$1", [f.lobbyId]);
    const next = await startRace(db, f.input);
    if (!next.ok) throw new Error(next.error);
    const oldGuest = f.entrants.find((e) => e.accountId === null)!;
    const newGuest = next.entrants.find((e) => e.accountId === null)!;
    expect(newGuest.entrantId).not.toBe(oldGuest.entrantId);
    expect(newGuest.memberId).toBe(oldGuest.memberId);
    const rows = (await pool.query("select id,member_id,account_id,display_name_snapshot from race_entrants where kind='guest'")).rows;
    expect(rows).toHaveLength(2);
    for (const row of rows) expect(row).toMatchObject({ member_id: null, account_id: null, display_name_snapshot: "#2" });
  });

  it("rolls back all result writes and phase changes on an invalid guest series", async () => {
    const f = await started();
    const broken = f.results.map((r, i) => i ? { ...r, elapsedMs: r.elapsedMs + 1 } : r);
    await expect(finalizeRace(db, f.race, broken)).rejects.toThrow("FINAL_SAMPLE_MISMATCH");
    for (const table of ["race_results", "race_wpm_series", "race_key_errors"]) expect((await pool.query(`select count(*)::int as n from ${table}`)).rows[0]?.n).toBe(0);
    expect((await pool.query("select state from races")).rows[0]?.state).toBe("countdown");
    expect((await pool.query("select phase from lobbies")).rows[0]?.phase).toBe("countdown");
    expect(await finalizeRace(db, f.race, f.results)).toEqual({ won: true, alreadyDone: false });
  });

  it("writes nothing for an obsolete owner or an interrupted race", async () => {
    const f = await started();
    expect(await finalizeRace(db, { ...f.race, ownerEpoch: f.race.ownerEpoch + 1 }, f.results)).toEqual({ won: false });
    await interruptOwnRace(db, f.race, "server_stopped");
    expect(await finalizeRace(db, f.race, f.results)).toEqual({ won: false });
    for (const table of ["race_results", "race_wpm_series", "race_key_errors"]) expect((await pool.query(`select count(*)::int as n from ${table}`)).rows[0]?.n).toBe(0);
  });

  it("finalizes guest-only races without any durable metrics, even with an account spectator", async () => {
    const f = await started(false);
    expect(await finalizeRace(db, f.race, f.results)).toEqual({ won: true, alreadyDone: false });
    expect(await finalizeRace(db, f.race, [])).toEqual({ won: true, alreadyDone: true });
    for (const table of ["race_results", "race_wpm_series", "race_key_errors"]) {
      expect((await pool.query(`select count(*)::int as n from ${table}`)).rows[0].n).toBe(0);
    }
    expect((await pool.query("select phase from lobbies")).rows[0].phase).toBe("results");
    expect(await readRaceForEntrant(db, f.race.raceId, f.accountId)).toBeUndefined();
  });

  it("rejects malformed ephemeral results atomically and preserves the active race", async () => {
    const f = await started(false);
    for (const patch of [{ entrantId: randomUUID() }, { rank: 0 }, { netWpm: Infinity }, { correctInputs: 100 }, { position: 0 }]) {
      await expect(finalizeRace(db, f.race, f.results.map((row) => ({ ...row, ...patch })))).rejects.toThrow();
      expect((await pool.query("select state from races")).rows[0].state).toBe("countdown");
    }
    expect(await finalizeRace(db, f.race, f.results)).toEqual({ won: true, alreadyDone: false });
  });

  it("serializes ephemeral finalizations without durable result rows", async () => {
    const f = await started(false);
    const results = await Promise.all([finalizeRace(db, f.race, f.results), finalizeRace(db, f.race, f.results)]);
    expect(results).toContainEqual({ won: true, alreadyDone: false });
    expect(results).toContainEqual({ won: true, alreadyDone: true });
    expect((await pool.query("select * from race_results")).rows).toEqual([]);
  });
  it("gives guests only a current-room view with no account heatmap, record or activity renewal", async () => {
    const f = await started(); await finalizeRace(db, f.race, f.results);
    const proof = { id: f.guestId, secretDigest: "a".repeat(64) };
    const input = { lobbyId: f.lobbyId, raceId: f.race.raceId, proof };
    const before = (await pool.query("select * from guest_sessions")).rows;
    const found = await readRoomRaceForGuest(db, input);
    expect(found?.memberId).toBe(f.guestMemberId);
    expect(found?.view.entrants).toHaveLength(2);
    expect(found?.view.personalKeyErrors).toBeUndefined(); expect(found?.view.personalRecord).toBeUndefined();
    expect(found?.view.entrants.every((entrant) => !entrant.isSelf)).toBe(true);
    expect((await pool.query("select * from guest_sessions")).rows).toEqual(before);
    expect(await readRoomRaceForGuest(db, { ...input, proof: { ...proof, secretDigest: "b".repeat(64) } })).toBeUndefined();
    expect(await readRoomRaceForGuest(db, { ...input, lobbyId: randomUUID() })).toBeUndefined();
    await pool.query("update lobbies set phase='waiting' where id=$1", [f.lobbyId]);
    expect(await readRoomRaceForGuest(db, input)).toBeUndefined();
    await pool.query("update lobbies set phase='results' where id=$1", [f.lobbyId]);
    await pool.query("update lobby_members set left_at=now() where id=$1", [f.guestMemberId]);
    expect(await readRoomRaceForGuest(db, input)).toBeUndefined();
  });

  it("refuses an expired guest while preserving account history", async () => {
    const f = await started(); await finalizeRace(db, f.race, f.results);
    const before = await readRaceForEntrant(db, f.race.raceId, f.accountId);
    await pool.query("update guest_sessions set created_at=now()-interval '2 days',last_seen_at=now()-interval '25 hours',expires_at=now()-interval '1 hour'");
    expect(await readRoomRaceForGuest(db, { lobbyId: f.lobbyId, raceId: f.race.raceId, proof: { id: f.guestId, secretDigest: "a".repeat(64) } })).toBeUndefined();
    expect(await readRaceForEntrant(db, f.race.raceId, f.accountId)).toEqual(before);
  });

});
