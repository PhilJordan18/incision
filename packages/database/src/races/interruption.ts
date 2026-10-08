import { and, eq, inArray, sql } from "drizzle-orm";
import { ACTIVE_RACE_STATES, type InterruptionReason, races } from "../schema";
import type { Transaction } from "../transaction";

/** When a race ends: now, but never before its start, so its times stay ordered. */
export const endedNow = sql`greatest(statement_timestamp(), coalesce(${races.startedAt}, ${races.countdownAt}))`;

/**
 * The columns of an interruption (D-06: no result). The ownership generation moves on, so any
 * later write of the former owner misses its compare-and-set (ADR-0004).
 */
export function interruption(reason: InterruptionReason) {
  return {
    state: "interrupted" as const,
    interruptionReason: reason,
    endedAt: endedNow,
    ownerEpoch: sql`${races.ownerEpoch} + 1`,
  };
}

/**
 * The room closes while its race counts down or runs: the race is interrupted in the closing
 * transaction, under the room lock, so closing and finalising cannot both win. A race that
 * already finished keeps its results.
 */
export async function interruptRaceForClosedRoom(tx: Transaction, raceId: string): Promise<void> {
  await tx
    .update(races)
    .set(interruption("room_closed"))
    .where(and(eq(races.id, raceId), inArray(races.state, ACTIVE_RACE_STATES)));
}
