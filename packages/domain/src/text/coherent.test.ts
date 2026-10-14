import { describe, expect, it } from "vitest";
import { createRandom } from "../random/prng";
import { applyPassageOptions, checkPassages, MAX_PASSAGE_LENGTH, passageCut, type Passage } from "./coherent";
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

  it("spells a ligature out with the version 2 rule when accents are off", () => {
    expect(applyPassageOptions("Œuvre, ŒUVRE et sœur", { ...all, accents: false })).toBe("Oeuvre, OEUVRE et soeur");
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

  it("checks a corpus that can change again on every call, and a failing frozen one every time", () => {
    const corpus: Passage[] = [{ ...(TEST_PASSAGES[0] as Passage) }];
    checkPassages(corpus);
    corpus.push({ ...(TEST_PASSAGES[1] as Passage), text: "C’est" });
    expect(() => checkPassages(corpus)).toThrow(RangeError);
    expect(() => checkPassages([{ ...(TEST_PASSAGES[0] as Passage), text: "mer ".repeat(MAX_PASSAGE_LENGTH / 4).concat("vent") }])).toThrow(RangeError);
    const frozen = Object.freeze([Object.freeze({ ...(TEST_PASSAGES[0] as Passage), text: "C’est" })]);
    expect(() => checkPassages(frozen)).toThrow(RangeError);
    expect(() => checkPassages(frozen)).toThrow(RangeError);
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

describe("applyPassageOptions: numbers off removes a run of numbers whole", () => {
  const off = { punctuation: true, numbers: false, capitals: true, accents: true };

  it("takes the marks the numbers open and close with them", () => {
    expect(applyPassageOptions("Jules Verne (1828 - 1905) est né.", off)).toBe("Jules Verne est né.");
    expect(applyPassageOptions("Il paya (1 000) francs.", off)).toBe("Il paya francs.");
    expect(applyPassageOptions('Il cria "12 345 !" puis rien.', off)).toBe("Il cria ! puis rien.");
    expect(applyPassageOptions("La guerre de 1914 - 1918 fut longue.", off)).toBe("La guerre de fut longue.");
  });

  it("never crosses a quote, a parenthesis or a sentence end", () => {
    expect(applyPassageOptions("En 1914 (1918 pour d'autres) la guerre.", off)).toBe("En (pour d'autres) la guerre.");
    expect(applyPassageOptions("(Il 1491) 1837!", off)).toBe("(Il)!");
    expect(applyPassageOptions("Il compta 1, 2, 3 (4) fois.", off)).toBe("Il compta fois.");
    expect(applyPassageOptions("Il naquit en 1914. 1918 fut dure.", off)).toBe("Il naquit en. fut dure.");
    expect(applyPassageOptions("Il naquit en 1802 (1803 selon certains) à Besançon.", off)).toBe("Il naquit en (selon certains) à Besançon.");
    expect(applyPassageOptions("Ils étaient (au total 12) 13 jours en mer.", off)).toBe("Ils étaient (au total) jours en mer.");
    expect(applyPassageOptions('Il dit en 1914 "1918 sera la fin" sans rire.', off)).toBe('Il dit en "sera la fin" sans rire.');
  });

  it("never doubles an end mark standing alone, nor leaves a dash with nothing on one side", () => {
    expect(applyPassageOptions("Victoire ! 1918 ! La paix revient.", off)).toBe("Victoire ! La paix revient.");
    expect(applyPassageOptions("Combien ? 3 ? Non, 4 ! Puis rien.", off)).toBe("Combien ? Non, Puis rien.");
    expect(applyPassageOptions("Il cria 1918 ! puis rien.", off)).toBe("Il cria ! puis rien.");
    expect(applyPassageOptions("Victoire ! 1918, la paix revient.", off)).toBe("Victoire ! la paix revient.");
    expect(applyPassageOptions("La guerre - 1914 - commence ici.", off)).toBe("La guerre commence ici.");
    expect(applyPassageOptions("1914 - La guerre commence ici.", off)).toBe("La guerre commence ici.");
    expect(applyPassageOptions("La fin - 1866.", off)).toBe("La fin.");
  });

  it("weighs an end mark after a removed number against the token before the dash, in dialogue", () => {
    expect(applyPassageOptions("- Combien ? - 12. - Merci.", off)).toBe("- Combien ? Merci.");
    expect(applyPassageOptions("- Quelle année ? - 1918 ! - Bien.", off)).toBe("- Quelle année ? Bien.");
    expect(applyPassageOptions("- 1918 ! - Bien.", off)).toBe("Bien.");
  });

  it("keeps quotes and parentheses balanced over seeded passages", () => {
    const random = createRandom([0x0bad_cafe, 0x1234_5678, 0x9abc_def0, 0x0fed_cba9]);
    const pick = <T>(items: readonly T[]): T => items[random.index(items.length)] as T;
    const balanced = (text: string): boolean => {
      let depth = 0;
      for (const character of text) {
        depth += character === "(" ? 1 : character === ")" ? -1 : 0;
        if (depth < 0) return false;
      }
      return depth === 0 && [...text].filter((character) => character === '"').length % 2 === 0;
    };
    // Groups of words and numbers, each maybe wrapped, with commas, end marks and dashes between them.
    const group = (): string[] => {
      const tokens = Array.from({ length: 1 + random.index(4) }, () => pick(["mer", "vent", "port", "12", "1 000", "1914 - 1918", "3,"]).split(" ")).flat();
      const wrapper = pick(["", "", "(", '"']);
      if (wrapper !== "") {
        tokens[0] = wrapper + tokens[0];
        tokens[tokens.length - 1] = `${tokens[tokens.length - 1]}${wrapper === "(" ? ")" : '"'}`;
      }
      return tokens;
    };
    for (let round = 0; round < 3_000; round += 1) {
      // Separators include the dialogue shape: an end mark, then a dash before the next group.
      const tokens = [...Array.from({ length: 1 + random.index(5) }, () => [...group(), ...pick([[""], [""], [","], ["."], ["!"], ["-"], [".", "-"], ["!", "-"]])]).flat().filter((token) => token !== "")];
      // English attaches its marks; French keeps a space before "!".
      const passage = `Il ${tokens.join(" ")}`.replace(round % 2 === 0 ? / ([,.!])/gu : / ([,.])/gu, "$1");
      expect(balanced(passage)).toBe(true);
      const result = applyPassageOptions(passage, off);
      const resultTokens = result.split(" ");
      const doubled = resultTokens.some((token, index) => index > 0 && /^[.!?]$/u.test(token) && /[.!?]["')]*$/u.test(resultTokens[index - 1] ?? ""));
      expect({ passage, result, balanced: balanced(result), dashes: / - - /u.test(` ${result} `), doubled }).toEqual({ passage, result, balanced: true, dashes: false, doubled: false });
    }
  });
});
