import { parseRoomCode, ROOM_CODE_ALPHABET, type RoomVisibility } from "@incision/domain";
import pg from "pg";
import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { createDatabase, type Database } from "../src/client";
import { createGuestSession } from "../src/identity/guest-sessions";
import { runMigrations } from "../src/migrations";
import { startRace } from "../src/races/lifecycle";
import { createRoomWithHost } from "../src/rooms/create-room";
import { joinRoomByCodeAsGuest } from "../src/rooms/guest-admission";
import { createRoomInvitation, joinRoomByInvitation } from "../src/rooms/invitations";
import { joinRoomByCode, readRoomSnapshot } from "../src/rooms/membership";
import { expelRoomMember } from "../src/rooms/moderation";
import { changeRoomVisibility } from "../src/rooms/visibility";
import { createTemporaryDatabase, type TemporaryDatabase } from "./test-database";

let database: TemporaryDatabase;
let pool: pg.Pool;
let db: Database;
const parsed = parseRoomCode("ABCDEF");
if (!parsed.ok) throw new Error("Invalid test code");
const code = parsed.code;
const address = "b".repeat(64);

beforeAll(async () => {
  database = await createTemporaryDatabase();
  await runMigrations({ connectionString: database.url });
  pool = new pg.Pool({ connectionString: database.url, max: 8 });
  db = createDatabase(pool);
});
afterEach(async () => {
  await pool.query("update lobbies set host_member_id = null");
  await pool.query("delete from lobbies");
  await pool.query("delete from races");
  await pool.query("delete from guest_sessions");
  await pool.query("delete from accounts");
});
afterAll(async () => { await pool?.end(); await database?.drop(); });

async function waitForLockWaiter(): Promise<void> {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    const { rows } = await pool.query<{ waiting: number }>(
      "select count(*)::int as waiting from pg_stat_activity where datname = current_database() and wait_event_type = 'Lock'");
    if ((rows[0]?.waiting ?? 0) > 0) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error("The code join never waited on the lobby lock");
}

async function account(name: string): Promise<string> {
  const result = await pool.query<{ id: string }>("insert into accounts (display_name) values ($1) returning id", [name]);
  return result.rows[0]!.id;
}
async function fixture(visibility: RoomVisibility = "code") {
  const host = await account("Host");
  let draw = 0;
  const result = await createRoomWithHost(db, { accountId: host, role: "participant", capacity: 30, visibility,
    randomIndex: () => ROOM_CODE_ALPHABET.indexOf("ABCDEF"[draw++]!),
  });
  if (!result.ok) throw new Error(result.error);
  return { host, lobbyId: result.room.id };
}
async function state(lobbyId: string) {
  return (await pool.query<{ visibility: RoomVisibility; revision: number; capacity: number }>(
    "select visibility, revision, capacity from lobbies where id=$1", [lobbyId])).rows[0]!;
}
async function guest() {
  const proof = { id: randomUUID(), secretDigest: randomUUID().replaceAll("-", "").padEnd(64, "0") };
  await createGuestSession(db, proof);
  return proof;
}
async function invite(host: string, tokenDigest: string) {
  const created = await createRoomInvitation(db, { accountId: host, code, tokenDigest });
  if (!created.ok) throw new Error(created.error);
}
const byInvitation = (accountId: string, tokenDigest: string) => joinRoomByInvitation(db, {
  tokenDigest, actor: { kind: "account", accountId }, role: "participant", addressDigestForRoom: () => address,
});

describe("room visibility at creation (SALLE-03, D-19)", () => {
  it.each(["public", "code", "private"] as const)("stores %s and shows it in the members' snapshot", async (visibility) => {
    const { lobbyId } = await fixture(visibility);
    expect((await state(lobbyId)).visibility).toBe(visibility);
    expect((await readRoomSnapshot(db, lobbyId))?.visibility).toBe(visibility);
  });
});

