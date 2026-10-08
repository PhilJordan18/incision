import type { RoomPhase } from "@incision/domain";
import { and, asc, count, eq, exists, inArray, isNull, max, notExists, sql } from "drizzle-orm";
import type { Database } from "../client";
import { findActiveMembership } from "../rooms/membership";
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
import { limitServerWaits, READ_COMMITTED, type Transaction } from "../transaction";
import { endedNow, interruption } from "./interruption";

/**
 * Lease of a race's owner, on the database clock (ADR-0004). Another process may take a race
 * over only once this has passed without a renewal; the owner renews every 10 s.
 */
export const RACE_LEASE_MS = 30_000;
const leaseEnd = sql`statement_timestamp() + make_interval(secs => ${RACE_LEASE_MS / 1000})`;

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

export type StartRaceInput<Refusal extends string> = {
  /** The account asking to start, from its session: it must host the room it occupies. */
  readonly accountId: string;
  /** This process (ADR-0004). */
  readonly ownerId: string;
  readonly text: string;
  readonly config: Readonly<Record<string, unknown>>;
  readonly rulesVersion: number;
  /**
   * The engine's start rule (`startRefusal`), applied to the participants read under the room
   * lock; never a copy of it here.
   */
  readonly refuseStart: (participants: readonly { readonly kind: "human" }[]) => Refusal | undefined;
};

export type StartRaceResult<Refusal extends string> =
  | {
      readonly ok: true;
      readonly race: RaceOwnership & { readonly roundNo: number; readonly countdownAt: Date; readonly leaseExpiresAt: Date };
      readonly entrants: readonly StartedEntrant[];
    }
  | { readonly ok: false; readonly error: "NOT_IN_A_ROOM" | "NOT_HOST" | "ROOM_NOT_WAITING" | Refusal };

/**
 * The host starts a race (COURSE-02/03): under the room lock, the room must be waiting and the
 * caller must still host it; the engine's rule decides on the participants (spectators never
 * race). One transaction freezes the text, the configuration and the entrants, takes the
 * lease, and moves the room to COUNTDOWN, which refuses every new admission (SALLE-09). A
 * second start finds the room in COUNTDOWN and changes nothing.
 */
export async function startRace<Refusal extends string>(
  db: Database,
  input: StartRaceInput<Refusal>,
): Promise<StartRaceResult<Refusal>> {
  return db.transaction(async (tx): Promise<StartRaceResult<Refusal>> => {
    await limitServerWaits(tx);
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
    const participants = await tx
      .select({ memberId: lobbyMembers.id, accountId: lobbyMembers.accountId, displayName: lobbyMembers.displayName })
      .from(lobbyMembers)
      .where(and(eq(lobbyMembers.lobbyId, lobby.id), eq(lobbyMembers.role, "participant"), isNull(lobbyMembers.leftAt)))
      .orderBy(asc(lobbyMembers.joinedAt), asc(lobbyMembers.id));
    // Every member is an account today: guests and bots come with their own cards.
    const refusal = input.refuseStart(participants.map(() => ({ kind: "human" as const })));
    if (refusal !== undefined) {
      return { ok: false, error: refusal };
    }
    const previous = firstRow(await tx.select({ value: max(races.roundNo) }).from(races).where(eq(races.lobbyId, lobby.id)));
    const race = firstRow(
      await tx
        .insert(races)
        .values({
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
        participants.map((participant, index) => ({
          raceId: race.id,
          memberId: participant.memberId,
          accountId: participant.accountId,
          ordinal: index + 1,
          displayNameSnapshot: participant.displayName,
        })),
      )
      .returning({ id: raceEntrants.id, ordinal: raceEntrants.ordinal });
    const idByOrdinal = new Map(inserted.map((row) => [row.ordinal, row.id]));
    const entrants = participants.map((participant, index): StartedEntrant => {
      const entrantId = idByOrdinal.get(index + 1);
      if (entrantId === undefined) {
        throw new Error("An entrant was not created");
      }
      return { entrantId, memberId: participant.memberId, accountId: participant.accountId, ordinal: index + 1, displayName: participant.displayName };
    });
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
    };
  }, READ_COMMITTED);
}

/**
 * Locks the race's room by its key, provided this race is still its current one, and gives
 * its phase. The limits on server waits come first, so this wait is bounded too.
 */
async function lockRoom(tx: Transaction, { lobbyId, raceId }: RaceOwnership): Promise<RoomPhase | undefined> {
  await limitServerWaits(tx);
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
 * The room closed while its race was still active: only a release without races does that,
 * closing a room during a deployment overlap. The owner ends the race as the closing would
 * have (D-06); its transition loses.
 */
async function endForClosedRoom(tx: Transaction, ownership: RaceOwnership): Promise<void> {
  await tx.update(races).set(interruption("room_closed")).where(ownedAndActive(ownership));
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
  return db.transaction(async (tx): Promise<Transition> => {
    const phase = await lockRoom(tx, ownership);
    if (phase === "closed") {
      await endForClosedRoom(tx, ownership);
      return { won: false };
    }
    const started =
      phase === undefined
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
  return db.transaction(async (tx): Promise<Transition> => {
    const phase = await lockRoom(tx, ownership);
    if (phase === "closed") {
      await endForClosedRoom(tx, ownership);
      return { won: false };
    }
    const ended =
      phase === undefined
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
    const written = await tx
      .insert(raceResults)
      .values(results.map((result) => ({ ...result, raceId: ownership.raceId })))
      .returning({ entrantId: raceResults.entrantId });
    if (written.length !== results.length) {
      throw new Error("Not every result was written");
    }
    await moveRoom(tx, ownership.lobbyId, ownership.raceId, "results");
    return { won: true, alreadyDone: false };
  }, READ_COMMITTED);
}

/**
 * The owner interrupts its own race, without results (D-06), and the room goes back to
 * WAITING: when its process stops (`server_stopped`), or when it gives up saving results after
 * its bounded attempts (`save_failed`). Nothing changes if the race already ended or was taken
 * over; `resultsSaved` says that this owner's own finalisation ended it, results included.
 */
export async function interruptOwnRace(
  db: Database,
  ownership: RaceOwnership,
  reason: Extract<InterruptionReason, "server_stopped" | "save_failed">,
): Promise<Interruption> {
  return db.transaction(async (tx): Promise<Interruption> => {
    const phase = await lockRoom(tx, ownership);
    if (phase === "closed") {
      await endForClosedRoom(tx, ownership);
      return { won: false, resultsSaved: false };
    }
    const interrupted =
      phase === undefined ? [] : await tx.update(races).set(interruption(reason)).where(ownedAndActive(ownership)).returning({ id: races.id });
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
 * only, never the room, so it cannot deadlock with a transition. A single statement: it waits
 * only for a transition of its own race, itself bounded on the server. Under a REPEATABLE READ
 * server default it may throw a serialisation failure, which the owner treats like an
 * unreachable database (it retries).
 */
export async function renewRaceLease(db: Database, ownership: RaceOwnership): Promise<LeaseRenewal> {
  const [renewed] = await db.update(races).set({ leaseExpiresAt: leaseEnd }).where(ownedAndActive(ownership)).returning({ expiresAt: races.leaseExpiresAt });
  return renewed === undefined ? { renewed: false } : { renewed: true, expiresAt: renewed.expiresAt };
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
  return db.transaction(async (tx): Promise<Recovery> => {
    // Nothing here waits for a row; the limits still bound a table lock (a migration).
    await limitServerWaits(tx);
    const expired = and(inArray(races.state, ACTIVE_RACE_STATES), sql`${races.leaseExpiresAt} <= statement_timestamp()`);
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
