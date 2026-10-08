import { and, asc, eq, inArray, isNull, max, sql } from "drizzle-orm";
import type { Database } from "../client";
import { firstRow } from "../rows";
import { lobbies, lobbyMembers, type AbandonmentReason, raceEntrants, raceResults, races } from "../schema";
import { findActiveMembership } from "../rooms/membership";
import { interruption } from "./interruption";

type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

/**
 * After the room lock, each statement sees every commit made before it; the compare-and-set
 * updates re-evaluate their conditions on the latest row version.
 */
const READ_COMMITTED = { isolationLevel: "read committed" } as const;

/**
 * Lease of a race's owner, on the database clock (ADR-0004). Another process may take a race
 * over only once this has passed without a renewal; the owner renews every 10 s.
 */
export const RACE_LEASE_MS = 30_000;
const leaseEnd = sql`statement_timestamp() + make_interval(secs => ${RACE_LEASE_MS / 1000})`;

/** The process running a race and the generation of its ownership: every owner write checks both. */
export type RaceOwnership = { readonly raceId: string; readonly ownerId: string; readonly ownerEpoch: number };

/** A transition that lost its compare-and-set changed nothing: someone else acted first. */
export type Transition = { readonly won: true } | { readonly won: false };

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
   * The engine's start rule (`startRefusal` in @incision/domain), applied to the participants
   * read under the room lock; never a copy of it here.
   */
  readonly refuseStart: (participants: readonly { readonly kind: "human" }[]) => Refusal | undefined;
};

export type StartRaceResult<Refusal extends string> =
  | {
      readonly ok: true;
      readonly lobbyId: string;
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
        .returning({ id: races.id, roundNo: races.roundNo, countdownAt: races.countdownAt, leaseExpiresAt: races.leaseExpiresAt }),
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
      lobbyId: lobby.id,
      race: { raceId: race.id, ownerId: input.ownerId, ownerEpoch: 1, roundNo: race.roundNo, countdownAt: race.countdownAt, leaseExpiresAt: race.leaseExpiresAt },
      entrants,
    };
  }, READ_COMMITTED);
}

/** The room whose current race this is, locked; undefined once another race replaced it. */
async function lockRoomOf(tx: Transaction, raceId: string): Promise<{ readonly id: string } | undefined> {
  const [lobby] = await tx.select({ id: lobbies.id }).from(lobbies).where(eq(lobbies.currentRaceId, raceId)).for("update");
  return lobby;
}

/** Condition of every owner write: the same process, the same generation, an active race. */
function ownedAndActive({ raceId, ownerId, ownerEpoch }: RaceOwnership) {
  return and(
    eq(races.id, raceId),
    eq(races.ownerId, ownerId),
    eq(races.ownerEpoch, ownerEpoch),
    inArray(races.state, ["countdown", "racing"]),
  );
}

/** Moves the room along with its race; a mismatch here means an invariant broke, so it throws. */
async function moveRoom(tx: Transaction, lobbyId: string, raceId: string, phase: "racing" | "results" | "waiting"): Promise<void> {
  const from = phase === "racing" ? ["countdown" as const] : ["countdown" as const, "racing" as const];
  const moved = await tx
    .update(lobbies)
    .set({ phase, revision: sql`${lobbies.revision} + 1` })
    .where(and(eq(lobbies.id, lobbyId), eq(lobbies.currentRaceId, raceId), inArray(lobbies.phase, from)))
    .returning({ id: lobbies.id });
  if (moved.length !== 1) {
    throw new Error("The room did not follow its race's transition");
  }
}

