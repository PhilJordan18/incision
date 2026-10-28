import { asEntrantId, asInstant, asRaceId, createRace, parseRoomCode, type MemberRole } from "@incision/domain";
import pg from "pg";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { createDatabase, type Database } from "../src/client";
import { runMigrations } from "../src/migrations";
import { changeRoomBots } from "../src/rooms/bots";
import { createRoomWithHost } from "../src/rooms/create-room";
import { readRoomSnapshot } from "../src/rooms/membership";
import { startNextRound } from "../src/rooms/host-actions";
import { finalizeRace, startRace, type RaceResultRow } from "../src/races/lifecycle";
import { readRaceForEntrant } from "../src/races/results";
import { readAccountStatistics } from "../src/races/profile-statistics";
import { createTemporaryDatabase, type TemporaryDatabase } from "./test-database";

let temporary: TemporaryDatabase; let pool: pg.Pool; let db: Database;
beforeAll(async () => {
  temporary = await createTemporaryDatabase(); await runMigrations({ connectionString: temporary.url });
  pool = new pg.Pool({ connectionString: temporary.url }); db = createDatabase(pool);
});
afterEach(async () => {
  await pool.query("update lobbies set host_member_id = null"); await pool.query("delete from lobbies");
  await pool.query("delete from races"); await pool.query("delete from accounts");
});
afterAll(async () => { await pool.end(); await temporary.drop(); });
async function room(role: MemberRole = "participant") {
  const { rows } = await pool.query<{ id: string }>("insert into accounts(display_name) values ('Human') returning id");
  const accountId = rows[0]!.id;
  const made = await createRoomWithHost(db, { accountId, role, visibility: "code", capacity: 5, randomIndex: () => 0 });
  if (!made.ok) throw new Error(made.error);
  const parsed = parseRoomCode(made.room.code); if (!parsed.ok) throw new Error("fixture code");
  const snapshot = (await readRoomSnapshot(db, made.room.id))!;
  const host = { accountId, code: parsed.code, lobbyId: made.room.id };
  await changeRoomBots(db, { ...host, revision: snapshot.revision, change: { kind: "add", level: "expert" } });
  return host;
}
async function start(host: Awaited<ReturnType<typeof room>>) {
  const snapshot = (await readRoomSnapshot(db, host.lobbyId))!;
  return startRace(db, { accountId: host.accountId, lobbyId: host.lobbyId, settingsRevision: snapshot.settings.revision,
    ownerId: "00000000-0000-4000-8000-00000000000a", rulesVersion: 1, text: "abc", config: { language: "fr", errorMode: "mandatory", bonuses: false },
    create: ({ raceId, entrants }) => createRace({ raceId: asRaceId(raceId), text: "abc", errorMode: "mandatory", timeLimit: null,
      now: asInstant(Date.now()), participants: entrants.map(({ entrantId, kind }) => ({ entrantId: asEntrantId(entrantId), kind })) }),
  });
}
describe("persistent human and bot race roster", () => {
  it("starts a human with a bot, freezes kind/level and preserves them after roster removal", async () => {
    const host = await room(); const started = await start(host); if (!started.ok) throw new Error(started.error);
    expect(started.created.entrants.map((entrant) => entrant.kind)).toEqual(["human", "bot"]);
    expect(started.entrants[1]).toMatchObject({ accountId: null, memberId: null, kind: "bot", botLevel: "expert" });
    expect(await start(host)).toMatchObject({ error: "ROOM_NOT_WAITING" });
    const rows: RaceResultRow[] = started.entrants.map((entrant, index) => ({
      entrantId: entrant.entrantId, outcome: "finished", rank: index + 1, elapsedMs: 10_000,
      position: 3, length: 3, correctInputs: 3, totalInputs: 4, netWpm: 3.6, rawWpm: 4.8, accuracy: 75,
      wpmSeries: { unavailable: "not_collected" }, keyErrors: { version: 1, keys: [{ grapheme: index === 0 ? "a" : "b", count: 1 }] },
    }));
    // Transaction fixture only; actual bot timing/measurements are covered by runtime and browser tests.
    expect((await finalizeRace(db, started.race, rows)).won).toBe(true);
    expect(await finalizeRace(db, started.race, rows)).toMatchObject({ alreadyDone: true });
    await startNextRound(db, { accountId: host.accountId, raceId: started.race.raceId });
    const snapshot = (await readRoomSnapshot(db, host.lobbyId))!;
    await changeRoomBots(db, { ...host, revision: snapshot.revision, change: { kind: "remove", botId: snapshot.bots[0]!.botId } });
    const saved = await readRaceForEntrant(db, started.race.raceId, host.accountId);
    expect(saved?.entrants[1]).toMatchObject({ kind: "bot", botLevel: "expert", isSelf: false });
    expect(saved?.personalKeyErrors?.keys).toEqual([{ grapheme: "a", count: 1 }]);
    expect(JSON.stringify(saved)).not.toContain('"grapheme":"b"');
    expect(await readRaceForEntrant(db, started.race.raceId, started.entrants[1]!.entrantId)).toBeUndefined();
    expect((await pool.query("select * from accounts")).rowCount).toBe(1);
    expect((await readAccountStatistics(db, host.accountId)).summary).toMatchObject({ raceCount: 1, victories: 0 });
    expect((await readAccountStatistics(db, started.entrants[1]!.entrantId)).summary).toMatchObject({ raceCount: 0, victories: 0 });
  });
  it("refuses a spectator host with bots only through the existing domain start rule", async () => {
    const host = await room("spectator");
    const snapshot = (await readRoomSnapshot(db, host.lobbyId))!;
    await changeRoomBots(db, { ...host, revision: snapshot.revision, change: { kind: "add", level: "noob" } });
    expect(await start(host)).toMatchObject({ error: "NO_HUMAN_PARTICIPANT" });
    expect((await pool.query("select * from races")).rowCount).toBe(0);
  });
  it("SQL rejects bots with accounts or membership and humans without accounts", async () => {
    const host = await room(); const started = await start(host); if (!started.ok) throw new Error(started.error);
    const bot = started.entrants[1]!; const human = started.entrants[0]!;
    await expect(pool.query("update race_entrants set account_id=$1 where id=$2", [host.accountId, bot.entrantId])).rejects.toMatchObject({ code: "23514" });
    await expect(pool.query("update race_entrants set member_id=$1 where id=$2", [human.memberId, bot.entrantId])).rejects.toMatchObject({ code: "23514" });
    await expect(pool.query("update race_entrants set account_id=null where id=$1", [human.entrantId])).rejects.toMatchObject({ code: "23514" });
    await expect(pool.query("update race_entrants set bot_level=null where id=$1", [bot.entrantId])).rejects.toMatchObject({ code: "23514" });
  });
});
