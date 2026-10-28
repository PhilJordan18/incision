import { randomUUID } from "node:crypto";
import type { RoomPhase } from "@incision/domain";
import { and, asc, count, eq, exists, inArray, isNull, max, notExists, sql } from "drizzle-orm";
import type { Database } from "../client";
import { findActiveMembership } from "../rooms/membership";
import { readSettingsRevision } from "../rooms/settings";
import { firstRow } from "../rows";
import {
  ACTIVE_RACE_STATES,
  type AbandonmentReason,
  type InterruptionReason,
  lobbies,
  lobbyMembers,
  raceEntrants,
  raceResults,
  races,
} from "../schema";
import { boundedTransaction, READ_COMMITTED, type Transaction } from "../transaction";
import { endedNow, interruption } from "./interruption";
import { raceWpmSeries } from "../schema/race-wpm-series";
import { checkedResultWpmSeries, type ResultWpmSeries } from "./wpm-series";
import { checkedKeyErrors, type StoredKeyErrors } from "./key-errors";
import { raceKeyErrors } from "../schema/race-key-errors";

/**
 * Lease of a race's owner, on the database clock (ADR-0004). Another process may take a race
 * over only once this has passed without a renewal; the owner renews every 10 s.
 */
export const RACE_LEASE_MS = 30_000;
const leaseEnd = sql`statement_timestamp() + make_interval(secs => ${RACE_LEASE_MS / 1000})`;

/** An active race whose lease has passed on the database clock: another process may take it over. */
const expiredActiveRace = and(inArray(races.state, ACTIVE_RACE_STATES), sql`${races.leaseExpiresAt} <= statement_timestamp()`);

/**
 * The process running a race, the generation of its ownership and its room. It only ever comes
 * from the runtime that started the race, never from a client.
 */
export type RaceOwnership = { readonly raceId: string; readonly lobbyId: string; readonly ownerId: string; readonly ownerEpoch: number };

/**
 * A transition that lost changed nothing: someone else acted first. `alreadyDone`: an earlier
 * attempt of this same owner and generation committed, and its answer was lost (a client
 * timeout after the commit, for instance); retrying after an uncertain failure is safe.
 */
export type Transition = { readonly won: true; readonly alreadyDone: boolean } | { readonly won: false };

/** An interruption may lose to this owner's own finalisation: the results are then saved. */
export type Interruption = { readonly won: true; readonly alreadyDone: boolean } | { readonly won: false; readonly resultsSaved: boolean };

export type StartedEntrant = {
  readonly entrantId: string;
  readonly memberId: string;
  readonly accountId: string;
  readonly ordinal: number;
  readonly displayName: string;
};

/** The race as the engine is asked to create it, with the ids its rows will keep. */
export type RaceToCreate = {
  readonly raceId: string;
  readonly entrants: readonly { readonly entrantId: string; readonly kind: "human" }[];
};

export type StartRaceInput<Refusal extends string, Created> = {
  /** The account asking to start, from its session: it must host the room it occupies. */
  readonly accountId: string;
  /** This process (ADR-0004). */
  readonly ownerId: string;
  readonly text: string;
  readonly config: Readonly<Record<string, unknown>>;
  /**
   * The room whose settings the text and `config` come from (F-03.1), and their revision, read
   * before the draw: a change saved meanwhile, or a host now in another room (another tab),
   * refuses the start (SETTINGS_CHANGED), never a race on another room's or stale settings.
   */
  readonly lobbyId: string;
  readonly settingsRevision: number;
  readonly rulesVersion: number;
  /**
   * The engine's start (`createRace`, which applies `createRaceRefusal`: the start rule, then
   * the text and the settings), on the participants read under the room lock, with the race
   * and entrant ids the rows keep; never a copy of its rules here. A refusal changes nothing;
   * an exception (a programming error, `RangeError`) rolls the start back. It runs under the
   * room lock, inside the transaction and its 4 s idle limit: it must stay synchronous and pure
   * (no I/O, nothing heavy), which its type enforces for promises.
   */
  readonly create: (race: RaceToCreate) => { readonly ok: false; readonly reason: Refusal } | { readonly ok: true; readonly race: Created };
};

