import { describe, expect, it } from "vitest";
import type { WordList } from "../words/types";
import { classifyMeasures, MEASURED_WORDS, measureText, type PassageThresholds } from "./measure";

const list: WordList = {
  language: "fr",
  version: "test",
  entries: [
    { word: "la", zipf: 7 },
    { word: "mer", zipf: 5 },
    { word: "eau", zipf: 5 },
    { word: "est", zipf: 6 },
    { word: "calme", zipf: 4.2 },
    { word: "porte", zipf: 4.5 },
    { word: "avions", zipf: 4.3 },
    { word: "hydrographie", zipf: 2.6 },
  ],
};

describe("measureText", () => {
  it("measures M1 to M4 on the words, apart from the editorial appraisal", () => {
    const measures = measureText("La mer est calme ; l'eau, hydrographie !", list, 4);
    expect(measures).toMatchObject({ words: 6, measuredWords: 6 });
    expect(measures.meanLetters).toBeCloseTo((2 + 3 + 3 + 5 + 4 + 12) / 6);
    expect(measures.longWordShare).toBeCloseTo(100 / 6);
    expect(measures.rareWordShare).toBeCloseTo(100 / 6);
    // Specials: ";", "'" and "!" (the comma and the period are plain).
    expect(measures.specialPer100Words).toBeCloseTo(300 / 6);
  });

  it("looks up elisions and hyphenated parts, and leaves proper nouns out of the vocabulary measure", () => {
    const measures = measureText("La porte-avions de Nemo.", list, 4);
    expect(measures.unknownWords).toEqual(["de"]);
    expect(measures.rareWordShare).toBeCloseTo(100 / 3);
  });

  it("counts a word missing from the list as rare and reports it", () => {
    expect(measureText("La mer bleue", list, 4)).toMatchObject({ unknownWords: ["bleue"], rareWordShare: 100 / 3 });
  });

  it("measures only the first 200 words", () => {
    const text = `${Array.from({ length: MEASURED_WORDS }, () => "la").join(" ")} hydrographie hydrographie`;
    expect(measureText(text, list, 4)).toMatchObject({ words: 202, measuredWords: 200, longWordShare: 0, rareWordShare: 0 });
  });
});

describe("classifyMeasures", () => {
  const thresholds: PassageThresholds = { easyMaxMeanLetters: 4.5, easyMaxRareShare: 10, easyMaxSpecialPer100: 5, hardMinMeanLetters: 5.5, hardMinRareShare: 30, hardMinLongShare: 15 };
  const base = { words: 50, measuredWords: 50, meanLetters: 4, longWordShare: 0, rareWordShare: 5, specialPer100Words: 2, unknownWords: [] };

  it("is easy only when M1, M3 and M4 are all at or below their bounds", () => {
    expect(classifyMeasures(base, thresholds)).toBe("easy");
    expect(classifyMeasures({ ...base, meanLetters: 4.5, rareWordShare: 10, specialPer100Words: 5 }, thresholds)).toBe("easy");
    expect(classifyMeasures({ ...base, specialPer100Words: 5.1 }, thresholds)).toBe("medium");
  });

  it("is hard as soon as M1, M3 or M2 reaches its bound", () => {
    expect(classifyMeasures({ ...base, meanLetters: 5.5 }, thresholds)).toBe("hard");
    expect(classifyMeasures({ ...base, rareWordShare: 30 }, thresholds)).toBe("hard");
    expect(classifyMeasures({ ...base, longWordShare: 15 }, thresholds)).toBe("hard");
    expect(classifyMeasures({ ...base, meanLetters: 5 }, thresholds)).toBe("medium");
  });
});

describe("measureText: review findings", () => {
  it("does not let a dash token hide a sentence start, nor count numbers in M1", () => {
    // "Hydrographie" starts a sentence after the dash, so it is no proper noun and counts as rare.
    expect(measureText("La mer. - Hydrographie", list, 4).rareWordShare).toBeCloseTo(100 / 3);
    expect(measureText("12 34 mer", list, 4).meanLetters).toBe(3);
  });

  it("skips the euphonic t and keeps English I in the vocabulary measure", () => {
    const words: WordList = { language: "fr", version: "t", entries: [{ word: "va", zipf: 5 }, { word: "il", zipf: 6 }, { word: "la", zipf: 7 }] };
    expect(measureText("La va-t-il", words, 4)).toMatchObject({ rareWordShare: 0, unknownWords: [] });
    const english: WordList = { language: "en", version: "t", entries: [{ word: "so", zipf: 6 }, { word: "i", zipf: 6.5 }, { word: "ran", zipf: 4.8 }] };
    expect(measureText("So I ran", english, 4)).toMatchObject({ rareWordShare: 0, unknownWords: [] });
  });

  it("keeps English contractions of I in the vocabulary measure, and tokens with a digit out of M1 to M3", () => {
    // "i'm" is rare in this list, so counting it shows that it was measured, not set aside as a name.
    const english: WordList = { language: "en", version: "t", entries: [{ word: "so", zipf: 6 }, { word: "i'm", zipf: 3 }, { word: "here", zipf: 6 }] };
    expect(measureText("So I'm here", english, 4)).toMatchObject({ rareWordShare: 100 / 3, unknownWords: [] });
    expect(measureText("La 1er mer", list, 4)).toMatchObject({ measuredWords: 3, meanLetters: 2.5, rareWordShare: 0, unknownWords: [] });
  });
});
