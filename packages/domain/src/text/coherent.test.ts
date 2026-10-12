import { describe, expect, it } from "vitest";
import { applyPassageOptions, checkPassages, passageCut, type Passage } from "./coherent";
import type { CoherentTextSettings } from "./settings";
import { TEST_PASSAGES } from "./text.fixtures";
import { countWords } from "./words";

const all = { punctuation: true, numbers: true, capitals: true, accents: true };
const settings = (overrides: Partial<CoherentTextSettings> = {}): CoherentTextSettings => ({ kind: "coherent", language: "fr", wordCount: 10, complexity: "easy", options: all, ...overrides });

describe("applyPassageOptions", () => {
  const text = 'Le 20 juillet 1866, l\'équipage - "Nautilus" (1er) - est à quai : très-calme !';

  it("keeps the passage as is when every option is on", () => {
    expect(applyPassageOptions(text, all)).toBe(text);
  });

  it("numbers off: every token holding a digit goes whole, its trailing marks move back", () => {
    expect(applyPassageOptions(text, { ...all, numbers: false })).toBe('Le juillet, l\'équipage - "Nautilus" - est à quai : très-calme !');
  });

  it("punctuation off: marks and dash tokens go, apostrophes and hyphens inside words stay", () => {
    expect(applyPassageOptions(text, { ...all, punctuation: false })).toBe("Le 20 juillet 1866 l'équipage Nautilus 1er est à quai très-calme");
  });

  it("capitals off lowercases; accents off strips diacritics", () => {
    expect(applyPassageOptions("À l'Île", { ...all, capitals: false })).toBe("à l'île");
    expect(applyPassageOptions("À l'Île, très-été", { ...all, accents: false })).toBe("A l'Ile, tres-ete");
  });
});

describe("passageCut", () => {
  const passage = TEST_PASSAGES[0] as Passage;

  it("cuts after exactly N words from the passage's start, options applied first", () => {
    const cut = passageCut(passage, settings({ wordCount: 12, options: { ...all, punctuation: false } }));
    expect(cut).toBe("Le vent souffle sur la mer bleue Un marin chante au port");
    expect(countWords(cut ?? "")).toBe(12);
  });

  it("serves only its language and complexity, and only when long enough", () => {
    expect(passageCut(passage, settings({ language: "en" }))).toBeUndefined();
    expect(passageCut(passage, settings({ complexity: "hard" }))).toBeUndefined();
    expect(passageCut({ ...passage, text: "Le vent souffle." }, settings())).toBeUndefined();
  });
});

describe("checkPassages", () => {
  it("accepts the normalised fixtures and refuses an unnormalised text or a repeated id", () => {
    expect(() => checkPassages(TEST_PASSAGES)).not.toThrow();
    expect(() => checkPassages([{ ...(TEST_PASSAGES[0] as Passage), text: "C’est" }])).toThrow(RangeError);
    expect(() => checkPassages([TEST_PASSAGES[0] as Passage, TEST_PASSAGES[0] as Passage])).toThrow(RangeError);
  });
});

describe("applyPassageOptions: numbers off keeps the marks balanced", () => {
  const off = { punctuation: true, numbers: false, capitals: true, accents: true };

  it("moves an opening quote onto the next word and never doubles an end mark", () => {
    expect(applyPassageOptions('Il dit "1866 fut une année" puis rien.', off)).toBe('Il dit "fut une année" puis rien.');
    expect(applyPassageOptions("la mer. 1866. Puis le vent", off)).toBe("la mer. Puis le vent");
    expect(applyPassageOptions("la fin - 1866. Le jour", off)).toBe("la fin. - Le jour");
  });
});