export type StartRaceResult<Refusal extends string, Created> =
  | {
      readonly ok: true;
      readonly race: RaceOwnership & { readonly roundNo: number; readonly countdownAt: Date; readonly leaseExpiresAt: Date };
      readonly entrants: readonly StartedEntrant[];
      /** What `create` returned: the race in memory, committed with its rows. */
      readonly created: Created;
    }
  | { readonly ok: false; readonly error: "NOT_IN_A_ROOM" | "NOT_HOST" | "ROOM_NOT_WAITING" | "SETTINGS_CHANGED" | Refusal };

/**
 * The host starts a race (COURSE-02/03): under the room lock, the room must be waiting, the
 * caller must still host it and the settings must be those the text was drawn with; the engine
 * creates the race from the participants (spectators never race), or refuses. One transaction
 * freezes the text, the configuration and the entrants, takes the lease, and moves the room to
 * COUNTDOWN, which refuses every new admission (SALLE-09). A second start finds the room in COUNTDOWN and changes nothing.
 */
export async function startRace<Refusal extends string, Created>(
  db: Database,
  input: StartRaceInput<Refusal, Created>,
): Promise<StartRaceResult<Refusal, Created>> {
  return boundedTransaction(db, async (tx): Promise<StartRaceResult<Refusal, Created>> => {
    const seen = await findActiveMembership(tx, input.accountId);
    if (seen === undefined) {
      return { ok: false, error: "NOT_IN_A_ROOM" };
    }
    const [lobby] = await tx
      .select({ id: lobbies.id, phase: lobbies.phase, hostMemberId: lobbies.hostMemberId })
      .from(lobbies)
      .where(eq(lobbies.id, seen.lobbyId))
      .for("update");
    // Read again under the lock: the account may have left, or the room closed, meanwhile.
    const current = await findActiveMembership(tx, input.accountId);
    if (lobby === undefined || current?.lobbyId !== lobby.id) {
      return { ok: false, error: "NOT_IN_A_ROOM" };
    }
    if (lobby.hostMemberId !== current.memberId) {
      return { ok: false, error: "NOT_HOST" };
    }
    if (lobby.phase !== "waiting") {
      return { ok: false, error: "ROOM_NOT_WAITING" };
    }
    // Settings change under the same lock (configureRoom), and they are this room's only.
    if (lobby.id !== input.lobbyId || (await readSettingsRevision(tx, lobby.id)) !== input.settingsRevision) {
      return { ok: false, error: "SETTINGS_CHANGED" };
    }
    const participants = await tx
      .select({ memberId: lobbyMembers.id, accountId: lobbyMembers.accountId, displayName: lobbyMembers.displayName })
      .from(lobbyMembers)
      .where(and(eq(lobbyMembers.lobbyId, lobby.id), eq(lobbyMembers.role, "participant"), isNull(lobbyMembers.leftAt)))
      .orderBy(asc(lobbyMembers.joinedAt), asc(lobbyMembers.id));
    // Ids drawn here, not by the database, so the engine creates the race with the ids the rows keep.
    const raceId = randomUUID();
    const entrants = participants.map(
      (participant, index): StartedEntrant => ({
        entrantId: randomUUID(),
        memberId: participant.memberId,
        accountId: participant.accountId,
        ordinal: index + 1,
        displayName: participant.displayName,
      }),
    );
    // Every member is an account today: guests and bots come with their own cards.
    const created = input.create({ raceId, entrants: entrants.map(({ entrantId }) => ({ entrantId, kind: "human" as const })) });
    if (!created.ok) {
      return { ok: false, error: created.reason };
    }
    const previous = firstRow(await tx.select({ value: max(races.roundNo) }).from(races).where(eq(races.lobbyId, lobby.id)));
    const race = firstRow(
      await tx
        .insert(races)
        .values({
          id: raceId,
          lobbyId: lobby.id,
          roundNo: (previous.value ?? 0) + 1,
          rulesVersion: input.rulesVersion,
          textSnapshot: input.text,
          configSnapshot: input.config,
          countdownAt: sql`statement_timestamp()`,
          ownerId: input.ownerId,
          leaseExpiresAt: leaseEnd,
        })
        .returning({
          id: races.id,
          roundNo: races.roundNo,
          ownerEpoch: races.ownerEpoch,
          countdownAt: races.countdownAt,
          leaseExpiresAt: races.leaseExpiresAt,
        }),
    );
    const inserted = await tx
      .insert(raceEntrants)
      .values(
        entrants.map((entrant) => ({
          id: entrant.entrantId,
          raceId: race.id,
          memberId: entrant.memberId,
          accountId: entrant.accountId,
          ordinal: entrant.ordinal,
          displayNameSnapshot: entrant.displayName,
        })),
      )
      .returning({ id: raceEntrants.id });
    if (inserted.length !== entrants.length) {
      throw new Error("Not every entrant was created");
    }
    await tx
      .update(lobbies)
      .set({ phase: "countdown", currentRaceId: race.id, revision: sql`${lobbies.revision} + 1` })
      .where(eq(lobbies.id, lobby.id));
    return {
      ok: true,
      race: {
        raceId: race.id,
        lobbyId: lobby.id,
        ownerId: input.ownerId,
        ownerEpoch: race.ownerEpoch,
        roundNo: race.roundNo,
        countdownAt: race.countdownAt,
        leaseExpiresAt: race.leaseExpiresAt,
      },
      entrants,
      created: created.race,
    };
  }, READ_COMMITTED);
}

