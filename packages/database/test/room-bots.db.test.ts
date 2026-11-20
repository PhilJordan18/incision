import { BOT_LEVELS, parseRoomCode, type RoomCode, ROOM_CODE_ALPHABET } from "@incision/domain";
import pg from "pg";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { createDatabase, type Database } from "../src/client";
import { runMigrations } from "../src/migrations";
import { changeRoomBots, type BotChange } from "../src/rooms/bots";
import { createRoomWithHost } from "../src/rooms/create-room";
import { joinRoomByCode, leaveCurrentRoom, readRoomSnapshot } from "../src/rooms/membership";
import { createTemporaryDatabase, type TemporaryDatabase } from "./test-database";

let temporary: TemporaryDatabase;
let pool: pg.Pool;
let db: Database;
beforeAll(async () => {
  temporary = await createTemporaryDatabase(); await runMigrations({ connectionString: temporary.url });
  pool = new pg.Pool({ connectionString: temporary.url, max: 8 }); db = createDatabase(pool);
});
afterEach(async () => {
  await pool.query("update lobbies set host_member_id = null"); await pool.query("delete from lobbies"); await pool.query("delete from races"); await pool.query("delete from accounts");
});
afterAll(async () => { await pool.end(); await temporary.drop(); });
async function account() {
  const { rows } = await pool.query<{ id: string }>("insert into accounts(display_name) values ('BotTester') returning id");
  return rows[0]!.id;
}
async function room(capacity = 3, code = "ABCDEF") {
  const accountId = await account(); let draw = 0;
  const created = await createRoomWithHost(db, { accountId, role: "participant", visibility: "code", capacity,
    randomIndex: () => ROOM_CODE_ALPHABET.indexOf(code[draw++]!) });
  if (!created.ok) throw new Error(created.error);
  const parsed = parseRoomCode(created.room.code); if (!parsed.ok) throw new Error("fixture code");
  return { accountId, code: parsed.code, lobbyId: created.room.id };
}
async function change(host: { accountId: string; code: RoomCode; lobbyId: string }, change: BotChange) {
  const snapshot = await readRoomSnapshot(db, host.lobbyId); if (!snapshot) throw new Error("fixture room");
  return changeRoomBots(db, { ...host, revision: snapshot.revision, change });
}
describe("room bot admission under the room lock", () => {
  it("persists all levels, changes one and removes it without creating accounts or members", async () => {
    const host = await room(8);
    for (const level of BOT_LEVELS) expect((await change(host, { kind: "add", level })).ok).toBe(true);
    const snapshot = await readRoomSnapshot(db, host.lobbyId);
    expect(snapshot?.bots.map((bot) => bot.level)).toEqual(BOT_LEVELS);
    expect(snapshot?.members).toHaveLength(1);
    expect((await pool.query("select * from accounts")).rowCount).toBe(1);
    const botId = snapshot!.bots[0]!.botId;
    expect((await change(host, { kind: "level", botId, level: "expert" })).ok).toBe(true);
    expect((await readRoomSnapshot(db, host.lobbyId))?.bots[0]?.level).toBe("expert");
    expect((await change(host, { kind: "remove", botId })).ok).toBe(true);
    expect((await readRoomSnapshot(db, host.lobbyId))?.bots).toHaveLength(4);
  });
  it("shares capacity with human admission but leaves the spectator quota independent", async () => {
    const host = await room(2);
    await change(host, { kind: "add", level: "noob" });
    expect(await change(host, { kind: "add", level: "expert" })).toMatchObject({ error: "ROOM_FULL" });
    expect(await joinRoomByCode(db, { accountId: await account(), code: host.code, role: "participant" })).toMatchObject({ error: "ROOM_FULL" });
    expect((await joinRoomByCode(db, { accountId: await account(), code: host.code, role: "spectator" })).ok).toBe(true);
    const snapshot = await readRoomSnapshot(db, host.lobbyId);
    await change(host, { kind: "remove", botId: snapshot!.bots[0]!.botId });
    expect((await joinRoomByCode(db, { accountId: await account(), code: host.code, role: "participant" })).ok).toBe(true);
  });
  it("serializes a human join against a bot for the last place", async () => {
    const host = await room(2); const other = await account();
    const results = await Promise.all([
      change(host, { kind: "add", level: "noob" }),
      joinRoomByCode(db, { accountId: other, code: host.code, role: "participant" }),
    ]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    const snapshot = await readRoomSnapshot(db, host.lobbyId);
    expect(snapshot!.members.length + snapshot!.bots.length).toBe(2);
  });
  it("rejects stale repeated adds, non-hosts, outsiders and another room's bot", async () => {
    const host = await room(8); const snapshot = await readRoomSnapshot(db, host.lobbyId);
    const input = { ...host, revision: snapshot!.revision, change: { kind: "add" as const, level: "noob" as const } };
    expect((await changeRoomBots(db, input)).ok).toBe(true);
    expect(await changeRoomBots(db, input)).toMatchObject({ error: "STALE_REVISION" });
    const other = await account();
    expect(await change({ ...host, accountId: other }, input.change)).toMatchObject({ error: "NOT_IN_A_ROOM" });
    await joinRoomByCode(db, { accountId: other, code: host.code, role: "participant" });
    expect(await change({ ...host, accountId: other }, input.change)).toMatchObject({ error: "NOT_HOST" });
    const foreign = await room(3, "BCDEFG"); await change(foreign, input.change);
    const botId = (await readRoomSnapshot(db, foreign.lobbyId))!.bots[0]!.botId;
    expect(await change(host, { kind: "remove", botId })).toMatchObject({ error: "BOT_NOT_FOUND" });
  });
  it("never makes a bot host: the last human leaving closes the room", async () => {
    const host = await room(); await change(host, { kind: "add", level: "expert" });
    expect(await leaveCurrentRoom(db, host.accountId, () => new Set())).toMatchObject({ closed: true });
    expect((await readRoomSnapshot(db, host.lobbyId))?.phase).toBe("closed");
    expect(await change(host, { kind: "add", level: "noob" })).toMatchObject({ error: "NOT_IN_A_ROOM" });
  });
  it.each(["countdown", "racing", "results"])("refuses every mutation in %s", async (phase) => {
    const host = await room(); await change(host, { kind: "add", level: "noob" });
    const botId = (await readRoomSnapshot(db, host.lobbyId))!.bots[0]!.botId;
    const { rows } = await pool.query<{ id: string }>(`insert into races
      (lobby_id, round_no, rules_version, text_snapshot, config_snapshot, countdown_at, owner_id, lease_expires_at)
      values ($1, 1, 1, 'Test', '{}', now(), gen_random_uuid(), now() + interval '30 seconds') returning id`, [host.lobbyId]);
    await pool.query("update lobbies set phase = $1, current_race_id = $2 where id = $3", [phase, rows[0]!.id, host.lobbyId]);
    const changes: BotChange[] = [{ kind: "add", level: "expert" }, { kind: "level", botId, level: "expert" }, { kind: "remove", botId }];
    for (const value of changes) expect(await change(host, value)).toMatchObject({ error: "ROOM_NOT_WAITING" });
    expect((await readRoomSnapshot(db, host.lobbyId))?.bots).toEqual([{ botId, level: "noob" }]);
  });
  it("rejects unknown levels in SQL and cascades bot rows with their room", async () => {
    const host = await room(); await change(host, { kind: "add", level: "expert" });
    await expect(pool.query("insert into lobby_bots(lobby_id, level) values ($1, 'cheat')", [host.lobbyId])).rejects.toMatchObject({ code: "23514" });
    await pool.query("update lobbies set host_member_id = null where id = $1", [host.lobbyId]);
    await pool.query("delete from lobbies where id = $1", [host.lobbyId]);
    expect((await pool.query("select * from lobby_bots")).rowCount).toBe(0);
  });
});
