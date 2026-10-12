import { asDuration, asEntrantId, containsLineBreak, createRaceRefusal } from "@incision/domain";
import { describe, expect, it } from "vitest";
import { FIRST_RACE_SETTINGS } from "./race-service";
import { FIXTURE_RACE_TEXTS, RACE_TEXTS } from "./race-texts";

const ALL = [
  ...Object.entries(RACE_TEXTS).map(([locale, text]) => [`chosen ${locale}`, text] as const),
  ...Object.entries(FIXTURE_RACE_TEXTS).map(([locale, text]) => [`fixture ${locale}`, text] as const),
];

describe("the race texts", () => {
  it.each(ALL)("%s: no line break (D-16), and the engine accepts it with the first path's settings", (_name, { text }) => {
    expect(containsLineBreak(text)).toBe(false);
    const participants = ["a", "b"].map((id) => ({ entrantId: asEntrantId(id), kind: "human" as const }));
    expect(createRaceRefusal({ participants, text, timeLimit: asDuration(FIRST_RACE_SETTINGS.timeLimitMs) })).toBeUndefined();
  });

  it.each(ALL)("%s: only characters a keyboard types directly, in their composed form", (_name, { text }) => {
    // Curly quotes and apostrophes, non-breaking and other special spaces, tabs.
    expect(text).not.toMatch(/[‘’“”  -​ \t]/u);
    expect(text).toBe(text.normalize("NFC"));
    expect(text).toBe(text.trim());
    expect(text).not.toMatch(/ {2}/);
  });

  it("names each chosen text and its source, and never passes a fixture off as one", () => {
    expect(RACE_TEXTS.fr.id).not.toBe(RACE_TEXTS.en.id);
    for (const chosen of Object.values(RACE_TEXTS)) {
      expect(chosen.id).not.toBe("fixture");
      expect(chosen.source).toBeDefined();
      for (const fixture of Object.values(FIXTURE_RACE_TEXTS)) {
        expect(chosen.text).not.toBe(fixture.text);
      }
    }
    for (const fixture of Object.values(FIXTURE_RACE_TEXTS)) {
      expect(fixture.id).toBe("fixture");
      expect(fixture.source).toBeUndefined();
      expect(fixture.text).toMatch(/^(Texte de test|Test text)\b/);
    }
  });
});