/**
 * Locks the race's room by its key, provided this race is still its current one, and gives
 * its phase. Bounded on the server like every wait of a race transaction.
 */
async function lockRoom(tx: Transaction, { lobbyId, raceId }: RaceOwnership): Promise<RoomPhase | undefined> {
  const [lobby] = await tx
    .select({ phase: lobbies.phase })
    .from(lobbies)
    .where(and(eq(lobbies.id, lobbyId), eq(lobbies.currentRaceId, raceId)))
    .for("update");
  return lobby?.phase;
}

/**
 * Condition of every owner write: the same process, the same generation, an active race. A
 * takeover always ends the race, so the active state alone already refuses a late write; the
 * generation also protects a future takeover that would let a race continue, and tells a
 * retry of this owner apart from a write that lost.
 */
function ownedAndActive({ raceId, ownerId, ownerEpoch }: RaceOwnership) {
  return and(eq(races.id, raceId), eq(races.ownerId, ownerId), eq(races.ownerEpoch, ownerEpoch), inArray(races.state, ACTIVE_RACE_STATES));
}

/**
 * Whether the room is closed, in which case the owner's transition changes nothing but this:
 * a race still active there is ended as the closing would have (D-06). Only a release without
 * races leaves it active, by closing a room during a deployment overlap. A race this owner
 * ended before the closing is left as it is, so a retry still learns about it.
 */
async function endedForClosedRoom(tx: Transaction, ownership: RaceOwnership, phase: RoomPhase): Promise<boolean> {
  if (phase !== "closed") {
    return false;
  }
  await tx.update(races).set(interruption("room_closed")).where(ownedAndActive(ownership));
  return true;
}

/** Moves the room along with its race; a mismatch here means an invariant broke, so it throws. */
async function moveRoom(tx: Transaction, lobbyId: string, raceId: string, phase: "racing" | "results" | "waiting"): Promise<void> {
  const from = phase === "racing" ? ["countdown" as const] : ACTIVE_RACE_STATES;
  const moved = await tx
    .update(lobbies)
    .set({ phase, revision: sql`${lobbies.revision} + 1` })
    .where(and(eq(lobbies.id, lobbyId), eq(lobbies.currentRaceId, raceId), inArray(lobbies.phase, from)))
    .returning({ id: lobbies.id });
  if (moved.length !== 1) {
    throw new Error("The room did not follow its race's transition");
  }
}

/** The race as this owner left it, to recognise an earlier attempt that committed. */
async function raceOfOwner(tx: Transaction, { raceId, ownerId }: RaceOwnership) {
  const [race] = await tx
    .select({ state: races.state, ownerEpoch: races.ownerEpoch, reason: races.interruptionReason })
    .from(races)
    .where(and(eq(races.id, raceId), eq(races.ownerId, ownerId)));
  return race;
}

/**
 * Whether this owner and generation already finished the race with every entrant's result:
 * what a finalisation writes, all or nothing.
 */
async function savedBy(tx: Transaction, ownership: RaceOwnership): Promise<boolean> {
  const race = await raceOfOwner(tx, ownership);
  if (race?.state !== "finished" || race.ownerEpoch !== ownership.ownerEpoch) {
    return false;
  }
  const saved = firstRow(
    await tx
      .select({ entrants: count(), results: count(raceResults.entrantId) })
      .from(raceEntrants)
      .leftJoin(raceResults, and(eq(raceResults.raceId, raceEntrants.raceId), eq(raceResults.entrantId, raceEntrants.id)))
      .where(eq(raceEntrants.raceId, ownership.raceId)),
  );
  return saved.entrants === saved.results;
}

