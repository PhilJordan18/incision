import { describe, expect, it } from "vitest";
import { bonusActivationPayloadSchema } from "./bonus-protocol";

const valid = { raceId: "6f1d2c3b-4a5e-4f60-8a7b-9c8d7e6f5a4b", seq: 1, milestone: 25 };
describe("bonus activation wire boundary", () => {
  it("accepts only the command identity", () => expect(bonusActivationPayloadSchema.parse(valid)).toEqual(valid));
  it.each([0, -1, 1.5, Infinity, NaN, Number.MAX_SAFE_INTEGER + 1, "1"])("refuses sequence %s", (seq) => {
    expect(bonusActivationPayloadSchema.safeParse({ ...valid, seq }).success).toBe(false);
  });
  it.each(["entrantId", "targetId", "kind", "now", "words", "state", "random"])("refuses client %s", (key) => {
    expect(bonusActivationPayloadSchema.safeParse({ ...valid, [key]: "forged" }).success).toBe(false);
  });
  it.each([null, {}, [], { ...valid, milestone: 26 }, { ...valid, raceId: "wrong" }])("refuses malformed input", (value) => {
    expect(bonusActivationPayloadSchema.safeParse(value).success).toBe(false);
  });
});
