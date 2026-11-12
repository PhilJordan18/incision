import { describe, expect, it } from "vitest";
import { CHARACTER_LAYOUTS, characterLayouts, representedCharacters } from "./character-layouts";

describe("expected-character references", () => {
  it("distinguishes the two Canadian variants without inventing a CA layout", () => {
    expect(representedCharacters("ca-french").has("è")).toBe(false);
    expect(representedCharacters("ca-multilingual").has("è")).toBe(true);
    expect(representedCharacters("ca-french").has("«")).toBe(true);
    expect(representedCharacters("ca-multilingual").has("«")).toBe(false);
  });
  it.each(CHARACTER_LAYOUTS)("%s neither duplicates nor folds characters and preserves outside counts", layout => {
    const characters = [...characterLayouts[layout].join(""), " "];
    const represented = representedCharacters(layout);
    expect(represented.size).toBe(characters.length);
    const errors = [{ grapheme: "é", count: 2 }, { grapheme: "É", count: 3 }, { grapheme: "e", count: 5 }, { grapheme: "è", count: 7 }, { grapheme: "Ж", count: 11 }, { grapheme: " ", count: 13 }];
    const inside = errors.filter(error => represented.has(error.grapheme));
    const outside = errors.filter(error => !represented.has(error.grapheme));
    expect(inside.length + outside.length).toBe(errors.length);
    expect([...inside, ...outside].reduce((sum, error) => sum + error.count, 0)).toBe(41);
    expect(outside).toContainEqual({ grapheme: "É", count: 3 });
    expect(outside).toContainEqual({ grapheme: "Ж", count: 11 });
  });
});