describe("access by visibility (SALLE-03)", () => {
  it("admits a code join to public and code rooms, and answers a private room like an unknown code", async () => {
    for (const visibility of ["public", "code", "private"] as const) {
      const { lobbyId } = await fixture(visibility);
      const joined = await joinRoomByCode(db, { accountId: await account(`Code ${visibility}`), code, role: "participant" });
      expect(joined).toMatchObject(visibility === "private" ? { ok: false, error: "ROOM_NOT_FOUND" } : { ok: true });
      const guestJoined = await joinRoomByCodeAsGuest(db, { proof: await guest(), nickname: `Guest${visibility}`, code, role: "spectator" });
      expect(guestJoined).toMatchObject(visibility === "private" ? { ok: false, error: "ROOM_NOT_FOUND" } : { ok: true });
      await pool.query("update lobbies set host_member_id = null where id=$1", [lobbyId]);
      await pool.query("delete from lobbies where id=$1", [lobbyId]);
    }
  });

  it("admits a valid invitation whatever the visibility", async () => {
    for (const visibility of ["public", "code", "private"] as const) {
      const { host, lobbyId } = await fixture(visibility);
      await invite(host, "a".repeat(64));
      expect(await byInvitation(await account(`Invited ${visibility}`), "a".repeat(64))).toMatchObject({ ok: true });
      await pool.query("update lobbies set host_member_id = null where id=$1", [lobbyId]);
      await pool.query("delete from lobbies where id=$1", [lobbyId]);
    }
  });
});

