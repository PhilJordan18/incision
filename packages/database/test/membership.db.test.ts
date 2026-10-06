import { parseRoomCode, type RoomCode, ROOM_CODE_ALPHABET } from "@incision/domain";
import pg from "pg";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { createDatabase, type Database } from "../src/client";
import { runMigrations } from "../src/migrations";
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

/** Resolves once at least `count` queries of this database wait on a lock. */
async function waitForBlockedQueries(count: number): Promise<void> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const result = await pool.query<{ count: string }>(
      "select count(*) as count from pg_stat_activity where datname = current_database() and wait_event_type = 'Lock'",
    );
    if (Number(result.rows[0]?.count) >= count) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error(`Fewer than ${count} queries blocked on a lock`);
}

/**
 * Starts the calls in order while `lobby_members` is locked, each one until it waits on
 * that lock, then releases them together: a deterministic interleaving of transactions.
 */
async function startTogether<T>(calls: ReadonlyArray<() => Promise<T>>, on: pg.Pool = pool): Promise<T[]> {
  const blocker = await on.connect();
  let committed = false;
  try {
    await blocker.query("begin");
    await blocker.query("lock table lobby_members in access exclusive mode");
    const pending: Promise<T>[] = [];
    for (const [index, call] of calls.entries()) {
      pending.push(call());
      await waitForBlockedQueries(index + 1);
    }
    await blocker.query("commit");
    committed = true;
    return await Promise.all(pending);
  } finally {
    // A failed helper must not leave the lock held in a pooled connection: destroy it.
    blocker.release(!committed);
  }
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
    expect(await findActiveMembership(db, bob)).toMatchObject({ lobbyId, code: "ABCDEF", isHost: false });
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
    for (const phase of ["countdown", "racing"]) {
      await pool.query("update lobbies set phase = $2 where id = $1", [lobbyId, phase]);
      expect(await joinRoomByCode(db, { accountId: bob, code: code("ABCDEF"), role: "participant" })).toEqual({ ok: false, error: "ROOM_NOT_ADMITTING" });
    }
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

  it("leaves participant places to participants when spectators are already in", async () => {
    await room("ABCDEF", { capacity: 2 });
    const spectator = await account("Spectatrice");
    const first = await account("Bob");
    const second = await account("Clo");
    expect(await joinRoomByCode(db, { accountId: spectator, code: code("ABCDEF"), role: "spectator" })).toMatchObject({ ok: true });
    expect(await joinRoomByCode(db, { accountId: first, code: code("ABCDEF"), role: "participant" })).toMatchObject({ ok: true });
    expect(await joinRoomByCode(db, { accountId: second, code: code("ABCDEF"), role: "participant" })).toEqual({ ok: false, error: "ROOM_FULL" });
  });

  it("refuses an account that no longer exists", async () => {
    await room("ABCDEF");
    const missing = "00000000-0000-4000-8000-000000000000";
    expect(await joinRoomByCode(db, { accountId: missing, code: code("ABCDEF"), role: "participant" })).toEqual({ ok: false, error: "ACCOUNT_NOT_FOUND" });
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
    // Both joins lock their room, then read the account's membership at the same moment:
    // only the one-active-room index can stop the second (the unique-violation fallback).
    const results = await startTogether(
      ["ABCDEF", "BCDEFG"].map((value) => () => joinRoomByCode(db, { accountId: bob, code: code(value), role: "participant" })),
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

  it("gives distinct local names, in admission order, to homonyms joining at the same time", async () => {
    const { lobbyId } = await room("ABCDEF", { capacity: 10 });
    const twins = await Promise.all(Array.from({ length: 6 }, () => account("Bob")));
    const results = await Promise.all(twins.map((accountId) => joinRoomByCode(db, { accountId, code: code("ABCDEF"), role: "participant" })));
    expect(results.every((result) => result.ok)).toBe(true);
    expect((await readRoomSnapshot(db, lobbyId))?.members.map((member) => member.displayName)).toEqual([
      "Hôte",
      "Bob",
      "Bob 2",
      "Bob 3",
      "Bob 4",
      "Bob 5",
      "Bob 6",
    ]);
  });
});

describe("readRoomSnapshot", () => {
  it("never mixes the revision of one moment with the members of another", async () => {
    const { lobbyId } = await room("ABCDEF", { capacity: 30 });
    const start = await readRoomSnapshot(db, lobbyId);
    const offset = (start?.revision ?? 0) - (start?.members.length ?? 0);
    const joiners = await Promise.all(Array.from({ length: 20 }, (_, index) => account(`J${index}`)));
    let joining = true;
    const reads: Promise<void>[] = [];
    const torn: string[] = [];
    for (let reader = 0; reader < 2; reader += 1) {
      reads.push(
        (async () => {
          while (joining) {
            const snapshot = await readRoomSnapshot(db, lobbyId);
            if (snapshot !== undefined && snapshot.revision - snapshot.members.length !== offset) {
              torn.push(`${snapshot.revision}/${snapshot.members.length}`);
            }
          }
        })(),
      );
    }
    await Promise.all(joiners.map((accountId) => joinRoomByCode(db, { accountId, code: code("ABCDEF"), role: "participant" })));
    joining = false;
    await Promise.all(reads);
    expect(torn).toEqual([]);
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

  it("closes the room even when a join commits while the host's departure waits for the room", async () => {
    const { lobbyId, hostId } = await room("ABCDEF");
    const bob = await account("Bob");
    // The departure starts first, then the join takes the room lock before it: the
    // departure's time must still come after the join (left_at >= joined_at).
    const [left, joined] = await startTogether<unknown>([
      () => leaveCurrentRoom(db, hostId),
      () => joinRoomByCode(db, { accountId: bob, code: code("ABCDEF"), role: "participant" }),
    ]);
    expect(joined).toMatchObject({ ok: true });
    expect(left).toEqual({ lobbyId, closed: true });
    expect(await findActiveMembership(db, bob)).toBeUndefined();
  });

  it("lets two tabs leave the same room once", async () => {
    const { lobbyId } = await room("ABCDEF");
    const bob = await account("Bob");
    await joinRoomByCode(db, { accountId: bob, code: code("ABCDEF"), role: "participant" });
    const before = (await readRoomSnapshot(db, lobbyId))?.revision ?? 0;
    const results = await startTogether([() => leaveCurrentRoom(db, bob), () => leaveCurrentRoom(db, bob)]);
    expect(results.filter((result) => result !== undefined)).toEqual([{ lobbyId, closed: false }]);
    expect((await readRoomSnapshot(db, lobbyId))?.revision).toBe(before + 1);
  });

  it("stays correct when the server's default isolation is REPEATABLE READ", async () => {
    // The transactions pin READ COMMITTED; without it the second tab would fail with 40001.
    const strict = new pg.Pool({ connectionString: database.url, max: 4, options: "-c default_transaction_isolation=repeatable\\ read" });
    try {
      const strictDb = createDatabase(strict);
      const { lobbyId } = await room("ABCDEF");
      const bob = await account("Bob");
      await joinRoomByCode(strictDb, { accountId: bob, code: code("ABCDEF"), role: "participant" });
      const results = await startTogether([() => leaveCurrentRoom(strictDb, bob), () => leaveCurrentRoom(strictDb, bob)], strict);
      expect(results.filter((result) => result !== undefined)).toEqual([{ lobbyId, closed: false }]);
    } finally {
      await strict.end();
    }
  });

  it("closes the room once when the host leaves from two tabs", async () => {
    const { lobbyId, hostId } = await room("ABCDEF");
    const results = await startTogether([() => leaveCurrentRoom(db, hostId), () => leaveCurrentRoom(db, hostId)]);
    expect(results.filter((result) => result !== undefined)).toEqual([{ lobbyId, closed: true }]);
    const closed = await pool.query<{ ok: boolean }>(
      "select l.closed_at >= m.left_at as ok from lobbies l join lobby_members m on m.id = l.host_member_id where l.id = $1",
      [lobbyId],
    );
    expect(closed.rows[0]?.ok).toBe(true);
  });

  it("does nothing for an account in no room", async () => {
    expect(await leaveCurrentRoom(db, await account("Seul"))).toBeUndefined();
  });
});
