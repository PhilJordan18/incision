import { parseRoomCode, ROOM_CODE_ALPHABET, type RoomCode, type RoomVisibility } from "@incision/domain";
import pg from "pg";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { createDatabase, type Database } from "../src/client";
import { runMigrations } from "../src/migrations";
import { startRace } from "../src/races/lifecycle";
import { createRoomWithHost } from "../src/rooms/create-room";
import { joinRoomByCode } from "../src/rooms/membership";
import { listPublicRooms } from "../src/rooms/public-rooms";
import { createTemporaryDatabase, type TemporaryDatabase } from "./test-database";

let database: TemporaryDatabase;
let pool: pg.Pool;
let db: Database;

beforeAll(async () => {
  database = await createTemporaryDatabase();
  await runMigrations({ connectionString: database.url });
  pool = new pg.Pool({ connectionString: database.url, max: 4 });
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
function roomCode(value: string): RoomCode {
  const parsed = parseRoomCode(value);
  if (!parsed.ok) throw new Error("Invalid test code");
  return parsed.code;
}
async function room(code: string, visibility: RoomVisibility, options: { host?: string; capacity?: number; textLanguage?: "fr" | "en" } = {}) {
  const host = await account(options.host ?? `Host ${code}`);
  let draw = 0;
  const result = await createRoomWithHost(db, { accountId: host, role: "participant", capacity: options.capacity ?? 30, visibility,
    textLanguage: options.textLanguage, randomIndex: () => ROOM_CODE_ALPHABET.indexOf(code[draw++]!) });
  if (!result.ok) throw new Error(result.error);
  return { host, lobbyId: result.room.id };
}

describe("listPublicRooms (JOIN-02)", () => {
  it("lists only open PUBLIC rooms, oldest first, with what a public room shows", async () => {
    const first = await room("AAAAAA", "public", { host: "Julie", textLanguage: "en" });
    await room("BBBBBB", "code");
    await room("CCCCCC", "private");
    const closed = await room("DDDDDD", "public");
    await pool.query("update lobbies set phase='closed', closed_at=now() where id=$1", [closed.lobbyId]);
    const second = await room("EEEEEE", "public", { capacity: 4 });
    await pool.query("update lobby_settings set complexity='hard', bonuses_enabled=true, word_count=80 where lobby_id=$1", [second.lobbyId]);

    const rooms = await listPublicRooms(db);
    expect(rooms.map((entry) => entry.code)).toEqual(["AAAAAA", "EEEEEE"]);
    expect(rooms[0]).toMatchObject({ id: first.lobbyId, hostName: "Julie", phase: "waiting", participants: 1, capacity: 30,
      textLanguage: "en", complexity: "medium", textKind: "coherent", wordCount: 50, arcade: false });
    expect(rooms[1]).toMatchObject({ capacity: 4, complexity: "hard", arcade: true, wordCount: 80 });
    // Nothing about accounts, members or invitations leaves the query.
    expect(Object.keys(rooms[0]!).sort()).toEqual(
      ["arcade", "capacity", "code", "complexity", "createdAt", "hostName", "id", "participants", "phase", "textKind", "textLanguage", "wordCount"]);
  });

  it("counts participants and bots, never spectators or members who left", async () => {
    const { lobbyId } = await room("AAAAAA", "public");
    const stayed = await joinRoomByCode(db, { accountId: await account("Stayed"), code: roomCode("AAAAAA"), role: "participant" });
    const left = await joinRoomByCode(db, { accountId: await account("Left"), code: roomCode("AAAAAA"), role: "participant" });
    await joinRoomByCode(db, { accountId: await account("Watcher"), code: roomCode("AAAAAA"), role: "spectator" });
    expect(stayed.ok && left.ok).toBe(true);
    if (left.ok) await pool.query("update lobby_members set left_at=now() where id=$1", [left.memberId]);
    await pool.query("insert into lobby_bots (lobby_id, level) values ($1, 'noob'), ($1, 'expert')", [lobbyId]);
    expect((await listPublicRooms(db))[0]?.participants).toBe(4);
  });

  it("keeps a room in a race in the list, with its phase", async () => {
    const { host, lobbyId } = await room("AAAAAA", "public");
    await joinRoomByCode(db, { accountId: await account("Second"), code: roomCode("AAAAAA"), role: "participant" });
    const started = await startRace(db, { accountId: host, lobbyId, settingsRevision: 0,
      ownerId: "00000000-0000-4000-8000-00000000000a", text: "La mer est calme.", config: {}, rulesVersion: 1,
      create: () => ({ ok: true as const, race: true }),
    });
    expect(started.ok).toBe(true);
    await pool.query("update lobbies set phase='racing' where id=$1", [lobbyId]);
    expect(await listPublicRooms(db)).toMatchObject([{ code: "AAAAAA", phase: "racing", participants: 2 }]);
  });

  it("follows a visibility change at the next read", async () => {
    const { lobbyId } = await room("AAAAAA", "code");
    expect(await listPublicRooms(db)).toEqual([]);
    await pool.query("update lobbies set visibility='public' where id=$1", [lobbyId]);
    expect(await listPublicRooms(db)).toHaveLength(1);
    await pool.query("update lobbies set visibility='private' where id=$1", [lobbyId]);
    expect(await listPublicRooms(db)).toEqual([]);
  });

  it("reads a room without a settings row with the defaults, and bounds the result", async () => {
    const { lobbyId } = await room("AAAAAA", "public");
    await room("BBBBBB", "public");
    await pool.query("delete from lobby_settings where lobby_id=$1", [lobbyId]);
    const rooms = await listPublicRooms(db, { limit: 1 });
    expect(rooms).toHaveLength(1);
    expect(rooms[0]).toMatchObject({ code: "AAAAAA", textLanguage: "fr", complexity: "medium", arcade: false });
    expect(await listPublicRooms(db, { limit: 0 })).toHaveLength(1);
    expect(await listPublicRooms(db, { limit: Number.NaN })).toHaveLength(2);
  });

  it("uses the partial index for the open public rooms", async () => {
    // One connection: the planner setting must apply to the EXPLAIN that follows it.
    const client = await pool.connect();
    try {
      await client.query("set enable_seqscan = off");
      const plan = await client.query<{ "QUERY PLAN": string }>(
        "explain select id from lobbies where visibility='public' and phase <> 'closed' order by created_at, id limit 100");
      expect(plan.rows.map((row) => row["QUERY PLAN"]).join("\n")).toContain("lobbies_open_public_idx");
    } finally {
      await client.query("reset enable_seqscan");
      client.release();
    }
  });
});
