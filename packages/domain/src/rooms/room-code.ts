/**
 * Room codes (SALLE-02, choice D-01): six characters from an alphabet that
 * leaves out 0/O and 1/I/L, so a code read aloud in class is typed correctly.
 */
export const ROOM_CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export const ROOM_CODE_LENGTH = 6;

/** A code that passed {@link parseRoomCode} or came from {@link generateRoomCode}. */
export type RoomCode = string & { readonly __brand: "RoomCode" };

/**
 * Returns a uniformly distributed integer in `[0, upperBound)`.
 * Injected so the rule stays pure: production passes `crypto.randomInt`.
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
  const candidate = input.trim().toUpperCase();
  if (candidate.length === 0) {
    return { ok: false, error: "EMPTY" };
  }
  if (candidate.length !== ROOM_CODE_LENGTH) {
    return { ok: false, error: "WRONG_LENGTH" };
  }
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
