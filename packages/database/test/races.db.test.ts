import { parseRoomCode, ROOM_CODE_ALPHABET, type RoomCode } from "@incision/domain";
import { and, eq } from "drizzle-orm";
import pg from "pg";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { createDatabase, type Database } from "../src/client";
import { runMigrations } from "../src/migrations";
import { QUERY_TIMEOUT_MS } from "../src/pool";
import {
  beginRacing,
  finalizeRace,
  interruptOwnRace,
  type RaceResultRow,
  recoverAbandonedRaces,
  renewRaceLease,
  startRace,
  type StartedEntrant,
} from "../src/races/lifecycle";
import { createRoomWithHost } from "../src/rooms/create-room";
import { joinRoomByCode, leaveCurrentRoom } from "../src/rooms/membership";
import { raceResults } from "../src/schema";
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
  // Rooms first (their races keep a null room), then races, then the accounts they reference.
  await pool.query("update lobbies set host_member_id = null");
  await pool.query("delete from lobbies");
  await pool.query("delete from races");
  await pool.query("delete from accounts");
});

afterAll(async () => {
  await pool.end();
  await database.drop();
});

const OWNER_A = "00000000-0000-4000-8000-00000000000a";
const OWNER_B = "00000000-0000-4000-8000-00000000000b";

/**
 * Stand-in for the engine's start rule in these transaction tests only: the real
 * `startRefusal` of @incision/domain is wired by the server (COURSE-02 evidence lives there).
 */
const atLeastTwo = (participants: readonly unknown[]) => (participants.length < 2 ? ("NOT_ENOUGH_PARTICIPANTS" as const) : undefined);

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

/** A waiting room hosted by a participant, with `others` more participants. */
async function room(value: string, others: string[] = ["Bea"]): Promise<{ lobbyId: string; hostId: string; memberIds: string[] }> {
  const hostId = await account("Hôte");
  const characters = [...value].map((character) => ROOM_CODE_ALPHABET.indexOf(character));
  let draw = 0;
  const created = await createRoomWithHost(db, {
    accountId: hostId,
    role: "participant",
    visibility: "code",
    capacity: 30,
    randomIndex: () => characters[draw++] ?? 0,
  });
  if (!created.ok) {
    throw new Error(created.error);
  }
  const memberIds: string[] = [];
  for (const name of others) {
    const joined = await joinRoomByCode(db, { accountId: await account(name), code: code(value), role: "participant" });
    if (!joined.ok) {
      throw new Error(joined.error);
    }
    memberIds.push(joined.memberId);
  }
  return { lobbyId: created.room.id, hostId, memberIds };
}

async function started(hostId: string, ownerId = OWNER_A) {
  const result = await startRace(db, { accountId: hostId, ownerId, text: "La mer est calme.", config: { language: "fr" }, rulesVersion: 1, refuseStart: atLeastTwo });
  if (!result.ok) {
    throw new Error(result.error);
  }
  return result;
}

function resultsFor(entrants: readonly StartedEntrant[]): RaceResultRow[] {
  return entrants.map((entrant, index) => ({
    entrantId: entrant.entrantId,
    outcome: "finished",
    rank: index + 1,
    elapsedMs: 10_000 + index,
    position: 17,
    length: 17,
    correctInputs: 17,
    totalInputs: 18,
    netWpm: 20.4,
    rawWpm: 21.6,
    accuracy: 94.44444444444444,
  }));
}

async function lobbyOf(lobbyId: string) {
  return (await pool.query<{ phase: string; current_race_id: string | null; revision: number }>("select phase, current_race_id, revision from lobbies where id = $1", [lobbyId])).rows[0];
}

async function raceOf(raceId: string) {
  return (
    await pool.query<{ state: string; interruption_reason: string | null; owner_epoch: number; lobby_id: string | null }>(
      "select state, interruption_reason, owner_epoch, lobby_id from races where id = $1",
      [raceId],
    )
  ).rows[0];
}

async function resultCount(raceId: string): Promise<number> {
  return Number((await pool.query<{ count: string }>("select count(*) from race_results where race_id = $1", [raceId])).rows[0]?.count);
}

/** As if the owner had stopped renewing for longer than the lease. */
async function expireLease(raceId: string): Promise<void> {
  await pool.query("update races set lease_expires_at = statement_timestamp() - interval '1 second' where id = $1", [raceId]);
}

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

type OpenTransaction = { readonly commit: () => Promise<void> };

/**
 * Another transaction runs `statement` and stays open until `commit`, holding its locks: a
 * transition or a renewal caught in the middle, or a migration holding a table.
 */
async function openTransaction(statement: string, params: readonly unknown[] = []): Promise<OpenTransaction> {
  const client = await pool.connect();
  try {
    await client.query("begin");
    await client.query(statement, [...params]);
  } catch (error) {
    client.release(true);
    throw error;
  }
  let done = false;
  return {
    commit: async () => {
      if (done) {
        return;
      }
      done = true;
      try {
        await client.query("commit");
        client.release();
      } catch (error) {
        client.release(true);
        throw error;
      }
    },
  };
}

const holdRoom = (lobbyId: string) => openTransaction("select 1 from lobbies where id = $1 for update", [lobbyId]);
const holdRace = (raceId: string) => openTransaction("select 1 from races where id = $1 for update", [raceId]);

type Settled<Calls extends readonly (() => Promise<unknown>)[]> = { -readonly [Index in keyof Calls]: Awaited<ReturnType<Calls[Index]>> };

