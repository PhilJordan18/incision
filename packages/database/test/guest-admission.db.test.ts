import { randomBytes, randomUUID } from "node:crypto";
import { parseRoomCode, type RoomCode } from "@incision/domain";
import pg from "pg";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { createDatabase, type Database } from "../src/client";
import { createGuestSession } from "../src/identity/guest-sessions";
import { runMigrations } from "../src/migrations";
import { joinRoomByCodeAsGuest } from "../src/rooms/guest-admission";
import { findActiveHumanMembership, joinRoomByCode, readRoomSnapshot } from "../src/rooms/membership";
import { createTemporaryDatabase, type TemporaryDatabase } from "./test-database";

let database: TemporaryDatabase;
let pool: pg.Pool;
let db: Database;
beforeAll(async () => {
  database = await createTemporaryDatabase();
  await runMigrations({ connectionString: database.url });
  pool = new pg.Pool({ connectionString: database.url, max: 10 });
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
function code(value = "ABCDEF"): RoomCode {
  const result = parseRoomCode(value);
  if (!result.ok) throw new Error("Invalid fixture code");
  return result.code;
}
async function guest() {
  const proof = { id: randomUUID(), secretDigest: randomBytes(32).toString("hex") };
  await createGuestSession(db, proof);
  return proof;
}
async function room(value = "ABCDEF", capacity = 30) {
  return (await pool.query<{ id: string }>("insert into lobbies(code,capacity) values($1,$2) returning id", [value, capacity])).rows[0]!.id;
}
async function expire(id: string, client: pg.Pool | pg.PoolClient = pool) {
  await client.query(`update guest_sessions set created_at=now()-interval '2 days',
    last_seen_at=now()-interval '25 hours', expires_at=now()-interval '1 hour' where id=$1`, [id]);
}
async function blocked() {
  for (let n = 0; n < 100; n++) {
    const result = await pool.query("select count(*)::int as n from pg_stat_activity where datname=current_database() and wait_event_type='Lock'");
    if (result.rows[0]?.n > 0) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error("Admission did not wait on the held lock");
}
const join = (proof: Awaited<ReturnType<typeof guest>>, nickname = "Éva", value = "ABCDEF") =>
  joinRoomByCodeAsGuest(db, { proof, nickname, code: code(value), role: "participant" });

describe("internal guest admission", () => {
  it("normalizes the nickname, projects the guest and keeps the same member across tabs without renewal", async () => {
    const lobbyId = await room(); const proof = await guest();
    const before = (await pool.query("select * from guest_sessions where id=$1", [proof.id])).rows;
    const first = await join(proof, "  Ｅ́va   Marin  ");
    expect(first).toMatchObject({ ok: true, alreadyMember: false, lobbyId });
    const member = (await pool.query("select * from lobby_members")).rows[0];
    const second = await join(proof, "Other");
    expect(second).toMatchObject({ ok: true, alreadyMember: true, memberId: member.id });
    expect((await pool.query("select * from lobby_members")).rows).toEqual([member]);
    expect((await pool.query("select * from guest_sessions where id=$1", [proof.id])).rows).toEqual(before);
    expect(await findActiveHumanMembership(db, { kind: "guest", guestSessionId: proof.id })).toMatchObject({ lobbyId, memberId: member.id });
    expect((await readRoomSnapshot(db, lobbyId))?.members).toEqual([
      { memberId: member.id, accountId: null, displayName: "Éva Marin", role: "participant", isHost: false },
    ]);
  });

  it.each(["ab", "a".repeat(21), "a\u200bb", "\u0301abc"])("refuses invalid nickname %j without inserting", async (nickname) => {
    await room(); const proof = await guest();
    expect(await join(proof, nickname)).toEqual({ ok: false, error: "INVALID_GUEST_NICKNAME" });
    expect((await pool.query("select count(*)::int as n from lobby_members")).rows[0]?.n).toBe(0);
  });

  it("refuses account/guest canonical collisions explicitly, preserving accents and account names", async () => {
    await room();
    const accountId = (await pool.query<{ id: string }>("insert into accounts(display_name) values('Éva') returning id")).rows[0]!.id;
    await joinRoomByCode(db, { accountId, code: code(), role: "participant" });
    const proof = await guest();
    expect(await join(proof, "Ｅ́ＶＡ")).toEqual({ ok: false, error: "NICKNAME_TAKEN" });
    expect(await join(proof, "Eva")).toMatchObject({ ok: true });
    expect(await join(await guest(), "eva")).toEqual({ ok: false, error: "NICKNAME_TAKEN" });
    expect((await pool.query("select display_name from accounts where id=$1", [accountId])).rows[0]?.display_name).toBe("Éva");
  });

  it("serializes simultaneous tabs for the same identity within and across rooms", async () => {
    await room(); await room("BCDEFG"); const proof = await guest();
    const results = await Promise.all(Array.from({ length: 6 }, (_, i) => join(proof, "Marin", i % 2 ? "BCDEFG" : "ABCDEF")));
    const successes = results.filter((r) => r.ok);
    expect(successes.filter((r) => !r.alreadyMember)).toHaveLength(1);
    expect(new Set(successes.map((r) => r.memberId)).size).toBe(1);
    expect(results.filter((r) => !r.ok)).toHaveLength(3);
    for (const r of results) if (!r.ok) expect(r.error).toBe("ALREADY_IN_ANOTHER_ROOM");
    expect((await pool.query("select count(*)::int as n from lobby_members where left_at is null")).rows[0]?.n).toBe(1);
  });

  it("serializes nickname collisions between different guests", async () => {
    await room(); const proofs = await Promise.all([guest(), guest()]);
    const results = await Promise.all(proofs.map((p) => join(p)));
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(results.find((r) => !r.ok)).toEqual({ ok: false, error: "NICKNAME_TAKEN" });
  });

  it("keeps account and guest namespaces separate even when their UUIDs coincide", async () => {
    await room(); await room("BCDEFG"); const proof = await guest();
    await pool.query("insert into accounts(id,display_name) values($1,'Account')", [proof.id]);
    expect(await joinRoomByCode(db, { accountId: proof.id, code: code(), role: "participant" })).toMatchObject({ ok: true });
    expect(await join(proof, "Guest", "BCDEFG")).toMatchObject({ ok: true });
    expect(await findActiveHumanMembership(db, { kind: "account", accountId: proof.id })).toMatchObject({ code: "ABCDEF" });
    expect(await findActiveHumanMembership(db, { kind: "guest", guestSessionId: proof.id })).toMatchObject({ code: "BCDEFG" });
  });

  it("serializes against an account competing for the final participant place", async () => {
    await room("ABCDEF", 2);
    expect(await join(await guest(), "First")).toMatchObject({ ok: true });
    const accountId = (await pool.query<{ id: string }>("insert into accounts(display_name) values('Account') returning id")).rows[0]!.id;
    const proof = await guest();
    const results = await Promise.all([join(proof, "Guest"), joinRoomByCode(db, { accountId, code: code(), role: "participant" })]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(results.find((r) => !r.ok)).toEqual({ ok: false, error: "ROOM_FULL" });
  });

  it("counts bots in participant capacity and enforces the independent spectator quota", async () => {
    const lobbyId = await room("ABCDEF", 2);
    await pool.query("insert into lobby_bots(lobby_id,level) values($1,'beginner')", [lobbyId]);
    const proofs = await Promise.all([guest(), guest()]);
    const results = await Promise.all(proofs.map((p, i) => join(p, `Marin${i}`)));
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(results.find((r) => !r.ok)).toEqual({ ok: false, error: "ROOM_FULL" });
    for (let i = 0; i < 20; i++) expect(await joinRoomByCodeAsGuest(db, {
      proof: await guest(), nickname: `Spectator${i}`, code: code(), role: "spectator",
    })).toMatchObject({ ok: true });
    expect(await joinRoomByCodeAsGuest(db, { proof: await guest(), nickname: "Extra", code: code(), role: "spectator" }))
      .toEqual({ ok: false, error: "SPECTATORS_FULL" });
  });

  it("refuses missing, forged and expired proofs even for an existing member", async () => {
    await room(); const proof = await guest();
    expect(await join({ ...proof, secretDigest: "0".repeat(64) })).toEqual({ ok: false, error: "INVALID_GUEST_SESSION" });
    expect(await join({ ...proof, id: randomUUID() })).toEqual({ ok: false, error: "INVALID_GUEST_SESSION" });
    expect(await join(proof)).toMatchObject({ ok: true });
    await expire(proof.id);
    expect(await join(proof)).toEqual({ ok: false, error: "INVALID_GUEST_SESSION" });
  });

  it("rechecks expiry after waiting for a session lock", async () => {
    await room(); const proof = await guest(); const holder = await pool.connect();
    try {
      await holder.query("begin");
      await holder.query("select id from guest_sessions where id=$1 for update", [proof.id]);
      const pending = join(proof);
      await blocked(); await expire(proof.id, holder); await holder.query("commit");
      expect(await pending).toEqual({ ok: false, error: "INVALID_GUEST_SESSION" });
      expect((await pool.query("select count(*)::int as n from lobby_members")).rows[0]?.n).toBe(0);
    } finally { await holder.query("rollback"); holder.release(); }
  });

  it("hides private rooms and admits new members only in waiting/results", async () => {
    const lobbyId = await room(); const proof = await guest();
    expect(await join(proof, "Marin", "ZZZZZZ")).toEqual({ ok: false, error: "ROOM_NOT_FOUND" });
    await pool.query("update lobbies set visibility='private' where id=$1", [lobbyId]);
    expect(await join(proof)).toEqual({ ok: false, error: "ROOM_NOT_FOUND" });
    await pool.query("update lobbies set visibility='code' where id=$1", [lobbyId]);
    const race = (await pool.query<{ id: string }>(`insert into races(lobby_id,round_no,rules_version,text_snapshot,config_snapshot,countdown_at,owner_id,lease_expires_at)
      values($1,1,1,'x','{}',now(),gen_random_uuid(),now()) returning id`, [lobbyId])).rows[0]!.id;
    await pool.query("update lobbies set current_race_id=$2 where id=$1", [lobbyId, race]);
    for (const phase of ["countdown", "racing", "closed"]) {
      await pool.query("update lobbies set phase=$2,closed_at=case when $2::text='closed' then now() else null end where id=$1", [lobbyId, phase]);
      expect(await join(proof)).toEqual({ ok: false, error: "ROOM_NOT_ADMITTING", phase });
    }
    await pool.query("update lobbies set phase='results',closed_at=null where id=$1", [lobbyId]);
    expect(await join(proof)).toMatchObject({ ok: true });
    await pool.query("update lobbies set phase='racing' where id=$1", [lobbyId]);
    expect(await join(proof)).toMatchObject({ ok: true, alreadyMember: true });
  });

  it("revalidates phase after waiting for the room lock", async () => {
    const lobbyId = await room(); const proof = await guest(); const holder = await pool.connect();
    try {
      await holder.query("begin"); await holder.query("select id from lobbies where id=$1 for update", [lobbyId]);
      const pending = join(proof);
      await blocked();
      await holder.query("update lobbies set phase='closed',closed_at=now() where id=$1", [lobbyId]);
      await holder.query("commit");
      expect(await pending).toEqual({ ok: false, error: "ROOM_NOT_ADMITTING", phase: "closed" });
    } finally { await holder.query("rollback"); holder.release(); }
  });
});
