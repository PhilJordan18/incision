import { describe, expect, it } from "vitest";
import { parseHistoryCursor } from "./history";

const id = "00000000-0000-4000-8000-000000000001";
describe("history cursor", () => {
  it("preserves microseconds and the tie-breaking UUID", () => {
    expect(parseHistoryCursor(`older|2026-10-25T10:00:00.123456Z|${id}`))
      .toEqual(["older", "2026-10-25T10:00:00.123456Z", id]);
    expect(parseHistoryCursor(`newer|2026-10-25T10:00:00.123456Z|${id}`)?.[0]).toBe("newer");
    expect(parseHistoryCursor(undefined)).toBeUndefined();
  });
  it.each([
    "", [], ["x", "y"], "x".repeat(81), `older|2026-02-30T10:00:00.123456Z|${id}`,
    `older|0000-01-01T10:00:00.123456Z|${id}`,
    `older|2026-10-25T10:00:00.123Z|${id}`, `older|2026-10-25T10:00:00.123456Z|bad`,
    `all|2026-10-25T10:00:00.123456Z|${id}`, `older|2026-10-25T10:00:00.123456Z|${id}|extra`,
  ].map((value) => ({ value })))("rejects an invalid position ($value)", ({ value }) => {
    expect(parseHistoryCursor(value)).toBeNull();
  });
});
