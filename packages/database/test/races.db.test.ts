import { parseRoomCode, ROOM_CODE_ALPHABET, type RoomCode } from "@incision/domain";
import { eq } from "drizzle-orm";
import pg from "pg";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { createDatabase, type Database } from "../src/client";
import { runMigrations } from "../src/migrations";
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

type Settled<Calls extends readonly (() => Promise<unknown>)[]> = { -readonly [Index in keyof Calls]: Awaited<ReturnType<Calls[Index]>> };

/**
 * Starts the calls in order while the room's row is locked, each until it waits on that lock,
 * then releases them together: a deterministic interleaving.
 */
async function underRoomLock<const Calls extends readonly (() => Promise<unknown>)[]>(lobbyId: string, calls: Calls): Promise<Settled<Calls>> {
  const blocker = await pool.connect();
  let committed = false;
  try {
    await blocker.query("begin");
    await blocker.query("select 1 from lobbies where id = $1 for update", [lobbyId]);
    const pending: Promise<unknown>[] = [];
    for (const [index, call] of calls.entries()) {
      pending.push(call());
      await waitForBlockedQueries(index + 1);
    }
    await blocker.query("commit");
    committed = true;
    // Promise.all keeps the order of the calls, so each result has its call's type.
    return (await Promise.all(pending)) as Settled<Calls>;
  } finally {
    blocker.release(!committed);
  }
}

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
    expect([first?.ok, second?.ok].sort()).toEqual([false, true]);
    expect([first, second].find((result) => result?.ok === false)).toEqual({ ok: false, error: "ROOM_NOT_WAITING" });
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
    expect(start?.ok === true ? start.entrants.map((entrant) => entrant.displayName) : []).toContain("Tôt");
    expect(joinedLate).toMatchObject({ ok: false, error: "ROOM_NOT_ADMITTING" });
  });
});

