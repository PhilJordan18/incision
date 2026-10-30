import { randomUUID } from "node:crypto";
import pg from "pg";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { createDatabase, type Database } from "../src/client";
import { prepareGuestAccountSignIn } from "../src/identity/guest-account-transition";
import { joinRoomByCodeAsGuest } from "../src/rooms/guest-admission";
import { createGuestSession } from "../src/identity/guest-sessions";
import { runMigrations } from "../src/migrations";
import { startRace } from "../src/races/lifecycle";
import { changeRoomBots } from "../src/rooms/bots";
import { closeRoom, configureRoom, startNextRound } from "../src/rooms/host-actions";
import { readGuestRoom } from "../src/rooms/guest-room";
import { leaveGuestRoom } from "../src/rooms/membership";
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

async function hostFixture() {
  const f = await fixture();
  await pool.query("update lobbies set host_member_id=$2 where id=$1", [f.lobbyId, f.guestMemberId]);
  await pool.query("update guest_sessions set created_at=now()-interval '1 hour',last_seen_at=now()-interval '1 hour',expires_at=now()+interval '23 hours'");
  const guestProof = { id: f.guestId, secretDigest: "a".repeat(64) };
  return { ...f, guestProof, start: { ...f.input, accountId: null, guestProof } };
}
const session = async () => (await pool.query("select * from guest_sessions")).rows;

const parsedCode = parseRoomCode("ABCDEF");
if (!parsedCode.ok) throw new Error("Invalid fixture code");
const code = parsedCode.code;

