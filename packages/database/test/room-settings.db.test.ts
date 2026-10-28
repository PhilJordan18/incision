import { ERROR_MODES, parseRoomCode, ROOM_CODE_ALPHABET, type RoomCode, TEXT_LANGUAGES, TIME_LIMIT_MAX_MS, TIME_LIMIT_MIN_MS } from "@incision/domain";
import pg from "pg";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { createDatabase, type Database } from "../src/client";
import { runMigrations } from "../src/migrations";
import { type RaceToCreate, startRace } from "../src/races/lifecycle";
import { createRoomWithHost } from "../src/rooms/create-room";
import { configureRoom } from "../src/rooms/host-actions";
import { joinRoomByCode, leaveCurrentRoom, readRoomSnapshot } from "../src/rooms/membership";
import { readOwnRoomSettings } from "../src/rooms/settings";
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

afterAll(async () => {
  await pool.end();
  await database.drop();
});

const OWNER = "00000000-0000-4000-8000-00000000000a";
const ENGLISH_ONE_MINUTE = { textLanguage: "en", timeLimitMs: 60_000, errorMode: "mandatory" } as const;

/** Stand-in for the engine's start in these transaction tests only (the server wires `createRace`). */
const atLeastTwo = ({ entrants }: RaceToCreate) =>
  entrants.length < 2 ? { ok: false as const, reason: "NOT_ENOUGH_PARTICIPANTS" as const } : { ok: true as const, race: entrants.length };

async function account(displayName: string): Promise<string> {
  const result = await pool.query<{ id: string }>("insert into accounts (display_name) values ($1) returning id", [displayName]);
  return result.rows[0]!.id;
}

function code(value: string): RoomCode {
  const parsed = parseRoomCode(value);
  if (!parsed.ok) throw new Error(`bad fixture code ${value}`);
  return parsed.code;
}

/** A waiting room hosted by a participant (a new account unless given), with one more participant, created in `textLanguage` when given. */
async function room(
  value: string,
  { textLanguage, host }: { readonly textLanguage?: "fr" | "en"; readonly host?: string } = {},
): Promise<{ lobbyId: string; hostId: string; guestId: string }> {
  const hostId = host ?? (await account("Hôte"));
  const characters = [...value].map((character) => ROOM_CODE_ALPHABET.indexOf(character));
  let draw = 0;
  const created = await createRoomWithHost(db, {
    accountId: hostId,
    role: "participant",
    visibility: "code",
    capacity: 30,
    randomIndex: () => characters[draw++] ?? 0,
    ...(textLanguage === undefined ? {} : { textLanguage }),
  });
  if (!created.ok) throw new Error(created.error);
  const guestId = await account("Bea");
  const joined = await joinRoomByCode(db, { accountId: guestId, code: code(value), role: "participant" });
  if (!joined.ok) throw new Error(joined.error);
  return { lobbyId: created.room.id, hostId, guestId };
}

async function lobbyRevision(lobbyId: string): Promise<number> {
  const result = await pool.query<{ revision: number }>("select revision from lobbies where id = $1", [lobbyId]);
  return result.rows[0]!.revision;
}

/** The start the server sends: the room and the settings revision its text was drawn with. */
function start(accountId: string, lobbyId: string, settingsRevision: number) {
  return startRace(db, { accountId, ownerId: OWNER, text: "La mer est calme.", config: {}, lobbyId, settingsRevision, rulesVersion: 1, create: atLeastTwo });
}

