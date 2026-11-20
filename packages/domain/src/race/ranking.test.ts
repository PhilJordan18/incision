import { describe, expect, it } from "vitest";
import { asEntrantId, type EntrantId } from "../ids";
import { asInstant, MAX_INSTANT, type Instant } from "../time";
import { rankEntrants } from "./ranking";
import { RANKING_EXAMPLES } from "./ranking.examples";
import type { RankInput, TerminalStatus } from "./types";

const id = (value: string): EntrantId => asEntrantId(value);
const at = (milliseconds: number): Instant => asInstant(1_000_000 + milliseconds);

function order(entrants: readonly RankInput[]): string[] {
  return rankEntrants(entrants).map((ranked) => ranked.entrantId);
}

function permutations<T>(items: readonly T[]): T[][] {
  if (items.length <= 1) {
    return [[...items]];
  }
  return items.flatMap((item, index) => permutations([...items.slice(0, index), ...items.slice(index + 1)]).map((rest) => [item, ...rest]));
}

/** Every group, with exact ties on the main key resolved by accuracy and by id. */
const tied: readonly RankInput[] = [
  { entrantId: id("f-b"), status: "finished", endedAt: at(30_000), position: 50, length: 50, accuracy: 90 },
  { entrantId: id("f-a"), status: "finished", endedAt: at(30_000), position: 50, length: 50, accuracy: 90 },
  { entrantId: id("f-c"), status: "finished", endedAt: at(30_000), position: 50, length: 50, accuracy: 99 },
  { entrantId: id("t-b"), status: "timedOut", endedAt: at(60_000), position: 25, length: 50, accuracy: 80 },
  { entrantId: id("t-a"), status: "timedOut", endedAt: at(60_000), position: 50, length: 100, accuracy: 80 },
  { entrantId: id("x-a"), status: "abandoned", endedAt: at(10_000), position: 10, length: 50, accuracy: 70 },
];

describe("rankEntrants (COURSE-10)", () => {
  it.each(RANKING_EXAMPLES.map((example) => [example.name, example] as const))("%s", (_name, example) => {
    expect(order(example.input)).toEqual(example.expected);
  });

  it("gives ranks 1 to n, each once", () => {
    expect(rankEntrants(tied).map((ranked) => ranked.rank)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it("gives the same order whatever the input order, ties included (720 orders)", () => {
    const expected = ["f-c", "f-a", "f-b", "t-a", "t-b", "x-a"];
    for (const permutation of permutations(tied)) {
      expect(order(permutation)).toEqual(expected);
    }
  });

  it("orders abandons by progress, never by the time of the abandon", () => {
    // Earlier-first would give b, a, c and later-first c, a, b: only the id order gives a, b, c.
    expect(
      order([
        { entrantId: id("b"), status: "abandoned", endedAt: at(-3_000), position: 0, length: 100, accuracy: 0 },
        { entrantId: id("c"), status: "abandoned", endedAt: at(-1_000), position: 0, length: 100, accuracy: 0 },
        { entrantId: id("a"), status: "abandoned", endedAt: at(-2_000), position: 0, length: 100, accuracy: 0 },
      ]),
    ).toEqual(["a", "b", "c"]);
  });

  it("leaves the input untouched", () => {
    const input = Object.freeze(tied.map((entrant) => Object.freeze({ ...entrant })));
    expect(() => rankEntrants(input)).not.toThrow();
    expect(input.map((entrant) => entrant.entrantId)).toEqual(["f-b", "f-a", "f-c", "t-b", "t-a", "x-a"]);
  });

  it("separates finishers arriving at the same instant by accuracy, then id", () => {
    expect(
      order([
        { entrantId: id("b"), status: "finished", endedAt: at(30_000), position: 50, length: 50, accuracy: 95 },
        { entrantId: id("c"), status: "finished", endedAt: at(30_000), position: 50, length: 50, accuracy: 98 },
        { entrantId: id("a"), status: "finished", endedAt: at(30_000), position: 50, length: 50, accuracy: 95 },
      ]),
    ).toEqual(["c", "a", "b"]);
  });

  it("compares very long effective lengths exactly, where floating point would see a tie", () => {
    const big = Number.MAX_SAFE_INTEGER;
    // (big − 1) ÷ big is ahead of (big − 2) ÷ (big − 1). As floats both round to the same value
    // (1 − 2⁻⁵³), and the id order (a before z) would wrongly decide. This covers the whole accepted
    // domain (any safe integer), beyond real texts.
    expect(
      order([
        { entrantId: id("a-behind"), status: "timedOut", endedAt: at(60_000), position: big - 2, length: big - 1, accuracy: 100 },
        { entrantId: id("z-ahead"), status: "timedOut", endedAt: at(60_000), position: big - 1, length: big, accuracy: 100 },
      ]),
    ).toEqual(["z-ahead", "a-behind"]);
  });

  it("ranks an empty race as empty", () => {
    expect(rankEntrants([])).toEqual([]);
  });

  const valid: RankInput = { entrantId: id("x"), status: "timedOut", endedAt: at(60_000), position: 1, length: 2, accuracy: 50 };
  it.each([
    ["a duplicate entrant", [valid, { ...valid }]],
    ["a zero length", [{ ...valid, length: 0, position: 0 }]],
    ["a position beyond the length", [{ ...valid, position: 3 }]],
    ["a fractional position", [{ ...valid, position: 0.5 }]],
    ["a negative position", [{ ...valid, position: -1 }]],
    ["a fractional length", [{ ...valid, length: 2.5 }]],
    ["a length that is NaN", [{ ...valid, length: Number.NaN }]],
    ["an accuracy above 100", [{ ...valid, accuracy: 101 }]],
    ["a negative accuracy", [{ ...valid, accuracy: -1 }]],
    ["a status outside the three groups", [{ ...valid, status: "racing" as TerminalStatus }]],
    ["a status named like an object property", [{ ...valid, status: "toString" as TerminalStatus }]],
    ["an accuracy that is NaN", [{ ...valid, accuracy: Number.NaN }]],
    ["an instant beyond the accepted range", [{ ...valid, endedAt: (MAX_INSTANT + 1) as Instant }]],
  ])("refuses %s as a programming error", (_label, entrants) => {
    expect(() => rankEntrants(entrants)).toThrow(RangeError);
  });
});