/**
 * Starts the calls in order while a lock is held, each until it waits on a lock, then releases
 * them together: a deterministic interleaving. The race transactions wait at most 2 s on the
 * server (SERVER_LIMITS_MS): the interleaving must complete within that (tens of milliseconds
 * locally), or the waiting call fails with 55P03.
 */
async function underLock<const Calls extends readonly (() => Promise<unknown>)[]>(held: OpenTransaction, calls: Calls): Promise<Settled<Calls>> {
  const pending: Promise<unknown>[] = [];
  try {
    for (const [index, call] of calls.entries()) {
      pending.push(call());
      await waitForBlockedQueries(index + 1);
    }
  } catch (error) {
    // The calls already started settle before the failure is reported, never unhandled.
    await held.commit();
    await Promise.allSettled(pending);
    throw error;
  }
  await held.commit();
  // Promise.all keeps the order of the calls, so each result has its call's type.
  return (await Promise.all(pending)) as Settled<Calls>;
}

/**
 * Starts `waiting` until it waits on a lock that `held` keeps, runs `during` to its end, then
 * commits `held`: what a call that does not wait sees while another one is stuck. The same
 * 2 s limit as `underLock` applies.
 */
async function meanwhile<Waiting, During>(held: OpenTransaction, waiting: () => Promise<Waiting>, during: () => Promise<During>): Promise<[Waiting, During]> {
  const pending = waiting();
  let result: During;
  try {
    await waitForBlockedQueries(1);
    result = await during();
  } catch (error) {
    await held.commit();
    await Promise.allSettled([pending]);
    throw error;
  }
  await held.commit();
  return [await pending, result];
}

const underRoomLock = async <const Calls extends readonly (() => Promise<unknown>)[]>(lobbyId: string, calls: Calls) => underLock(await holdRoom(lobbyId), calls);

/** The constraint a statement violated (or the error code without one), or "accepted". */
async function violationOf(statement: () => Promise<unknown>): Promise<string> {
  try {
    await statement();
    return "accepted";
  } catch (error) {
    // Drizzle wraps pg's error in `cause`.
    let current: unknown = error;
    for (let depth = 0; depth < 5 && typeof current === "object" && current !== null; depth += 1) {
      if ("constraint" in current && typeof current.constraint === "string") {
        return current.constraint;
      }
      if ("code" in current && typeof current.code === "string" && /^[0-9A-Z]{5}$/.test(current.code)) {
        return current.code;
      }
      current = "cause" in current ? current.cause : undefined;
    }
    throw error;
  }
}

const NO_RECOVERY = { rooms: [], orphans: 0, remaining: 0 };
const recovered = (rooms: string[], orphans = 0) => ({ rooms, orphans, remaining: 0 });
const WON = { won: true, alreadyDone: false };
const REPLAYED = { won: true, alreadyDone: true };

describe("startRace", () => {
  it("freezes the race, its participants and a lease, and moves the room to COUNTDOWN", async () => {
    const { lobbyId, hostId } = await room("ABCDEF", ["Bea", "Cyd"]);
    const spectator = await account("Spectatrice");
    await joinRoomByCode(db, { accountId: spectator, code: code("ABCDEF"), role: "spectator" });
    const before = await lobbyOf(lobbyId);
    const result = await started(hostId);
    expect(result.entrants.map((entrant) => [entrant.ordinal, entrant.displayName])).toEqual([
      [1, "Hôte"],
      [2, "Bea"],
      [3, "Cyd"],
    ]);
    expect(result.race).toMatchObject({ ownerId: OWNER_A, ownerEpoch: 1, roundNo: 1 });
    const leaseSeconds = (result.race.leaseExpiresAt.getTime() - result.race.countdownAt.getTime()) / 1000;
    expect(leaseSeconds).toBeCloseTo(30, 0);
    expect(await lobbyOf(lobbyId)).toEqual({ phase: "countdown", current_race_id: result.race.raceId, revision: (before?.revision ?? 0) + 1 });
    // From the countdown on, nobody new may enter (SALLE-09).
    expect(await joinRoomByCode(db, { accountId: await account("Tard"), code: code("ABCDEF"), role: "participant" })).toMatchObject({
      ok: false,
      error: "ROOM_NOT_ADMITTING",
    });
  });

  it("refuses a member who does not host, an account in no room, a room not waiting, and the engine's refusal", async () => {
    const { hostId } = await room("ABCDEF", ["Bea"]);
    const bea = (await pool.query<{ account_id: string }>("select account_id from lobby_members where display_name = 'Bea'")).rows[0]!.account_id;
    const outsider = await account("Dehors");
    const call = (accountId: string) => startRace(db, { accountId, ownerId: OWNER_A, text: "x", config: {}, rulesVersion: 1, refuseStart: atLeastTwo });
    expect(await call(bea)).toEqual({ ok: false, error: "NOT_HOST" });
    expect(await call(outsider)).toEqual({ ok: false, error: "NOT_IN_A_ROOM" });
    await started(hostId);
    expect(await call(hostId)).toEqual({ ok: false, error: "ROOM_NOT_WAITING" });

    const alone = await room("BCDEFG", []);
    expect(await call(alone.hostId)).toEqual({ ok: false, error: "NOT_ENOUGH_PARTICIPANTS" });
    expect(await pool.query("select 1 from races where lobby_id = $1", [alone.lobbyId])).toMatchObject({ rowCount: 0 });
  });

  it("creates one race when the host starts twice at the same moment", async () => {
    const { lobbyId, hostId } = await room("ABCDEF");
    const call = () => startRace(db, { accountId: hostId, ownerId: OWNER_A, text: "x", config: {}, rulesVersion: 1, refuseStart: atLeastTwo });
    const [first, second] = await underRoomLock(lobbyId, [call, call]);
    expect([first.ok, second.ok].sort()).toEqual([false, true]);
    expect([first, second].find((result) => !result.ok)).toEqual({ ok: false, error: "ROOM_NOT_WAITING" });
    expect(await pool.query("select 1 from races where lobby_id = $1", [lobbyId])).toMatchObject({ rowCount: 1 });
  });

  it("freezes a join that committed before the start, and refuses one queued behind it", async () => {
    const { lobbyId, hostId } = await room("ABCDEF");
    const early = await account("Tôt");
    const late = await account("Tard");
    const [joinedEarly, start, joinedLate] = await underRoomLock(lobbyId, [
      () => joinRoomByCode(db, { accountId: early, code: code("ABCDEF"), role: "participant" }),
      () => startRace(db, { accountId: hostId, ownerId: OWNER_A, text: "x", config: {}, rulesVersion: 1, refuseStart: atLeastTwo }),
      () => joinRoomByCode(db, { accountId: late, code: code("ABCDEF"), role: "participant" }),
    ]);
    expect(joinedEarly).toMatchObject({ ok: true });
    expect(start).toMatchObject({ ok: true });
    expect(start.ok ? start.entrants.map((entrant) => entrant.displayName) : []).toContain("Tôt");
    expect(joinedLate).toMatchObject({ ok: false, error: "ROOM_NOT_ADMITTING" });
  });
});