/** COUNTDOWN → RACING at the common start (COURSE-03), by the owner only: the first fenced write. */
export async function beginRacing(db: Database, ownership: RaceOwnership): Promise<Transition> {
  return boundedTransaction(db, async (tx): Promise<Transition> => {
    const phase = await lockRoom(tx, ownership);
    const started =
      phase === undefined || (await endedForClosedRoom(tx, ownership, phase))
        ? []
        : await tx
            .update(races)
            .set({ state: "racing", startedAt: sql`greatest(statement_timestamp(), ${races.countdownAt})` })
            .where(and(ownedAndActive(ownership), eq(races.state, "countdown")))
            .returning({ id: races.id });
    if (started.length === 0) {
      const race = await raceOfOwner(tx, ownership);
      const begun = race?.ownerEpoch === ownership.ownerEpoch && (race.state === "racing" || race.state === "finished");
      return begun ? { won: true, alreadyDone: true } : { won: false };
    }
    await moveRoom(tx, ownership.lobbyId, ownership.raceId, "racing");
    return { won: true, alreadyDone: false };
  }, READ_COMMITTED);
}

/** What the engine's end gives for one entrant, written as is (never recomputed in SQL). */
export type RaceResultRow = {
  /** Required: real samples, or an explicit non-live producer that did not collect them. */
  readonly wpmSeries: ResultWpmSeries;
  /** Absent for older non-live producers. The live runtime always supplies collected data. */
  readonly keyErrors?: StoredKeyErrors;
  readonly entrantId: string;
  readonly outcome: "finished" | "timed_out" | "abandoned";
  readonly rank: number;
  readonly elapsedMs: number;
  readonly position: number;
  readonly length: number;
  readonly correctInputs: number;
  readonly totalInputs: number;
  readonly netWpm: number;
  readonly rawWpm: number;
  readonly accuracy: number;
  readonly abandonmentReason?: AbandonmentReason;
};

/**
 * The race ends with its results, in one transaction with the room's move to RESULTS
 * (COURSE-09, RES-05). Only the owner of the current generation can finalise, and only once:
 * a call after an interruption or a takeover, or one for a replaced race, changes nothing. A
 * race that ends during its countdown (everyone abandoned) finalises too. Every entrant gets
 * exactly one result, or nothing is written. A retry must pass the same results, frozen at the
 * end of the race: `alreadyDone` says the earlier attempt saved them, not these.
 */
export async function finalizeRace(db: Database, ownership: RaceOwnership, results: readonly RaceResultRow[]): Promise<Transition> {
  return boundedTransaction(db, async (tx): Promise<Transition> => {
    const phase = await lockRoom(tx, ownership);
    const ended =
      phase === undefined || (await endedForClosedRoom(tx, ownership, phase))
        ? []
        : await tx
            .update(races)
            .set({ state: "finished", startedAt: sql`coalesce(${races.startedAt}, greatest(statement_timestamp(), ${races.countdownAt}))`, endedAt: endedNow })
            .where(ownedAndActive(ownership))
            .returning({ id: races.id });
    if (ended.length === 0) {
      return (await savedBy(tx, ownership)) ? { won: true, alreadyDone: true } : { won: false };
    }
    const entrants = await tx.select({ id: raceEntrants.id }).from(raceEntrants).where(eq(raceEntrants.raceId, ownership.raceId));
    if (entrants.length !== results.length) {
      throw new Error("Every entrant needs exactly one result");
    }
    // After the owner CAS: a losing/replayed attempt writes nothing and validates no new data.
    // Before either insert: malformed series rolls back the phase change too.
    const series = results.flatMap((result) => {
      const value = checkedResultWpmSeries(result.wpmSeries, result);
      return value === undefined ? [] : [{ raceId: ownership.raceId, entrantId: result.entrantId, series: value }];
    });
    const keyErrors = results.flatMap((result) => result.keyErrors === undefined ? [] : [{
      raceId: ownership.raceId, entrantId: result.entrantId, aggregate: checkedKeyErrors(result.keyErrors, result),
    }]);
    const written = await tx
      .insert(raceResults)
      .values(results.map(({ wpmSeries, keyErrors, ...result }) => {
        // The validated series belongs to its own table, not a race_results column.
        void wpmSeries;
        void keyErrors;
        return { ...result, raceId: ownership.raceId };
      }))
      .returning({ entrantId: raceResults.entrantId });
    if (written.length !== results.length) {
      throw new Error("Not every result was written");
    }
    if (series.length > 0) {
      const inserted = await tx.insert(raceWpmSeries).values(series).returning({ entrantId: raceWpmSeries.entrantId });
      if (inserted.length !== series.length) throw new Error("Not every WPM series was written");
    }
    if (keyErrors.length > 0) {
      const inserted = await tx.insert(raceKeyErrors).values(keyErrors).returning({ entrantId: raceKeyErrors.entrantId });
      if (inserted.length !== keyErrors.length) throw new Error("Not every key error aggregate was written");
    }
    await moveRoom(tx, ownership.lobbyId, ownership.raceId, "results");
    return { won: true, alreadyDone: false };
  }, READ_COMMITTED);
}

