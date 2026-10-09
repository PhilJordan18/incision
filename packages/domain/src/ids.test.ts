import { describe, expect, it } from "vitest";
import { asEntrantId, asRaceId, compareIds } from "./ids";

describe("identifiers", () => {
  it("accepts server ids such as UUIDs, up to 64 characters", () => {
    expect(asRaceId("6f1c2a9e-2b7d-4c1e-9f00-1a2b3c4d5e6f")).toBe("6f1c2a9e-2b7d-4c1e-9f00-1a2b3c4d5e6f");
    expect(asEntrantId("a".repeat(64))).toHaveLength(64);
  });

  it.each(["", "a".repeat(65), "has space", "é"])("refuses %j", (value) => {
    expect(() => asEntrantId(value)).toThrow(RangeError);
  });

  it("orders ids by code unit, independently of any locale", () => {
    expect(["b", "a", "B", "_"].sort(compareIds)).toEqual(["B", "_", "a", "b"]);
  });
});