describe("guest host actions and retirement", () => {
  it("reads only the guest's own live room without activity or cross-room disclosure", async () => {
    const f = await hostFixture(); const before = await session();
    expect(await readGuestRoom(db, f.guestProof, code)).toMatchObject({ memberId: f.guestMemberId });
    expect(await readGuestRoom(db, f.guestProof, "UVWXYZ")).toBeUndefined();
    expect(await readGuestRoom(db, { ...f.guestProof, secretDigest: "b".repeat(64) }, code)).toBeUndefined();
    expect(await session()).toEqual(before);
    await leaveGuestRoom(db, f.guestProof, () => new Set());
    expect(await readGuestRoom(db, f.guestProof, code)).toBeUndefined();
  });

  it("uses the existing 10–200 settings contract and renews only accepted changes", async () => {
    const f = await hostFixture(); const actor = { accountId: null, guestProof: f.guestProof };
    const settings = { textLanguage: "en" as const, wordCount: 10, timeLimitMs: null, errorMode: "mandatory" as const };
    expect(await configureRoom(db, { ...actor, code, revision: 0, settings })).toMatchObject({ ok: true, revision: 1, guestSession: { id: f.guestId } });
    const before = await session();
    expect(await configureRoom(db, { ...actor, code, revision: 0, settings })).toEqual({ ok: false, error: "STALE_REVISION" });
    expect(await session()).toEqual(before);
    expect(await configureRoom(db, { ...actor, code, revision: 1, settings: { ...settings, wordCount: 200 } })).toMatchObject({ ok: true, revision: 2 });
    expect((await pool.query("select word_count from lobby_settings")).rows[0].word_count).toBe(200);
    expect(await configureRoom(db, { accountId: f.accountId, code, revision: 2, settings })).toEqual({ ok: false, error: "NOT_HOST" });
  });

  it("retires guests on closure while preserving account rows", async () => {
    const f = await hostFixture(); const accounts = (await pool.query("select * from accounts")).rows;
    expect(await closeRoom(db, { accountId: null, guestProof: f.guestProof, code })).toEqual({ ok: true, lobbyId: f.lobbyId });
    expect((await pool.query("select * from guest_sessions")).rows).toEqual([]);
    expect((await pool.query("select * from lobby_members where guest_session_id is not null")).rows).toEqual([]);
    expect((await pool.query("select * from accounts")).rows).toEqual(accounts);
    expect((await pool.query("select phase,host_member_id from lobbies")).rows[0]).toEqual({ phase: "closed", host_member_id: null });
  });

  it("makes next round idempotent without counting duplicate submissions as activity", async () => {
    const f = await hostFixture(); const race = await startRace(db, f.start);
    if (!race.ok) throw new Error(race.error);
    await pool.query("update races set state='finished',started_at=countdown_at,ended_at=countdown_at");
    await pool.query("update lobbies set phase='results'");
    const input = { accountId: null, guestProof: f.guestProof, raceId: race.race.raceId };
    expect(await startNextRound(db, input)).toMatchObject({ ok: true, alreadyDone: false });
    const before = await session();
    expect(await startNextRound(db, input)).toEqual({ ok: true, lobbyId: f.lobbyId, alreadyDone: true });
    expect(await session()).toEqual(before);
  });

  it("authorizes inherited guest bot controls without changing bot rules or renewing refusals", async () => {
    const f = await hostFixture(); const actor = { accountId: null, guestProof: f.guestProof, code };
    const before = await session();
    expect(await changeRoomBots(db, { ...actor, guestProof: { ...f.guestProof, secretDigest: "b".repeat(64) }, revision: 0,
      change: { kind: "add", level: "beginner" } })).toEqual({ ok: false, error: "NOT_IN_A_ROOM" });
    expect(await session()).toEqual(before);
    expect(await changeRoomBots(db, { ...actor, revision: 0, change: { kind: "add", level: "beginner" } }))
      .toMatchObject({ ok: true, revision: 1, guestSession: { id: f.guestId } });
    const accepted = await session();
    expect(await changeRoomBots(db, { ...actor, revision: 0, change: { kind: "add", level: "beginner" } }))
      .toEqual({ ok: false, error: "STALE_REVISION" });
    expect(await session()).toEqual(accepted);
    const bot = (await pool.query("select id from lobby_bots")).rows[0];
    expect(await changeRoomBots(db, { ...actor, revision: 1, change: { kind: "remove", botId: bot.id } }))
      .toMatchObject({ ok: true, revision: 2 });
    expect((await pool.query("select * from lobby_bots")).rows).toEqual([]);
  });

  it("refuses forged host proofs without writes or activity", async () => {
    const f = await hostFixture(); const before = await session();
    const guestProof = { ...f.guestProof, secretDigest: "b".repeat(64) };
    expect(await closeRoom(db, { accountId: null, guestProof, code })).toEqual({ ok: false, error: "NOT_IN_A_ROOM" });
    expect(await startNextRound(db, { accountId: null, guestProof, raceId: randomUUID() })).toEqual({ ok: false, error: "NOT_IN_A_ROOM" });
    expect(await leaveGuestRoom(db, guestProof, () => new Set())).toBeUndefined();
    expect(await session()).toEqual(before);
  });

  it("explicit guest host leave succeeds to the account and deletes identity exactly once", async () => {
    const f = await hostFixture();
    const member = (await pool.query("select id from lobby_members where account_id=$1", [f.accountId])).rows[0].id;
    const before = (await pool.query("select * from accounts")).rows;
    const results = await Promise.all([1, 2].map(() => leaveGuestRoom(db, f.guestProof, () => new Set([member]))));
    expect(results.filter((r) => r !== undefined)).toEqual([{ lobbyId: f.lobbyId, memberId: f.guestMemberId, closed: false }]);
    expect(await session()).toEqual([]);
    expect((await pool.query("select host_member_id from lobbies")).rows[0].host_member_id).toBe(member);
    expect((await pool.query("select * from accounts")).rows).toEqual(before);
  });
});


describe("account transition admission fence", () => {
  it("refuses an active guest without altering membership or identity", async () => {
    const f = await fixture(); const before = await session();
    expect(await prepareGuestAccountSignIn(db, { id: f.guestId, secretDigest: "a".repeat(64) })).toBe(false);
    expect(await session()).toEqual(before);
    expect((await pool.query("select id from lobby_members where id=$1", [f.guestMemberId])).rowCount).toBe(1);
  });
  it.each([0, 1, 2, 3])("serializes unused-identity retirement against admission (%s)", async (attempt) => {
    const f = await fixture();
    await pool.query("delete from lobby_members where id=$1", [f.guestMemberId]);
    const proof = { id: f.guestId, secretDigest: "a".repeat(64) };
    const admission = () => joinRoomByCodeAsGuest(db, { proof, code, role: "participant", nickname: "Visitor" });
    const transition = () => prepareGuestAccountSignIn(db, proof);
    const [allowed, joined] = attempt % 2 === 0
      ? await Promise.all([transition(), admission()])
      : await Promise.all([admission(), transition()]).then(([joined, allowed]) => [allowed, joined] as const);
    if (allowed) {
      expect(joined).toEqual({ ok: false, error: "INVALID_GUEST_SESSION" });
      expect(await session()).toEqual([]);
    } else {
      expect(joined.ok).toBe(true);
      expect((await session()).length).toBe(1);
    }
    expect(allowed && joined.ok).toBe(false);
  });
});
