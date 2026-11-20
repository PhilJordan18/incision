import { asDuration, asEntrantId, asInstant, asRaceId, createRace, type RaceState, type RandomWords, type TextSettings } from "@incision/domain";
import { describe, expect, it, vi } from "vitest";
import { extensionContent, extensionSettings } from "./race-extension";

/** Approved-looking words (not a fixture version), injected so the test never depends on the shipped lists. */
function words(): RandomWords {
  const version = "test-approved-1";
  const list = ["mer", "vent", "port", "voile", "cap", "phare", "sable", "vague", "quai", "nord", "sud", "ciel"];
  return { list: { language: "fr", version, entries: list.map((word, index) => ({ word, zipf: 6 - index / 100 })) }, exclusions: { language: "fr", version, words: [] }, pairs: { language: "fr", version, pairs: [] } };
}

const COHERENT: TextSettings = { kind: "coherent", language: "fr", wordCount: 50, complexity: "easy", options: { punctuation: true, numbers: false, capitals: true, accents: true } };
const RANDOM: TextSettings = { ...COHERENT, kind: "random", include: ["k"], exclude: ["z"] };

function race(): RaceState {
  const created = createRace({ raceId: asRaceId("race-1"), now: asInstant(0), text: "la mer est calme", errorMode: "mandatory", timeLimit: asDuration(60_000),
    participants: [{ entrantId: asEntrantId("alice"), kind: "human" }, { entrantId: asEntrantId("bob"), kind: "human" }] });
  if (!created.ok) throw new Error(created.reason);
  return created.race;
}

const grant = { entrantId: asEntrantId("alice"), milestone: 25 as const, kind: "extendLeader" as const };

describe("extensionSettings", () => {
  it("keeps the race's language, complexity and options, and a random race's excluded characters only", () => {
    expect(extensionSettings(COHERENT)).toEqual({ language: "fr", complexity: "easy", options: COHERENT.options });
    expect(extensionSettings(RANDOM)).toEqual({ language: "fr", complexity: "easy", options: COHERENT.options, exclude: ["z"] });
  });
});

describe("extensionContent", () => {
  it("draws three approved words for a grant and a target text, the same each time, memoised", () => {
    const data = vi.fn(words);
    const content = extensionContent({ settings: COHERENT, seed: [1, 2, 3, 4], words: data, logError: vi.fn() });
    const first = content({ race: race(), grant, targetId: asEntrantId("bob") });
    expect(first).toHaveLength(3);
    expect(first?.every((word) => words().list.entries.some((entry) => entry.word === word.toLowerCase()))).toBe(true);
    expect(content({ race: race(), grant, targetId: asEntrantId("bob") })).toEqual(first);
    expect(data).toHaveBeenCalledTimes(1);
  });

  it("gives other words for another seed: the seed is the race's private stream", () => {
    const draws = [[1, 2, 3, 4], [9, 9, 9, 9], [5, 6, 7, 8]].map((seed) => extensionContent({ settings: COHERENT, seed: seed as [number, number, number, number], words, logError: vi.fn() })({ race: race(), grant, targetId: asEntrantId("bob") }));
    expect(new Set(draws.map((draw) => draw?.join(" "))).size).toBeGreaterThan(1);
  });

  it("is unavailable without an approved list, logging the reason and never a word", () => {
    const logError = vi.fn();
    expect(extensionContent({ settings: COHERENT, seed: [1, 2, 3, 4], words: () => undefined, logError })({ race: race(), grant, targetId: asEntrantId("bob") })).toBeUndefined();
    expect(logError).toHaveBeenCalledWith("[races] bonus extension unavailable: no approved word list");
  });

  it("is unavailable for an unknown target", () => {
    expect(extensionContent({ settings: COHERENT, seed: [1, 2, 3, 4], words, logError: vi.fn() })({ race: race(), grant, targetId: asEntrantId("nobody") })).toBeUndefined();
  });
});
