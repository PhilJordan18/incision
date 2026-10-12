import { describe, expect, it } from "vitest";
import { buildWordPool, foldForExclusion, forbiddenPairRule } from "./pool";
import type { ExclusionList, ForbiddenPairList, WordList } from "./types";

const list = (...words: string[]): WordList => ({
  language: "fr",
  version: "test-1",
  entries: words.map((word, index) => ({ word, zipf: 5 - index / 100 })),
});
const exclusions = (...words: string[]): ExclusionList => ({ language: "fr", version: "excl-1", words });
const pairs = (...entries: [string, string][]): ForbiddenPairList => ({ language: "fr", version: "pairs-1", pairs: entries });

describe("foldForExclusion", () => {
  it.each([
    ["Connard", "connard"],
    ["pédé", "pede"],
    ["PÉDÉ", "pede"],
    ["Œuvre", "oeuvre"],
    ["cæcum", "caecum"],
    ["aujourd’hui", "aujourd'hui"],
    ["aujourd‘hui", "aujourd'hui"],
    ["ﬁn", "fin"],
    ["ｃｏｎ", "con"],
    ["idi\u200dot", "idiot"],
    ["idi\u00adot", "idiot"],
    ["maison", "maison"],
  ])("folds %s to %s", (word, folded) => {
    expect(foldForExclusion(word)).toBe(folded);
  });
});

describe("buildWordPool", () => {
  it("removes exclusions on exact folded forms, keeps order and versions", () => {
    const pool = buildWordPool({ list: list("maison", "pédé", "conte", "con", "jardin"), exclusions: exclusions("PEDE", "Con") });
    expect(pool.entries.map((entry) => entry.word)).toEqual(["maison", "conte", "jardin"]);
    expect([pool.language, pool.listVersion, pool.exclusionsVersion]).toEqual(["fr", "test-1", "excl-1"]);
  });

  it("never shows an excluded word to the accept filter, which sees the others once, in order", () => {
    const seen: string[] = [];
    const pool = buildWordPool({
      list: list("maison", "interdit", "jardin"),
      exclusions: exclusions("interdit"),
      accept: (entry) => {
        seen.push(entry.word);
        return entry.word !== "jardin";
      },
    });
    expect(seen).toEqual(["maison", "jardin"]);
    expect(pool.entries.map((entry) => entry.word)).toEqual(["maison"]);
  });

  it("may return an empty pool, which the generator will refuse before any draw (F-02.5)", () => {
    expect(buildWordPool({ list: list("seul"), exclusions: exclusions("seul") }).entries).toEqual([]);
  });

  it("refuses exclusions of another language", () => {
    expect(() => buildWordPool({ list: list("maison"), exclusions: { ...exclusions(), language: "en" } })).toThrow(RangeError);
  });

  it("never lets an excluded word through, over every combination of a small list (exhaustive)", () => {
    const words = ["maison", "Maison", "pédé", "pede", "œuvre", "oeuvre", "conte", "con"];
    for (let mask = 0; mask < 2 ** words.length; mask += 1) {
      const excluded = words.filter((_, index) => (mask >> index) & 1);
      const folded = new Set(excluded.map(foldForExclusion));
      const pool = buildWordPool({ list: list("maison", "pédé", "œuvre", "conte", "con"), exclusions: exclusions(...excluded) });
      expect(pool.entries.some((entry) => folded.has(foldForExclusion(entry.word)))).toBe(false);
      expect(pool.entries.length + [...new Set(["maison", "pede", "oeuvre", "conte", "con"])].filter((word) => folded.has(word)).length).toBe(5);
    }
  });
});

describe("forbiddenPairRule", () => {
  const rule = forbiddenPairRule(pairs(["sale", "juif"], ["dirty", "jew"]));

  it("forbids a listed pair in either order, on folded forms", () => {
    expect(rule("sale", "juif")).toBe(true);
    expect(rule("juif", "sale")).toBe(true);
    expect(rule("Sale", "Juif")).toBe(true);
    expect(rule("dirty", "jew")).toBe(true);
  });

  it("leaves each word drawable alone and next to anything else", () => {
    expect(rule("sale", "maison")).toBe(false);
    expect(rule("juif", "maison")).toBe(false);
    expect(rule("sale", "jew")).toBe(false);
    expect(rule("sale", "sale")).toBe(false);
    // Their halves concatenate to a listed pair ("juif" + "sale", "dirty" + "jew").
    expect(rule("juifsa", "le")).toBe(false);
    expect(rule("dirtyj", "ew")).toBe(false);
  });

  it("forbids nothing for an empty list", () => {
    expect(forbiddenPairRule(pairs())("sale", "juif")).toBe(false);
  });
});
