import { describe, expect, it } from "vitest";
import { parseThemeChoice } from "./theme";

describe("parseThemeChoice", () => {
  it("keeps an explicit choice and falls back to the system for anything else", () => {
    expect(parseThemeChoice("abysse")).toBe("abysse");
    expect(parseThemeChoice("aube")).toBe("aube");
    expect(parseThemeChoice("system")).toBe("system");
    expect(parseThemeChoice("dark")).toBe("system");
    expect(parseThemeChoice(undefined)).toBe("system");
  });
});
