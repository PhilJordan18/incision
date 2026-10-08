import type { JoinRoomResult, RoomSnapshot } from "@incision/database";
import { headers } from "next/headers";
import { type AttemptLimit, AttemptLimiter } from "@/server/auth/attempt-limiter";
import { addressLimitKey, CLIENT_ADDRESS_HEADER } from "@/server/http/client-address";
import { CodeAttemptLimiter } from "./code-attempt-limiter";

/**
 * While its address has spent the code budget, an account may still read its own membership
 * (to open its own room) this many times per minute: the bypass stays bounded.
 */
export const OWN_ROOM_READS_WHILE_LIMITED: AttemptLimit = { maxFailures: 20, windowMs: 60_000 };

const processGlobal = globalThis as typeof globalThis & {
  incisionCodeAttempts?: CodeAttemptLimiter;
  incisionOwnRoomReads?: AttemptLimiter;
};

/** One budget per process: Next bundles each server module separately (single instance). */
export function codeAttempts(): CodeAttemptLimiter {
  processGlobal.incisionCodeAttempts ??= new CodeAttemptLimiter();
  return processGlobal.incisionCodeAttempts;
}

function ownRoomReads(): AttemptLimiter {
  processGlobal.incisionOwnRoomReads ??= new AttemptLimiter(OWN_ROOM_READS_WHILE_LIMITED);
  return processGlobal.incisionOwnRoomReads;
}

/** Rate-limit key of the request's client address, set by the custom server (server.ts). */
export async function requestAddressKey(): Promise<string> {
  return addressLimitKey((await headers()).get(CLIENT_ADDRESS_HEADER) ?? "unknown");
}

/**
 * Whether this request may read the account's own membership, by account id (never by code).
 * Always, while the address is within its budget; once it is spent, 20 times per minute and
 * per account, so opening one's own room never becomes an unbounded path to the database.
 */
export function allowOwnRoomRead(
  addressKey: string,
  accountId: string,
  limiters: { readonly codes: CodeAttemptLimiter; readonly ownRoomReads: AttemptLimiter } = {
    codes: codeAttempts(),
    ownRoomReads: ownRoomReads(),
  },
): boolean {
  if (!limiters.codes.isExhausted(addressKey)) {
    return true;
  }
  if (limiters.ownRoomReads.isBlocked(accountId)) {
    return false;
  }
  limiters.ownRoomReads.recordFailure(accountId);
  return true;
}

/**
 * A code spends the budget when it leads to no room one could enter: unknown, private
 * (indistinguishable from unknown) or closed. A full room, a race in progress, an account
 * already elsewhere and an admission spend nothing (SALLE-10, decided on October 7).
 */
export function joinSpendsBudget(result: JoinRoomResult): boolean {
  return !result.ok && (result.error === "ROOM_NOT_FOUND" || (result.error === "ROOM_NOT_ADMITTING" && result.phase === "closed"));
}

/** The same rule for a room page: `findRoomByCode` answers undefined for unknown and private codes. */
export function lookupSpendsBudget(room: { readonly phase: RoomSnapshot["phase"] } | undefined): boolean {
  return room === undefined || room.phase === "closed";
}
