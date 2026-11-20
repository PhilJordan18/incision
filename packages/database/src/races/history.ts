import { and, asc, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import type { Database } from "../client";
import { raceEntrants, raceResults, races } from "../schema";

export const HISTORY_PAGE_SIZE = 20;
const cursorSchema = z.tuple([
  z.enum(["older", "newer"]),
  z.iso.datetime({ precision: 6 }).refine((value) => !value.startsWith("0000-")),
  z.uuid(),
]);
type HistoryCursor = z.infer<typeof cursorSchema>;

/** A bounded, public position, never an identity or an authorization credential. */
export function parseHistoryCursor(value: unknown): HistoryCursor | undefined | null {
  if (value === undefined) return undefined;
  if (typeof value !== "string" || value.length > 80) return null;
  const parsed = cursorSchema.safeParse(value.split("|"));
  return parsed.success ? parsed.data : null;
}

export type HistoryRow = {
  readonly raceId: string;
  /** PostgreSQL microseconds preserved for pagination; Date is only used for display. */
  readonly endedAt: string;
  readonly roundNo: number;
  readonly outcome: "finished" | "timed_out" | "abandoned";
  readonly netWpm: number;
  readonly accuracy: number;
  readonly rank: number;
};
export type HistoryPage = {
  readonly rows: readonly HistoryRow[];
  readonly older?: string;
  readonly newer?: string;
};

function cursorFor(direction: "older" | "newer", row: HistoryRow): string {
  return [direction, row.endedAt, row.raceId].join("|");
}

/**
 * Private HIST-01 projection. Account identity is always supplied by the trusted session,
 * never by the cursor. One query, at most 21 rows, no text/config or other entrants loaded.
 * Invalid cursors are refused before touching the database.
 */
export async function readAccountHistory(
  db: Database,
  input: { readonly accountId: string; readonly cursor?: unknown },
): Promise<HistoryPage | null> {
  const cursor = parseHistoryCursor(input.cursor);
  if (cursor === null) return null;
  const newer = cursor?.[0] === "newer";
  const boundary = cursor === undefined ? undefined : newer
    ? sql`(${races.endedAt}, ${races.id}) > (${cursor[1]}::timestamptz, ${cursor[2]}::uuid)`
    : sql`(${races.endedAt}, ${races.id}) < (${cursor[1]}::timestamptz, ${cursor[2]}::uuid)`;
  const order = newer ? asc : desc;
  const found: HistoryRow[] = await db.select({
    raceId: races.id,
    endedAt: sql<string>`to_char(${races.endedAt} at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`,
    roundNo: races.roundNo,
    outcome: raceResults.outcome,
    netWpm: raceResults.netWpm,
    accuracy: raceResults.accuracy,
    rank: raceResults.rank,
  }).from(raceEntrants)
    .innerJoin(races, eq(races.id, raceEntrants.raceId))
    .innerJoin(raceResults, and(eq(raceResults.raceId, races.id), eq(raceResults.entrantId, raceEntrants.id)))
    .where(and(eq(raceEntrants.accountId, input.accountId), eq(races.state, "finished"), boundary))
    .orderBy(order(races.endedAt), order(races.id))
    .limit(HISTORY_PAGE_SIZE + 1);
  const more = found.length > HISTORY_PAGE_SIZE;
  const rows = found.slice(0, HISTORY_PAGE_SIZE);
  if (newer) rows.reverse();
  const first = rows[0];
  const last = rows.at(-1);
  return {
    rows,
    ...(last && (newer ? cursor !== undefined : more) ? { older: cursorFor("older", last) } : {}),
    ...(first && (newer ? more : cursor !== undefined) ? { newer: cursorFor("newer", first) } : {}),
  };
}
