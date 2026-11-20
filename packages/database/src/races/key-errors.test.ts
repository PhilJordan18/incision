import { describe, expect, it } from "vitest";
import { checkedKeyErrors, keyErrorsFromEngine } from "./key-errors";

describe("private expected-grapheme aggregates", () => {
  it("keeps case, accents and spaces distinct and cumulative corrected errors", () => {
    const stored = keyErrorsFromEngine({ é: 3, E: 1, " ": 2 });
    expect(checkedKeyErrors(stored, { totalInputs: 10, correctInputs: 4 })).toEqual(stored);
    expect(stored.keys).toEqual([{ grapheme: " ", count: 2 }, { grapheme: "E", count: 1 }, { grapheme: "é", count: 3 }]);
  });
  it("distinguishes collected zero from missing historical data", () => {
    expect(checkedKeyErrors(keyErrorsFromEngine({}), { totalInputs: 4, correctInputs: 4 }).keys).toEqual([]);
    expect(() => checkedKeyErrors(undefined, { totalInputs: 4, correctInputs: 4 })).toThrow();
  });
  it.each(["ab", "", "e\u0301", "\n", "__proto__"])("rejects invalid expected cluster %j", (grapheme) => {
    expect(() => checkedKeyErrors({ version: 1, keys: [{ grapheme, count: 1 }] }, { totalInputs: 1, correctInputs: 0 })).toThrow();
  });
  it("does not mistake keyboard input limits for expected text limits", () => {
    const grapheme = "x" + "\u0301".repeat(30);
    expect(checkedKeyErrors(keyErrorsFromEngine({ [grapheme]: 1 }), { totalInputs: 1, correctInputs: 0 }).keys).toHaveLength(1);
  });
  it.each([0, -1, 0.5, Infinity, NaN, Number.MAX_SAFE_INTEGER])("rejects invalid count %j", (count) => {
    expect(() => checkedKeyErrors(keyErrorsFromEngine({ a: count }), { totalInputs: count, correctInputs: 0 })).toThrow();
  });
  it("rejects duplicate clusters and inconsistent totals", () => {
    expect(() => checkedKeyErrors({ version: 1, keys: [{ grapheme: "a", count: 1 }, { grapheme: "a", count: 1 }] }, { totalInputs: 2, correctInputs: 0 })).toThrow();
    expect(() => checkedKeyErrors(keyErrorsFromEngine({ a: 2 }), { totalInputs: 3, correctInputs: 0 })).toThrow();
  });
});
