import { AttemptLimiter } from "@/server/auth/attempt-limiter";

/**
 * Room changes (create, join, leave) one account may make per minute. A person needs a
 * few; a loop would fill the database with rooms and flood a room's crew list.
 */
export const ROOM_CHANGE_LIMIT = { maxFailures: 10, windowMs: 60_000 } as const;

const processGlobal = globalThis as typeof globalThis & { incisionRoomChanges?: AttemptLimiter };

/** One counter per process: Next bundles each server action module separately. */
function roomChanges(): AttemptLimiter {
  processGlobal.incisionRoomChanges ??= new AttemptLimiter(ROOM_CHANGE_LIMIT);
  return processGlobal.incisionRoomChanges;
}

/** Counts one room change of the account; false once it made too many this minute. */
export function allowRoomChange(accountId: string, limiter: AttemptLimiter = roomChanges()): boolean {
  if (limiter.isBlocked(accountId)) {
    return false;
  }
  limiter.recordFailure(accountId);
  return true;
}