describe("race transitions, guarded by race, phase and owner", () => {
  it("starts racing once, for the owner of the current generation only", async () => {
    const { lobbyId, hostId } = await room("ABCDEF");
    const { race } = await started(hostId);
    expect(await beginRacing(db, { ...race, ownerId: OWNER_B })).toEqual({ won: false });
    expect(await beginRacing(db, { ...race, ownerEpoch: 2 })).toEqual({ won: false });
    expect(await beginRacing(db, race)).toEqual(WON);
    // A retry after a lost answer learns that its race already runs; nobody else does.
    expect(await beginRacing(db, race)).toEqual(REPLAYED);
    expect(await beginRacing(db, { ...race, ownerId: OWNER_B })).toEqual({ won: false });
    expect(await lobbyOf(lobbyId)).toMatchObject({ phase: "racing" });
  });

  it("finalises once, with exactly one result per entrant, and moves the room to RESULTS", async () => {
    const { lobbyId, hostId } = await room("ABCDEF", ["Bea", "Cyd"]);
    const { race, entrants } = await started(hostId);
    await beginRacing(db, race);
    const revision = (await lobbyOf(lobbyId))?.revision ?? 0;
    await expect(finalizeRace(db, race, resultsFor(entrants).slice(1))).rejects.toThrow("exactly one result");
    expect(await raceOf(race.raceId)).toMatchObject({ state: "racing" });
    expect(await finalizeRace(db, race, resultsFor(entrants))).toEqual(WON);
    expect(await resultCount(race.raceId)).toBe(3);
    expect(await lobbyOf(lobbyId)).toMatchObject({ phase: "results", revision: revision + 1 });
    // The engine's exact values come back as they were written.
    const [stored] = (await pool.query<{ accuracy: number }>("select accuracy from race_results where race_id = $1 and rank = 1", [race.raceId])).rows;
    expect(stored?.accuracy).toBe(94.44444444444444);
  });

  it("finalises a race that ends during its countdown (everyone abandoned)", async () => {
    const { lobbyId, hostId } = await room("ABCDEF");
    const { race, entrants } = await started(hostId);
    const abandoned = entrants.map((entrant, index): RaceResultRow => ({
      entrantId: entrant.entrantId,
      outcome: "abandoned",
      abandonmentReason: "voluntary",
      rank: index + 1,
      elapsedMs: 0,
      position: 0,
      length: 17,
      correctInputs: 0,
      totalInputs: 0,
      netWpm: 0,
      rawWpm: 0,
      accuracy: 0,
    }));
    expect(await finalizeRace(db, race, abandoned)).toEqual(WON);
    expect(await lobbyOf(lobbyId)).toMatchObject({ phase: "results" });
  });

  it("tells a retry of the same owner that its results are saved, and refuses everyone else", async () => {
    const { lobbyId, hostId } = await room("ABCDEF");
    const { race, entrants } = await started(hostId);
    await beginRacing(db, race);
    await finalizeRace(db, race, resultsFor(entrants));
    // The first answer was lost after the commit: the owner retries.
    expect(await finalizeRace(db, race, resultsFor(entrants))).toEqual(REPLAYED);
    expect(await finalizeRace(db, { ...race, ownerId: OWNER_B }, resultsFor(entrants))).toEqual({ won: false });
    expect(await finalizeRace(db, { ...race, ownerEpoch: 2 }, resultsFor(entrants))).toEqual({ won: false });
    expect(await resultCount(race.raceId)).toBe(2);
    // An interruption after it loses to the saved results, and says so.
    expect(await interruptOwnRace(db, race, "save_failed")).toEqual({ won: false, resultsSaved: true });
    // Still saved once the room has moved on to its next race.
    await pool.query("update lobbies set phase = 'waiting' where id = $1", [lobbyId]);
    await started(hostId);
    expect(await finalizeRace(db, race, resultsFor(entrants))).toEqual(REPLAYED);
    // A finished race missing results was not saved by a finalisation: never reported as saved.
    await pool.query("delete from race_results where race_id = $1 and rank = 2", [race.raceId]);
    expect(await finalizeRace(db, race, resultsFor(entrants))).toEqual({ won: false });
  });

  it("writes nothing for a race that a newer race replaced", async () => {
    const { lobbyId, hostId } = await room("ABCDEF");
    const first = await started(hostId);
    await interruptOwnRace(db, first.race, "server_stopped");
    const second = await started(hostId);
    expect(second.race.roundNo).toBe(2);
    expect(await finalizeRace(db, first.race, resultsFor(first.entrants))).toEqual({ won: false });
    expect(await resultCount(first.race.raceId)).toBe(0);
    expect(await lobbyOf(lobbyId)).toMatchObject({ phase: "countdown", current_race_id: second.race.raceId });
  });
});

