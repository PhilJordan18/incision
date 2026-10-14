import { asDuration, asEntrantId, containsLineBreak, createRaceRefusal } from "@incision/domain";
import { describe, expect, it } from "vitest";
import { FIRST_RACE_SETTINGS } from "./race-service";
import { FIXTURE_RACE_TEXTS } from "./race-texts";

describe("the fixture race texts", () => {
  it.each(Object.entries(FIXTURE_RACE_TEXTS))("in %s: no line break (D-16), and the engine accepts it with the first path's settings", (_locale, text) => {
    expect(containsLineBreak(text)).toBe(false);
    const participants = ["a", "b"].map((id) => ({ entrantId: asEntrantId(id), kind: "human" as const }));
    expect(createRaceRefusal({ participants, text, timeLimit: asDuration(FIRST_RACE_SETTINGS.timeLimitMs) })).toBeUndefined();
  });

  it("uses no typographic apostrophe, which a keyboard does not type directly", () => {
    for (const text of Object.values(FIXTURE_RACE_TEXTS)) {
      expect(text).not.toMatch(/[‘’“”]/u);
    }
  });
});
