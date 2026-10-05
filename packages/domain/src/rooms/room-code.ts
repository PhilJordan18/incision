/**
 * Room codes (SALLE-02, choice D-01): six characters from an alphabet that
 * leaves out 0/O and 1/I/L, so a code read aloud in class is typed correctly.
 */
export const ROOM_CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export const ROOM_CODE_LENGTH = 6;

/** A code that passed {@link parseRoomCode} or came from {@link generateRoomCode}. */
export type RoomCode = string & { readonly __brand: "RoomCode" };

/**
 * Returns an integer in `[0, upperBound)` from a uniform, cryptographically
 * secure source: production passes `crypto.randomInt`. Never `Math.random` or a
 * modulo of random bytes, since knowing a CODE room's code is enough to join it
 * (D-01). Injected so the rule stays pure and testable.
 */
export type RandomIndex = (upperBound: number) => number;

export type RoomCodeError = "EMPTY" | "WRONG_LENGTH" | "INVALID_CHARACTER";

export type RoomCodeParseResult =
  | { readonly ok: true; readonly code: RoomCode }
  | { readonly ok: false; readonly error: RoomCodeError };

export function generateRoomCode(randomIndex: RandomIndex): RoomCode {
  let code = "";
  for (let position = 0; position < ROOM_CODE_LENGTH; position += 1) {
    code += ROOM_CODE_ALPHABET.charAt(checkedIndex(randomIndex(ROOM_CODE_ALPHABET.length)));
  }
  // Every character comes from the alphabet and the length is fixed.
  return code as RoomCode;
}

/** Trims and uppercases user input, then checks it against the code format. */
export function parseRoomCode(input: string): RoomCodeParseResult {
  const trimmed = input.trim();
  if (trimmed.length === 0) {
    return { ok: false, error: "EMPTY" };
  }
  if (trimmed.length !== ROOM_CODE_LENGTH) {
    return { ok: false, error: "WRONG_LENGTH" };
  }
  // Check ASCII before uppercasing: "ß", "ſ" or ligatures would uppercase into code letters.
  if (!/^[A-Za-z0-9]+$/.test(trimmed)) {
    return { ok: false, error: "INVALID_CHARACTER" };
  }
  const candidate = trimmed.toUpperCase();
  if (![...candidate].every((character) => ROOM_CODE_ALPHABET.includes(character))) {
    return { ok: false, error: "INVALID_CHARACTER" };
  }
  return { ok: true, code: candidate as RoomCode };
}

function checkedIndex(index: number): number {
  if (!Number.isInteger(index) || index < 0 || index >= ROOM_CODE_ALPHABET.length) {
    throw new RangeError(
      `randomIndex returned ${index}; expected an integer in [0, ${ROOM_CODE_ALPHABET.length})`,
    );
  }
  return index;
}
