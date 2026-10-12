import { describe, expect, it } from "vitest";
import { normalizePassage } from "./normalize";
import { countWords, cutToWords } from "./words";

const NBSP = String.fromCodePoint(0xa0);
const NNBSP = String.fromCodePoint(0x202f);
const SOFT_HYPHEN = String.fromCodePoint(0xad);
const PRIME = String.fromCodePoint(0x2032);
const ok = (source: string, language: "fr" | "en" = "fr"): string => {
  const result = normalizePassage(source, language);
  if (!result.ok) throw new Error(`refused: ${result.reason} ${result.character}`);
  return result.text;
};

describe("normalizePassage (version 1)", () => {
  it("makes spaces, apostrophes, quotes and ellipses typable, and reports what it changed", () => {
    const result = normalizePassage(`C’est « la mer »${NBSP}! Il dit${NNBSP}: “oui”…`, "fr");
    expect(result).toEqual({ ok: true, text: `C'est "la mer" ! Il dit : "oui"...`, changes: ["spaces", "apostrophes", "quotes", "ellipsis"] });
  });

  it("turns sentence dashes into a hyphen between spaces and keeps hyphens inside words", () => {
    expect(ok("plans--not even the Spy-glass--could", "en")).toBe("plans - not even the Spy-glass - could");
    expect(ok(`— Non, répondit-elle — sans hésiter.`)).toBe("- Non, répondit-elle - sans hésiter.");
    expect(ok("a–b", "en")).toBe("a - b");
    expect(countWords(ok("ham--plain", "en"))).toBe(2);
  });

  it("keeps one space before ; : ! ? in French and none in English", () => {
    expect(ok("Riche? Oui!")).toBe("Riche ? Oui !");
    expect(ok(`mers${NBSP}; ses courants`)).toBe("mers ; ses courants");
    expect(ok("Riche ? Oui !", "en")).toBe("Riche? Oui!");
  });

  it("joins lines and collapses runs of spaces", () => {
    expect(ok("  un\n\tdeux    trois  ")).toBe("un deux trois");
  });

  it("is idempotent", () => {
    for (const source of [`C’est « la mer »${NBSP}!`, "plans--not even", "Riche? Oui!", "Alice “said”… — no."]) {
      for (const language of ["fr", "en"] as const) {
        const first = normalizePassage(source, language);
        if (first.ok) expect(normalizePassage(first.text, language)).toEqual({ ok: true, text: first.text, changes: [] });
      }
    }
  });

  it("refuses invisible characters and primes with their position in the source", () => {
    expect(normalizePassage(`ab${SOFT_HYPHEN}c`, "fr")).toEqual({ ok: false, reason: "REFUSED_CHARACTER", character: SOFT_HYPHEN, position: 2 });
    expect(normalizePassage(`l${PRIME}eau`, "fr")).toMatchObject({ ok: false, reason: "REFUSED_CHARACTER", position: 1 });
  });

  it("refuses untypable characters with their position, œ included until P-4", () => {
    expect(normalizePassage("son œil", "fr")).toEqual({ ok: false, reason: "UNTYPABLE_CHARACTER", character: "œ", position: 4 });
    expect(normalizePassage("idiоt", "en")).toMatchObject({ ok: false, reason: "UNTYPABLE_CHARACTER", position: 3 });
    expect(normalizePassage("café", "en")).toMatchObject({ ok: false, reason: "UNTYPABLE_CHARACTER", character: "é" });
    expect(normalizePassage("   ", "fr")).toMatchObject({ ok: false, reason: "EMPTY" });
  });
});

describe("countWords and cutToWords (D-10)", () => {
  it("counts tokens holding a letter or a digit, not punctuation alone", () => {
    expect(countWords("Il dit : oui ! 1866 - fin.")).toBe(5);
    expect(countWords("")).toBe(0);
  });

  it("cuts after the Nth word and keeps the punctuation that follows it", () => {
    expect(cutToWords("la mer ; le port ! le vent", 2)).toBe("la mer ;");
    expect(cutToWords("la mer ; le port ! le vent", 4)).toBe("la mer ; le port !");
    expect(() => cutToWords("la mer", 3)).toThrow(RangeError);
  });
});

describe("normalizePassage: review findings", () => {
  const ch = (code: number): string => String.fromCodePoint(code);

  it("keeps times and references intact and spaces after other marks", () => {
    expect(ok("Il est 10:30, verset 3:16.")).toBe("Il est 10:30, verset 3:16.");
    expect(ok("etc.: Quoi...? Oui!?")).toBe("etc. : Quoi... ? Oui !?");
  });

  it("records every change, Unicode composition and space collapsing included", () => {
    expect(normalizePassage("  un  deux ", "fr")).toEqual({ ok: true, text: "un deux", changes: ["spaces"] });
    expect(normalizePassage(`${ch(0x212a)}ilo`, "en")).toEqual({ ok: true, text: "Kilo", changes: ["unicode"] });
  });

  it("turns typographic hyphens inside a word into a plain hyphen", () => {
    expect(normalizePassage(`répondit${ch(0x2011)}elle`, "fr")).toEqual({ ok: true, text: "répondit-elle", changes: ["hyphens"] });
  });

  it("refuses bidirectional controls, wherever they stand", () => {
    for (const code of [0x202e, 0x2066, 0x2067, 0x2068, 0x2069, 0x200e, 0x200f]) {
      expect(normalizePassage(`la ${ch(code)}mer`, "fr")).toMatchObject({ ok: false, reason: "UNTYPABLE_CHARACTER", position: 3 });
      expect(normalizePassage(`${ch(code)}la mer`, "fr")).toMatchObject({ ok: false, reason: "UNTYPABLE_CHARACTER", position: 0 });
    }
  });

  it("never ends a cut on a lone dash or an opening mark", () => {
    expect(cutToWords("plans - not even", 1)).toBe("plans");
    expect(cutToWords("un deux ( trois", 2)).toBe("un deux");
  });
});

describe("normalizePassage and cutToWords: confirmation findings", () => {
  const EM = String.fromCodePoint(0x2014);

  it("turns a run of dashes into one spaced dash, and stays idempotent", () => {
    const cases: readonly (readonly [string, string])[] = [
      [`Mme de ${EM}${EM} arriva.`, "Mme de - arriva."],
      [`a ${EM} ${EM} b`, "a - b"],
      ["a -- -- b", "a - b"],
      [`fin.${EM}${EM}Début`, "fin. - Début"],
      [`${EM} Oui, dit-il ${EM}`, "- Oui, dit-il -"],
    ];
    for (const [source, expected] of cases) {
      expect(ok(source)).toBe(expected);
      expect(normalizePassage(expected, "fr")).toEqual({ ok: true, text: expected, changes: [] });
    }
  });

  it("keeps a closing quote after the last word's mark, never an opening one", () => {
    expect(cutToWords(ok("Il cria : « Oui ! » puis rien."), 3)).toBe('Il cria : "Oui !"');
    expect(cutToWords('un deux " trois', 2)).toBe("un deux");
  });
});
