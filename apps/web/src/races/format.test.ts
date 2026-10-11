import { describe, expect, it } from "vitest";
import { en } from "../i18n/dictionaries/en";
import { fr } from "../i18n/dictionaries/fr";
import { formatAccuracy, formatClock, formatElapsed, formatProgress, formatWpm, ordinal } from "./format";

describe("race formats", () => {
  it("writes ranks as each language does", () => {
    expect([1, 2, 3, 11].map((rank) => ordinal(rank, "fr", fr.races.results.ordinal))).toEqual(["1er", "2e", "3e", "11e"]);
    expect([1, 2, 3, 4, 11, 12, 13, 21, 22].map((rank) => ordinal(rank, "en", en.races.results.ordinal))).toEqual([
      "1st",
      "2nd",
      "3rd",
      "4th",
      "11th",
      "12th",
      "13th",
      "21st",
      "22nd",
    ]);
  });

  it("shows times, speeds and accuracy rounded for display only", () => {
    expect(formatElapsed(12_345, "en")).toBe("0:12.3");
    expect(formatElapsed(125_000, "en")).toBe("2:05.0");
    expect(formatElapsed(20_512, "fr")).toBe("0:20,5");
    expect(formatClock(120_000)).toBe("2:00");
    expect(formatClock(59_001)).toBe("1:00");
    expect(formatClock(-5)).toBe("0:00");
    expect(formatWpm(41.6, "fr")).toBe("42");
    expect(formatAccuracy(96.44, "en")).toBe("96.4%");
    expect(formatAccuracy(96.44, "fr")).toMatch(/^96,4\s%$/u);
  });

  it("never shows 100 % progress before the last grapheme", () => {
    expect(formatProgress(199, 200, "en")).toBe("99%");
    expect(formatProgress(200, 200, "en")).toBe("100%");
    expect(formatProgress(0, 0, "en")).toBe("0%");
  });
});
