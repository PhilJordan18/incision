import { randomBytes, randomUUID } from "node:crypto";
import pg from "pg";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { createDatabase, type Database } from "../src/client";
import { createGuestSession, readGuestSession, touchGuestSession, purgeUnusedGuestSessions } from "../src/identity/guest-sessions";
import { runMigrations } from "../src/migrations";
import { createTemporaryDatabase, type TemporaryDatabase } from "./test-database";

let database: TemporaryDatabase;
let pool: pg.Pool;
let db: Database;
const proof = () => ({ id: randomUUID(), secretDigest: randomBytes(32).toString("hex") });
beforeAll(async () => {
  database = await createTemporaryDatabase();
  await runMigrations({ connectionString: database.url });
  pool = new pg.Pool({ connectionString: database.url, max: 10 });
  db = createDatabase(pool);
});
afterEach(async () => {
  await pool.query("update lobbies set host_member_id=null");
  await pool.query("delete from lobbies");
  await pool.query("delete from guest_sessions");
  await pool.query("delete from accounts");
});
afterAll(async () => { await pool?.end(); await database?.drop(); });

async function expire(id: string) {
  await pool.query(`update guest_sessions set created_at=now()-interval '2 days',
    last_seen_at=now()-interval '25 hours', expires_at=now()-interval '1 hour' where id=$1`, [id]);
}
async function room(code: string) {
  return (await pool.query<{ id: string }>("insert into lobbies(code,capacity) values($1,30) returning id", [code])).rows[0]!.id;
}
function member(lobbyId: string, guestId: string, nickname = "Éva") {
  return pool.query("insert into lobby_members(lobby_id,guest_session_id,role,display_name,display_name_canonical) values($1,$2,'spectator',$3,$4) returning id",
    [lobbyId, guestId, nickname, nickname.normalize("NFKC").toLowerCase()]);
}

