import { describe, expect, it } from "vitest";
import {
  generateRoomCode,
  parseRoomCode,
  ROOM_CODE_ALPHABET,
  ROOM_CODE_LENGTH,
  type RandomIndex,
} from "./room-code";

function sequence(...indexes: number[]): RandomIndex {
  let call = 0;
  return () => indexes[call++ % indexes.length] ?? 0;
}

/** Deterministic linear congruential picker, enough to sweep many codes. */
function seeded(seed: number): RandomIndex {
  let state = seed;
  return (upperBound) => {
    state = (state * 1_103_515_245 + 12_345) % 2_147_483_648;
    return state % upperBound;
  };
}

describe("ROOM_CODE_ALPHABET", () => {
  it("excludes the ambiguous characters 0, O, 1, I and L", () => {
    for (const ambiguous of ["0", "O", "1", "I", "L"]) {
      expect(ROOM_CODE_ALPHABET).not.toContain(ambiguous);
    }
  });

  it("contains 31 distinct uppercase letters and digits", () => {
    expect(new Set(ROOM_CODE_ALPHABET).size).toBe(31);
    expect(ROOM_CODE_ALPHABET).toMatch(/^[A-Z2-9]+$/);
  });
});

describe("generateRoomCode", () => {
  it("maps each random index to the matching alphabet character", () => {
    expect(generateRoomCode(sequence(0, 1, 2, 3, 4, 5))).toBe("ABCDEF");
    expect(generateRoomCode(sequence(ROOM_CODE_ALPHABET.length - 1))).toBe("999999");
  });

  it("always produces a code that parses back to itself", () => {
    const randomIndex = seeded(42);
    for (let attempt = 0; attempt < 1_000; attempt += 1) {
      const code = generateRoomCode(randomIndex);
      expect(code).toHaveLength(ROOM_CODE_LENGTH);
      expect(parseRoomCode(code)).toEqual({ ok: true, code });
    }
  });

  it.each([-1, ROOM_CODE_ALPHABET.length, 1.5, Number.NaN])(
    "rejects an out-of-range random index (%s)",
    (index) => {
      expect(() => generateRoomCode(() => index)).toThrow(RangeError);
    },
  );
});

describe("parseRoomCode", () => {
  it("accepts lowercase input surrounded by spaces", () => {
    expect(parseRoomCode("  abc23z ")).toEqual({ ok: true, code: "ABC23Z" });
  });

  it.each(["", "   "])("reports empty input (%j)", (input) => {
    expect(parseRoomCode(input)).toEqual({ ok: false, error: "EMPTY" });
  });

  it.each(["ABC23", "ABC23ZZ", "ABC 23Z"])("reports a wrong length (%s)", (input) => {
    expect(parseRoomCode(input)).toEqual({ ok: false, error: "WRONG_LENGTH" });
  });

  it.each(["ABC0EF", "ABCOEF", "ABC1EF", "ABCIEF", "abclef", "ABC-EF", "ÀBCDEF"])(
    "rejects a character outside the alphabet (%s)",
    (input) => {
      expect(parseRoomCode(input)).toEqual({ ok: false, error: "INVALID_CHARACTER" });
    },
  );
});
