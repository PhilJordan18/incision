import { parseRoomCode } from "@incision/domain";
import pg from "pg";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { createDatabase, type Database } from "../src/client";
import { runMigrations } from "../src/migrations";
import { closeRoom, configureRoom, startNextRound } from "../src/rooms/host-actions";
import { createRoomWithHost } from "../src/rooms/create-room";
import { findActiveMembership, joinRoomByCode, leaveCurrentRoom, readRoomSnapshot } from "../src/rooms/membership";
import { createTemporaryDatabase, type TemporaryDatabase } from "./test-database";

let database: TemporaryDatabase;
let pool: pg.Pool;
let db: Database;
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
  await pool.query("delete from accounts");
});
afterAll(async () => { await pool.end(); await database.drop(); });

async function account(name: string): Promise<string> {
  const result = await pool.query<{ id: string }>("insert into accounts (display_name) values ($1) returning id", [name]);
  return result.rows[0]!.id;
}
async function fixture() {
  const host = await account("Host");
  const created = await createRoomWithHost(db, { accountId: host, role: "participant", visibility: "code", capacity: 8, randomIndex: () => 0 });
  if (!created.ok) throw new Error(created.error);
  const parsed = parseRoomCode(created.room.code);
  if (!parsed.ok) throw new Error("Invalid fixture code");
  const roomCode = parsed.code;
  async function join(name: string, role: "participant" | "spectator" = "participant") {
    const accountId = await account(name);
    const result = await joinRoomByCode(db, { accountId, code: roomCode, role });
    if (!result.ok) throw new Error(result.error);
    return { accountId, memberId: result.memberId };
  }
  return { host, lobbyId: created.room.id, roomCode, join };
}

async function blocked(): Promise<void> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const result = await pool.query<{ count: string }>("select count(*) as count from pg_stat_activity where datname = current_database() and wait_event_type = 'Lock'");
    if (Number(result.rows[0]?.count) > 0) return;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error("Departure did not wait for the room lock");
}