describe("guest session storage", () => {
  it("creates only proof digests; reads do not touch the 24-hour deadline", async () => {
    const p = proof();
    const created = await createGuestSession(db, p);
    expect(await readGuestSession(db, p)).toEqual({ kind: "valid", session: created });
    const before = (await pool.query("select * from guest_sessions")).rows;
    await readGuestSession(db, p);
    expect((await pool.query("select * from guest_sessions")).rows).toEqual(before);
    expect((await pool.query("select extract(epoch from (expires_at-last_seen_at))::int as seconds from guest_sessions")).rows[0]?.seconds).toBe(86400);
    expect(Object.keys(before[0] ?? {}).sort()).toEqual(["created_at", "expires_at", "id", "last_seen_at", "secret_digest"]);
    expect(await readGuestSession(db, { ...p, secretDigest: "0".repeat(64) })).toEqual({ kind: "invalid" });
  });

  it("serializes concurrent touches without creating new identities or shortening a deadline", async () => {
    const p = proof();
    const initial = await createGuestSession(db, p);
    const results = await Promise.all(Array.from({ length: 8 }, () => touchGuestSession(db, p)));
    for (const result of results) {
      expect(result.kind).toBe("valid");
      if (result.kind === "valid") {
        expect(result.session.id).toBe(p.id);
        expect(result.session.expiresAt.getTime()).toBeGreaterThanOrEqual(initial.expiresAt.getTime());
      }
    }
    expect((await pool.query("select count(*)::int as n from guest_sessions")).rows[0]?.n).toBe(1);
    const current = await readGuestSession(db, p);
    expect(current.kind).toBe("valid");
    if (current.kind === "valid") for (const result of results) {
      if (result.kind === "valid") expect(current.session.expiresAt.getTime()).toBeGreaterThanOrEqual(result.session.expiresAt.getTime());
    }
  });

  it("refuses expired/deleted proofs and a touch delayed past expiry by a row lock", async () => {
    const p = proof();
    await createGuestSession(db, p);
    const holder = await pool.connect();
    try {
      await holder.query("begin");
      await holder.query("select id from guest_sessions where id=$1 for update", [p.id]);
      const pending = touchGuestSession(db, p);
      // Force the touch to overlap the held row, without relying on promise scheduling.
      for (let attempt = 0; ; attempt += 1) {
        const blocked = await pool.query("select count(*)::int as n from pg_stat_activity where datname=current_database() and wait_event_type='Lock'");
        if (blocked.rows[0]?.n > 0) break;
        if (attempt > 100) throw new Error("Touch did not block");
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
      await holder.query(`update guest_sessions set created_at=now()-interval '2 days', last_seen_at=now()-interval '25 hours', expires_at=now()-interval '1 hour' where id=$1`, [p.id]);
      await holder.query("commit");
      expect(await pending).toEqual({ kind: "expired" });
    } finally { await holder.query("rollback"); holder.release(); }
    expect(await readGuestSession(db, p)).toEqual({ kind: "expired" });
    expect(await touchGuestSession(db, p)).toEqual({ kind: "expired" });
    expect(await purgeUnusedGuestSessions(db)).toBe(1);
    expect(await touchGuestSession(db, p)).toEqual({ kind: "invalid" });
  });

  it("keeps referenced identities, even departed ones, and purges only expired unreferenced rows", async () => {
    const active = proof(), departed = proof(), unused = proof(), fresh = proof();
    for (const p of [active, departed, unused, fresh]) await createGuestSession(db, p);
    const lobby = await room("ABCDEF");
    await member(lobby, active.id);
    await member(lobby, departed.id, "Other");
    await pool.query("update lobby_members set left_at=now() where guest_session_id=$1", [departed.id]);
    for (const p of [active, departed, unused]) await expire(p.id);
    expect(await purgeUnusedGuestSessions(db)).toBe(1);
    expect((await pool.query("select count(*)::int as n from guest_sessions")).rows[0]?.n).toBe(3);
    await expect(pool.query("delete from guest_sessions where id=$1", [active.id])).rejects.toMatchObject({ code: "23503" });
  });
});

describe("preparatory guest membership constraints", () => {
  it("requires exactly one subject and preserves account constraints", async () => {
    const lobby = await room("ABCDEF");
    const p = proof(); await createGuestSession(db, p);
    const account = (await pool.query<{ id: string }>("insert into accounts(display_name) values('Account') returning id")).rows[0]!.id;
    const insert = (accountId: string | null, guestId: string | null) => pool.query(
      "insert into lobby_members(lobby_id,account_id,guest_session_id,role,display_name,display_name_canonical) values($1,$2,$3,'participant','Name','name')", [lobby, accountId, guestId]);
    await expect(insert(null, null)).rejects.toMatchObject({ constraint: "lobby_members_one_subject" });
    await expect(insert(account, p.id)).rejects.toMatchObject({ constraint: "lobby_members_one_subject" });
    await insert(account, null);
    await expect(insert(account, null)).rejects.toMatchObject({ code: "23505" });
    await expect(member(lobby, p.id, "Name")).rejects.toMatchObject({ constraint: "lobby_members_active_display_name_unique" });
    await expect(member(lobby, p.id, "ab")).rejects.toMatchObject({ constraint: "lobby_members_guest_name_length" });
    await expect(member(lobby, p.id, "a".repeat(21))).rejects.toMatchObject({ constraint: "lobby_members_guest_name_length" });
  });

  it("allows only one active guest presence across rooms, including concurrent spectators", async () => {
    const p = proof(); await createGuestSession(db, p);
    const a = await room("ABCDEF"), b = await room("BCDEFG");
    const results = await Promise.allSettled([member(a, p.id), member(b, p.id)]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    const rejected = results.find((result) => result.status === "rejected");
    expect(rejected?.status === "rejected" && rejected.reason.constraint).toBe("lobby_members_active_guest_unique");
    await pool.query("update lobby_members set left_at=now() where guest_session_id=$1", [p.id]);
    await member(b, p.id);
    expect((await pool.query("select count(*)::int as n from lobby_members where guest_session_id=$1 and left_at is null", [p.id])).rows[0]?.n).toBe(1);
  });
});