describe("host visibility changes under the room lock (CONF-11)", () => {
  it("saves each visibility with a new revision and refuses a stale page", async () => {
    const { host, lobbyId } = await fixture();
    const settings = await pool.query("select * from lobby_settings where lobby_id=$1", [lobbyId]);
    for (const visibility of ["public", "private", "code"] as const) {
      const { revision, capacity } = await state(lobbyId);
      expect(await changeRoomVisibility(db, { accountId: host, code, revision, visibility }))
        .toEqual({ ok: true, lobbyId, revision: revision + 1 });
      expect(await changeRoomVisibility(db, { accountId: host, code, revision, visibility: "public" }))
        .toEqual({ ok: false, error: "STALE_REVISION" });
      expect(await state(lobbyId)).toEqual({ visibility, revision: revision + 1, capacity });
      expect((await readRoomSnapshot(db, lobbyId))?.visibility).toBe(visibility);
    }
    expect((await pool.query("select * from lobby_settings where lobby_id=$1", [lobbyId])).rows).toEqual(settings.rows);
  });

  it("refuses an unknown value, a member who is not the host and someone outside the room, without writing", async () => {
    const { host, lobbyId } = await fixture();
    const member = await account("Member");
    await joinRoomByCode(db, { accountId: member, code, role: "spectator" });
    const before = await state(lobbyId);
    const forged = "secret" as RoomVisibility;
    expect(await changeRoomVisibility(db, { accountId: host, code, revision: before.revision, visibility: forged }))
      .toEqual({ ok: false, error: "INVALID_VISIBILITY" });
    expect(await changeRoomVisibility(db, { accountId: member, code, revision: before.revision, visibility: "public" }))
      .toEqual({ ok: false, error: "NOT_HOST" });
    expect(await changeRoomVisibility(db, { accountId: await account("Outsider"), code, revision: before.revision, visibility: "public" }))
      .toEqual({ ok: false, error: "NOT_IN_A_ROOM" });
    expect(await state(lobbyId)).toEqual(before);
  });

  it("lets a guest successor change it and renews the guest session; a forged proof cannot", async () => {
    const { lobbyId } = await fixture("public");
    const proof = await guest();
    const admitted = await joinRoomByCodeAsGuest(db, { proof, nickname: "Sailor", code, role: "participant" });
    if (!admitted.ok) throw new Error(admitted.error);
    await pool.query("update lobbies set host_member_id=$2 where id=$1", [lobbyId, admitted.memberId]);
    const { revision } = await state(lobbyId);
    expect(await changeRoomVisibility(db, { accountId: null, guestProof: { ...proof, secretDigest: "f".repeat(64) }, code, revision, visibility: "private" }))
      .toEqual({ ok: false, error: "NOT_IN_A_ROOM" });
    const changed = await changeRoomVisibility(db, { accountId: null, guestProof: proof, code, revision, visibility: "private" });
    expect(changed).toMatchObject({ ok: true, revision: revision + 1, guestSession: { id: proof.id } });
    expect((await state(lobbyId)).visibility).toBe("private");
  });

  it.each(["countdown", "racing", "results"])("refuses a change in %s", async (phase) => {
    const { host, lobbyId } = await fixture();
    await joinRoomByCode(db, { accountId: await account("Second"), code, role: "participant" });
    const started = await startRace(db, { accountId: host, lobbyId, settingsRevision: 0,
      ownerId: "00000000-0000-4000-8000-00000000000a", text: "La mer est calme.", config: {}, rulesVersion: 1,
      create: () => ({ ok: true as const, race: true }),
    });
    expect(started.ok).toBe(true);
    await pool.query("update lobbies set phase=$2 where id=$1", [lobbyId, phase]);
    const before = await state(lobbyId);
    expect(await changeRoomVisibility(db, { accountId: host, code, revision: before.revision, visibility: "private" }))
      .toEqual({ ok: false, error: "ROOM_NOT_WAITING" });
    expect(await state(lobbyId)).toEqual(before);
  });

  it("keeps present members when the room turns private, and refuses the code alone afterwards", async () => {
    const { host, lobbyId } = await fixture();
    const present = await account("Present");
    const joined = await joinRoomByCode(db, { accountId: present, code, role: "participant" });
    if (!joined.ok) throw new Error(joined.error);
    const { revision } = await state(lobbyId);
    expect(await changeRoomVisibility(db, { accountId: host, code, revision, visibility: "private" })).toMatchObject({ ok: true });
    expect((await readRoomSnapshot(db, lobbyId))?.members.map((member) => member.memberId)).toContain(joined.memberId);
    // A present member returns through membership, never the code; the code alone admits nobody now.
    expect(await joinRoomByCode(db, { accountId: present, code, role: "participant" })).toEqual({ ok: false, error: "ROOM_NOT_FOUND" });
    expect(await joinRoomByCode(db, { accountId: await account("Late"), code, role: "participant" })).toEqual({ ok: false, error: "ROOM_NOT_FOUND" });
    await invite(host, "c".repeat(64));
    expect(await byInvitation(await account("Invited"), "c".repeat(64))).toMatchObject({ ok: true });
  });

  it("re-evaluates a code join that waited for the lock after the room turned private", async () => {
    for (let round = 0; round < 5; round += 1) {
      const { host, lobbyId } = await fixture("public");
      const newcomer = await account(`Racer ${round}`);
      const { revision } = await state(lobbyId);
      const [changed, joined] = await Promise.all([
        changeRoomVisibility(db, { accountId: host, code, revision, visibility: "private" }),
        joinRoomByCode(db, { accountId: newcomer, code, role: "participant" }),
      ]);
      const members = await pool.query<{ joined_at: Date }>(
        "select joined_at from lobby_members where lobby_id=$1 and account_id=$2", [lobbyId, newcomer]);
      // Exactly one wins the lock: a join first moves the revision (the host's page is stale and
      // the room stays public); a private switch first answers the join like an unknown code.
      if (joined.ok) {
        expect(changed).toEqual({ ok: false, error: "STALE_REVISION" });
        expect((await state(lobbyId)).visibility).toBe("public");
        expect(members.rows).toHaveLength(1);
      } else {
        expect(changed).toMatchObject({ ok: true });
        expect(joined).toEqual({ ok: false, error: "ROOM_NOT_FOUND" });
        expect(members.rows).toHaveLength(0);
      }
      await pool.query("update lobbies set host_member_id = null where id=$1", [lobbyId]);
      await pool.query("delete from lobbies where id=$1", [lobbyId]);
    }
  });

  it("refuses a code join deterministically while a private switch holds the lock", async () => {
    const { lobbyId } = await fixture("public");
    const holder = await pool.connect();
    try {
      await holder.query("begin");
      await holder.query("select id from lobbies where id=$1 for update", [lobbyId]);
      const waiter = await account("Waiting");
      const waiting = joinRoomByCode(db, { accountId: waiter, code, role: "participant" });
      // Prove the join is blocked on the row lock before the switch commits, so the
      // READ COMMITTED recheck is what refuses it (not a late read of the private row).
      await waitForLockWaiter();
      await holder.query("update lobbies set visibility='private', revision=revision+1 where id=$1", [lobbyId]);
      await holder.query("commit");
      expect(await waiting).toEqual({ ok: false, error: "ROOM_NOT_FOUND" });
    } finally { holder.release(); }
    expect((await readRoomSnapshot(db, lobbyId))?.members.map((member) => member.displayName)).toEqual(["Host"]);
  });

  it("keeps bans: a banned identity stays out of a room made public", async () => {
    const { host, lobbyId } = await fixture("code");
    const banned = await account("Banned");
    const joined = await joinRoomByCode(db, { accountId: banned, code, role: "participant" });
    if (!joined.ok) throw new Error(joined.error);
    expect(await expelRoomMember(db, { accountId: host, code, memberId: joined.memberId, revision: (await state(lobbyId)).revision }))
      .toMatchObject({ ok: true });
    expect(await changeRoomVisibility(db, { accountId: host, code, revision: (await state(lobbyId)).revision, visibility: "public" }))
      .toMatchObject({ ok: true });
    expect(await joinRoomByCode(db, { accountId: banned, code, role: "participant" })).toEqual({ ok: false, error: "ROOM_NOT_FOUND" });
  });
});