describe("closing the room while the race runs", () => {
  it("interrupts the race when the host leaves first, and the later transition changes nothing", async () => {
    const { lobbyId, hostId } = await room("ABCDEF");
    const { race } = await started(hostId);
    const [left, begun] = await underRoomLock(lobbyId, [() => leaveCurrentRoom(db, hostId), () => beginRacing(db, race)]);
    expect(left).toMatchObject({ closed: true });
    expect(begun).toEqual({ won: false });
    expect(await raceOf(race.raceId)).toMatchObject({ state: "interrupted", interruption_reason: "room_closed" });
    expect(await lobbyOf(lobbyId)).toMatchObject({ phase: "closed", current_race_id: race.raceId });
  });

  it("keeps the results when the finalisation wins, and creates none when the closing wins", async () => {
    const finishedFirst = await room("ABCDEF");
    const one = await started(finishedFirst.hostId);
    await beginRacing(db, one.race);
    const [finalised] = await underRoomLock(finishedFirst.lobbyId, [
      () => finalizeRace(db, one.race, resultsFor(one.entrants)),
      () => leaveCurrentRoom(db, finishedFirst.hostId),
    ]);
    expect(finalised).toEqual(WON);
    expect(await raceOf(one.race.raceId)).toMatchObject({ state: "finished" });
    expect(await resultCount(one.race.raceId)).toBe(2);

    const closedFirst = await room("BCDEFG");
    const two = await started(closedFirst.hostId);
    await beginRacing(db, two.race);
    const [, lateFinal] = await underRoomLock(closedFirst.lobbyId, [
      () => leaveCurrentRoom(db, closedFirst.hostId),
      () => finalizeRace(db, two.race, resultsFor(two.entrants)),
    ]);
    expect(lateFinal).toEqual({ won: false });
    expect(await raceOf(two.race.raceId)).toMatchObject({ state: "interrupted", interruption_reason: "room_closed" });
    expect(await resultCount(two.race.raceId)).toBe(0);
  });

  it("tells a retry after the host left that the results, or the interruption, were saved", async () => {
    const finished = await room("ABCDEF");
    const one = await started(finished.hostId);
    await beginRacing(db, one.race);
    // The finalisation committed but its answer was lost; then the host left.
    await finalizeRace(db, one.race, resultsFor(one.entrants));
    expect(await leaveCurrentRoom(db, finished.hostId)).toMatchObject({ closed: true });
    expect(await finalizeRace(db, one.race, resultsFor(one.entrants))).toEqual(REPLAYED);
    expect(await interruptOwnRace(db, one.race, "save_failed")).toEqual({ won: false, resultsSaved: true });
    expect(await raceOf(one.race.raceId)).toMatchObject({ state: "finished", owner_epoch: 1 });

    const stopped = await room("BCDEFG");
    const two = await started(stopped.hostId);
    await interruptOwnRace(db, two.race, "server_stopped");
    expect(await leaveCurrentRoom(db, stopped.hostId)).toMatchObject({ closed: true });
    expect(await interruptOwnRace(db, two.race, "server_stopped")).toEqual(REPLAYED);
    expect(await raceOf(two.race.raceId)).toMatchObject({ state: "interrupted", interruption_reason: "server_stopped" });
  });

  it("ends the race when a release without races closed its room during an overlap", async () => {
    // As the release before races does: the room closes without touching its race.
    const closeLikeBefore = async (lobbyId: string) => {
      await pool.query("update lobby_members set left_at = statement_timestamp() where lobby_id = $1", [lobbyId]);
      await pool.query("update lobbies set phase = 'closed', closed_at = statement_timestamp() where id = $1", [lobbyId]);
    };
    const one = await room("ABCDEF");
    const first = await started(one.hostId);
    await beginRacing(db, first.race);
    await closeLikeBefore(one.lobbyId);
    expect(await finalizeRace(db, first.race, resultsFor(first.entrants))).toEqual({ won: false });
    expect(await raceOf(first.race.raceId)).toMatchObject({ state: "interrupted", interruption_reason: "room_closed", owner_epoch: 2 });
    expect(await resultCount(first.race.raceId)).toBe(0);
    expect(await renewRaceLease(db, first.race)).toEqual({ renewed: false });

    const two = await room("BCDEFG");
    const second = await started(two.hostId);
    await closeLikeBefore(two.lobbyId);
    expect(await beginRacing(db, second.race)).toEqual({ won: false });
    expect(await raceOf(second.race.raceId)).toMatchObject({ state: "interrupted", interruption_reason: "room_closed" });

    const three = await room("CDEFGH");
    const third = await started(three.hostId);
    await closeLikeBefore(three.lobbyId);
    expect(await interruptOwnRace(db, third.race, "server_stopped")).toEqual({ won: false, resultsSaved: false });
    expect(await raceOf(third.race.raceId)).toMatchObject({ state: "interrupted", interruption_reason: "room_closed" });
  });

  it("still writes the result of a participant who left during the race", async () => {
    const { hostId, memberIds } = await room("ABCDEF", ["Bea"]);
    const { race, entrants } = await started(hostId);
    await beginRacing(db, race);
    const bea = (await pool.query<{ account_id: string }>("select account_id from lobby_members where id = $1", [memberIds[0]])).rows[0]!.account_id;
    await leaveCurrentRoom(db, bea);
    // Free again, Bea joins another room meanwhile.
    await room("BCDEFG", []);
    expect(await joinRoomByCode(db, { accountId: bea, code: code("BCDEFG"), role: "participant" })).toMatchObject({ ok: true });
    expect(await finalizeRace(db, race, resultsFor(entrants))).toEqual(WON);
    const rows = await pool.query("select 1 from race_results r join race_entrants e on e.id = r.entrant_id where e.account_id = $1", [bea]);
    expect(rows.rowCount).toBe(1);
  });
});

