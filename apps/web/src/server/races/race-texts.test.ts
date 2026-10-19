import { asDuration, asEntrantId, containsLineBreak, createRaceRefusal } from "@incision/domain";
import { describe, expect, it } from "vitest";
import { FIRST_RACE_SETTINGS } from "./race-service";
import { FIXTURE_RACE_TEXTS, RACE_TEXTS } from "./race-texts";

const ALL = [
  ...Object.entries(RACE_TEXTS).map(([locale, text]) => [`chosen ${locale}`, locale, text] as const),
  ...Object.entries(FIXTURE_RACE_TEXTS).map(([locale, text]) => [`fixture ${locale}`, locale, text] as const),
];

/**
 * What a keyboard of the language types directly, and nothing else: printable ASCII, plus the
 * French accented letters in French. No curly quote or apostrophe, no special space, dash or
 * ellipsis, no invisible character.
 */
const TYPABLE: Record<string, RegExp> = {
  en: /^[\x20-\x7E]+$/u,
  fr: /^[\x20-\x7EàâçéèêëîïôùûüÿÀÂÇÉÈÊËÎÏÔÙÛÜŸ]+$/u,
};

describe("the race texts", () => {
  it.each(ALL)("%s: no line break (D-16), and the engine accepts it with the first path's settings", (_name, _locale, { text }) => {
    expect(containsLineBreak(text)).toBe(false);
    const participants = ["a", "b"].map((id) => ({ entrantId: asEntrantId(id), kind: "human" as const }));
    expect(createRaceRefusal({ participants, text, timeLimit: asDuration(FIRST_RACE_SETTINGS.timeLimitMs) })).toBeUndefined();
  });

  it.each(ALL)("%s: only characters its keyboard types directly, in their composed form, single-spaced", (_name, locale, { text }) => {
    expect(text).toMatch(TYPABLE[locale] ?? /^$/);
    expect(text).toBe(text.normalize("NFC"));
    expect(text).toBe(text.trim());
    expect(text).not.toMatch(/ {2}/);
  });

  it("names each chosen text and its source, and never passes a fixture off as one", () => {
    expect(RACE_TEXTS.fr.id).not.toBe(RACE_TEXTS.en.id);
    for (const chosen of Object.values(RACE_TEXTS)) {
      expect(chosen.id).not.toBe("fixture");
      expect(chosen.source).toBeDefined();
      expect(chosen.text).not.toMatch(/^(Texte de test|Test text)\b/);
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
