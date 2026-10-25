import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { BonusChannel } from "./bonus-channel";
import { BonusClient } from "./bonus-client";
import { RaceClient } from "./race-client";

const RACE = "6f1d2c3b-4a5e-4f60-8a7b-9c8d7e6f5a4b";
const OTHER = "af1d2c3b-4a5e-4f60-8a7b-9c8d7e6f5a4b";
const reveal = (raceId = RACE) => ({ reveal: { raceId, text: [..."sea port"], errorMode: "mandatory", countdownAt: 0, startsAt: 100, timeLimit: 120000 },
  language: "en", entrants: [{ entrantId: "alice", displayName: "Alice" }], selfEntrantId: "alice", serverNow: 100 });
const self = (control = "controlling") => ({ snapshot: { raceId: RACE, entrantId: "alice", textVersion: 0, target: [..."sea port"],
  typed: [], pendingError: false, ackSeq: 0, status: "racing", counters: { correctInserts: 0, totalInserts: 0 } }, measures: { netWpm: 0, accuracy: 0 }, control });
const inventory = { raceId: RACE, revision: 1, ackSeq: 0, enabled: true, grants: [{ milestone: 25, kind: "shortenSelf" }], fog: null };
const channels: BonusChannel[] = [];
function setup() {
  const schedule = (callback: () => void, delay: number) => { const timer = setTimeout(callback, delay); return () => clearTimeout(timer); };
  const race = new RaceClient({ now: Date.now, schedule });
  const bonuses = new BonusClient({ serverNow: () => race.serverNow(), schedule });
  const send = vi.fn(() => new Promise(() => {}));
  const channel = new BonusChannel(race, bonuses, { send }); channels.push(channel);
  channel.connect(); race.reveal(reveal()); race.self(self());
  const progress = (phase = "racing", revision = 1, serverNow = 100) => race.progress({ broadcast: { raceId: RACE, phase, revision, startsAt: 100, timeLimit: 120000, entrants: [] }, serverNow });
  progress(); bonuses.self(inventory);
  return { race, bonuses, send, channel, progress };
}
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(100); });
afterEach(() => { channels.splice(0).forEach(channel => channel.close()); vi.useRealTimers(); });

it("connects only after private state and authoritative racing phase; normal progress does not erase sync", () => {
  const { bonuses, progress } = setup();
  progress("racing", 2); progress("racing", 3);
  expect(bonuses.getState().synchronized).toBe(true);
  expect(bonuses.activate()).toBe(true);
});

it("preserves one lost intent through reconnect, waits for inventory, and requires another deliberate activation", async () => {
  const { bonuses, channel, send } = setup(); bonuses.activate(); await vi.advanceTimersByTimeAsync(0);
  channel.disconnect(); channel.connect(); expect(bonuses.activate()).toBe(false);
  bonuses.self(inventory); await vi.advanceTimersByTimeAsync(10);
  expect(send).toHaveBeenCalledTimes(1);
  expect(bonuses.activate()).toBe(true); await vi.advanceTimersByTimeAsync(0);
  expect(send.mock.calls[1]).toEqual(send.mock.calls[0]);
});

it("control loss and terminal phase cancel intent; a fresh private cursor is needed after control returns", () => {
  const { race, bonuses, progress } = setup(); bonuses.activate(); race.self(self("observing"));
  expect(bonuses.activate()).toBe(false);
  race.self(self()); expect(bonuses.activate()).toBe(false);
  bonuses.self(inventory); expect(bonuses.activate()).toBe(true);
  progress("ended", 2); expect(bonuses.activate()).toBe(false); expect(bonuses.getState().pending).toBeUndefined();
});

it("forgets the former race and uses clock corrections for fog without an independent timer", async () => {
  const { race, bonuses, progress } = setup();
  bonuses.self({ ...inventory, fog: { startsAt: 100, expiresAt: 3100 } });
  expect(bonuses.getState().fogVisible).toBe(true);
  progress("racing", 2, 4000); expect(bonuses.getState().fogVisible).toBe(false);
  race.reveal(reveal(OTHER)); expect(bonuses.getState().self).toBeUndefined();
  bonuses.self(inventory); expect(bonuses.getState().self).toBeUndefined();
  await vi.advanceTimersByTimeAsync(10000); expect(bonuses.activate()).toBe(false);
});

it("cleanup removes subscriptions and timers; disabled inventory cannot activate", () => {
  const { race, bonuses, channel } = setup();
  bonuses.self({ ...inventory, enabled: false }); expect(bonuses.activate()).toBe(false);
  channel.close(); const state = bonuses.getState(); race.self(self()); expect(bonuses.getState()).toBe(state);
  expect(vi.getTimerCount()).toBe(0);
});