describe("ownership lease (ADR-0004)", () => {
  it("is renewed by its owner and never taken over while it runs", async () => {
    const { lobbyId, hostId } = await room("ABCDEF");
    const { race } = await started(hostId);
    const renewal = await renewRaceLease(db, race);
    expect(renewal.renewed).toBe(true);
    expect(await renewRaceLease(db, { ...race, ownerId: OWNER_B })).toEqual({ renewed: false });
    expect(await recoverAbandonedRaces(db)).toEqual(NO_RECOVERY);
    expect(await lobbyOf(lobbyId)).toMatchObject({ phase: "countdown" });
  });

  it("A loses the database, its lease expires, B takes over, then A can neither renew nor write", async () => {
    const { lobbyId, hostId } = await room("ABCDEF");
    const { race, entrants } = await started(hostId, OWNER_A);
    await beginRacing(db, race);
    // A stops renewing (no database); the lease passes on the database clock.
    await expireLease(race.raceId);
    expect(await recoverAbandonedRaces(db)).toEqual(recovered([lobbyId]));
    expect(await raceOf(race.raceId)).toMatchObject({ state: "interrupted", interruption_reason: "owner_lost", owner_epoch: 2 });
    expect(await lobbyOf(lobbyId)).toMatchObject({ phase: "waiting", current_race_id: race.raceId });
    // A comes back: every write of the old generation misses.
    expect(await renewRaceLease(db, race)).toEqual({ renewed: false });
    expect(await beginRacing(db, race)).toEqual({ won: false });
    expect(await finalizeRace(db, race, resultsFor(entrants))).toEqual({ won: false });
    expect(await interruptOwnRace(db, race, "server_stopped")).toEqual({ won: false, resultsSaved: false });
    expect(await resultCount(race.raceId)).toBe(0);
  });

  it("is renewed after expiry when nobody took the race over", async () => {
    const { hostId } = await room("ABCDEF");
    const { race } = await started(hostId);
    await expireLease(race.raceId);
    expect((await renewRaceLease(db, race)).renewed).toBe(true);
    expect(await recoverAbandonedRaces(db)).toEqual(NO_RECOVERY);
  });

  it("skips a race whose renewal is under way, and leaves it once renewed", async () => {
    const { lobbyId, hostId } = await room("ABCDEF");
    const { race } = await started(hostId);
    await expireLease(race.raceId);
    const renewal = await openTransaction("update races set lease_expires_at = statement_timestamp() + interval '30 seconds' where id = $1", [race.raceId]);
    try {
      expect(await recoverAbandonedRaces(db)).toEqual({ rooms: [], orphans: 0, remaining: 1 });
    } finally {
      await renewal.commit();
    }
    expect(await recoverAbandonedRaces(db)).toEqual(NO_RECOVERY);
    expect(await raceOf(race.raceId)).toMatchObject({ state: "countdown", owner_epoch: 1 });
    expect(await lobbyOf(lobbyId)).toMatchObject({ phase: "countdown" });
  });

  it("skips a room another transaction holds instead of waiting for it, and recovers it later", async () => {
    const { lobbyId, hostId } = await room("ABCDEF");
    const { race } = await started(hostId);
    await expireLease(race.raceId);
    const held = await holdRoom(lobbyId);
    try {
      expect(await recoverAbandonedRaces(db)).toEqual({ rooms: [], orphans: 0, remaining: 1 });
      expect(await recoverAbandonedRaces(db, { lobbyId })).toEqual({ rooms: [], orphans: 0, remaining: 1 });
    } finally {
      await held.commit();
    }
    expect(await recoverAbandonedRaces(db)).toEqual(recovered([lobbyId]));
  });

  it("ends its wait for a table lock on the server, before the client gives up", async () => {
    const { lobbyId, hostId } = await room("ABCDEF");
    const { race } = await started(hostId);
    await expireLease(race.raceId);
    // As a migration does: the whole table is locked.
    const migration = await openTransaction("lock table races in access exclusive mode");
    // Without a server-side limit the recovery would wait: the lock is released after 5 s so
    // that such a wait fails this test instead of hanging it.
    const deadline = setTimeout(() => void migration.commit(), 5_000);
    try {
      // lock_not_available, before the pool's 5 s client timeout.
      expect(await violationOf(() => recoverAbandonedRaces(db))).toBe("55P03");
    } finally {
      clearTimeout(deadline);
      await migration.commit();
    }
    expect(await lobbyOf(lobbyId)).toMatchObject({ phase: "countdown" });
    expect(await recoverAbandonedRaces(db)).toEqual(recovered([lobbyId]));
  });

  it("lets one of two processes take each expired race over, and only one", async () => {
    const rooms = [await room("ABCDEF"), await room("BCDEFG"), await room("CDEFGH")];
    const running = await Promise.all(rooms.map(({ hostId }) => started(hostId)));
    for (const { race } of running) {
      await expireLease(race.raceId);
    }
    const [first, second] = await Promise.all([recoverAbandonedRaces(db), recoverAbandonedRaces(db)]);
    expect([...first.rooms, ...second.rooms].sort()).toEqual(rooms.map(({ lobbyId }) => lobbyId).sort());
    for (const { race } of running) {
      expect(await raceOf(race.raceId)).toMatchObject({ state: "interrupted", owner_epoch: 2 });
    }
  });

  it("keeps the results when the owner finalises first, and creates none when the takeover is first", async () => {
    const finishedFirst = await room("ABCDEF");
    const one = await started(finishedFirst.hostId);
    await beginRacing(db, one.race);
    await expireLease(one.race.raceId);
    // The finalisation holds the room and waits for the race row: the takeover skips the room.
    const [finalised, skipped] = await meanwhile(
      await holdRace(one.race.raceId),
      () => finalizeRace(db, one.race, resultsFor(one.entrants)),
      () => recoverAbandonedRaces(db),
    );
    expect(skipped).toEqual({ rooms: [], orphans: 0, remaining: 1 });
    expect(finalised).toEqual(WON);
    expect(await resultCount(one.race.raceId)).toBe(2);

    const takenFirst = await room("BCDEFG");
    const two = await started(takenFirst.hostId);
    await beginRacing(db, two.race);
    await expireLease(two.race.raceId);
    // A SHARE lock on the table lets the takeover lock the room and the race, then holds its
    // update; the finalisation then waits for the room.
    const [taken, lateFinal] = await underLock(await openTransaction("lock table races in share mode"), [
      () => recoverAbandonedRaces(db),
      () => finalizeRace(db, two.race, resultsFor(two.entrants)),
    ]);
    expect(taken).toEqual(recovered([takenFirst.lobbyId]));
    expect(lateFinal).toEqual({ won: false });
    expect(await resultCount(two.race.raceId)).toBe(0);
  });

  it("recovers one room on demand, and leaves the others to their own owners", async () => {
    const target = await room("ABCDEF");
    const other = await room("BCDEFG");
    const a = await started(target.hostId, OWNER_A);
    const b = await started(other.hostId, OWNER_B);
    await expireLease(a.race.raceId);
    await expireLease(b.race.raceId);
    expect(await recoverAbandonedRaces(db, { lobbyId: target.lobbyId })).toEqual(recovered([target.lobbyId]));
    expect(await raceOf(b.race.raceId)).toMatchObject({ state: "countdown" });
  });

  it("interrupts at boot an expired race whose room no longer points to it, never one whose lease runs", async () => {
    const { lobbyId, hostId } = await room("ABCDEF");
    const { race } = await started(hostId);
    // As an older release did: the room closed without touching its race.
    await pool.query("update lobby_members set left_at = statement_timestamp() where lobby_id = $1", [lobbyId]);
    await pool.query("update lobbies set phase = 'closed', closed_at = statement_timestamp() where id = $1", [lobbyId]);
    expect(await recoverAbandonedRaces(db)).toEqual(NO_RECOVERY);
    expect(await raceOf(race.raceId)).toMatchObject({ state: "countdown", owner_epoch: 1 });
    await expireLease(race.raceId);
    // Recovering one room never sweeps the others.
    expect(await recoverAbandonedRaces(db, { lobbyId })).toEqual(NO_RECOVERY);
    expect(await recoverAbandonedRaces(db)).toEqual(recovered([], 1));
    expect(await raceOf(race.raceId)).toMatchObject({ state: "interrupted", interruption_reason: "owner_lost" });
  });

  it("lets its owner interrupt its own race when its process stops or its results cannot be saved", async () => {
    const stopped = await room("ABCDEF");
    const one = await started(stopped.hostId);
    expect(await interruptOwnRace(db, { ...one.race, ownerId: OWNER_B }, "server_stopped")).toEqual({ won: false, resultsSaved: false });
    expect(await interruptOwnRace(db, one.race, "server_stopped")).toEqual(WON);
    // A retry after a lost answer learns that its interruption committed; another reason does not.
    expect(await interruptOwnRace(db, one.race, "server_stopped")).toEqual(REPLAYED);
    expect(await interruptOwnRace(db, one.race, "save_failed")).toEqual({ won: false, resultsSaved: false });
    expect(await raceOf(one.race.raceId)).toMatchObject({ state: "interrupted", interruption_reason: "server_stopped" });
    expect(await lobbyOf(stopped.lobbyId)).toMatchObject({ phase: "waiting" });

    const unsaved = await room("BCDEFG");
    const two = await started(unsaved.hostId);
    await beginRacing(db, two.race);
    expect(await interruptOwnRace(db, two.race, "save_failed")).toEqual(WON);
    expect(await raceOf(two.race.raceId)).toMatchObject({ state: "interrupted", interruption_reason: "save_failed" });
    expect(await resultCount(two.race.raceId)).toBe(0);
  });
});