/**
 * The owner interrupts its own race, without results (D-06), and the room goes back to
 * WAITING: when its process stops (`server_stopped`), when it gives up saving results after
 * its bounded attempts (`save_failed`), or when the engine failed unexpectedly on this race
 * (`engine_error`). Nothing changes if the race already ended or was taken
 * over; `resultsSaved` says that this owner's own finalisation ended it, results included.
 */
export async function interruptOwnRace(
  db: Database,
  ownership: RaceOwnership,
  reason: Extract<InterruptionReason, "server_stopped" | "save_failed" | "engine_error">,
): Promise<Interruption> {
  return boundedTransaction(db, async (tx): Promise<Interruption> => {
    const phase = await lockRoom(tx, ownership);
    const interrupted =
      phase === undefined || (await endedForClosedRoom(tx, ownership, phase))
        ? []
        : await tx.update(races).set(interruption(reason)).where(ownedAndActive(ownership)).returning({ id: races.id });
    if (interrupted.length === 0) {
      const race = await raceOfOwner(tx, ownership);
      // An interruption raises the generation: this owner's own one leaves it one higher.
      if (race?.state === "interrupted" && race.reason === reason && race.ownerEpoch === ownership.ownerEpoch + 1) {
        return { won: true, alreadyDone: true };
      }
      return { won: false, resultsSaved: await savedBy(tx, ownership) };
    }
    await moveRoom(tx, ownership.lobbyId, ownership.raceId, "waiting");
    return { won: true, alreadyDone: false };
  }, READ_COMMITTED);
}

export type LeaseRenewal = { readonly renewed: true; readonly expiresAt: Date } | { readonly renewed: false };

/**
 * The owner extends its lease (ADR-0004). It fails for good once the race ended, was
 * interrupted or was taken over (another generation): the owner must then stop. A lease that
 * expired without a takeover is renewed: nobody else acted on the race. Touches the race row
 * only, never the room, so it cannot deadlock with a transition. Bounded on the server like
 * every race transaction: a renewal stuck behind a lock ends with an error from PostgreSQL,
 * which the owner treats like an unreachable database (it retries, and its local view of the
 * lease never trusts an answer beyond what it proves). It sets READ COMMITTED itself, whatever
 * the server's default.
 */
export async function renewRaceLease(db: Database, ownership: RaceOwnership): Promise<LeaseRenewal> {
  return boundedTransaction(db, async (tx): Promise<LeaseRenewal> => {
    const [renewed] = await tx.update(races).set({ leaseExpiresAt: leaseEnd }).where(ownedAndActive(ownership)).returning({ expiresAt: races.leaseExpiresAt });
    return renewed === undefined ? { renewed: false } : { renewed: true, expiresAt: renewed.expiresAt };
  }, READ_COMMITTED);
}

export type Recovery = {
  /** Rooms that went back to WAITING. */
  readonly rooms: readonly string[];
  /** Expired races interrupted although they were no longer current in their room (boot only). */
  readonly orphans: number;
  /**
   * Expired races left for later because another transaction held their room or their row
   * (a transition or a renewal under way). In the scope of the call: one room, or all.
   */
  readonly remaining: number;
};

/**
 * Interrupts the races whose owner stopped renewing (ADR-0004): at boot, and when someone
 * opens a room whose race nobody runs. Only a lease that has expired on the database clock is
 * taken over, so a race still run by another live process (two processes overlapping during a
 * deployment) is left to it. Rooms and their races are locked together, in room order, and
 * never waited for: a room or race row that another transaction holds is skipped and counted
 * in `remaining`. At boot, expired races no longer current in their room are interrupted too.
 */
