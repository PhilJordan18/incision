import { endDisconnectedHostPresence } from "../src/rooms/host-departure";
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
  await pool.query("update lobbies set host_member_id=$2 where id=$1", [lobbyId, result.memberId]);
  return { lobbyId, memberId: result.memberId, proof };
}
async function phase(lobbyId: string, next: "racing" | "results") {
  const race = (await pool.query<{ id: string }>(`insert into races(lobby_id,round_no,rules_version,text_snapshot,config_snapshot,countdown_at,owner_id,lease_expires_at)
    values($1,1,1,'x','{}',now(),gen_random_uuid(),now()) returning id`, [lobbyId])).rows[0]!.id;
  await pool.query("update lobbies set current_race_id=$2,phase=$3 where id=$1", [lobbyId, race, next]);
}

const end = (f: { lobbyId: string; memberId: string }, online: ReadonlySet<string> = new Set()) =>
  endDisconnectedHostPresence(db, { ...f, claim: () => true, online: () => online });

async function successor() {
  const proof = await guest(); const result = await join(proof, "Successor");
  if (!result.ok) throw new Error(result.error);
  return { ...result, proof };
}

describe("host network departure transaction", () => {
  it("transfers to a connected guest spectator and erases the outgoing guest name", async () => {
    const f = await fixture(); const next = await successor();
    await pool.query("update lobby_members set role='spectator' where id=$1", [next.memberId]);
    const before = (await pool.query("select * from guest_sessions")).rows;
    expect(await end(f, new Set([next.memberId]))).toEqual({ kind: "departed", closed: false, accountId: null });
    expect((await pool.query("select host_member_id,phase,revision from lobbies")).rows[0]).toMatchObject({ host_member_id: next.memberId, phase: "waiting" });
    expect((await pool.query("select * from lobby_members where id=$1", [f.memberId])).rows).toEqual([]);
    expect((await pool.query("select * from guest_sessions")).rows).toEqual(before.filter((row) => row.id !== f.proof.id));
    expect(await end(f)).toEqual({ kind: "gone" });
  });

  it("excludes expired guest successors despite a stale online socket", async () => {
    const f = await fixture(); const next = await successor(); await expire(next.proof.id);
    expect(await end(f, new Set([next.memberId]))).toEqual({ kind: "departed", closed: true, accountId: null });
    expect((await pool.query("select phase,host_member_id from lobbies")).rows[0]).toEqual({ phase: "closed", host_member_id: null });
  });

  it("preserves account rows, settings and bots while retiring an account host", async () => {
    const f = await fixture(); const accountId = randomUUID();
    await pool.query("insert into accounts(id,display_name) values($1,'Account')", [accountId]);
    const account = await joinRoomByCode(db, { accountId, code: code(), role: "spectator" });
    if (!account.ok) throw new Error(account.error);
    await pool.query("update lobbies set host_member_id=$2 where id=$1", [f.lobbyId, account.memberId]);
    await pool.query("insert into lobby_settings(lobby_id,text_language,word_count,error_mode) values($1,'fr',200,'mandatory')", [f.lobbyId]);
    await pool.query("insert into lobby_bots(lobby_id,level) values($1,'beginner')", [f.lobbyId]);
    const rows = async () => Promise.all(["accounts", "lobby_settings", "lobby_bots"].map(async (table) => (await pool.query(`select * from ${table}`)).rows));
    const before = await rows();
    expect(await end({ ...f, memberId: account.memberId }, new Set([f.memberId]))).toEqual({ kind: "departed", closed: false, accountId });
    expect(await rows()).toEqual(before);
    expect((await pool.query("select left_at from lobby_members where id=$1", [account.memberId])).rows[0].left_at).not.toBeNull();
  });

  it("samples the reconnect claim only after the room lock", async () => {
    const f = await fixture(); const blocker = await pool.connect(); let online = false;
    const claim = vi.fn(() => !online);
    try {
      await blocker.query("begin"); await blocker.query("select id from lobbies where id=$1 for update", [f.lobbyId]);
      const pending = endDisconnectedHostPresence(db, { ...f, claim, online: () => new Set() });
      await blocked(); expect(claim).not.toHaveBeenCalled(); online = true; await blocker.query("commit");
      expect(await pending).toMatchObject({ kind: "retained" });
    } finally { await blocker.query("rollback"); blocker.release(); }
  });

  it("ignores a callback after a different member became host", async () => {
    const f = await fixture(); const next = await successor(); const claim = vi.fn(() => true);
    await pool.query("update lobbies set host_member_id=$2 where id=$1", [f.lobbyId, next.memberId]);
    expect(await endDisconnectedHostPresence(db, { ...f, claim, online: () => new Set() })).toEqual({ kind: "not-host" });
    expect(claim).not.toHaveBeenCalled();
  });

  it("rolls back the claimed departure if successor presence cannot be read", async () => {
    const f = await fixture(); await successor();
    const before = (await pool.query("select * from lobbies")).rows;
    await expect(endDisconnectedHostPresence(db, { ...f, claim: () => true,
      online: () => { throw new Error("presence failed"); },
    })).rejects.toThrow("presence failed");
    expect((await pool.query("select * from lobbies")).rows).toEqual(before);
    expect(await findActiveHumanMembership(db, { kind: "guest", guestSessionId: f.proof.id })).toMatchObject({ memberId: f.memberId });
  });

  it("serializes concurrent callbacks into a single revision and departure", async () => {
    const f = await fixture(); const next = await successor();
    const before = (await pool.query("select revision from lobbies")).rows[0].revision;
    const results = await Promise.all([end(f, new Set([next.memberId])), end(f, new Set([next.memberId]))]);
    expect(results.filter((r) => r.kind === "departed")).toHaveLength(1);
    expect((await pool.query("select revision from lobbies")).rows[0].revision).toBe(before + 1);
  });

  it("interrupts an active race atomically when no successor exists", async () => {
    const f = await fixture(); await phase(f.lobbyId, "racing");
    expect(await end(f)).toMatchObject({ kind: "departed", closed: true });
    expect((await pool.query("select state,interruption_reason,owner_epoch from races")).rows[0]).toMatchObject({ state: "interrupted", interruption_reason: "room_closed", owner_epoch: 2 });
  });

  it("preserves an already finalized race on closure", async () => {
    const f = await fixture(); await phase(f.lobbyId, "results");
    await pool.query("update races set state='finished',started_at=countdown_at,ended_at=countdown_at");
    const before = (await pool.query("select * from races")).rows;
    expect(await end(f)).toMatchObject({ kind: "departed", closed: true });
    expect((await pool.query("select * from races")).rows).toEqual(before);
  });

  it("reads guest expiry after acquiring its session lock", async () => {
    const f = await fixture(); await expire(f.proof.id); const claim = vi.fn(() => false);
    expect(await endDisconnectedHostPresence(db, { ...f, claim, online: () => new Set() })).toMatchObject({ kind: "retained", expired: true });
    expect(claim).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ expired: true }));
  });
});
