import { GuestCommandGate } from "../../../apps/web/src/server/realtime/guest-command-gate";
import { SessionRegistry } from "../../../apps/web/src/server/realtime/session-registry";
import { leaveGuestRoom } from "../src/rooms/membership";
import { closeRoom } from "../src/rooms/host-actions";
import { runGuestMemberCommand } from "../src/identity/guest-member-command";
import { randomBytes, randomUUID } from "node:crypto";
import { parseRoomCode, type RoomCode } from "@incision/domain";
import pg from "pg";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { createDatabase, type Database } from "../src/client";
import { createGuestSession } from "../src/identity/guest-sessions";
import { runMigrations } from "../src/migrations";
import { joinRoomByCodeAsGuest } from "../src/rooms/guest-admission";
import { joinRoomByCode } from "../src/rooms/membership";
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
async function activity(id: string) {
  return (await pool.query("select last_seen_at,expires_at from guest_sessions where id=$1", [id])).rows;
}

describe("guest member command authorization and activity", () => {
  it("updates expiry only after a server-confirmed accepted action", async () => {
    const f = await fixture();
    await pool.query("update guest_sessions set created_at=now()-interval '1 hour',last_seen_at=now()-interval '1 hour',expires_at=now()+interval '23 hours' where id=$1", [f.proof.id]);
    const before = await activity(f.proof.id);
    const rejected = await runGuestMemberCommand(db, { ...f, run: () => ({ answer: "rejected", activity: false }) });
    expect(rejected).toMatchObject({ kind: "authorized", answer: "rejected" });
    expect(await activity(f.proof.id)).toEqual(before);
    expect(await runGuestMemberCommand(db, { ...f, run: () => ({ answer: "accepted", activity: true }) })).toMatchObject({ kind: "authorized", answer: "accepted" });
    const after = await activity(f.proof.id);
    expect(after[0].last_seen_at.getTime()).toBeGreaterThan(before[0].last_seen_at.getTime());
    expect(after[0].expires_at.getTime() - after[0].last_seen_at.getTime()).toBe(86_400_000);
  });

  it("refuses forged, expired, missing and mismatched memberships before the callback", async () => {
    const f = await fixture(); const run = vi.fn(() => ({ answer: true, activity: true }));
    expect(await runGuestMemberCommand(db, { ...f, proof: { ...f.proof, secretDigest: "0".repeat(64) }, run })).toEqual({ kind: "unauthorized" });
    expect(await runGuestMemberCommand(db, { ...f, memberId: randomUUID(), run })).toEqual({ kind: "unauthorized" });
    expect(await runGuestMemberCommand(db, { ...f, lobbyId: randomUUID(), run })).toEqual({ kind: "unauthorized" });
    await expire(f.proof.id);
    expect(await runGuestMemberCommand(db, { ...f, run })).toEqual({ kind: "unauthorized" });
    expect(run).not.toHaveBeenCalled();
  });

  it("cannot command an account member even when the guest and account UUIDs match", async () => {
    const f = await fixture(); await pool.query("insert into accounts(id,display_name) values($1,'Account')", [f.proof.id]);
    const account = await joinRoomByCode(db, { accountId: f.proof.id, code: code(), role: "participant" });
    if (!account.ok) throw new Error(account.error);
    const run = vi.fn(() => ({ answer: true, activity: true }));
    expect(await runGuestMemberCommand(db, { ...f, memberId: account.memberId, run })).toEqual({ kind: "unauthorized" });
    expect(run).not.toHaveBeenCalled();
  });

  it("rechecks departure after waiting for the room lock", async () => {
    const f = await fixture(); const blocker = await pool.connect(); const run = vi.fn(() => ({ answer: true, activity: true }));
    try {
      await blocker.query("begin"); await blocker.query("select id from lobbies where id=$1 for update", [f.lobbyId]);
      const pending = runGuestMemberCommand(db, { ...f, run }); await blocked();
      await blocker.query("delete from lobby_members where id=$1", [f.memberId]); await blocker.query("commit");
      expect(await pending).toEqual({ kind: "unauthorized" }); expect(run).not.toHaveBeenCalled();
    } finally { await blocker.query("rollback"); blocker.release(); }
  });

  it("samples expiry after the session lock, not before waiting on a renewal", async () => {
    const f = await fixture(); const blocker = await pool.connect(); const run = vi.fn(() => ({ answer: true, activity: true }));
    try {
      await blocker.query("begin"); await blocker.query("select id from guest_sessions where id=$1 for update", [f.proof.id]);
      const pending = runGuestMemberCommand(db, { ...f, run }); await blocked();
      await expire(f.proof.id, blocker); await blocker.query("commit");
      expect(await pending).toEqual({ kind: "unauthorized" }); expect(run).not.toHaveBeenCalled();
    } finally { await blocker.query("rollback"); blocker.release(); }
  });

  it("does not renew when the synchronous server action throws", async () => {
    const f = await fixture(); const before = await activity(f.proof.id);
    await expect(runGuestMemberCommand(db, { ...f, run: () => { throw new Error("synthetic engine fault"); } })).rejects.toThrow();
    expect(await activity(f.proof.id)).toEqual(before);
  });
});


