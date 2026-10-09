import { and, asc, eq, sql } from "drizzle-orm";
import type { Database } from "../client";
import { lobbies, type InterruptionReason, raceEntrants, raceResults, races } from "../schema";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type EntrantResultView = {
  readonly ordinal: number;
  readonly displayName: string;
  /** The account reading the race. */
  readonly isSelf: boolean;
  /** Absent for a race without official results (interrupted, D-06). */
  readonly result?: {
    readonly outcome: "finished" | "timed_out" | "abandoned";
    readonly rank: number;
    readonly elapsedMs: number;
    readonly position: number;
    readonly length: number;
    readonly netWpm: number;
    readonly rawWpm: number;
    readonly accuracy: number;
  };
};

export type RaceResultView = {
  readonly raceId: string;
  readonly roundNo: number;
  readonly state: "countdown" | "racing" | "finished" | "interrupted";
  readonly interruptionReason: InterruptionReason | null;
  readonly countdownAt: Date;
  readonly startedAt: Date | null;
  readonly endedAt: Date | null;
  /** The room's code, while the room still exists. */
  readonly roomCode: string | null;
  /** Ranked first (by rank), then by start order. */
  readonly entrants: readonly EntrantResultView[];
};

/**
 * A race as frozen in the database (HIST-02), for one of its entrants only. Anyone else, an
 * unknown id or a malformed one get the same `undefined`, so a race id reveals nothing.
 * Results are written once, with the move to RESULTS; an interrupted race has none (D-06).
 */
export async function readRaceForEntrant(db: Database, raceId: string, accountId: string): Promise<RaceResultView | undefined> {
  if (!UUID.test(raceId)) {
    return undefined;
  }
  const [race] = await db
    .select({
      roundNo: races.roundNo,
      state: races.state,
      interruptionReason: races.interruptionReason,
      countdownAt: races.countdownAt,
      startedAt: races.startedAt,
      endedAt: races.endedAt,
      roomCode: lobbies.code,
    })
    .from(races)
    .leftJoin(lobbies, eq(lobbies.id, races.lobbyId))
    .where(
      and(
        eq(races.id, raceId),
        sql`exists (select 1 from ${raceEntrants} where ${raceEntrants.raceId} = ${races.id} and ${raceEntrants.accountId} = ${accountId})`,
      ),
    );
  if (race === undefined) {
    return undefined;
  }
  const rows = await db
    .select({
      ordinal: raceEntrants.ordinal,
      displayName: raceEntrants.displayNameSnapshot,
      accountId: raceEntrants.accountId,
      outcome: raceResults.outcome,
      rank: raceResults.rank,
      elapsedMs: raceResults.elapsedMs,
      position: raceResults.position,
      length: raceResults.length,
      netWpm: raceResults.netWpm,
      rawWpm: raceResults.rawWpm,
      accuracy: raceResults.accuracy,
    })
    .from(raceEntrants)
    .leftJoin(raceResults, and(eq(raceResults.raceId, raceEntrants.raceId), eq(raceResults.entrantId, raceEntrants.id)))
    .where(eq(raceEntrants.raceId, raceId))
    .orderBy(sql`${raceResults.rank} asc nulls last`, asc(raceEntrants.ordinal));
  return {
    raceId,
    ...race,
    entrants: rows.map(({ accountId: entrantAccount, outcome, rank, elapsedMs, position, length, netWpm, rawWpm, accuracy, ordinal, displayName }) => ({
      ordinal,
      displayName,
      isSelf: entrantAccount === accountId,
      ...(outcome === null || rank === null || elapsedMs === null || position === null || length === null || netWpm === null || rawWpm === null || accuracy === null
        ? {}
        : { result: { outcome, rank, elapsedMs, position, length, netWpm, rawWpm, accuracy } }),
    })),
  };
}