/** COUNTDOWN → RACING at the common start (COURSE-03), by the owner only. */
export async function beginRacing(db: Database, ownership: RaceOwnership): Promise<Transition> {
  return db.transaction(async (tx): Promise<Transition> => {
    const lobby = await lockRoomOf(tx, ownership.raceId);
    if (lobby === undefined) {
      return { won: false };
    }
    const started = await tx
      .update(races)
      .set({ state: "racing", startedAt: sql`greatest(statement_timestamp(), ${races.countdownAt})` })
      .where(and(ownedAndActive(ownership), eq(races.state, "countdown")))
      .returning({ id: races.id });
    if (started.length === 0) {
      return { won: false };
    }
    await moveRoom(tx, lobby.id, ownership.raceId, "racing");
    return { won: true };
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
 * a second call, a call after an interruption or a takeover, or one for a replaced race
 * changes nothing. A race that ends during its countdown (everyone abandoned) finalises too.
 * Every entrant gets exactly one result, or nothing is written.
 */
export async function finalizeRace(db: Database, ownership: RaceOwnership, results: readonly RaceResultRow[]): Promise<Transition> {
  return db.transaction(async (tx): Promise<Transition> => {
    const lobby = await lockRoomOf(tx, ownership.raceId);
    if (lobby === undefined) {
      return { won: false };
    }
    const ended = await tx
      .update(races)
      .set({
        state: "finished",
        startedAt: sql`coalesce(${races.startedAt}, greatest(statement_timestamp(), ${races.countdownAt}))`,
        endedAt: sql`greatest(statement_timestamp(), coalesce(${races.startedAt}, ${races.countdownAt}))`,
      })
      .where(ownedAndActive(ownership))
      .returning({ id: races.id });
    if (ended.length === 0) {
      return { won: false };
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
    await moveRoom(tx, lobby.id, ownership.raceId, "results");
    return { won: true };
  }, READ_COMMITTED);
}

/**
 * The owner interrupts its own race when its process stops (SIGTERM): no result (D-06), the
 * room goes back to WAITING. Nothing changes if the race already ended or was taken over.
 */
export async function interruptOwnRace(db: Database, ownership: RaceOwnership): Promise<Transition> {
  return db.transaction(async (tx): Promise<Transition> => {
    const lobby = await lockRoomOf(tx, ownership.raceId);
    if (lobby === undefined) {
      return { won: false };
    }
    const interrupted = await tx
      .update(races)
      .set(interruption("server_stopped"))
      .where(ownedAndActive(ownership))
      .returning({ id: races.id });
    if (interrupted.length === 0) {
      return { won: false };
    }
    await moveRoom(tx, lobby.id, ownership.raceId, "waiting");
    return { won: true };
  }, READ_COMMITTED);
}

export type LeaseRenewal = { readonly renewed: true; readonly expiresAt: Date } | { readonly renewed: false };

/**
 * The owner extends its lease (ADR-0004). It fails for good once the race ended, was
 * interrupted or was taken over (another generation): the owner must then stop. A lease that
 * expired without a takeover is renewed: nobody else acted on the race. Touches the race row
 * only, never the room, so it cannot deadlock with a transition.
 */
export async function renewRaceLease(db: Database, ownership: RaceOwnership): Promise<LeaseRenewal> {
  const [renewed] = await db
    .update(races)
    .set({ leaseExpiresAt: leaseEnd })
    .where(ownedAndActive(ownership))
    .returning({ expiresAt: races.leaseExpiresAt });
  return renewed === undefined ? { renewed: false } : { renewed: true, expiresAt: renewed.expiresAt };
}

/**
 * Interrupts the races whose owner stopped renewing (ADR-0004): at boot, and when someone
 * opens a room whose race nobody runs. Only a lease that has expired on the database clock is
 * taken over, so a race still run by another live process (two processes overlapping during a
 * deployment) is left to it. Rooms are locked in id order, then their races: the order of every
 * transition. At boot, races whose room no longer points to them are interrupted too.
 * Returns the rooms that went back to WAITING.
 */
export async function recoverAbandonedRaces(db: Database, scope: { readonly lobbyId?: string } = {}): Promise<readonly string[]> {
  return db.transaction(async (tx) => {
    const candidates = await tx
      .select({ lobbyId: lobbies.id, raceId: races.id })
      .from(lobbies)
      .innerJoin(races, eq(races.id, lobbies.currentRaceId))
      .where(
        and(
          inArray(lobbies.phase, ["countdown", "racing"]),
          inArray(races.state, ["countdown", "racing"]),
          sql`${races.leaseExpiresAt} <= statement_timestamp()`,
          scope.lobbyId === undefined ? undefined : eq(lobbies.id, scope.lobbyId),
        ),
      )
      .orderBy(asc(lobbies.id))
      .for("update", { of: lobbies });
    const recovered: string[] = [];
    for (const { lobbyId, raceId } of candidates) {
      // Checked again on the latest row: a renewal that committed meanwhile keeps the race alive.
      const interrupted = await tx
        .update(races)
        .set(interruption("owner_lost"))
        .where(and(eq(races.id, raceId), inArray(races.state, ["countdown", "racing"]), sql`${races.leaseExpiresAt} <= statement_timestamp()`))
        .returning({ id: races.id });
      if (interrupted.length === 1) {
        await moveRoom(tx, lobbyId, raceId, "waiting");
        recovered.push(lobbyId);
      }
    }
    if (scope.lobbyId === undefined) {
      await tx
        .update(races)
        .set(interruption("owner_lost"))
        .where(
          and(
            inArray(races.state, ["countdown", "racing"]),
            sql`${races.leaseExpiresAt} <= statement_timestamp()`,
            sql`not exists (select 1 from ${lobbies} where ${lobbies.currentRaceId} = ${races.id} and ${lobbies.phase} in ('countdown', 'racing'))`,
          ),
        );
    }
    return recovered;
  }, READ_COMMITTED);
}
