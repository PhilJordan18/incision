import { randomBytes, randomUUID } from "node:crypto";
import { parseRoomCode } from "@incision/domain";
import pg from "pg";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { createDatabase, type Database } from "../src/client";
import { runMigrations } from "../src/migrations";
import { createGuestSession, purgeUnusedGuestSessions } from "../src/identity/guest-sessions";
import { joinRoomByCodeAsGuest } from "../src/rooms/guest-admission";
import { joinRoomByCode } from "../src/rooms/membership";
import { expelRoomMember } from "../src/rooms/moderation";
import { createRoomInvitation, joinRoomByInvitation } from "../src/rooms/invitations";
import { startRace } from "../src/races/lifecycle";
import { maintainGuestRetention } from "../src/identity/guest-retention";
import { createTemporaryDatabase, type TemporaryDatabase } from "./test-database";

let database: TemporaryDatabase;
let pool: pg.Pool;
let db: Database;
const parsed = parseRoomCode("ABCDEF");
if (!parsed.ok) throw new Error("Invalid fixture code");
const code = parsed.code;
beforeAll(async () => {
  database = await createTemporaryDatabase();
  await runMigrations({ connectionString: database.url });
  pool = new pg.Pool({ connectionString: database.url, max: 8 });
  db = createDatabase(pool);
});
afterEach(async () => {
  await pool.query("update lobbies set host_member_id=null");
  await pool.query("delete from lobbies");
  await pool.query("delete from races");
  await pool.query("delete from guest_sessions");
  await pool.query("delete from accounts");
});
afterAll(async () => { await pool?.end(); await database?.drop(); });
async function account(name: string) {
  return (await pool.query<{ id: string }>("insert into accounts(display_name) values($1) returning id", [name])).rows[0]!.id;
}
async function fixture() {
  const host = await account("Host");
  const lobbyId = (await pool.query<{ id: string }>("insert into lobbies(code,capacity) values('ABCDEF',30) returning id")).rows[0]!.id;
  const joined = await joinRoomByCode(db, { accountId: host, code, role: "participant" });
  if (!joined.ok) throw new Error(joined.error);
  await pool.query("update lobbies set host_member_id=$2 where id=$1", [lobbyId, joined.memberId]);
  return { host, lobbyId, hostMemberId: joined.memberId };
}
async function revision(lobbyId: string) {
  return (await pool.query<{ revision: number }>("select revision from lobbies where id=$1", [lobbyId])).rows[0]!.revision;
}
async function target() {
  const accountId = await account("Target");
  const joined = await joinRoomByCode(db, { accountId, code, role: "spectator" });
  if (!joined.ok) throw new Error(joined.error);
  return { accountId, memberId: joined.memberId };
}