describe("race transitions, guarded by race, phase and owner", () => {
  it("starts racing once, for the owner of the current generation only", async () => {
    const { lobbyId, hostId } = await room("ABCDEF");
    const { race } = await started(hostId);
    expect(await beginRacing(db, { ...race, ownerId: OWNER_B })).toEqual({ won: false });
    expect(await beginRacing(db, { ...race, ownerEpoch: 2 })).toEqual({ won: false });
    expect(await beginRacing(db, race)).toEqual({ won: true });
    expect(await beginRacing(db, race)).toEqual({ won: false });
    expect(await lobbyOf(lobbyId)).toMatchObject({ phase: "racing" });
  });

  it("finalises once, with exactly one result per entrant, and moves the room to RESULTS", async () => {
    const { lobbyId, hostId } = await room("ABCDEF", ["Bea", "Cyd"]);
    const { race, entrants } = await started(hostId);
    await beginRacing(db, race);
    const revision = (await lobbyOf(lobbyId))?.revision ?? 0;
    await expect(finalizeRace(db, race, resultsFor(entrants).slice(1))).rejects.toThrow("exactly one result");
    expect(await raceOf(race.raceId)).toMatchObject({ state: "racing" });
    expect(await finalizeRace(db, race, resultsFor(entrants))).toEqual({ won: true });
    expect(await finalizeRace(db, race, resultsFor(entrants))).toEqual({ won: false });
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
    expect(await finalizeRace(db, race, abandoned)).toEqual({ won: true });
    expect(await lobbyOf(lobbyId)).toMatchObject({ phase: "results" });
  });

  it("writes nothing for a race that a newer race replaced", async () => {
    const { lobbyId, hostId } = await room("ABCDEF");
    const first = await started(hostId);
    await interruptOwnRace(db, first.race);
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
    expect(finalised).toEqual({ won: true });
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

  it("still writes the result of a participant who left during the race", async () => {
    const { hostId, memberIds } = await room("ABCDEF", ["Bea"]);
    const { race, entrants } = await started(hostId);
    await beginRacing(db, race);
    const bea = (await pool.query<{ account_id: string }>("select account_id from lobby_members where id = $1", [memberIds[0]])).rows[0]!.account_id;
    await leaveCurrentRoom(db, bea);
    // Free again, Bea joins another room meanwhile.
    await room("BCDEFG", []);
    expect(await joinRoomByCode(db, { accountId: bea, code: code("BCDEFG"), role: "participant" })).toMatchObject({ ok: true });
    expect(await finalizeRace(db, race, resultsFor(entrants))).toEqual({ won: true });
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
    expect(await recoverAbandonedRaces(db)).toEqual([]);
    expect(await lobbyOf(lobbyId)).toMatchObject({ phase: "countdown" });
  });

  it("A loses the database, its lease expires, B takes over, then A can neither renew nor write", async () => {
    const { lobbyId, hostId } = await room("ABCDEF");
    const { race, entrants } = await started(hostId, OWNER_A);
    await beginRacing(db, race);
    // A stops renewing (no database); the lease passes on the database clock.
    await expireLease(race.raceId);
    expect(await recoverAbandonedRaces(db)).toEqual([lobbyId]);
    expect(await raceOf(race.raceId)).toMatchObject({ state: "interrupted", interruption_reason: "owner_lost", owner_epoch: 2 });
    expect(await lobbyOf(lobbyId)).toMatchObject({ phase: "waiting", current_race_id: race.raceId });
    // A comes back: every write of the old generation misses.
    expect(await renewRaceLease(db, race)).toEqual({ renewed: false });
    expect(await finalizeRace(db, race, resultsFor(entrants))).toEqual({ won: false });
    expect(await interruptOwnRace(db, race)).toEqual({ won: false });
    expect(await resultCount(race.raceId)).toBe(0);
  });

  it("is renewed after expiry when nobody took the race over", async () => {
    const { hostId } = await room("ABCDEF");
    const { race } = await started(hostId);
    await expireLease(race.raceId);
    expect((await renewRaceLease(db, race)).renewed).toBe(true);
    expect(await recoverAbandonedRaces(db)).toEqual([]);
  });

  it("lets one of two processes take an expired race over, and only one", async () => {
    const { lobbyId, hostId } = await room("ABCDEF");
    const { race } = await started(hostId);
    await expireLease(race.raceId);
    const [first, second] = await underRoomLock(lobbyId, [() => recoverAbandonedRaces(db), () => recoverAbandonedRaces(db)]);
    expect([...(first ?? []), ...(second ?? [])]).toEqual([lobbyId]);
    expect(await raceOf(race.raceId)).toMatchObject({ owner_epoch: 2 });
  });

  it("keeps the results when the owner finalises first, and creates none when the takeover is first", async () => {
    const finishedFirst = await room("ABCDEF");
    const one = await started(finishedFirst.hostId);
    await beginRacing(db, one.race);
    await expireLease(one.race.raceId);
    const [finalised, recovered] = await underRoomLock(finishedFirst.lobbyId, [
      () => finalizeRace(db, one.race, resultsFor(one.entrants)),
      () => recoverAbandonedRaces(db),
    ]);
    expect(finalised).toEqual({ won: true });
    expect(recovered).toEqual([]);
    expect(await resultCount(one.race.raceId)).toBe(2);

    const takenFirst = await room("BCDEFG");
    const two = await started(takenFirst.hostId);
    await beginRacing(db, two.race);
    await expireLease(two.race.raceId);
    const [taken, lateFinal] = await underRoomLock(takenFirst.lobbyId, [
      () => recoverAbandonedRaces(db),
      () => finalizeRace(db, two.race, resultsFor(two.entrants)),
    ]);
    expect(taken).toEqual([takenFirst.lobbyId]);
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
    expect(await recoverAbandonedRaces(db, { lobbyId: target.lobbyId })).toEqual([target.lobbyId]);
    expect(await raceOf(b.race.raceId)).toMatchObject({ state: "countdown" });
  });

  it("interrupts at boot an expired race whose room no longer points to it", async () => {
    const { lobbyId, hostId } = await room("ABCDEF");
    const { race } = await started(hostId);
    // As an older release did: the room closed without touching its race.
    await pool.query("update lobby_members set left_at = statement_timestamp() where lobby_id = $1", [lobbyId]);
    await pool.query("update lobbies set phase = 'closed', closed_at = statement_timestamp() where id = $1", [lobbyId]);
    await expireLease(race.raceId);
    expect(await recoverAbandonedRaces(db)).toEqual([]);
    expect(await raceOf(race.raceId)).toMatchObject({ state: "interrupted", interruption_reason: "owner_lost" });
  });

  it("lets its owner interrupt its own race when its process stops", async () => {
    const { lobbyId, hostId } = await room("ABCDEF");
    const { race } = await started(hostId);
    expect(await interruptOwnRace(db, { ...race, ownerId: OWNER_B })).toEqual({ won: false });
    expect(await interruptOwnRace(db, race)).toEqual({ won: true });
    expect(await raceOf(race.raceId)).toMatchObject({ state: "interrupted", interruption_reason: "server_stopped" });
    expect(await lobbyOf(lobbyId)).toMatchObject({ phase: "waiting" });
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

  it("refuses results that contradict themselves and a racing room without a race", async () => {
    const { lobbyId, hostId } = await room("ABCDEF");
    const { race, entrants } = await started(hostId);
    await beginRacing(db, race);
    const [valid] = resultsFor(entrants);
    const insert = (change: Partial<RaceResultRow>) =>
      pool.query(
        "insert into race_results (race_id, entrant_id, outcome, rank, elapsed_ms, position, length, correct_inputs, total_inputs, net_wpm, raw_wpm, accuracy, abandonment_reason) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)",
        (({ entrantId, outcome, rank, elapsedMs, position, length, correctInputs, totalInputs, netWpm, rawWpm, accuracy, abandonmentReason }) => [
          race.raceId,
          entrantId,
          outcome,
          rank,
          elapsedMs,
          position,
          length,
          correctInputs,
          totalInputs,
          netWpm,
          rawWpm,
          accuracy,
          abandonmentReason ?? null,
        ])({ ...valid!, ...change }),
      );
    await expect(insert({ position: 10 })).rejects.toMatchObject({ constraint: "race_results_finished_at_end" });
    await expect(insert({ accuracy: 101 })).rejects.toMatchObject({ constraint: "race_results_accuracy_range" });
    await expect(insert({ outcome: "abandoned", position: 10 })).rejects.toMatchObject({ constraint: "race_results_reason_matches_outcome" });
    await expect(insert({ rawWpm: 1 })).rejects.toMatchObject({ constraint: "race_results_speeds_valid" });
    // The engine's largest values are stored exactly: MAX_COMPUTABLE_WPM (240 000), an elapsed
    // time and counters beyond 2^31 (MAX_DURATION_MS, MAX_ENTRANT_INSERTS), all below 2^53.
    await insert({ netWpm: 240_000, rawWpm: 240_000, elapsedMs: 4_102_444_800_000, correctInputs: 102_561_120_020, totalInputs: 102_561_120_020 });
    const [stored] = await db.select().from(raceResults).where(eq(raceResults.raceId, race.raceId));
    expect(stored).toMatchObject({ netWpm: 240_000, elapsedMs: 4_102_444_800_000, correctInputs: 102_561_120_020, totalInputs: 102_561_120_020 });
    await expect(pool.query("update lobbies set current_race_id = null where id = $1", [lobbyId])).rejects.toMatchObject({
      constraint: "lobbies_active_phase_has_race",
    });
  });
});
