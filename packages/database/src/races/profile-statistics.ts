import { computeProfileStatistics, MAX_PROFILE_GROUPS, PROFILE_TREND_LIMIT, type ProfileStatistics } from "@incision/domain";
import { sql } from "drizzle-orm";
import { z } from "zod";
import type { Database } from "../client";

const outcome = z.enum(["finished", "timed_out", "abandoned"]);
const speed = z.number().finite().nonnegative();
const groupSchema = z.object({ outcome, rank: z.number().int().min(1).max(30), hasOtherHuman: z.boolean(),
  count: z.number().int().positive().max(Number.MAX_SAFE_INTEGER), averageNetWpm: speed,
  averageAccuracy: z.number().min(0).max(100), bestNetWpm: speed });
const pointSchema = z.object({ raceId: z.uuid(), endedAt: z.iso.datetime({ precision: 6 }), outcome,
  netWpm: speed, accuracy: z.number().min(0).max(100) });
const projectionSchema = z.object({ groups: z.array(groupSchema).max(MAX_PROFILE_GROUPS),
  trend: z.array(pointSchema).max(PROFILE_TREND_LIMIT) });
export type ProfileTrendPoint = z.infer<typeof pointSchema>;
export type AccountStatistics = { readonly summary: ProfileStatistics; readonly trend: readonly ProfileTrendPoint[] };

/**
 * One statement / MVCC snapshot for lifetime aggregates and the latest 30 results.
 * Identity is supplied by the checked server session, never a page parameter.
 * At most 180 grouped rows and 30 points cross the database boundary.
 * Only authenticated human entrants contribute to personal statistics. A bot opponent
 * cannot satisfy the other-human condition for a victory; names never decide identity.
 */
export async function readAccountStatistics(db: Database, accountId: string): Promise<AccountStatistics> {
  const result = await db.execute(sql`
    with eligible as (
      select r.id as race_id, r.ended_at, rr.outcome, rr.rank, rr.net_wpm, rr.accuracy,
        exists (select 1 from race_entrants other
          where other.race_id = r.id and (other.kind = 'guest' or (other.kind = 'human' and other.account_id <> e.account_id))) as other_human
      from race_entrants e
      join races r on r.id = e.race_id
      join race_results rr on rr.race_id = r.id and rr.entrant_id = e.id
      where e.account_id = ${accountId}::uuid and e.kind = 'human' and r.state = 'finished'
    ), grouped as (
      select outcome, rank, other_human, count(*)::double precision as count,
        avg(net_wpm) as average_net_wpm, avg(accuracy) as average_accuracy, max(net_wpm) as best_net_wpm
      from eligible group by outcome, rank, other_human
    ), recent as (
      select * from eligible order by ended_at desc, race_id desc limit ${PROFILE_TREND_LIMIT}
    )
    select
      coalesce((select jsonb_agg(jsonb_build_object('outcome', outcome, 'rank', rank,
        'hasOtherHuman', other_human, 'count', count, 'averageNetWpm', average_net_wpm,
        'averageAccuracy', average_accuracy, 'bestNetWpm', best_net_wpm)
        order by outcome, rank, other_human) from grouped), '[]'::jsonb) as groups,
      coalesce((select jsonb_agg(jsonb_build_object('raceId', race_id,
        'endedAt', to_char(ended_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
        'outcome', outcome, 'netWpm', net_wpm, 'accuracy', accuracy)
        order by ended_at, race_id) from recent), '[]'::jsonb) as trend
  `);
  const projection = projectionSchema.parse(result.rows[0]);
  return { summary: computeProfileStatistics(projection.groups), trend: projection.trend };
}
