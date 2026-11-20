import { MAX_BATCH_EVENTS } from "@incision/domain";
import { MAX_MESSAGE_BYTES } from "../server/realtime/socket-server";
import { describe, expect, it } from "vitest";
import { keystrokeBatchPayloadSchema, parseKeystrokeBatch, WIRE_MAX_EVENTS, WIRE_MAX_INSERT_LENGTH } from "./protocol";

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
    // Every event is invalid: parsing them would report one issue per event.
    const parsed = parseKeystrokeBatch(batch({ events: Array.from({ length: 40_000 }, () => null) }));
    expect(parsed.success ? [] : parsed.issues.map((issue) => issue.path.join("."))).toEqual(["events"]);
  });

  it("match the full schema whenever the size step passes", () => {
    expect(keystrokeBatchPayloadSchema.safeParse(batch()).success).toBe(parseKeystrokeBatch(batch()).success);
  });
});

describe("the incoming message bound", () => {
  it("lets through the largest batch the schema accepts with three-byte characters, under MAX_MESSAGE_BYTES", () => {
    // WIRE_MAX_EVENTS inserts of WIRE_MAX_INSERT_LENGTH code units, each 3 bytes in UTF-8: what a
    // page could send at most with ordinary text. Escaped control characters would be bigger, and
    // are cut by the bound: no keyboard types them, and the engine would refuse them anyway.
    const events = Array.from({ length: WIRE_MAX_EVENTS }, () => ({ type: "insert", grapheme: "€".repeat(WIRE_MAX_INSERT_LENGTH) }));
    const payload = batch({ events });
    expect(parseKeystrokeBatch(payload).success).toBe(true);
    // Socket.IO frames it as `42<ack>["race:batch",{…}]`: a few dozen bytes more.
    const frame = `421234567890${JSON.stringify(["race:batch", payload])}`;
    expect(Buffer.byteLength(frame, "utf8")).toBeLessThan(MAX_MESSAGE_BYTES);
  });
});