describe("atomic room moderation", () => {
  it.each(["countdown", "racing", "results"])("allows expulsion in %s without rewriting the race", async (phase) => {
    const { host, lobbyId } = await fixture(); const victim = await target();
    await pool.query("update lobby_members set role='participant' where id=$1", [victim.memberId]);
    const started = await startRace(db, { accountId: host, lobbyId, settingsRevision: 0,
      ownerId: randomUUID(), text: "La mer est calme.", config: {}, rulesVersion: 1,
      create: () => ({ ok: true as const, race: true }),
    });
    expect(started.ok).toBe(true);
    await pool.query("update lobbies set phase=$2 where id=$1", [lobbyId, phase]);
    const races = (await pool.query("select * from races")).rows;
    expect(await expelRoomMember(db, { accountId: host, code, memberId: victim.memberId, revision: await revision(lobbyId) })).toMatchObject({ ok: true });
    expect((await pool.query("select * from races")).rows).toEqual(races);
  });
  it("refuses a fresh invitation for the banned identity but admits a classmate at the same address", async () => {
    const { host, lobbyId } = await fixture(); const victim = await target();
    await expelRoomMember(db, { accountId: host, code, memberId: victim.memberId, revision: await revision(lobbyId) });
    const tokenDigest = "d".repeat(64);
    expect(await createRoomInvitation(db, { accountId: host, code, tokenDigest })).toMatchObject({ ok: true });
    const shared = { tokenDigest, role: "participant" as const, addressDigestForRoom: () => "e".repeat(64) };
    expect(await joinRoomByInvitation(db, { ...shared, actor: { kind: "account", accountId: victim.accountId } })).toMatchObject({ ok: false });
    expect(await joinRoomByInvitation(db, { ...shared, actor: { kind: "account", accountId: await account("Classmate") } })).toMatchObject({ ok: true });
  });
  it("authorizes a current guest host and rejects a target belonging to another room", async () => {
    const { host, lobbyId, hostMemberId } = await fixture();
    const proof = { id: randomUUID(), secretDigest: randomBytes(32).toString("hex") };
    await createGuestSession(db, proof);
    const joined = await joinRoomByCodeAsGuest(db, { proof, nickname: "Guest host", code, role: "spectator" });
    if (!joined.ok) throw new Error(joined.error);
    await pool.query("update lobbies set host_member_id=$2 where id=$1", [lobbyId, joined.memberId]);
    expect(await expelRoomMember(db, { accountId: host, code, memberId: joined.memberId, revision: await revision(lobbyId) })).toEqual({ ok: false, error: "NOT_HOST" });
    const otherRoom = (await pool.query<{ id: string }>("insert into lobbies(code,capacity) values('BCDEFG',30) returning id")).rows[0]!.id;
    const outsider = await account("Outsider");
    const outsideMember = (await pool.query<{ id: string }>("insert into lobby_members(lobby_id,account_id,role,display_name,display_name_canonical) values($1,$2,'participant','Outsider','outsider') returning id", [otherRoom, outsider])).rows[0]!.id;
    expect(await expelRoomMember(db, { accountId: null, guestProof: proof, code, memberId: outsideMember, revision: await revision(lobbyId) })).toEqual({ ok: false, error: "INVALID_TARGET" });
    expect(await expelRoomMember(db, { accountId: null, guestProof: proof, code, memberId: hostMemberId, revision: await revision(lobbyId) })).toMatchObject({ ok: true, guestSession: { id: proof.id } });
  });
  it("purges bans when the closed room reaches its retention deadline", async () => {
    const { host, lobbyId } = await fixture(); const victim = await target();
    await expelRoomMember(db, { accountId: host, code, memberId: victim.memberId, revision: await revision(lobbyId) });
    await pool.query("update lobbies set phase='closed',closed_at=now()-interval '24 hours',host_member_id=null where id=$1", [lobbyId]);
    expect((await maintainGuestRetention(db, () => new Set())).purgedRooms).toContain(lobbyId);
    expect((await pool.query("select * from lobby_bans")).rows).toEqual([]);
  });
  it("bans only the target identity, revokes its invitation and refuses reentry", async () => {
    const { host, lobbyId } = await fixture(); const victim = await target();
    await pool.query(`insert into lobby_invitations(lobby_id,token_digest,bound_member_id,bound_ip_digest,bound_at)
      values($1,$2,$3,$4,now())`, [lobbyId, "a".repeat(64), victim.memberId, "b".repeat(64)]);
    const input = { accountId: host, code, memberId: victim.memberId, revision: await revision(lobbyId) };
    expect(await expelRoomMember(db, input)).toMatchObject({ ok: true, subject: { kind: "account", accountId: victim.accountId } });
    expect(await expelRoomMember(db, input)).toEqual({ ok: false, error: "STALE_REVISION" });
    expect((await pool.query("select revoked_at from lobby_invitations")).rows[0].revoked_at).not.toBeNull();
    expect(await joinRoomByCode(db, { accountId: victim.accountId, code, role: "participant" })).toEqual({ ok: false, error: "ROOM_NOT_FOUND" });
    expect(await joinRoomByCode(db, { accountId: await account("Classmate"), code, role: "participant" })).toMatchObject({ ok: true });
    expect((await pool.query("select count(*)::int as n from lobby_bans")).rows[0].n).toBe(1);
  });
  it("rejects non-host, self and unknown targets without a ban", async () => {
    const { host, lobbyId, hostMemberId } = await fixture(); const victim = await target();
    const rev = await revision(lobbyId);
    expect(await expelRoomMember(db, { accountId: victim.accountId, code, memberId: hostMemberId, revision: rev })).toEqual({ ok: false, error: "NOT_HOST" });
    expect(await expelRoomMember(db, { accountId: host, code, memberId: hostMemberId, revision: rev })).toEqual({ ok: false, error: "CANNOT_EXPEL_SELF" });
    expect(await expelRoomMember(db, { accountId: host, code, memberId: randomUUID(), revision: rev })).toEqual({ ok: false, error: "INVALID_TARGET" });
    expect(await revision(lobbyId)).toBe(rev);
    expect((await pool.query("select * from lobby_bans")).rows).toEqual([]);
  });
  it("keeps only the expelled guest identity without renewing expiry, then purges it at expiry", async () => {
    const { host, lobbyId } = await fixture();
    const proof = { id: randomUUID(), secretDigest: randomBytes(32).toString("hex") };
    await createGuestSession(db, proof);
    const joined = await joinRoomByCodeAsGuest(db, { proof, nickname: "Guest", code, role: "participant" });
    if (!joined.ok) throw new Error(joined.error);
    const before = (await pool.query("select * from guest_sessions where id=$1", [proof.id])).rows;
    expect(await expelRoomMember(db, { accountId: host, code, memberId: joined.memberId, revision: await revision(lobbyId) })).toMatchObject({ ok: true });
    expect((await pool.query("select * from guest_sessions where id=$1", [proof.id])).rows).toEqual(before);
    expect((await pool.query("select * from lobby_members where guest_session_id=$1", [proof.id])).rows).toEqual([]);
    expect(await joinRoomByCodeAsGuest(db, { proof, nickname: "Renamed", code, role: "spectator" })).toEqual({ ok: false, error: "ROOM_NOT_FOUND" });
    expect(await purgeUnusedGuestSessions(db)).toBe(0);
    await pool.query(`update guest_sessions set created_at=now()-interval '2 days', last_seen_at=now()-interval '25 hours', expires_at=now()-interval '1 hour' where id=$1`, [proof.id]);
    expect(await purgeUnusedGuestSessions(db)).toBe(1);
    expect((await pool.query("select * from lobby_bans")).rows).toEqual([]);
  });
  it("serializes concurrent reentry and duplicate expulsions", async () => {
    const { host, lobbyId } = await fixture(); const victim = await target();
    const input = { accountId: host, code, memberId: victim.memberId, revision: await revision(lobbyId) };
    const results = await Promise.all([expelRoomMember(db, input), expelRoomMember(db, input),
      joinRoomByCode(db, { accountId: victim.accountId, code, role: "participant" })]);
    expect(results.slice(0, 2).filter((result) => result.ok)).toHaveLength(1);
    expect(await joinRoomByCode(db, { accountId: victim.accountId, code, role: "participant" })).toEqual({ ok: false, error: "ROOM_NOT_FOUND" });
    expect((await pool.query("select * from lobby_members where id=$1 and left_at is null", [victim.memberId])).rows).toEqual([]);
  });
});
