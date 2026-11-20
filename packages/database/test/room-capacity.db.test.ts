import { parseRoomCode, ROOM_CODE_ALPHABET } from "@incision/domain";
import pg from "pg";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { createDatabase, type Database } from "../src/client";
import { runMigrations } from "../src/migrations";
import { startRace } from "../src/races/lifecycle";
import { changeRoomCapacity } from "../src/rooms/capacity";
import { changeRoomBots } from "../src/rooms/bots";
import { createRoomWithHost } from "../src/rooms/create-room";
import { joinRoomByCode } from "../src/rooms/membership";
import { createTemporaryDatabase, type TemporaryDatabase } from "./test-database";

let database: TemporaryDatabase;
let pool: pg.Pool;
let db: Database;
const parsed = parseRoomCode("ABCDEF");
if (!parsed.ok) throw new Error("Invalid test code");
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
  await pool.query("delete from accounts");
});
afterAll(async () => { await pool?.end(); await database?.drop(); });

async function account(name: string): Promise<string> {
  const result = await pool.query<{ id: string }>("insert into accounts (display_name) values ($1) returning id", [name]);
  return result.rows[0]!.id;
}
async function fixture() {
  const host = await account("Host");
  let draw = 0;
  const result = await createRoomWithHost(db, { accountId: host, role: "participant", capacity: 30, visibility: "code",
    randomIndex: () => ROOM_CODE_ALPHABET.indexOf("ABCDEF"[draw++]!),
  });
  if (!result.ok) throw new Error(result.error);
  return { host, lobbyId: result.room.id };
}
async function state(lobbyId: string) {
  return (await pool.query<{ capacity: number; revision: number }>("select capacity, revision from lobbies where id=$1", [lobbyId])).rows[0]!;
}

describe("host capacity changes under the room lock", () => {
  it("saves bounds without changing text settings and refuses stale requests", async () => {
    const { host, lobbyId } = await fixture();
    const before = await pool.query("select * from lobby_settings where lobby_id=$1", [lobbyId]);
    for (const capacity of [2, 30]) {
      const { revision } = await state(lobbyId);
      expect(await changeRoomCapacity(db, { accountId: host, code, revision, capacity })).toMatchObject({ ok: true, revision: revision + 1 });
      expect(await changeRoomCapacity(db, { accountId: host, code, revision, capacity })).toEqual({ ok: false, error: "STALE_REVISION" });
      expect((await state(lobbyId)).capacity).toBe(capacity);
    }
    expect((await pool.query("select * from lobby_settings where lobby_id=$1", [lobbyId])).rows).toEqual(before.rows);
  });
  it("rejects invalid values and unauthorized actors without writing", async () => {
    const { host, lobbyId } = await fixture();
    const spectator = await account("Spectator");
    await joinRoomByCode(db, { accountId: spectator, code, role: "spectator" });
    const before = await state(lobbyId);
    expect(await changeRoomCapacity(db, { accountId: spectator, code, revision: before.revision, capacity: 2 })).toEqual({ ok: false, error: "NOT_HOST" });
    for (const capacity of [1, 31, 2.5, NaN, Infinity]) {
      expect(await changeRoomCapacity(db, { accountId: host, code, revision: before.revision, capacity })).toEqual({ ok: false, error: "INVALID_CAPACITY" });
    }
    expect(await state(lobbyId)).toEqual(before);
  });
  it("counts bots but not spectators when reducing capacity", async () => {
    const { host, lobbyId } = await fixture();
    await pool.query("insert into lobby_bots (lobby_id, level) values ($1, 'intermediate'), ($1, 'intermediate')", [lobbyId]);
    await joinRoomByCode(db, { accountId: await account("Spectator"), code, role: "spectator" });
    const { revision } = await state(lobbyId);
    expect(await changeRoomCapacity(db, { accountId: host, code, revision, capacity: 2 })).toEqual({ ok: false, error: "CAPACITY_BELOW_OCCUPANCY" });
    expect(await changeRoomCapacity(db, { accountId: host, code, revision, capacity: 3 })).toMatchObject({ ok: true });
  });
  it("never reduces below a concurrently admitted participant", async () => {
    const { host, lobbyId } = await fixture();
    await joinRoomByCode(db, { accountId: await account("Second"), code, role: "participant" });
    const newcomer = await account("Third");
    const { revision } = await state(lobbyId);
    const [changed, joined] = await Promise.all([
      changeRoomCapacity(db, { accountId: host, code, revision, capacity: 2 }),
      joinRoomByCode(db, { accountId: newcomer, code, role: "participant" }),
    ]);
    expect(changed.ok && joined.ok).toBe(false);
    const count = await pool.query<{ count: number }>("select count(*)::int as count from lobby_members where lobby_id=$1 and role='participant' and left_at is null", [lobbyId]);
    expect(count.rows[0]!.count).toBeLessThanOrEqual((await state(lobbyId)).capacity);
  });
  it("serializes a bot addition against a capacity reduction", async () => {
    const { host, lobbyId } = await fixture();
    await joinRoomByCode(db, { accountId: await account("Second"), code, role: "participant" });
    const { revision } = await state(lobbyId);
    const [changed, added] = await Promise.all([
      changeRoomCapacity(db, { accountId: host, code, revision, capacity: 2 }),
      changeRoomBots(db, { accountId: host, code, revision, change: { kind: "add", level: "intermediate" } }),
    ]);
    expect(Number(changed.ok) + Number(added.ok)).toBe(1);
    const bots = await pool.query<{ count: number }>("select count(*)::int as count from lobby_bots where lobby_id=$1", [lobbyId]);
    expect(2 + bots.rows[0]!.count).toBeLessThanOrEqual((await state(lobbyId)).capacity);
    expect(await joinRoomByCode(db, { accountId: await account("Viewer"), code, role: "spectator" })).toMatchObject({ ok: true });
  });
  it.each(["countdown", "racing", "results"])("rejects a change in %s", async (phase) => {
    const { host, lobbyId } = await fixture();
    await joinRoomByCode(db, { accountId: await account("Second"), code, role: "participant" });
    const started = await startRace(db, { accountId: host, lobbyId, settingsRevision: 0,
      ownerId: "00000000-0000-4000-8000-00000000000a", text: "La mer est calme.", config: {}, rulesVersion: 1,
      create: () => ({ ok: true as const, race: true }),
    });
    expect(started.ok).toBe(true);
    await pool.query("update lobbies set phase=$2 where id=$1", [lobbyId, phase]);
    const before = await state(lobbyId);
    expect(await changeRoomCapacity(db, { accountId: host, code, revision: before.revision, capacity: 2 })).toEqual({ ok: false, error: "ROOM_NOT_WAITING" });
    expect(await state(lobbyId)).toEqual(before);
  });
});
