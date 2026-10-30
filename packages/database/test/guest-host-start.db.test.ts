import { randomUUID } from "node:crypto";
import pg from "pg";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { createDatabase, type Database } from "../src/client";
import { createGuestSession } from "../src/identity/guest-sessions";
import { runMigrations } from "../src/migrations";
import { startRace } from "../src/races/lifecycle";
import { readGuestRoomSettings } from "../src/rooms/guest-host";
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

describe("guest host start authorization", () => {
  it("reads settings without activity and renews only a committed start", async () => {
    const f = await hostFixture(); const before = await session();
    expect(await readGuestRoomSettings(db, f.guestProof)).toMatchObject({ lobbyId: f.lobbyId, isHost: true, settings: { wordCount: 200 } });
    expect(await session()).toEqual(before);
    const result = await startRace(db, f.start);
    expect(result).toMatchObject({ ok: true, guestSession: { id: f.guestId } });
    expect((await session())[0].last_seen_at.getTime()).toBeGreaterThan(before[0].last_seen_at.getTime());
    const after = await session();
    expect(await startRace(db, f.start)).toEqual({ ok: false, error: "ROOM_NOT_WAITING" });
    expect(await session()).toEqual(after);
  });

  it("refuses a forged proof, a departed member and the previous account host", async () => {
    const f = await hostFixture(); const before = await session();
    const forged = { ...f.guestProof, secretDigest: "b".repeat(64) };
    expect(await readGuestRoomSettings(db, forged)).toBeUndefined();
    expect(await startRace(db, { ...f.start, guestProof: forged })).toEqual({ ok: false, error: "NOT_IN_A_ROOM" });
    expect(await startRace(db, f.input)).toEqual({ ok: false, error: "NOT_HOST" });
    await pool.query("update lobby_members set left_at=now() where id=$1", [f.guestMemberId]);
    expect(await startRace(db, f.start)).toEqual({ ok: false, error: "NOT_IN_A_ROOM" });
    expect(await session()).toEqual(before);
    expect((await pool.query("select * from races")).rows).toEqual([]);
  });

  it("revalidates expiry after a settings read, without resurrecting the identity", async () => {
    const f = await hostFixture(); expect(await readGuestRoomSettings(db, f.guestProof)).toBeDefined();
    await pool.query("update guest_sessions set created_at=now()-interval '2 days',last_seen_at=now()-interval '25 hours',expires_at=now()-interval '1 hour'");
    const before = await session();
    expect(await startRace(db, f.start)).toEqual({ ok: false, error: "NOT_IN_A_ROOM" });
    expect(await readGuestRoomSettings(db, f.guestProof)).toBeUndefined(); expect(await session()).toEqual(before);
  });

  it("leaves activity unchanged on engine refusal, stale settings and rolled-back start", async () => {
    const f = await hostFixture(); const before = await session();
    expect(await startRace(db, { ...f.start, settingsRevision: 1 })).toEqual({ ok: false, error: "SETTINGS_CHANGED" });
    expect(await startRace(db, { ...f.start, create: () => ({ ok: false, reason: "NO_HUMAN_PARTICIPANT" }) })).toEqual({ ok: false, error: "NO_HUMAN_PARTICIPANT" });
    await expect(startRace(db, { ...f.start, create: () => { throw new Error("synthetic failure"); } })).rejects.toThrow();
    expect(await session()).toEqual(before); expect((await pool.query("select * from races")).rows).toEqual([]);
  });

  it("serializes competing tabs into one race and one accepted renewal", async () => {
    const f = await hostFixture();
    const replies = await Promise.all([startRace(db, f.start), startRace(db, f.start)]);
    expect(replies.filter((r) => r.ok)).toHaveLength(1);
    expect(replies).toContainEqual({ ok: false, error: "ROOM_NOT_WAITING" });
    expect((await pool.query("select * from races")).rows).toHaveLength(1);
  });
  it("rechecks a host transfer committed while the start waits for the room lock", async () => {
    const f = await hostFixture(); const before = await session(); const blocker = await pool.connect();
    try {
      await blocker.query("begin");
      await blocker.query("update lobbies set host_member_id=(select id from lobby_members where account_id=$2 and lobby_id=$1) where id=$1", [f.lobbyId, f.accountId]);
      const pending = startRace(db, f.start);
      let blocked = false;
      for (let n = 0; n < 100; n++) {
        const result = await pool.query("select count(*)::int as n from pg_stat_activity where datname=current_database() and wait_event_type='Lock'");
        if (result.rows[0].n > 0) { blocked = true; break; }
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
      expect(blocked).toBe(true); await blocker.query("commit");
      expect(await pending).toEqual({ ok: false, error: "NOT_HOST" });
      expect(await session()).toEqual(before);
    } finally { await blocker.query("rollback"); blocker.release(); }
  });

  it("does not freeze an expired guest participant into a newly started race", async () => {
    const f = await hostFixture(); const expired = randomUUID();
    await createGuestSession(db, { id: expired, secretDigest: "c".repeat(64) });
    await pool.query("insert into lobby_members(lobby_id,guest_session_id,role,display_name,display_name_canonical) values($1,$2,'participant','Expired','expired')", [f.lobbyId, expired]);
    await pool.query("update guest_sessions set created_at=now()-interval '2 days',last_seen_at=now()-interval '25 hours',expires_at=now()-interval '1 hour' where id=$1", [expired]);
    const started = await startRace(db, f.start);
    expect(started.ok).toBe(true);
    if (started.ok) expect(started.entrants.map((e) => e.displayName)).toEqual(["Account", "SecretNickname"]);
  });

});