describe("room settings (F-03.1)", () => {
  it("are written with the room: the creator's language, no limit, mandatory correction, revision 0", async () => {
    const { lobbyId } = await room("ABCDEF", { textLanguage: "en" });
    const rows = await pool.query("select lobby_id, revision, text_language, time_limit_ms, error_mode from lobby_settings");
    expect(rows.rows).toEqual([{ lobby_id: lobbyId, revision: 0, text_language: "en", time_limit_ms: null, error_mode: "mandatory" }]);
    expect((await readRoomSnapshot(db, lobbyId))?.settings).toEqual({ revision: 0, textLanguage: "en", timeLimitMs: null, errorMode: "mandatory" });
  });

  it("keeps an existing saved duration when another new room gets no limit", async () => {
    const existing = await room("ABCDEF");
    await pool.query("update lobby_settings set time_limit_ms = 120000, revision = 4 where lobby_id = $1", [existing.lobbyId]);
    const fresh = await room("BCDEFG");
    expect((await readRoomSnapshot(db, existing.lobbyId))?.settings).toMatchObject({ timeLimitMs: 120_000, revision: 4 });
    expect((await readRoomSnapshot(db, fresh.lobbyId))?.settings).toMatchObject({ timeLimitMs: null, revision: 0 });
  });

  it("take French texts when the creator's language is not given", async () => {
    const { lobbyId } = await room("ABCDEF");
    expect((await readRoomSnapshot(db, lobbyId))?.settings.textLanguage).toBe("fr");
  });

  it("read as the initial ones for a room without a row (created by an older process), then saved", async () => {
    const { lobbyId, hostId } = await room("ABCDEF", { textLanguage: "en" });
    await pool.query("delete from lobby_settings where lobby_id = $1", [lobbyId]);
    const initial = { revision: 0, textLanguage: "fr", timeLimitMs: 120_000, errorMode: "mandatory" };
    expect((await readRoomSnapshot(db, lobbyId))?.settings).toEqual(initial);
    expect((await readOwnRoomSettings(db, hostId))?.settings).toEqual(initial);
    expect(await configureRoom(db, { accountId: hostId, code: code("ABCDEF"), revision: 0, settings: ENGLISH_ONE_MINUTE })).toEqual({ ok: true, lobbyId, revision: 1 });
    expect((await readRoomSnapshot(db, lobbyId))?.settings).toEqual({ revision: 1, ...ENGLISH_ONE_MINUTE });
  });

  it("start a room without a row at revision 0, its initial settings", async () => {
    const { lobbyId, hostId } = await room("ABCDEF", { textLanguage: "en" });
    await pool.query("delete from lobby_settings where lobby_id = $1", [lobbyId]);
    expect(await start(hostId, lobbyId, 1)).toEqual({ ok: false, error: "SETTINGS_CHANGED" });
    expect(await start(hostId, lobbyId, 0)).toMatchObject({ ok: true });
  });

  it("read a stored \"no limit\" back as it is, never as another limit", async () => {
    const { lobbyId, hostId } = await room("ABCDEF");
    await pool.query("update lobby_settings set time_limit_ms = null where lobby_id = $1", [lobbyId]);
    const noLimit = { revision: 0, textLanguage: "fr", timeLimitMs: null, errorMode: "mandatory" };
    expect((await readRoomSnapshot(db, lobbyId))?.settings).toEqual(noLimit);
    expect((await readOwnRoomSettings(db, hostId))?.settings).toEqual(noLimit);
  });

  it("are read with the account's room before a start, or nothing outside a room", async () => {
    const { lobbyId, hostId, guestId } = await room("ABCDEF", { textLanguage: "en" });
    expect(await readOwnRoomSettings(db, hostId)).toMatchObject({ lobbyId, phase: "waiting", isHost: true, settings: { textLanguage: "en" } });
    expect(await readOwnRoomSettings(db, guestId)).toMatchObject({ lobbyId, isHost: false });
    expect(await readOwnRoomSettings(db, await account("Ailleurs"))).toBeUndefined();
  });

  it("are saved by the host while the room waits: both revisions increase and the snapshot carries them", async () => {
    const { lobbyId, hostId } = await room("ABCDEF");
    const before = await lobbyRevision(lobbyId);
    expect(await configureRoom(db, { accountId: hostId, code: code("ABCDEF"), revision: 0, settings: ENGLISH_ONE_MINUTE })).toEqual({ ok: true, lobbyId, revision: 1 });
    expect(await lobbyRevision(lobbyId)).toBe(before + 1);
    const snapshot = await readRoomSnapshot(db, lobbyId);
    expect(snapshot).toMatchObject({ revision: before + 1, settings: { revision: 1, ...ENGLISH_ONE_MINUTE } });
    expect(await configureRoom(db, { accountId: hostId, code: code("ABCDEF"), revision: 1, settings: { ...ENGLISH_ONE_MINUTE, timeLimitMs: 30_000 } })).toMatchObject({ ok: true, revision: 2 });
  });

  it("refuse a page that did not show the last saved settings, changing nothing", async () => {
    const { lobbyId, hostId } = await room("ABCDEF");
    await configureRoom(db, { accountId: hostId, code: code("ABCDEF"), revision: 0, settings: ENGLISH_ONE_MINUTE });
    const before = await lobbyRevision(lobbyId);
    expect(await configureRoom(db, { accountId: hostId, code: code("ABCDEF"), revision: 0, settings: { ...ENGLISH_ONE_MINUTE, textLanguage: "fr" } })).toEqual({
      ok: false,
      error: "STALE_REVISION",
    });
    expect((await readRoomSnapshot(db, lobbyId))?.settings).toEqual({ revision: 1, ...ENGLISH_ONE_MINUTE });
    expect(await lobbyRevision(lobbyId)).toBe(before);
  });

  it("are the host's only, in the room its page shows", async () => {
    const { lobbyId, hostId, guestId } = await room("ABCDEF");
    expect(await configureRoom(db, { accountId: guestId, code: code("ABCDEF"), revision: 0, settings: ENGLISH_ONE_MINUTE })).toEqual({ ok: false, error: "NOT_HOST" });
    expect(await configureRoom(db, { accountId: hostId, code: code("BCDEFG"), revision: 0, settings: ENGLISH_ONE_MINUTE })).toEqual({ ok: false, error: "NOT_IN_A_ROOM" });
    expect(await configureRoom(db, { accountId: await account("Ailleurs"), code: code("ABCDEF"), revision: 0, settings: ENGLISH_ONE_MINUTE })).toEqual({
      ok: false,
      error: "NOT_IN_A_ROOM",
    });
    expect((await readOwnRoomSettings(db, hostId))?.settings.revision).toBe(0);
    // A host who left closed the room: nothing to save in it any more.
    await leaveCurrentRoom(db, hostId, () => new Set());
    expect(await configureRoom(db, { accountId: hostId, code: code("ABCDEF"), revision: 0, settings: ENGLISH_ONE_MINUTE })).toEqual({ ok: false, error: "NOT_IN_A_ROOM" });
    expect((await readRoomSnapshot(db, lobbyId))?.settings).toEqual({ revision: 0, textLanguage: "fr", timeLimitMs: null, errorMode: "mandatory" });
  });

  it("are locked from the countdown on", async () => {
    const { lobbyId, hostId } = await room("ABCDEF");
    expect(await start(hostId, lobbyId, 0)).toMatchObject({ ok: true });
    expect(await configureRoom(db, { accountId: hostId, code: code("ABCDEF"), revision: 0, settings: ENGLISH_ONE_MINUTE })).toEqual({ ok: false, error: "ROOM_NOT_WAITING" });
    expect((await readRoomSnapshot(db, lobbyId))?.settings.revision).toBe(0);
  });

  it("refuse a start drawn with older settings, writing no race", async () => {
    const { lobbyId, hostId } = await room("ABCDEF");
    await configureRoom(db, { accountId: hostId, code: code("ABCDEF"), revision: 0, settings: ENGLISH_ONE_MINUTE });
    expect(await start(hostId, lobbyId, 0)).toEqual({ ok: false, error: "SETTINGS_CHANGED" });
    expect((await readRoomSnapshot(db, lobbyId))?.phase).toBe("waiting");
    expect((await pool.query("select 1 from races")).rowCount).toBe(0);
    expect(await start(hostId, lobbyId, 1)).toMatchObject({ ok: true });
  });

  it("refuse a start drawn with the settings of the room the host left meanwhile, writing no race", async () => {
    const first = await room("ABCDEF", { textLanguage: "en" });
    const drawnWith = await readOwnRoomSettings(db, first.hostId);
    // During the draw, the host leaves that room (closing it) in another tab and creates a French one: revision 0 too.
    await leaveCurrentRoom(db, first.hostId, () => new Set());
    const second = await room("BCDEFG", { host: first.hostId });
    expect(drawnWith).toMatchObject({ lobbyId: first.lobbyId, settings: { revision: 0, textLanguage: "en" } });
    expect(await start(first.hostId, first.lobbyId, 0)).toEqual({ ok: false, error: "SETTINGS_CHANGED" });
    expect((await readRoomSnapshot(db, second.lobbyId))?.phase).toBe("waiting");
    expect((await pool.query("select 1 from races")).rowCount).toBe(0);
    // The server then draws again with the settings of the room the host is in.
    expect(await start(first.hostId, second.lobbyId, 0)).toMatchObject({ ok: true });
  });

  it("hold the engine's bounds in the database: languages, error modes and a time limit of none or 30 s to 10 min", async () => {
    const enums = await pool.query<{ languages: string; modes: string }>(
      "select enum_range(null::text_language)::text as languages, enum_range(null::error_mode)::text as modes",
    );
    expect(enums.rows[0]).toEqual({ languages: `{${TEXT_LANGUAGES.join(",")}}`, modes: `{${ERROR_MODES.join(",")}}` });
    const { lobbyId } = await room("ABCDEF");
    const setLimit = (value: number | null) => pool.query("update lobby_settings set time_limit_ms = $1 where lobby_id = $2", [value, lobbyId]);
    for (const accepted of [null, TIME_LIMIT_MIN_MS, TIME_LIMIT_MAX_MS]) {
      await expect(setLimit(accepted)).resolves.toBeDefined();
    }
    for (const refused of [TIME_LIMIT_MIN_MS - 1, TIME_LIMIT_MAX_MS + 1, 0, -1]) {
      await expect(setLimit(refused)).rejects.toMatchObject({ constraint: "lobby_settings_time_limit_range" });
    }
    await expect(pool.query("update lobby_settings set revision = -1 where lobby_id = $1", [lobbyId])).rejects.toMatchObject({
      constraint: "lobby_settings_revision_non_negative",
    });
  });

  it("go with their room", async () => {
    const { lobbyId } = await room("ABCDEF");
    await pool.query("update lobbies set host_member_id = null where id = $1", [lobbyId]);
    await pool.query("delete from lobbies where id = $1", [lobbyId]);
    expect((await pool.query("select 1 from lobby_settings")).rowCount).toBe(0);
  });
});
