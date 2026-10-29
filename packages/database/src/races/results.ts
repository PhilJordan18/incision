import { and, asc, eq, isNull, type SQL, sql } from "drizzle-orm";
import { compareResultRecord, resultRecordCategory, type RecordCategory, type ResultRecord } from "@incision/domain";
import { z } from "zod";
import type { BotLevel, StoredWpmSeries } from "@incision/domain";
import { raceWpmSeries } from "../schema/race-wpm-series";
import { checkedStoredWpmSeries } from "./wpm-series";
import { checkedKeyErrors, type StoredKeyErrors } from "./key-errors";
import { raceKeyErrors } from "../schema/race-key-errors";
import type { Database } from "../client";
import { type AbandonmentReason, type InterruptionReason, lobbies, lobbyMembers, RACE_OUTCOMES, RACE_STATES, raceEntrants, raceResults, races } from "../schema";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type EntrantResult = {
  readonly outcome: (typeof RACE_OUTCOMES)[number];
  /** Why an abandon happened (voluntary, a lost connection, inactivity); null for the other outcomes. */
  readonly abandonmentReason: AbandonmentReason | null;
  readonly rank: number;
  readonly elapsedMs: number;
  readonly position: number;
  readonly length: number;
  readonly netWpm: number;
  readonly rawWpm: number;
  readonly accuracy: number;
  /** Cumulative wrong insertions, including errors subsequently corrected (D-09). */
  readonly errors: number;
  /** Absent only for historical rows without collected observations; never fabricated. */
  readonly wpmSeries?: StoredWpmSeries;
};

export type EntrantResultView = {
  /** Always populated by the SQL reader; optional for older non-live view producers. */
  readonly kind?: "human" | "bot";
  /** Anonymous human opponent: label is a race-local ordinal, never a guest nickname. */
  readonly anonymous?: boolean;
  readonly botLevel?: BotLevel | null;
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
  /** Only the authenticated reader's record; absent for a spectator or non-finisher. */
  readonly personalRecord?: ResultRecord;
  /** Only the authenticated entrant's aggregate; absent for legacy races and spectators. */
  readonly personalKeyErrors?: StoredKeyErrors;
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
 * included: what the room shows on its results. Undefined when the account is not an active
 * member of that room, or when the room no longer shows that race's results (the host took it
 * back to the waiting room, or a new round started, between the caller's read and this one).
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
    .where(and(eq(lobbies.id, lobbyId), eq(lobbies.phase, "results"), eq(lobbies.currentRaceId, races.id), sql`exists (${member})`));
  return readRaceView(db, accountId, sql`${races.id} = ${raceId} and exists (${roomRace})`);
}

