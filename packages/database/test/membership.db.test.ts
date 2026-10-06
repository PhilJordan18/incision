import { parseRoomCode, type RoomCode, ROOM_CODE_ALPHABET } from "@incision/domain";
import pg from "pg";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { createDatabase, type Database } from "../src/client";
import { runMigrations } from "../src/migrations";
import { createRoomWithHost } from "../src/rooms/create-room";
import { findActiveMembership, joinRoomByCode, leaveCurrentRoom, localDisplayName, readRoomSnapshot } from "../src/rooms/membership";
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
  await pool.query("delete from accounts");
});

afterAll(async () => {
  await pool.end();
  await database.drop();
});

async function account(displayName: string): Promise<string> {
  const result = await pool.query<{ id: string }>("insert into accounts (display_name) values ($1) returning id", [displayName]);
  return result.rows[0]!.id;
}

function code(value: string): RoomCode {
  const parsed = parseRoomCode(value);
  if (!parsed.ok) {
    throw new Error(`bad fixture code ${value}`);
  }
  return parsed.code;
}

/** A room with the given code, hosted by a new account as participant. */
async function room(value: string, options: { capacity?: number; host?: string } = {}): Promise<{ lobbyId: string; hostId: string }> {
  const hostId = options.host ?? (await account("Hôte"));
  const characters = [...value].map((character) => ROOM_CODE_ALPHABET.indexOf(character));
  let draw = 0;
  const created = await createRoomWithHost(db, {
    accountId: hostId,
    role: "participant",
    visibility: "code",
    capacity: options.capacity ?? 8,
    randomIndex: () => characters[draw++] ?? 0,
  });
  if (!created.ok) {
    throw new Error(created.error);
  }
  return { lobbyId: created.room.id, hostId };
}

describe("joinRoomByCode", () => {
  it("admits an account, and a second join from another tab returns the same member", async () => {
    const { lobbyId } = await room("ABCDEF");
    const bob = await account("Bob");
    const first = await joinRoomByCode(db, { accountId: bob, code: code("abcdef"), role: "participant" });
    expect(first).toMatchObject({ ok: true, lobbyId, alreadyMember: false });
    const again = await joinRoomByCode(db, { accountId: bob, code: code("ABCDEF"), role: "participant" });
    expect(again).toMatchObject({ ok: true, lobbyId, alreadyMember: true });
    expect(first.ok && again.ok && again.memberId === first.memberId).toBe(true);
    expect((await readRoomSnapshot(db, lobbyId))?.members.map((member) => member.displayName)).toEqual(["Hôte", "Bob"]);
  });

  it("refuses an unknown code and a private room's code", async () => {
    const { lobbyId } = await room("ABCDEF");
    await pool.query("update lobbies set visibility = 'private' where id = $1", [lobbyId]);
    const bob = await account("Bob");
    expect(await joinRoomByCode(db, { accountId: bob, code: code("ABCDEF"), role: "participant" })).toEqual({ ok: false, error: "ROOM_NOT_FOUND" });
    expect(await joinRoomByCode(db, { accountId: bob, code: code("ZZZZZZ"), role: "participant" })).toEqual({ ok: false, error: "ROOM_NOT_FOUND" });
  });

  it("admits only while waiting or at results", async () => {
    const { lobbyId } = await room("ABCDEF");
    const bob = await account("Bob");
    await pool.query("update lobbies set phase = 'racing' where id = $1", [lobbyId]);
    expect(await joinRoomByCode(db, { accountId: bob, code: code("ABCDEF"), role: "participant" })).toEqual({ ok: false, error: "ROOM_NOT_ADMITTING" });
    await pool.query("update lobbies set phase = 'results' where id = $1", [lobbyId]);
    expect(await joinRoomByCode(db, { accountId: bob, code: code("ABCDEF"), role: "participant" })).toMatchObject({ ok: true });
  });

  it("keeps participants within capacity under concurrent joins; spectators do not count", async () => {
    await room("ABCDEF", { capacity: 3 });
    const joiners = await Promise.all(["A1", "A2", "A3", "A4", "A5"].map((name) => account(name)));
    const results = await Promise.all(joiners.map((accountId) => joinRoomByCode(db, { accountId, code: code("ABCDEF"), role: "participant" })));
    expect(results.filter((result) => result.ok)).toHaveLength(2);
    expect(results.filter((result) => !result.ok && result.error === "ROOM_FULL")).toHaveLength(3);
    const spectator = await account("Spectatrice");
    expect(await joinRoomByCode(db, { accountId: spectator, code: code("ABCDEF"), role: "spectator" })).toMatchObject({ ok: true });
  });

  it("refuses an account already in another room and names that room", async () => {
    await room("ABCDEF");
    await room("BCDEFG");
    const bob = await account("Bob");
    await joinRoomByCode(db, { accountId: bob, code: code("ABCDEF"), role: "participant" });
    expect(await joinRoomByCode(db, { accountId: bob, code: code("BCDEFG"), role: "participant" })).toEqual({
      ok: false,
      error: "ALREADY_IN_ANOTHER_ROOM",
      currentCode: "ABCDEF",
    });
  });

  it("lets one account enter only one of two rooms joined at the same time", async () => {
    await room("ABCDEF");
    await room("BCDEFG");
    const bob = await account("Bob");
    const results = await Promise.all(
      ["ABCDEF", "BCDEFG"].map((value) => joinRoomByCode(db, { accountId: bob, code: code(value), role: "participant" })),
    );
    expect(results.filter((result) => result.ok)).toHaveLength(1);
    expect(results.find((result) => !result.ok)).toMatchObject({ error: "ALREADY_IN_ANOTHER_ROOM" });
  });

  it("gives a homonym a local name without changing the account's name", async () => {
    const { lobbyId } = await room("ABCDEF");
    const twin = await account("Hôte");
    await joinRoomByCode(db, { accountId: twin, code: code("ABCDEF"), role: "participant" });
    expect((await readRoomSnapshot(db, lobbyId))?.members.map((member) => member.displayName)).toEqual(["Hôte", "Hôte 2"]);
    const stored = await pool.query<{ display_name: string }>("select display_name from accounts where id = $1", [twin]);
    expect(stored.rows[0]?.display_name).toBe("Hôte");
  });
});

