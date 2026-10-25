import { describe, expect, it } from "vitest";
import { formatDate, formatNumber } from "./value-format";

describe("shared locale formats", () => {
  it("uses the interface language for grouping and decimal separators", () => {
    expect(formatNumber(1234.5, "fr")).toBe("1\u202f234,5");
    expect(formatNumber(1234.5, "en")).toBe("1,234.5");
    expect(formatNumber(-12.5, "fr")).toBe("-12,5");
    expect(formatNumber(0, "en")).toBe("0");
  });

  it("preserves the caller's precision and percentage rounding", () => {
    expect(formatNumber(41.6, "fr", { maximumFractionDigits: 0 })).toBe("42");
    expect(formatNumber(0.9644, "fr", { style: "percent", maximumFractionDigits: 1 })).toBe("96,4\u00a0%");
    expect(formatNumber(0.9644, "en", { style: "percent", maximumFractionDigits: 1 })).toBe("96.4%");
    expect(formatNumber(0.999, "en", { style: "percent", maximumFractionDigits: 0, roundingMode: "floor" })).toBe("99%");
  });

  it("formats the same instant in French and English with a caller-selected zone", () => {
    const instant = new Date("2026-10-25T00:30:00Z");
    const options = { timeZone: "UTC", year: "numeric", month: "long", day: "numeric" } as const;
    expect(formatDate(instant, "fr", options)).toBe("25 octobre 2026");
    expect(formatDate(instant.getTime(), "en", options)).toBe("October 25, 2026");
    expect(formatDate(instant, "fr", { ...options, timeZone: "America/Toronto" })).toBe("24 octobre 2026");
    expect(formatDate(instant, "en", { ...options, timeZone: "America/Toronto" })).toBe("October 24, 2026");
  });
});