export async function recoverAbandonedRaces(db: Database, scope: { readonly lobbyId?: string } = {}): Promise<Recovery> {
  // Nothing here waits for a row; the limits still bound a table lock (a migration).
  return boundedTransaction(db, async (tx): Promise<Recovery> => {
    const expired = expiredActiveRace;
    const inScope = scope.lobbyId === undefined ? undefined : eq(lobbies.id, scope.lobbyId);
    const candidates = await tx
      .select({ lobbyId: lobbies.id, raceId: races.id })
      .from(lobbies)
      .innerJoin(races, eq(races.id, lobbies.currentRaceId))
      .where(and(inArray(lobbies.phase, ACTIVE_RACE_STATES), expired, inScope))
      .orderBy(asc(lobbies.id))
      .for("update", { of: [lobbies, races], skipLocked: true });
    const rooms: string[] = [];
    for (const { lobbyId, raceId } of candidates) {
      const interrupted = await tx
        .update(races)
        .set(interruption("owner_lost"))
        .where(and(eq(races.id, raceId), expired))
        .returning({ id: races.id });
      if (interrupted.length === 1) {
        await moveRoom(tx, lobbyId, raceId, "waiting");
        rooms.push(lobbyId);
      }
    }
    let orphans = 0;
    if (scope.lobbyId === undefined) {
      const stillCurrent = tx
        .select({ id: lobbies.id })
        .from(lobbies)
        .where(and(eq(lobbies.currentRaceId, races.id), inArray(lobbies.phase, ACTIVE_RACE_STATES)));
      const lockedOrphans = tx
        .select({ id: races.id })
        .from(races)
        .where(and(expired, notExists(stillCurrent)))
        .for("update", { skipLocked: true });
      const interrupted = await tx
        .update(races)
        .set(interruption("owner_lost"))
        .where(and(inArray(races.id, lockedOrphans), expired))
        .returning({ id: races.id });
      orphans = interrupted.length;
    }
    // A new statement sees this transaction's interruptions: what is left was skipped.
    const ofRoom =
      scope.lobbyId === undefined
        ? undefined
        : exists(
            tx
              .select({ id: lobbies.id })
              .from(lobbies)
              .where(and(eq(lobbies.id, scope.lobbyId), eq(lobbies.currentRaceId, races.id), inArray(lobbies.phase, ACTIVE_RACE_STATES))),
          );
    const left = firstRow(await tx.select({ value: count() }).from(races).where(and(expired, ofRoom)));
    return { rooms, orphans, remaining: left.value };
  }, READ_COMMITTED);
}

export type RoomRecovery =
  | { readonly recovered: true }
  /** `retryInMs`: the room's race is active and its lease runs this much longer (database clock). */
  | { readonly recovered: false; readonly retryInMs?: number };

/**
 * Recovers the race of one room whose owner stopped renewing (ADR-0004), for a room someone
 * opens or watches. One read first: only an active race with an expired lease leads to the
 * recovery transaction. While the lease runs, it says how long it still runs, so the caller can
 * look again once, then; nothing is recovered.
 */
export async function recoverRoomIfAbandoned(db: Database, lobbyId: string): Promise<RoomRecovery> {
  const [race] = await db
    .select({
      expired: sql<boolean>`${races.leaseExpiresAt} <= statement_timestamp()`,
      leaseLeftMs: sql<number>`greatest(0, ceil(extract(epoch from (${races.leaseExpiresAt} - statement_timestamp())) * 1000))::float8`,
    })
    .from(lobbies)
    .innerJoin(races, eq(races.id, lobbies.currentRaceId))
    .where(and(eq(lobbies.id, lobbyId), inArray(lobbies.phase, ACTIVE_RACE_STATES), inArray(races.state, ACTIVE_RACE_STATES)));
  if (race === undefined) {
    return { recovered: false };
  }
  if (!race.expired) {
    return { recovered: false, retryInMs: race.leaseLeftMs };
  }
  const { rooms } = await recoverAbandonedRaces(db, { lobbyId });
  // Not recovered although expired: another transaction held the room or the race. Look again soon.
  return rooms.includes(lobbyId) ? { recovered: true } : { recovered: false, retryInMs: SKIPPED_RETRY_MS };
}

/** When an expired race could not be recovered because something else held it. */
const SKIPPED_RETRY_MS = 2_000;
