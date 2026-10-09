import { describe, expect, it } from "vitest";
import { MEASURES_EXAMPLES } from "./measures/measures.examples";
import { KEYSTROKE_EXAMPLES } from "./race/keystrokes.examples";
import { RACE_EXAMPLES } from "./race/race.examples";
import { RANKING_EXAMPLES } from "./race/ranking.examples";

/**
 * The worked examples load (their instants and ids pass the validators) and are named uniquely.
 * This is not a functional test: each set runs against its function in the implementing card.
 */
describe.each([
  ["measures (F-02.1)", MEASURES_EXAMPLES],
  ["ranking (F-02.2)", RANKING_EXAMPLES],
  ["keystrokes (F-04.4)", KEYSTROKE_EXAMPLES],
  ["race (F-04.1)", RACE_EXAMPLES],
])("%s examples", (_label, examples) => {
  it("exist and have unique names", () => {
    const names = examples.map((example) => example.name);
    expect(names.length).toBeGreaterThan(0);
    expect(new Set(names).size).toBe(names.length);
  });
});
