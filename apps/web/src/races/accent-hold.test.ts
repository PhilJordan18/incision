import { toGraphemes } from "@incision/domain";
import { describe, expect, it } from "vitest";
import { accentVariant, holdsAccents } from "./accent-hold";

describe("holdsAccents", () => {
  it.each([..."aceiouyACEIOUY"])("holds %s for the OS accent menu", key => {
    expect(holdsAccents(key)).toBe(true);
  });

  it.each(["b", "T", "n", "s", " ", "é", "î", "Enter", "Backspace", "ee", ""])("sends %j at once", key => {
    expect(holdsAccents(key)).toBe(false);
  });
});

describe("accentVariant", () => {
  // The issue: holding i offered î, ï, ì, í, and only e was accepted.
  it.each([
    ["i", "î"], ["i", "ï"], ["i", "ì"], ["i", "í"],
    ["I", "Î"], ["I", "Ï"], ["I", "Ì"], ["I", "Í"],
  ])("accepts %s → %s as one grapheme", (base, candidate) => {
    const typed = accentVariant(base, candidate);
    expect(typed).toBe(candidate);
    expect(toGraphemes(typed!)).toEqual([candidate]);
  });

  // Every accented letter of the race texts, in both cases, plus the menu's other accents.
  it.each([
    ["a", "àâäáãåā"], ["A", "ÀÂÄÁÃÅĀ"],
    ["c", "çćč"], ["C", "ÇĆČ"],
    ["e", "éèêëēėę"], ["E", "ÉÈÊËĒĖĘ"],
    ["o", "ôöòóõō"], ["O", "ÔÖÒÓÕŌ"],
    ["u", "ùûüúū"], ["U", "ÙÛÜÚŪ"],
    ["y", "ÿ"], ["Y", "Ÿ"],
  ])("accepts every accent of %s: %s", (base, accents) => {
    for (const accent of accents) expect(accentVariant(base, accent)).toBe(accent);
  });

  it("composes a decomposed accent into the grapheme the text holds", () => {
    expect(accentVariant("i", "î")).toBe("î");
    expect(accentVariant("E", "É")).toBe("É");
  });

  it.each([
    ["i", "é", "another letter"],
    ["i", "Î", "the other case"],
    ["I", "î", "the other case"],
    ["i", "i", "the letter itself"],
    ["o", "œ", "a ligature, never in the texts"],
    ["a", "æ", "a ligature, never in the texts"],
    ["o", "ø", "a letter that does not decompose"],
    ["i", "îe", "two graphemes"],
    ["i", "iî", "two graphemes"],
    ["e", "é ", "a trailing space"],
    ["e", "unwanted text", "any text"],
    ["e", "", "nothing"],
    ["n", "ñ", "a letter that is not held"],
    ["t", "ţ", "a letter that is not held"],
  ])("refuses %s → %j: %s", (base, candidate) => {
    expect(accentVariant(base, candidate)).toBeUndefined();
  });
});