describe("PERF-02 guest coordinator with real SQL", () => {
  it("amortizes 18000 batches from 30 guests into 60 SQL transactions", async () => {
    await room();
    const visitors = [];
    for (let n = 0; n < 30; n++) {
      const proof = await guest(); const joined = await join(proof, `Visitor ${n}`);
      if (!joined.ok) throw new Error(joined.error);
      visitors.push({ proof, lobbyId: joined.lobbyId, memberId: joined.memberId });
    }
    let now = Date.now(), calls = 0;
    const scheduled: (() => void)[] = [];
    const gate = new GuestCommandGate({ now: () => now, registry: new SessionRegistry(() => now),
      schedule: (callback) => { scheduled.push(callback); return () => {}; },
      store: (input) => { calls++; return runGuestMemberCommand(db, input); },
    });
    for (let tick = 0; tick < 600; tick++) {
      for (const visitor of visitors) expect(await gate.run({ ...visitor, alive: () => true,
        apply: () => ({ answer: "accepted", activity: true }) })).toBe("accepted");
      now += 100;
    }
    expect(calls).toBe(30);
    // Stop drains the exact same pending writes as the timer, without new engine input.
    await gate.stop(); expect(calls).toBe(60);
    expect(scheduled).toHaveLength(30);
    const rows = (await pool.query("select last_seen_at,expires_at from guest_sessions")).rows;
    expect(rows).toHaveLength(30);
    for (const row of rows) {
      expect(row.last_seen_at.getTime()).toBe(now - 100);
      expect(row.expires_at.getTime() - row.last_seen_at.getTime()).toBe(86_400_000);
    }
  });

  it.each(["departure", "closure"] as const)("fences batches before a concurrent %s commits", async (operation) => {
    const f = await fixture();
    await pool.query("update lobbies set host_member_id=$1 where id=$2", [f.memberId, f.lobbyId]);
    const gate = new GuestCommandGate({ now: Date.now, registry: new SessionRegistry(), store: (input) => runGuestMemberCommand(db, input) });
    expect(await gate.run({ ...f, alive: () => true, apply: () => ({ answer: true, activity: true }) })).toBe(true);
    const locker = await pool.connect();
    try {
      await locker.query("begin"); await locker.query("select id from lobbies where id=$1 for update", [f.lobbyId]);
      const mutation = operation === "departure" ? leaveGuestRoom(db, f.proof, () => new Set())
        : closeRoom(db, { accountId: null, guestProof: f.proof, code: code() });
      await blocked();
      const apply = vi.fn(() => ({ answer: true, activity: true }));
      const command = gate.run({ ...f, alive: () => true, apply });
      await Promise.resolve(); expect(apply).not.toHaveBeenCalled();
      await locker.query("commit"); await mutation;
      expect(await command).toEqual({ ok: false, error: "UNAUTHORIZED" });
      expect(apply).not.toHaveBeenCalled();
    } finally { await locker.query("rollback"); locker.release(); await gate.stop(); }
  });

  it("persists the actual past acceptance time rather than extending at flush time", async () => {
    const f = await fixture();
    await pool.query("update guest_sessions set created_at=now()-interval '1 hour',last_seen_at=now()-interval '1 hour',expires_at=now()+interval '23 hours' where id=$1", [f.proof.id]);
    const acceptedAt = Date.now() - 5_000;
    expect(await runGuestMemberCommand(db, { ...f, run: () => ({ answer: true, activity: true, activityAt: acceptedAt }) })).toMatchObject({ kind: "authorized" });
    const [saved] = await activity(f.proof.id);
    expect(saved.last_seen_at.getTime()).toBe(acceptedAt);
    expect(saved.expires_at.getTime()).toBe(acceptedAt + 86_400_000);
  });
});
