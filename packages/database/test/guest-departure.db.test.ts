import { endDisconnectedGuestPresence } from "../src/rooms/guest-departure";
import { randomBytes, randomUUID } from "node:crypto";
import { parseRoomCode, type RoomCode } from "@incision/domain";
import pg from "pg";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { createDatabase, type Database } from "../src/client";
import { createGuestSession } from "../src/identity/guest-sessions";
import { runMigrations } from "../src/migrations";
import { joinRoomByCodeAsGuest } from "../src/rooms/guest-admission";
import { findActiveHumanMembership, joinRoomByCode } from "../src/rooms/membership";
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

async function fixture() {
  const lobbyId = await room(); const proof = await guest(); const result = await join(proof);
  if (!result.ok) throw new Error(result.error);
  return { lobbyId, memberId: result.memberId, proof };
}
async function phase(lobbyId: string, next: "racing" | "results") {
  const race = (await pool.query<{ id: string }>(`insert into races(lobby_id,round_no,rules_version,text_snapshot,config_snapshot,countdown_at,owner_id,lease_expires_at)
    values($1,1,1,'x','{}',now(),gen_random_uuid(),now()) returning id`, [lobbyId])).rows[0]!.id;
  await pool.query("update lobbies set current_race_id=$2,phase=$3 where id=$1", [lobbyId, race, next]);
}

describe("non-host guest departure transaction", () => {
  it("removes only the live guest name, releases place/name and creates a new member on readmission", async () => {
    const f = await fixture();
    const accountId = randomUUID(); await pool.query("insert into accounts(id,display_name) values($1,'Account')", [accountId]);
    await joinRoomByCode(db, { accountId, code: code(), role: "participant" });
    await pool.query("insert into lobby_bots(lobby_id,level) values($1,'beginner')", [f.lobbyId]);
    const accounts = (await pool.query("select * from accounts")).rows;
    const accountMembers = (await pool.query("select * from lobby_members where account_id is not null")).rows;
    const bots = (await pool.query("select * from lobby_bots")).rows;
    expect(await endDisconnectedGuestPresence(db, { ...f, claim: () => true })).toEqual({ kind: "departed" });
    expect(await endDisconnectedGuestPresence(db, { ...f, claim: () => true })).toEqual({ kind: "gone" });
    expect(await findActiveHumanMembership(db, { kind: "guest", guestSessionId: f.proof.id })).toBeUndefined();
    expect((await pool.query("select * from lobby_members where id=$1", [f.memberId])).rows).toEqual([]);
    expect((await pool.query("select * from accounts")).rows).toEqual(accounts);
    expect((await pool.query("select * from lobby_members where account_id is not null")).rows).toEqual(accountMembers);
    expect((await pool.query("select * from lobby_bots")).rows).toEqual(bots);
    const again = await join(f.proof); expect(again).toMatchObject({ ok: true, alreadyMember: false });
    if (again.ok) expect(again.memberId).not.toBe(f.memberId);
  });

  it("refuses account members and current hosts without invoking the presence claim", async () => {
    const f = await fixture(); const claim = vi.fn(() => true);
    await pool.query("update lobbies set host_member_id=$2 where id=$1", [f.lobbyId, f.memberId]);
    expect(await endDisconnectedGuestPresence(db, { ...f, claim })).toEqual({ kind: "host" });
    const accountId = randomUUID(); await pool.query("insert into accounts(id,display_name) values($1,'Account')", [accountId]);
    const account = await joinRoomByCode(db, { accountId, code: code(), role: "participant" });
    if (!account.ok) throw new Error(account.error);
    expect(await endDisconnectedGuestPresence(db, { lobbyId: f.lobbyId, memberId: account.memberId, claim })).toEqual({ kind: "gone" });
    expect(claim).not.toHaveBeenCalled();
  });

  it("retains a live in-course membership but expires it with SQL clock priority", async () => {
    const f = await fixture(); await phase(f.lobbyId, "racing"); const claim = vi.fn(() => true);
    expect(await endDisconnectedGuestPresence(db, { ...f, claim })).toMatchObject({ kind: "retained", phase: "racing", expired: false });
    expect(claim).not.toHaveBeenCalled(); await expire(f.proof.id);
    expect(await endDisconnectedGuestPresence(db, { ...f, claim })).toEqual({ kind: "departed" });
    expect(claim).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ expired: true }));
  });

  it("ends results presence without modifying the stored race", async () => {
    const f = await fixture(); await phase(f.lobbyId, "results");
    const before = (await pool.query("select * from races")).rows;
    expect(await endDisconnectedGuestPresence(db, { ...f, claim: () => true })).toEqual({ kind: "departed" });
    expect((await pool.query("select * from races")).rows).toEqual(before);
  });

  it("samples presence after waiting for the room lock, so a reconnect cancels deletion", async () => {
    const f = await fixture(); const blocker = await pool.connect(); let online = false;
    try {
      await blocker.query("begin"); await blocker.query("select id from lobbies where id=$1 for update", [f.lobbyId]);
      const pending = endDisconnectedGuestPresence(db, { ...f, claim: () => !online });
      await blocked(); online = true; await blocker.query("commit");
      expect(await pending).toMatchObject({ kind: "retained" });
      expect(await findActiveHumanMembership(db, { kind: "guest", guestSessionId: f.proof.id })).toMatchObject({ memberId: f.memberId });
    } finally { await blocker.query("rollback"); blocker.release(); }
  });

  it("rechecks a host promotion under the room lock and ignores stale timers", async () => {
    const f = await fixture(); const blocker = await pool.connect(); const claim = vi.fn(() => true);
    try {
      await blocker.query("begin"); await blocker.query("update lobbies set host_member_id=$2 where id=$1", [f.lobbyId, f.memberId]);
      const pending = endDisconnectedGuestPresence(db, { ...f, claim }); await blocked(); await blocker.query("commit");
      expect(await pending).toEqual({ kind: "host" }); expect(claim).not.toHaveBeenCalled();
    } finally { await blocker.query("rollback"); blocker.release(); }
  });

  it("rolls back a failed presence decision and never bumps revision", async () => {
    const f = await fixture(); const before = (await pool.query("select * from lobbies")).rows;
    await expect(endDisconnectedGuestPresence(db, { ...f, claim: () => { throw new Error("synthetic fault"); } })).rejects.toThrow();
    expect((await pool.query("select * from lobbies")).rows).toEqual(before);
    expect(await findActiveHumanMembership(db, { kind: "guest", guestSessionId: f.proof.id })).toMatchObject({ memberId: f.memberId });
  });

  it("serializes duplicate expirations into one departure and one revision increment", async () => {
    const f = await fixture(); const before = (await pool.query("select revision from lobbies where id=$1", [f.lobbyId])).rows[0].revision;
    const outcomes = await Promise.all([1, 2, 3].map(() => endDisconnectedGuestPresence(db, { ...f, claim: () => true })));
    expect(outcomes.filter((r) => r.kind === "departed")).toHaveLength(1);
    expect((await pool.query("select revision from lobbies where id=$1", [f.lobbyId])).rows[0].revision).toBe(before + 1);
  });
});
