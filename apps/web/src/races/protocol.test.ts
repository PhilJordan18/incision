import { MAX_BATCH_EVENTS } from "@incision/domain";
import { describe, expect, it } from "vitest";
import { abandonPayloadSchema, keystrokeBatchPayloadSchema } from "./protocol";

const RACE = "6f1d2c3b-4a5e-4f60-8a7b-9c8d7e6f5a4b";
const batch = (change: Record<string, unknown> = {}) => ({ raceId: RACE, seq: 1, textVersion: 0, events: [{ type: "insert", grapheme: "a" }], ...change });

describe("keystrokeBatchPayloadSchema", () => {
  it("accepts a batch the engine can judge, inserts of one grapheme of any size included", () => {
    expect(keystrokeBatchPayloadSchema.safeParse(batch()).success).toBe(true);
    const events = [{ type: "insert", grapheme: "👩‍👩‍👧‍👦" }, { type: "insert", grapheme: "é" }, { type: "deleteBackward" }];
    expect(keystrokeBatchPayloadSchema.safeParse(batch({ events })).success).toBe(true);
    const full = Array.from({ length: MAX_BATCH_EVENTS }, () => ({ type: "deleteBackward" }));
    expect(keystrokeBatchPayloadSchema.safeParse(batch({ events: full })).success).toBe(true);
  });

  it.each([
    ["a null event", { events: [null] }],
    ["events that are not an array", { events: { 0: { type: "insert", grapheme: "a" } } }],
    ["no event", { events: [] }],
    ["more events than the engine takes", { events: Array.from({ length: MAX_BATCH_EVENTS + 1 }, () => ({ type: "deleteBackward" })) }],
    ["an unknown event type", { events: [{ type: "paste", text: "abc" }] }],
    ["Enter", { events: [{ type: "insert", grapheme: "\n" }] }],
    ["a carriage return", { events: [{ type: "insert", grapheme: "\r\n" }] }],
    ["an empty insert", { events: [{ type: "insert", grapheme: "" }] }],
    ["an oversized insert", { events: [{ type: "insert", grapheme: "a".repeat(65) }] }],
    ["an extra field on an event", { events: [{ type: "deleteBackward", count: 3 }] }],
    ["a sequence below 1", { seq: 0 }],
    ["a fractional sequence", { seq: 1.5 }],
    ["an unsafe sequence", { seq: Number.MAX_SAFE_INTEGER + 2 }],
    ["a negative text version", { textVersion: -1 }],
    ["a race id that is not a UUID", { raceId: "race-1" }],
    ["an entrant id from the client", { entrantId: RACE }],
  ])("refuses %s", (_label, change) => {
    expect(keystrokeBatchPayloadSchema.safeParse(batch(change)).success).toBe(false);
  });

  it("refuses a payload that is not an object", () => {
    for (const payload of [null, "batch", 42, [batch()]]) {
      expect(keystrokeBatchPayloadSchema.safeParse(payload).success).toBe(false);
    }
  });
});

describe("abandonPayloadSchema", () => {
  it("takes the race only: the reason is the server's", () => {
    expect(abandonPayloadSchema.safeParse({ raceId: RACE }).success).toBe(true);
    expect(abandonPayloadSchema.safeParse({ raceId: RACE, reason: "disconnection" }).success).toBe(false);
  });
});