describe("leaveCurrentRoom", () => {
  it("lets a member leave and increases the revision; the account can join another room", async () => {
    const { lobbyId } = await room("ABCDEF");
    await room("BCDEFG");
    const bob = await account("Bob");
    await joinRoomByCode(db, { accountId: bob, code: code("ABCDEF"), role: "participant" });
    const before = (await readRoomSnapshot(db, lobbyId))?.revision ?? 0;
    expect(await leaveCurrentRoom(db, bob)).toEqual({ lobbyId, closed: false });
    const after = await readRoomSnapshot(db, lobbyId);
    expect(after?.members.map((member) => member.displayName)).toEqual(["Hôte"]);
    expect(after?.revision).toBeGreaterThan(before);
    expect(await findActiveMembership(db, bob)).toBeUndefined();
    expect(await joinRoomByCode(db, { accountId: bob, code: code("BCDEFG"), role: "participant" })).toMatchObject({ ok: true });
  });

  it("closes the room when the host leaves, and frees every member", async () => {
    const { lobbyId, hostId } = await room("ABCDEF");
    const bob = await account("Bob");
    await joinRoomByCode(db, { accountId: bob, code: code("ABCDEF"), role: "participant" });
    expect(await leaveCurrentRoom(db, hostId)).toEqual({ lobbyId, closed: true });
    const snapshot = await readRoomSnapshot(db, lobbyId);
    expect(snapshot).toMatchObject({ phase: "closed", members: [] });
    expect(await findActiveMembership(db, bob)).toBeUndefined();
    const other = await account("Clo");
    expect(await joinRoomByCode(db, { accountId: other, code: code("ABCDEF"), role: "participant" })).toEqual({ ok: false, error: "ROOM_NOT_ADMITTING" });
  });

  it("does nothing for an account in no room", async () => {
    expect(await leaveCurrentRoom(db, await account("Seul"))).toBeUndefined();
  });
});

describe("localDisplayName", () => {
  it("keeps 40 characters at most when it adds a suffix", () => {
    const long = "x".repeat(40);
    expect(localDisplayName(long, new Set([long]))).toBe(`${"x".repeat(38)} 2`);
    expect(localDisplayName("Bob", new Set(["bob", "bob 2"]))).toBe("Bob 3");
  });
});
