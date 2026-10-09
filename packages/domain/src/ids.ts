/**
 * Identifiers the engine works with. The server creates them (UUIDs in practice) and resolves
 * them before calling the engine: an `EntrantId` is always the entrant of the authenticated
 * socket or of a server-driven bot, never a value read from a client payload, so it is never
 * taken as proof of identity.
 */
export type RaceId = string & { readonly __brand: "RaceId" };
export type EntrantId = string & { readonly __brand: "EntrantId" };

const ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

export function asRaceId(value: string): RaceId {
  return checkedId(value, "race") as RaceId;
}

export function asEntrantId(value: string): EntrantId {
  return checkedId(value, "entrant") as EntrantId;
}

/**
 * Stable order of identifiers, the last tie-break of the ranking (COURSE-10): UTF-16 code
 * unit order, so it never depends on a locale.
 */
export function compareIds(left: string, right: string): number {
  if (left === right) {
    return 0;
  }
  return left < right ? -1 : 1;
}

function checkedId(value: string, kind: string): string {
  if (!ID_PATTERN.test(value)) {
    throw new RangeError(`Invalid ${kind} id: expected 1 to 64 characters among A-Z, a-z, 0-9, _ and -`);
  }
  return value;
}
