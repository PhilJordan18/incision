import { parseRoomCode, ROOM_CODE_ALPHABET } from "@incision/domain";
import pg from "pg";
import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { createDatabase, type Database } from "../src/client";
import { runMigrations } from "../src/migrations";
import { createGuestSession } from "../src/identity/guest-sessions";
import { createRoomWithHost } from "../src/rooms/create-room";
import { createRoomInvitation, joinRoomByInvitation, listRoomInvitations, revokeRoomInvitation } from "../src/rooms/invitations";
import { joinRoomByCode } from "../src/rooms/membership";
import { createTemporaryDatabase, type TemporaryDatabase } from "./test-database";

let database: TemporaryDatabase;
let pool: pg.Pool;
let db: Database;
const tokenDigest = "a".repeat(64);
const address = "b".repeat(64);
const unavailable = { ok: false, error: "INVITATION_UNAVAILABLE" };
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
  await pool.query("update lobbies set host_member_id = null");
  await pool.query("delete from lobbies");
  await pool.query("delete from races");
  await pool.query("delete from guest_sessions");
  await pool.query("delete from accounts");
});
afterAll(async () => { await pool?.end(); await database?.drop(); });

async function account(name: string) {
  const result = await pool.query<{ id: string }>("insert into accounts(display_name) values($1) returning id", [name]);
  return result.rows[0]!.id;
}
async function fixture(capacity = 8) {
  const host = await account("Host");
  let draw = 0;
  const created = await createRoomWithHost(db, { accountId: host, role: "participant", visibility: "private", capacity,
    randomIndex: () => ROOM_CODE_ALPHABET.indexOf("ABCDEF"[draw++]!) });
  if (!created.ok) throw new Error(created.error);
  const invitation = await createRoomInvitation(db, { accountId: host, code, tokenDigest });
  if (!invitation.ok) throw new Error(invitation.error);
  return { host, lobbyId: created.room.id, invitationId: invitation.invitationId };
}
function join(accountId: string, digest: string | undefined = address) {
  return joinRoomByInvitation(db, { tokenDigest, actor: { kind: "account", accountId }, role: "participant",
    addressDigestForRoom: () => digest });
}
async function binding() {
  return (await pool.query("select bound_member_id, bound_ip_digest, bound_at from lobby_invitations")).rows[0];
}