/**
 * Results are written once, with the move to RESULTS, and shown only for a finished race: a
 * finalisation committing between the two reads cannot pair a race in progress with results.
 * `condition` is the access check: always a condition, never none (which would read any race).
 */
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
      config: races.configSnapshot,
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
      kind: raceEntrants.kind,
      botLevel: raceEntrants.botLevel,
      seriesEntrantId: raceWpmSeries.entrantId,
      series: raceWpmSeries.series,
      keyErrorsEntrantId: raceKeyErrors.entrantId,
      keyErrors: raceKeyErrors.aggregate,
      correctInputs: raceResults.correctInputs,
      totalInputs: raceResults.totalInputs,
      // Null when the entrant has no result row (left join).
      result: {
        outcome: raceResults.outcome,
        abandonmentReason: raceResults.abandonmentReason,
        rank: raceResults.rank,
        elapsedMs: raceResults.elapsedMs,
        position: raceResults.position,
        length: raceResults.length,
        netWpm: raceResults.netWpm,
        rawWpm: raceResults.rawWpm,
        accuracy: raceResults.accuracy,
        errors: sql<number>`${raceResults.totalInputs} - ${raceResults.correctInputs}`.mapWith(Number),
      },
    })
    .from(raceEntrants)
    .leftJoin(raceResults, and(eq(raceResults.raceId, raceEntrants.raceId), eq(raceResults.entrantId, raceEntrants.id)))
    // Read the bounded payload in the existing authorised entrant query, not an extra query.
    .leftJoin(raceWpmSeries, and(eq(raceWpmSeries.raceId, raceEntrants.raceId), eq(raceWpmSeries.entrantId, raceEntrants.id)))
    // Enforce privacy in SQL: another entrant's aggregate never leaves the database.
    .leftJoin(raceKeyErrors, and(eq(raceKeyErrors.raceId, raceEntrants.raceId), eq(raceKeyErrors.entrantId, raceEntrants.id), eq(raceEntrants.accountId, accountId)))
    .where(eq(raceEntrants.raceId, race.raceId))
    .orderBy(sql`${raceResults.rank} asc nulls last`, asc(raceEntrants.ordinal));
  const finished = race.state === "finished";
  const ownRow = rows.find((row) => row.accountId === accountId);
  const personalKeyErrors = finished && ownRow?.keyErrorsEntrantId != null
    ? checkedKeyErrors(ownRow.keyErrors, { correctInputs: ownRow.correctInputs ?? Number.NaN, totalInputs: ownRow.totalInputs ?? Number.NaN })
    : undefined;
  const self = rows.find((row) => row.accountId === accountId)?.result;
  // The frozen config is used server-side only, never projected with personal settings/seeds.
  const { config, ...metadata } = race;
  const category = resultRecordCategory(config);
  const personalRecord = finished && self?.outcome === "finished"
    ? category === undefined ? { status: "unavailable" } as const
      : compareResultRecord({ category, netWpm: self.netWpm,
        ...await previousRecords(db, { raceId: race.raceId, accountId, category }) })
    : undefined;
  return {
    ...metadata,
    ...(personalRecord === undefined ? {} : { personalRecord }),
    ...(personalKeyErrors === undefined ? {} : { personalKeyErrors }),
    entrants: rows.map(({ ordinal, displayName, kind, botLevel, accountId: entrantAccount, seriesEntrantId, series, correctInputs, totalInputs, result }) => ({
      ordinal,
      displayName,
      kind: kind === "guest" ? "human" : kind,
      ...(kind === "guest" ? { anonymous: true } : {}),
      botLevel,
      isSelf: entrantAccount === accountId,
      ...(finished && result !== null ? { result: {
        ...result,
        ...(seriesEntrantId !== null ? { wpmSeries: checkedStoredWpmSeries(series, {
          ...result, correctInputs: correctInputs ?? Number.NaN, totalInputs: totalInputs ?? Number.NaN,
        }) } : {}),
      } } : {}),
    })),
  };
}

const previousRecordSchema = z.object({
  previousBest: z.number().finite().nonnegative().nullable(),
  historyComplete: z.boolean(),
});

/**
 * One aggregate row for the reader, never a query per entrant or an unbounded history transfer.
 * Compare timestamps inside PostgreSQL (microseconds, not JS Date milliseconds). Only races
 * ending strictly earlier are prior: simultaneous ends do not arbitrarily order by UUID.
 * Later results cannot erase a record on an older race. As a read projection, this assumes
 * historical results/configurations are retained; a later backfill can revise the evidence.
 * Current entrants are authenticated accounts, not guests/bots; a future kind must filter here.
 */
async function previousRecords(db: Database, input: {
  readonly raceId: string; readonly accountId: string; readonly category: RecordCategory;
}): Promise<z.infer<typeof previousRecordSchema>> {
  const result = await db.execute(sql`
    select max(rr.net_wpm) filter (where r.config_snapshot->'bonuses' = ${JSON.stringify(input.category.bonuses)}::jsonb
      and r.config_snapshot->>'errorMode' = ${input.category.errorMode}) as "previousBest",
      coalesce(bool_and(coalesce(jsonb_typeof(r.config_snapshot->'bonuses') = 'boolean'
        and r.config_snapshot->>'errorMode' in ('mandatory', 'free'), false)), true) as "historyComplete"
    from race_entrants e
    join race_results rr on rr.race_id = e.race_id and rr.entrant_id = e.id
    join races r on r.id = e.race_id
    join races current_race on current_race.id = ${input.raceId}::uuid
    where e.account_id = ${input.accountId}::uuid and r.state = 'finished' and rr.outcome = 'finished'
      and r.ended_at < current_race.ended_at
  `);
  return previousRecordSchema.parse(result.rows[0]);
}
