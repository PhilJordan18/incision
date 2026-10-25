import { describe, expect, it } from "vitest";
import { RaceClient } from "./race-client";

const RACE = "6f1d2c3b-4a5e-4f60-8a7b-9c8d7e6f5a4b";
const NEXT = "2b3c4d5e-6f70-4182-a3b4-c5d6e7f80912";

const reveal = (raceId: string) => ({
  reveal: { raceId, text: ["a", "b"], errorMode: "mandatory", countdownAt: 0, startsAt: 3_000, timeLimit: 120_000 },
  language: "fr",
  entrants: [{ entrantId: "e-alice", displayName: "Alice" }],
  selfEntrantId: "e-alice",
  serverNow: 0,
});

const selfState = (raceId: string, status: string, abandonReason?: string) => ({
  snapshot: {
    raceId,
    entrantId: "e-alice",
    textVersion: 0,
    target: ["a", "b"],
    typed: [],
    pendingError: false,
    ackSeq: 0,
    status,
    counters: { correctInserts: 0, totalInserts: 0 },
  },
  measures: { netWpm: 0, accuracy: 0 },
  control: "controlling",
  ...(abandonReason === undefined ? {} : { abandonReason }),
});

describe("RaceClient", () => {
  it("shows why its entrant abandoned, and forgets it with the next race", () => {
    const client = new RaceClient({ now: () => 0, schedule: () => () => undefined });
    client.reveal(reveal(RACE));
    client.self(selfState(RACE, "racing"));
    expect(client.getState().abandonReason).toBeUndefined();
    client.self(selfState(RACE, "abandoned", "disconnection"));
    expect(client.getState()).toMatchObject({ abandonReason: "disconnection", typing: { status: "abandoned" } });
    client.reveal(reveal(NEXT));
    expect(client.getState().abandonReason).toBeUndefined();
  });

  it("takes why its entrant abandoned from a batch's answer too", async () => {
    const client = new RaceClient({ now: () => 10_000, schedule: () => () => undefined });
    client.reveal({ ...reveal(RACE), serverNow: 10_000 });
    client.self(selfState(RACE, "racing"));
    // The batch came after an inactivity deadline: refused, with the entrant's terminal state.
    client.attach({
      sendBatch: async () => ({ ok: true, result: { outcome: "refused", seq: 1, reason: "ENTRANT_TERMINAL" }, self: selfState(RACE, "abandoned", "inactivity") }),
      connected: () => true,
    });
    client.type({ type: "insert", grapheme: "a" });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(client.getState()).toMatchObject({ abandonReason: "inactivity", typing: { status: "abandoned" } });
  });
});

it("keeps calibrated countdown time when a delayed reveal arrives, and detaches the probe", async () => {
  let now = 10_000;
  const cancelled: number[] = [];
  const client = new RaceClient({ now: () => now, monotonic: () => now,
    schedule: (_callback, delay) => () => { cancelled.push(delay); } });
  client.startClockSync(async () => { now += 200; return { ok: true, serverTime: 15_100 }; });
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(client.serverNow()).toBe(15_200);
  client.reveal({ ...reveal(RACE), serverNow: 15_000 });
  expect(client.serverNow()).toBe(15_200);
  expect(client.getState().reveal?.startsAt).toBe(3_000);
  client.detach();
  expect(cancelled).toContain(250);
});
