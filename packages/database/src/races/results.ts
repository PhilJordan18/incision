import { and, asc, eq, isNull, type SQL, sql } from "drizzle-orm";
import type { Database } from "../client";
import { type InterruptionReason, lobbies, lobbyMembers, RACE_OUTCOMES, RACE_STATES, raceEntrants, raceResults, races } from "../schema";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type EntrantResult = {
  readonly outcome: (typeof RACE_OUTCOMES)[number];
  readonly rank: number;
  readonly elapsedMs: number;
  readonly position: number;
  readonly length: number;
  readonly netWpm: number;
  readonly rawWpm: number;
  readonly accuracy: number;
};

export type EntrantResultView = {
  readonly ordinal: number;
  readonly displayName: string;
  /** The account reading the race. */
  readonly isSelf: boolean;
  /** Only for a finished race; an interrupted one has none (D-06). */
  readonly result?: EntrantResult;
};

/** The race as frozen in the database, independent of its room (HIST-02): no room code. */
export type RaceResultView = {
  readonly raceId: string;
  readonly roundNo: number;
  readonly state: (typeof RACE_STATES)[number];
  readonly interruptionReason: InterruptionReason | null;
  readonly countdownAt: Date;
  readonly startedAt: Date | null;
  readonly endedAt: Date | null;
  /** Ranked first (by rank), then by start order. */
  readonly entrants: readonly EntrantResultView[];
};

/**
 * A race as frozen in the database (HIST-02), for one of its entrants only. Anyone else, an
 * unknown id or a malformed one get the same `undefined`, so a race id reveals nothing.
 */
export async function readRaceForEntrant(db: Database, raceId: string, accountId: string): Promise<RaceResultView | undefined> {
  if (!UUID.test(raceId)) {
    return undefined;
  }
  return readRaceView(
    db,
    accountId,
    sql`${races.id} = ${raceId} and exists (select 1 from ${raceEntrants} where ${raceEntrants.raceId} = ${races.id} and ${raceEntrants.accountId} = ${accountId})`,
  );
}

/**
 * The race `raceId` of the room `lobbyId`, for any active member of that room, spectators
 * included: what the room shows once its race ended. Undefined when the account is not an
 * active member of that room, or when that race is no longer the room's current one (a new
 * round started between the caller's read and this one).
 */
export async function readRoomRaceForMember(
  db: Database,
  { lobbyId, raceId, accountId }: { readonly lobbyId: string; readonly raceId: string; readonly accountId: string },
): Promise<RaceResultView | undefined> {
  if (!UUID.test(lobbyId) || !UUID.test(raceId)) {
    return undefined;
  }
  const member = db
    .select({ id: lobbyMembers.id })
    .from(lobbyMembers)
    .where(and(eq(lobbyMembers.lobbyId, lobbies.id), eq(lobbyMembers.accountId, accountId), isNull(lobbyMembers.leftAt)));
  const roomRace = db
    .select({ id: lobbies.id })
    .from(lobbies)
    .where(and(eq(lobbies.id, lobbyId), eq(lobbies.currentRaceId, races.id), sql`exists (${member})`));
  return readRaceView(db, accountId, sql`${races.id} = ${raceId} and exists (${roomRace})`);
}

/**
 * Results are written once, with the move to RESULTS, and shown only for a finished race: a
 * finalisation committing between the two reads cannot pair a race in progress with results.
 */
/** `condition` is the access check: always a condition, never none (which would read any race). */
async function readRaceView(db: Database, accountId: string, condition: SQL): Promise<RaceResultView | undefined> {
  const [race] = await db
    .select({
      raceId: races.id,
      roundNo: races.roundNo,
      state: races.state,
      interruptionReason: races.interruptionReason,
      countdownAt: races.countdownAt,
      startedAt: races.startedAt,
      endedAt: races.endedAt,
    })
    .from(races)
    .where(condition);
  if (race === undefined) {
    return undefined;
  }
  const rows = await db
    .select({
      ordinal: raceEntrants.ordinal,
      displayName: raceEntrants.displayNameSnapshot,
      accountId: raceEntrants.accountId,
      // Null when the entrant has no result row (left join).
      result: {
        outcome: raceResults.outcome,
        rank: raceResults.rank,
        elapsedMs: raceResults.elapsedMs,
        position: raceResults.position,
        length: raceResults.length,
        netWpm: raceResults.netWpm,
        rawWpm: raceResults.rawWpm,
        accuracy: raceResults.accuracy,
      },
    })
    .from(raceEntrants)
    .leftJoin(raceResults, and(eq(raceResults.raceId, raceEntrants.raceId), eq(raceResults.entrantId, raceEntrants.id)))
    .where(eq(raceEntrants.raceId, race.raceId))
    .orderBy(sql`${raceResults.rank} asc nulls last`, asc(raceEntrants.ordinal));
  const finished = race.state === "finished";
  return {
    ...race,
    entrants: rows.map(({ ordinal, displayName, accountId: entrantAccount, result }) => ({
      ordinal,
      displayName,
      isSelf: entrantAccount === accountId,
      ...(finished && result !== null ? { result } : {}),
    })),
  };
}
