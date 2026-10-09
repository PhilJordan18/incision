import { MAX_BATCH_EVENTS } from "@incision/domain";
import { describe, expect, it } from "vitest";
import { abandonPayloadSchema, keystrokeBatchPayloadSchema, parseKeystrokeBatch } from "./protocol";

const RACE = "6f1d2c3b-4a5e-4f60-8a7b-9c8d7e6f5a4b";
const batch = (change: Record<string, unknown> = {}) => ({ raceId: RACE, seq: 1, textVersion: 0, events: [{ type: "insert", grapheme: "a" }], ...change });
const deletions = (count: number) => Array.from({ length: count }, () => ({ type: "deleteBackward" }));

describe("keystroke batch payloads", () => {
  it("let through every batch the engine itself judges, its refusals included", () => {
    const forTheEngine = [
      batch(),
      batch({ events: [{ type: "insert", grapheme: "👩‍👩‍👧‍👦" }, { type: "insert", grapheme: "é" }, { type: "deleteBackward" }] }),
      // The engine refuses these with INVALID_INPUT or BATCH_TOO_LARGE, and a snapshot.
      batch({ seq: 0 }),
      batch({ seq: 1.5 }),
      batch({ textVersion: -1 }),
      batch({ events: [] }),
      batch({ events: [{ type: "insert", grapheme: "" }] }),
      batch({ events: [{ type: "insert", grapheme: "ab" }] }),
      batch({ events: deletions(MAX_BATCH_EVENTS + 1) }),
      // A line break counts as one wrong grapheme for the engine; the client never sends Enter (D-16).
      batch({ events: [{ type: "insert", grapheme: "\n" }] }),
    ];
    for (const payload of forTheEngine) {
      expect(parseKeystrokeBatch(payload).success).toBe(true);
    }
  });

  it.each([
    ["a null event", { events: [null] }],
    ["events that are not an array", { events: { 0: { type: "insert", grapheme: "a" } } }],
    ["an unknown event type", { events: [{ type: "paste", text: "abc" }] }],
    ["an extra field on an event", { events: [{ type: "deleteBackward", count: 3 }] }],
    ["an insert that is not a string", { events: [{ type: "insert", grapheme: 7 }] }],
    ["an insert beyond the wire bound", { events: [{ type: "insert", grapheme: "a".repeat(65) }] }],
    ["more events than a message carries", { events: deletions(2 * MAX_BATCH_EVENTS + 1) }],
    ["a sequence that is not a number", { seq: "1" }],
    ["a race id that is not a UUID", { raceId: "race-1" }],
    ["an entrant id from the client", { entrantId: RACE }],
  ])("refuse %s, which is not a batch", (_label, change) => {
    expect(parseKeystrokeBatch(batch(change)).success).toBe(false);
  });

  it("refuse a payload that is not an object", () => {
    for (const payload of [null, "batch", 42, [batch()]]) {
      expect(parseKeystrokeBatch(payload).success).toBe(false);
    }
  });

  it("refuse an oversized array before parsing any of its events", () => {
    const parsed = parseKeystrokeBatch(batch({ events: Array.from({ length: 40_000 }, () => ({ type: "insert", grapheme: "x".repeat(60) })) }));
    // The size step answers: no issue comes from the events themselves.
    expect(parsed.success ? [] : parsed.issues.map((issue) => issue.path.join("."))).toEqual(["events"]);
  });

  it("match the full schema whenever the size step passes", () => {
    expect(keystrokeBatchPayloadSchema.safeParse(batch()).success).toBe(parseKeystrokeBatch(batch()).success);
  });
});

describe("abandonPayloadSchema", () => {
  it("takes the race only: the reason is the server's", () => {
    expect(abandonPayloadSchema.safeParse({ raceId: RACE }).success).toBe(true);
    expect(abandonPayloadSchema.safeParse({ raceId: RACE, reason: "disconnection" }).success).toBe(false);
  });
});