describe("voluntary host succession (SALLE-08 / D-03)", () => {
  it("selects the oldest connected human including spectators, preserving SQL microseconds", async () => {
    const { host, lobbyId, join } = await fixture();
    const participant = await join("Runner");
    const spectator = await join("Spectator", "spectator");
    // Same JavaScript millisecond, deliberately opposite to insertion order.
    await pool.query("update lobby_members set joined_at = '2026-01-01 00:00:00.000002+00' where id = $1", [participant.memberId]);
    await pool.query("update lobby_members set joined_at = '2026-01-01 00:00:00.000001+00' where id = $1", [spectator.memberId]);
    const before = await readRoomSnapshot(db, lobbyId);
    expect(await leaveCurrentRoom(db, host, () => new Set([participant.memberId, spectator.memberId]))).toEqual({ lobbyId, closed: false });
    const after = await readRoomSnapshot(db, lobbyId);
    expect(after).toMatchObject({ members: expect.arrayContaining([expect.objectContaining({ memberId: spectator.memberId, isHost: true })]), phase: "waiting", revision: before!.revision + 1 });
    expect(after?.members).toHaveLength(2);
    expect(await findActiveMembership(db, host)).toBeUndefined();
    expect(await findActiveMembership(db, spectator.accountId)).toMatchObject({ isHost: true });
  });

  it("breaks exact timestamp ties by domain member ID", async () => {
    const { host, lobbyId, join } = await fixture();
    const a = await join("A");
    const b = await join("B");
    await pool.query("update lobby_members set joined_at = '2026-01-01 00:00:00+00' where id = any($1::uuid[])", [[a.memberId, b.memberId]]);
    await leaveCurrentRoom(db, host, () => new Set([b.memberId, a.memberId]));
    expect((await readRoomSnapshot(db, lobbyId))?.members.find((member) => member.isHost)?.memberId).toBe([a.memberId, b.memberId].sort()[0]);
  });

  it("ignores offline and departed members even when a stale socket remains", async () => {
    const { host, lobbyId, join } = await fixture();
    await join("Offline");
    const departed = await join("Departed");
    const connected = await join("Connected");
    await leaveCurrentRoom(db, departed.accountId, () => new Set());
    await leaveCurrentRoom(db, host, () => new Set([departed.memberId, connected.memberId]));
    expect((await readRoomSnapshot(db, lobbyId))?.members.find((member) => member.isHost)?.memberId).toBe(connected.memberId);
  });

  it("samples presence only after acquiring the room lock", async () => {
    const { host, lobbyId, join } = await fixture();
    const successor = await join("Successor");
    let online = new Set<string>();
    const presence = vi.fn(() => online);
    const blocker = await pool.connect();
    let pending: Promise<unknown> | undefined;
    try {
      await blocker.query("begin");
      await blocker.query("select id from lobbies where id = $1 for update", [lobbyId]);
      pending = leaveCurrentRoom(db, host, presence);
      await blocked();
      expect(presence).not.toHaveBeenCalled();
      online = new Set([successor.memberId]);
      await blocker.query("commit");
      expect(await pending).toEqual({ lobbyId, closed: false });
      expect(presence).toHaveBeenCalledExactlyOnceWith(lobbyId);
      expect((await readRoomSnapshot(db, lobbyId))?.members.find((member) => member.isHost)?.memberId).toBe(successor.memberId);
    } finally {
      await blocker.query("rollback");
      blocker.release();
      await pending;
    }
  });

  it("rolls back if presence is unavailable instead of closing the room", async () => {
    const { host, lobbyId, join } = await fixture();
    await join("Successor");
    const before = await readRoomSnapshot(db, lobbyId);
    await expect(leaveCurrentRoom(db, host, () => { throw new Error("presence unavailable"); })).rejects.toThrow("presence unavailable");
    expect(await readRoomSnapshot(db, lobbyId)).toEqual(before);
    expect(await findActiveMembership(db, host)).toMatchObject({ isHost: true });
  });

  it("transfers once for two departing tabs and survives concurrent successor departure", async () => {
    const { host, lobbyId, join } = await fixture();
    const first = await join("First");
    const last = await join("Last");
    const online = () => new Set([first.memberId, last.memberId]);
    const before = await readRoomSnapshot(db, lobbyId);
    const results = await Promise.all([leaveCurrentRoom(db, host, online), leaveCurrentRoom(db, host, online), leaveCurrentRoom(db, first.accountId, online)]);
    expect(results.filter((result) => result !== undefined)).toEqual([{ lobbyId, closed: false }, { lobbyId, closed: false }]);
    expect(await readRoomSnapshot(db, lobbyId)).toMatchObject({ members: [expect.objectContaining({ memberId: last.memberId, isHost: true })], phase: "waiting", revision: before!.revision + 2 });
    expect(await leaveCurrentRoom(db, last.accountId, online)).toEqual({ lobbyId, closed: true });
  });

  it("grants settings and closure only to the successor, not the departed host or another member", async () => {
    const { host, lobbyId, roomCode, join } = await fixture();
    const successor = await join("Successor", "spectator");
    const other = await join("Other");
    await leaveCurrentRoom(db, host, () => new Set([successor.memberId, other.memberId]));
    const settings = { code: roomCode, revision: 0, settings: { textLanguage: "en" as const, wordCount: 50, timeLimitMs: 60_000, errorMode: "mandatory" as const } };
    expect(await configureRoom(db, { ...settings, accountId: host })).toEqual({ ok: false, error: "NOT_IN_A_ROOM" });
    expect(await configureRoom(db, { ...settings, accountId: other.accountId })).toEqual({ ok: false, error: "NOT_HOST" });
    expect(await configureRoom(db, { ...settings, accountId: successor.accountId })).toMatchObject({ ok: true, lobbyId, revision: 1 });
    expect(await closeRoom(db, { accountId: host, code: roomCode })).toEqual({ ok: false, error: "NOT_IN_A_ROOM" });
    expect(await closeRoom(db, { accountId: other.accountId, code: roomCode })).toEqual({ ok: false, error: "NOT_HOST" });
    expect(await closeRoom(db, { accountId: successor.accountId, code: roomCode })).toEqual({ ok: true, lobbyId });
  });

  it.each(["countdown", "racing", "results"])("keeps the current race and phase %s when a successor exists", async (phase) => {
    const { host, lobbyId, join } = await fixture();
    const successor = await join("Successor");
    const race = await pool.query<{ id: string }>("insert into races (lobby_id, round_no, rules_version, text_snapshot, config_snapshot, countdown_at, owner_id, lease_expires_at) values ($1, 1, 1, 'x', '{}', statement_timestamp(), gen_random_uuid(), statement_timestamp()) returning id", [lobbyId]);
    const raceId = race.rows[0]!.id;
    await pool.query("update lobbies set phase = $2, current_race_id = $3 where id = $1", [lobbyId, phase, raceId]);
    const before = await pool.query("select * from races where id = $1", [raceId]);
    expect(await leaveCurrentRoom(db, host, () => new Set([successor.memberId]))).toEqual({ lobbyId, closed: false });
    expect((await pool.query("select * from races where id = $1", [raceId])).rows).toEqual(before.rows);
    expect(await readRoomSnapshot(db, lobbyId)).toMatchObject({ phase, members: [expect.objectContaining({ memberId: successor.memberId, isHost: true })], race: { raceId } });
    if (phase === "results") {
      expect(await startNextRound(db, { accountId: host, raceId })).toEqual({ ok: false, error: "NOT_IN_A_ROOM" });
      expect(await startNextRound(db, { accountId: successor.accountId, raceId })).toEqual({ ok: true, lobbyId, alreadyDone: false });
    }
  });
});