describe("transaction limits and isolation", () => {
  it("ends a long lock wait on the server, so a client with the production timeout stays clean", async () => {
    // One connection with the application's client timeout: a later query reuses it.
    const appPool = new pg.Pool({ connectionString: database.url, max: 1, query_timeout: QUERY_TIMEOUT_MS });
    try {
      const app = createDatabase(appPool);
      const { hostId } = await room("ABCDEF");
      const { race, entrants } = await started(hostId);
      await beginRacing(app, race);
      // A transition stuck far longer than the client timeout and its rollback (2 x 5 s).
      const stuck = await holdRace(race.raceId);
      const deadline = setTimeout(() => void stuck.commit(), 12_000);
      try {
        expect(await violationOf(() => finalizeRace(app, race, resultsFor(entrants)))).toBe("55P03");
      } finally {
        clearTimeout(deadline);
        await stuck.commit();
      }
      // No transaction was left open on the connection: a new statement starts its own.
      const [state] = (await appPool.query<{ fresh: boolean }>("select now() = statement_timestamp() as fresh")).rows;
      expect(state?.fresh).toBe(true);
      expect(await raceOf(race.raceId)).toMatchObject({ state: "racing" });
      expect(await resultCount(race.raceId)).toBe(0);
      expect(await finalizeRace(app, race, resultsFor(entrants))).toEqual(WON);
    } finally {
      await appPool.end();
    }
  });

  it("keeps the same winner when the server's default isolation is SERIALIZABLE", async () => {
    const strictPool = new pg.Pool({ connectionString: database.url, max: 4, options: "-c default_transaction_isolation=serializable" });
    try {
      const strict = createDatabase(strictPool);
      const { lobbyId, hostId } = await room("ABCDEF");
      const { race, entrants } = await started(hostId);
      await beginRacing(strict, race);
      // Each transition sets READ COMMITTED itself: the late one sees the closing and loses
      // instead of failing with a serialisation error.
      const [left, lateFinal] = await underRoomLock(lobbyId, [
        () => leaveCurrentRoom(strict, hostId),
        () => finalizeRace(strict, race, resultsFor(entrants)),
      ]);
      expect(left).toMatchObject({ closed: true });
      expect(lateFinal).toEqual({ won: false });
    } finally {
      await strictPool.end();
    }
  });
});