describe("room invitations", () => {
  it("discloses status only to the current host, never hashes, and does not accept invalid pages", async () => {
    const { host } = await fixture();
    const bob = await account("Bob");
    expect(await listRoomInvitations(db, { accountId: bob, code, page: 0 })).toEqual(unavailable);
    expect(await listRoomInvitations(db, { accountId: host, code, page: -1 })).toEqual(unavailable);
    await join(bob);
    const result = await listRoomInvitations(db, { accountId: host, code, page: 0 });
    expect(result).toMatchObject({ ok: true, hasMore: false, items: [{ displayName: "Bob" }] });
    if (!result.ok) throw new Error("Expected host listing");
    expect(Object.keys(result.items[0]!).sort()).toEqual(["boundAt", "createdAt", "displayName", "id", "revokedAt"]);
  });
  it("admits a live guest and keeps other guests on the same IP out", async () => {
    await fixture();
    const proof = { id: randomUUID(), secretDigest: "e".repeat(64) };
    await createGuestSession(db, proof);
    const input = { tokenDigest, actor: { kind: "guest" as const, proof, nickname: "Sailor" },
      role: "participant" as const, addressDigestForRoom: () => address };
    expect(await joinRoomByInvitation(db, input)).toMatchObject({ ok: true, alreadyMember: false });
    expect(await joinRoomByInvitation(db, input)).toMatchObject({ ok: true, alreadyMember: true });
    const other = { id: randomUUID(), secretDigest: "f".repeat(64) };
    await createGuestSession(db, other);
    expect(await joinRoomByInvitation(db, { ...input, actor: { kind: "guest", proof: other, nickname: "Other" } })).toEqual(unavailable);
  });

  it("does not bind an invitation for an invalid guest proof", async () => {
    await fixture();
    const proof = { id: randomUUID(), secretDigest: "e".repeat(64) };
    await createGuestSession(db, proof);
    const result = await joinRoomByInvitation(db, { tokenDigest,
      actor: { kind: "guest", proof: { ...proof, secretDigest: "f".repeat(64) }, nickname: "Sailor" },
      role: "participant", addressDigestForRoom: () => address });
    expect(result).toMatchObject({ ok: false });
    expect((await binding()).bound_member_id).toBeNull();
  });

  it("revokes a bound invitation without deleting the existing presence", async () => {
    const { host, invitationId } = await fixture();
    const bob = await account("Bob");
    expect((await join(bob)).ok).toBe(true);
    expect((await revokeRoomInvitation(db, { accountId: host, code, invitationId })).ok).toBe(true);
    expect(await join(bob)).toEqual(unavailable);
    expect((await pool.query("select count(*)::int as count from lobby_members where account_id=$1 and left_at is null", [bob])).rows[0].count).toBe(1);
  });

  it("admits a private room only through its token, then reuses the same presence", async () => {
    const { lobbyId } = await fixture();
    const bob = await account("Bob");
    expect(await joinRoomByCode(db, { accountId: bob, code, role: "participant" })).toEqual({ ok: false, error: "ROOM_NOT_FOUND" });
    const first = await join(bob);
    expect(first).toMatchObject({ ok: true, lobbyId, alreadyMember: false });
    expect(await join(bob)).toMatchObject({ ok: true, alreadyMember: true });
    expect(await binding()).toMatchObject({ bound_ip_digest: address });
  });

  it("refuses another identity on the same IP and the holder on another IP", async () => {
    await fixture();
    const bob = await account("Bob");
    expect((await join(bob)).ok).toBe(true);
    expect(await join(await account("Eve"))).toEqual(unavailable);
    expect(await join(bob, "c".repeat(64))).toEqual(unavailable);
  });

  it("binds exactly one of two concurrent identities", async () => {
    await fixture();
    const results = await Promise.all([join(await account("Bob")), join(await account("Eve"))]);
    expect(results.filter((result) => result.ok)).toHaveLength(1);
    expect(results.filter((result) => !result.ok)).toEqual([unavailable]);
    expect((await pool.query("select count(*)::int as count from lobby_members where left_at is null")).rows[0].count).toBe(2);
  });

  it("does not consume a token when capacity refuses admission", async () => {
    const { lobbyId } = await fixture(2);
    const filler = await account("Filler");
    await pool.query("insert into lobby_members(lobby_id,account_id,role,display_name,display_name_canonical) values($1,$2,'participant','Filler','filler')", [lobbyId, filler]);
    const result = await join(await account("Bob"));
    expect(result.ok).toBe(false);
    expect(await binding()).toEqual({ bound_member_id: null, bound_ip_digest: null, bound_at: null });
  });

  it("fails closed without a valid IP digest and leaves the token unused", async () => {
    await fixture();
    expect(await join(await account("Bob"), "invalid")).toEqual(unavailable);
    expect((await binding()).bound_member_id).toBeNull();
  });

  it("allows only the host to create and revoke, and rejects a revoked token", async () => {
    const { host, invitationId } = await fixture();
    const bob = await account("Bob");
    expect(await createRoomInvitation(db, { accountId: bob, code, tokenDigest: "d".repeat(64) })).toEqual(unavailable);
    expect(await revokeRoomInvitation(db, { accountId: bob, code, invitationId })).toEqual(unavailable);
    expect(await revokeRoomInvitation(db, { accountId: host, code, invitationId })).toMatchObject({ ok: true, alreadyRevoked: false });
    expect(await join(bob)).toEqual(unavailable);
    expect(await revokeRoomInvitation(db, { accountId: host, code, invitationId })).toMatchObject({ ok: true, alreadyRevoked: true });
  });

  it("rejects a closed room without binding its unused token", async () => {
    const { lobbyId } = await fixture();
    await pool.query("update lobbies set phase='closed', closed_at=statement_timestamp() where id=$1", [lobbyId]);
    expect(await join(await account("Bob"))).toEqual(unavailable);
    expect((await binding()).bound_member_id).toBeNull();
  });
});
