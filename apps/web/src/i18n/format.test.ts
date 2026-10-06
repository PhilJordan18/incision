import { describe, expect, it } from "vitest";
import { format } from "./format";

describe("format", () => {
  it("fills named placeholders and leaves unknown ones", () => {
    expect(format("{count} / {capacity} participants", { count: 2, capacity: 30 })).toBe("2 / 30 participants");
    expect(format("Salle {code} {other}", { code: "B7K4PQ" })).toBe("Salle B7K4PQ {other}");
  });
});