describe("history and constraints", () => {
  it("keeps races, entrants and results when the room is purged", async () => {
    const { lobbyId, hostId } = await room("ABCDEF");
    const { race, entrants } = await started(hostId);
    await beginRacing(db, race);
    await finalizeRace(db, race, resultsFor(entrants));
    await pool.query("update lobbies set host_member_id = null where id = $1", [lobbyId]);
    await pool.query("delete from lobbies where id = $1", [lobbyId]);
    expect(await raceOf(race.raceId)).toMatchObject({ state: "finished", lobby_id: null });
    expect(await resultCount(race.raceId)).toBe(2);
    const history = await pool.query("select 1 from race_entrants e join race_results r on r.entrant_id = e.id where e.account_id = $1 and e.member_id is null", [hostId]);
    expect(history.rowCount).toBe(1);
  });

  it("refuses every row that contradicts the model, each by its own constraint", async () => {
    const { lobbyId, hostId } = await room("ABCDEF");
    const { race, entrants } = await started(hostId);
    await beginRacing(db, race);
    const elsewhere = await started((await room("BCDEFG")).hostId);
    const stranger = await account("Inconnu");
    const leaving = await account("Partant");
    const [first, second] = entrants;
    if (first === undefined || second === undefined) {
      throw new Error("two entrants expected");
    }
    const raceId = race.raceId;
    const random = "00000000-0000-4000-8000-000000000999";
    const updateRace = (assignments: string) => () => pool.query(`update races set ${assignments} where id = $1`, [raceId]);
    const copyRace = (lobby: string) => () =>
      pool.query(
        `insert into races (lobby_id, round_no, rules_version, text_snapshot, config_snapshot, countdown_at, owner_id, lease_expires_at)
         select ${lobby}, round_no, rules_version, text_snapshot, config_snapshot, countdown_at, owner_id, lease_expires_at from races where id = $1`,
        [raceId],
      );
    const entrant = (values: { race?: string; member?: string | null; accountId?: string; ordinal: number; name?: string }) => () =>
      pool.query("insert into race_entrants (race_id, member_id, account_id, ordinal, display_name_snapshot) values ($1, $2, $3, $4, $5)", [
        values.race ?? raceId,
        values.member ?? null,
        values.accountId ?? stranger,
        values.ordinal,
        values.name ?? "Inconnu",
      ]);
    const result = (change: Partial<Record<keyof RaceResultRow, unknown>>) => () => {
      const row = { ...resultsFor([first])[0], ...change };
      return pool.query(
        "insert into race_results (race_id, entrant_id, outcome, rank, elapsed_ms, position, length, correct_inputs, total_inputs, net_wpm, raw_wpm, accuracy, abandonment_reason) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)",
        [raceId, row.entrantId, row.outcome, row.rank, row.elapsedMs, row.position, row.length, row.correctInputs, row.totalInputs, row.netWpm, row.rawWpm, row.accuracy, row.abandonmentReason ?? null],
      );
    };
    // The second entrant's result is in place, for the duplicates below.
    await result({ entrantId: second.entrantId, rank: 2 })();
    await entrant({ accountId: leaving, ordinal: 20 })();

    const cases: [string, () => Promise<unknown>][] = [
      ["races_round_no_positive", updateRace("round_no = 0")],
      ["races_rules_version_positive", updateRace("rules_version = 0")],
      ["races_owner_epoch_positive", updateRace("owner_epoch = 0")],
      ["races_text_not_empty", updateRace("text_snapshot = ''")],
      ["races_config_is_object", updateRace("config_snapshot = '[]'::jsonb")],
      ["races_started_matches_state", updateRace("started_at = null")],
      ["races_ended_matches_state", updateRace("ended_at = started_at")],
      ["races_reason_matches_state", updateRace("interruption_reason = 'owner_lost'")],
      ["races_reason_known", updateRace("state = 'interrupted', ended_at = started_at, interruption_reason = 'lost'")],
      ["races_times_ordered", updateRace("started_at = countdown_at - interval '1 second'")],
      ["races_lobby_round_unique", copyRace("lobby_id")],
      ["races_lobby_id_lobbies_id_fk", copyRace(`'${random}'::uuid`)],
      ["race_entrants_race_ordinal_unique", entrant({ ordinal: 1 })],
      ["race_entrants_member_race_unique", entrant({ member: first.memberId, ordinal: 5 })],
      ["race_entrants_account_race_unique", entrant({ accountId: hostId, ordinal: 6 })],
      ["race_entrants_ordinal_range", entrant({ ordinal: 31 })],
      ["race_entrants_display_name_length", entrant({ ordinal: 7, name: "  " })],
      ["race_entrants_race_id_races_id_fk", entrant({ race: random, ordinal: 1 })],
      ["race_entrants_member_id_lobby_members_id_fk", entrant({ member: random, ordinal: 8 })],
      ["race_entrants_account_id_accounts_id_fk", entrant({ accountId: random, ordinal: 9 })],
      // An account with a race history cannot be deleted from under it.
      ["race_entrants_account_id_accounts_id_fk", () => pool.query("delete from accounts where id = $1", [leaving])],
      ["race_results_entrant_fk", result({ entrantId: random })],
      ["race_results_pk", result({ entrantId: second.entrantId, rank: 3 })],
      ["race_results_race_rank_unique", result({ rank: 2 })],
      ["race_results_rank_positive", result({ rank: 0 })],
      ["race_results_counts_valid", result({ elapsedMs: -1 })],
      ["race_results_counts_exact", result({ elapsedMs: 2 ** 53 })],
      ["race_results_counts_exact", result({ totalInputs: 2 ** 53 })],
      ["race_results_correct_within_total", result({ correctInputs: 19 })],
      ["race_results_finished_at_end", result({ position: 10 })],
      ["race_results_position_within_length", result({ outcome: "timed_out", position: 18 })],
      ["race_results_speeds_valid", result({ rawWpm: 1 })],
      ["race_results_speeds_valid", result({ netWpm: -1 })],
      ["race_results_speeds_valid", result({ rawWpm: Number.NaN })],
      ["race_results_speeds_valid", result({ netWpm: Number.NaN })],
      ["race_results_speeds_valid", result({ rawWpm: Number.POSITIVE_INFINITY })],
      ["race_results_accuracy_range", result({ accuracy: 101 })],
      ["race_results_accuracy_range", result({ accuracy: -0.5 })],
      ["race_results_accuracy_range", result({ accuracy: Number.NaN })],
      ["race_results_reason_matches_outcome", result({ outcome: "abandoned", position: 10 })],
      ["race_results_reason_matches_outcome", result({ abandonmentReason: "voluntary" })],
      ["race_results_reason_known", result({ outcome: "abandoned", position: 10, abandonmentReason: "bored" })],
      ["lobbies_current_race_fk", () => pool.query("update lobbies set current_race_id = $2 where id = $1", [lobbyId, elsewhere.race.raceId])],
      ["lobbies_active_phase_has_race", () => pool.query("update lobbies set current_race_id = null where id = $1", [lobbyId])],
    ];
    const refused: string[] = [];
    for (const [, violate] of cases) {
      refused.push(await violationOf(violate));
    }
    expect(refused).toEqual(cases.map(([constraint]) => constraint));

    // The engine's largest values are stored exactly: MAX_COMPUTABLE_WPM (240 000), an elapsed
    // time and counters beyond 2^31 (MAX_DURATION_MS, MAX_ENTRANT_INSERTS), all below 2^53.
    await result({ netWpm: 240_000, rawWpm: 240_000, elapsedMs: 4_102_444_800_000, correctInputs: 102_561_120_020, totalInputs: 102_561_120_020 })();
    const [stored] = await db.select().from(raceResults).where(and(eq(raceResults.raceId, raceId), eq(raceResults.entrantId, first.entrantId)));
    expect(stored).toMatchObject({ netWpm: 240_000, elapsedMs: 4_102_444_800_000, correctInputs: 102_561_120_020, totalInputs: 102_561_120_020 });
    // 2^53 - 1, the largest safe integer, is still accepted.
    const largest = await pool.query("update race_results set elapsed_ms = $2, total_inputs = $2 where race_id = $1 and entrant_id = $3", [
      raceId,
      Number.MAX_SAFE_INTEGER,
      first.entrantId,
    ]);
    expect(largest.rowCount).toBe(1);
  });
});
