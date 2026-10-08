import { describe, expect, it } from "vitest";
import { asEntrantId, type EntrantId } from "../ids";
import { asInstant, MAX_INSTANT, type Instant } from "../time";
import { rankEntrants } from "./ranking";
import { RANKING_EXAMPLES } from "./ranking.examples";
import type { RankInput } from "./types";

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

const mixed: readonly RankInput[] = [
  { entrantId: id("quitter"), status: "abandoned", endedAt: at(50_000), position: 95, length: 100, accuracy: 99 },
  { entrantId: id("slow"), status: "timedOut", endedAt: at(60_000), position: 80, length: 100, accuracy: 99 },
  { entrantId: id("winner"), status: "finished", endedAt: at(55_000), position: 100, length: 100, accuracy: 90 },
  { entrantId: id("close"), status: "timedOut", endedAt: at(60_000), position: 90, length: 100, accuracy: 70 },
];

describe("rankEntrants (COURSE-10)", () => {
  it.each(RANKING_EXAMPLES.map((example) => [example.name, example] as const))("%s", (_name, example) => {
    expect(order(example.input)).toEqual(example.expected);
  });

  it("gives ranks 1 to n, each once", () => {
    expect(rankEntrants(mixed).map((ranked) => ranked.rank)).toEqual([1, 2, 3, 4]);
  });

  it("gives the same order whatever the input order", () => {
    const expected = ["winner", "close", "slow", "quitter"];
    for (const permutation of permutations(mixed)) {
      expect(order(permutation)).toEqual(expected);
    }
  });

  it("leaves the input untouched", () => {
    const input = Object.freeze(mixed.map((entrant) => Object.freeze({ ...entrant })));
    expect(() => rankEntrants(input)).not.toThrow();
    expect(input.map((entrant) => entrant.entrantId)).toEqual(["quitter", "slow", "winner", "close"]);
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
    // (big − 1) ÷ big is ahead of (big − 2) ÷ (big − 1). As floats both are 1, and the id order
    // (a before z) would wrongly decide.
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
    ["an accuracy above 100", [{ ...valid, accuracy: 101 }]],
    ["an accuracy that is NaN", [{ ...valid, accuracy: Number.NaN }]],
    ["an instant beyond the accepted range", [{ ...valid, endedAt: (MAX_INSTANT + 1) as Instant }]],
  ])("refuses %s as a programming error", (_label, entrants) => {
    expect(() => rankEntrants(entrants)).toThrow(RangeError);
  });
});
