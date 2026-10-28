import { asDuration, asEntrantId, asInstant, asRaceId, BOT_LEVELS, COUNTDOWN_MS, createBonusRace, maxBotCompletionMs, type BotLevel, type ErrorMode } from "@incision/domain";
import { describe, expect, it, vi } from "vitest";
import type { LeaseState } from "./race-lease";
import { RaceRuntime, type RaceConnection, type RaceStore } from "./race-runtime";

const START = 1_800_000_000_000;
const RACE = "6f1d2c3b-4a5e-4f60-8a7b-9c8d7e6f5a4b";
const HUMAN = { entrantId: "human", accountId: "account", displayName: "Human" };
const BOT = { entrantId: "bot", accountId: null, displayName: "Bot 1", kind: "bot" as const };
const WON = { won: true, alreadyDone: false } as const;
async function settle() { for (let turn = 0; turn < 12; turn++) await Promise.resolve(); }

function setup({ level = "noob", mode = "mandatory", text = "ab é!", limit = null }: {
  level?: BotLevel; mode?: ErrorMode; text?: string; limit?: number | null;
} = {}) {
  let now = START; let next = 0; let leaseState: LeaseState = "held";
  const timers = new Map<number, { at: number; callback: () => void }>();
  const schedule = (callback: () => void, delay: number) => {
    const id = ++next; timers.set(id, { at: now + delay, callback }); return () => { timers.delete(id); };
  };
  const created = createBonusRace({ enabled: false, random: [1, 2, 3, 4], race: {
    raceId: asRaceId(RACE), now: asInstant(START), text, errorMode: mode, timeLimit: limit === null ? null : asDuration(limit),
    participants: [{ entrantId: asEntrantId(HUMAN.entrantId), kind: "human" }, { entrantId: asEntrantId(BOT.entrantId), kind: "bot" }],
  } });
  if (!created.ok) throw new Error(created.reason);
  const emit = vi.fn();
  const connection: RaceConnection = { id: "human-tab", accountId: HUMAN.accountId, emit };
  const store = { beginRacing: vi.fn<RaceStore["beginRacing"]>(async () => WON),
    finalizeRace: vi.fn<RaceStore["finalizeRace"]>(async () => WON),
    interruptOwnRace: vi.fn<RaceStore["interruptOwnRace"]>(async () => ({ ...WON })) };
  const runtime = new RaceRuntime({ ownership: { raceId: RACE, lobbyId: "room", ownerId: "server", ownerEpoch: 1 },
    state: created.state, entrants: [HUMAN, { ...BOT, botLevel: level }], language: "fr", store, schedule,
    now: () => now, followers: () => [connection], onSettled: vi.fn(), log: vi.fn(), botSeed: () => [1, 2, 3, 4],
    lease: { start: () => {}, stop: () => { leaseState = "stopped"; }, isAuthoritative: () => leaseState === "held",
      get state() { return leaseState; }, suspendedForMs: () => 0 },
  });
  async function advance(ms: number, late = false) {
    const target = now + ms; if (late) now = target;
    let calls = 0;
    for (;;) {
      const due = [...timers.entries()].filter(([, timer]) => timer.at <= target).sort((a, b) => a[1].at - b[1].at || a[0] - b[0])[0];
      if (!due) break;
      if (++calls > 100_000) throw new Error("unbounded timer loop");
      timers.delete(due[0]); now = Math.max(now, due[1].at); due[1].callback(); await settle();
    }
    now = target; await settle();
  }
  return { runtime, store, emit, connection, advance, timers,
    bot: () => runtime.state.entrants.find((entrant) => entrant.entrantId === "bot")!,
    lease: (state: LeaseState) => { leaseState = state; runtime.leaseChanged(state); },
  };
}

describe("server bot driver through the authoritative reducer", () => {
  for (const mode of ["mandatory", "free"] as const) {
    it.each(BOT_LEVELS)(`finishes %s in ${mode}, saves real measurements and private aggregates once`, async (level) => {
      const { runtime, advance, bot, store } = setup({ level, mode }); runtime.start();
      expect(bot().disconnectedAt).toBeUndefined();
      await advance(COUNTDOWN_MS - 1); expect(bot().counters.totalInserts).toBe(0);
      await advance(1 + maxBotCompletionMs(level, 5));
      expect(bot().status).toBe("finished"); expect(bot().counters.totalInserts).toBeGreaterThanOrEqual(5);
      if (mode === "mandatory") expect(bot().counters.correctInserts).toBe(5);
      runtime.memberLeft(HUMAN.accountId); await settle();
      expect(store.finalizeRace).toHaveBeenCalledOnce();
      const results = store.finalizeRace.mock.calls[0]![1];
      expect(results.find((row) => row.entrantId === BOT.entrantId)).toMatchObject({ outcome: "finished", position: 5, length: 5 });
      expect(results.every((row) => row.keyErrors?.version === 1)).toBe(true);
      await advance(30_000); expect(store.finalizeRace).toHaveBeenCalledOnce();
    });
  }
  it("does not catch up a stalled server with retroactive inserts", async () => {
    const { runtime, advance, bot } = setup({ text: "a".repeat(100), level: "impossible" }); runtime.start();
    await advance(COUNTDOWN_MS); expect(bot().counters.totalInserts).toBe(0);
    await advance(10_000, true); expect(bot().counters.totalInserts).toBe(1);
    runtime.retire();
  });
  it("pauses on lease suspension, resumes and stops permanently on ownership loss", async () => {
    const { runtime, advance, bot, lease, timers } = setup({ text: "a".repeat(100) }); runtime.start();
    await advance(COUNTDOWN_MS + 3_000); const before = bot().counters.totalInserts;
    lease("suspended"); await advance(5_000); expect(bot().counters.totalInserts).toBe(before);
    lease("held"); await advance(3_000); expect(bot().counters.totalInserts).toBeGreaterThan(before);
    lease("lost"); const lost = bot().counters.totalInserts;
    await advance(10_000); expect(bot().counters.totalInserts).toBe(lost); expect(timers.size).toBe(0);
  });
  it("applies the deadline before a delayed bot insert and persists timed-out results", async () => {
    const { runtime, advance, bot, store } = setup({ text: "a".repeat(1000), limit: 30_000 }); runtime.start();
    await advance(COUNTDOWN_MS); await advance(31_000, true);
    expect(bot().counters.totalInserts).toBe(0); expect(bot().status).toBe("timedOut");
    expect(store.finalizeRace).toHaveBeenCalledOnce();
  });
  it("never exposes seed/plans or lets a human payload select the bot", async () => {
    const { runtime, advance, bot, connection, emit } = setup(); runtime.start(); await advance(COUNTDOWN_MS + 100);
    const before = bot().counters.totalInserts;
    const forged = { raceId: RACE, entrantId: BOT.entrantId, seq: 1, textVersion: 0, events: [{ type: "insert" as const, grapheme: "a" }] };
    runtime.keystrokes(connection, forged);
    expect(bot().counters.totalInserts).toBe(before);
    const publicMessages = JSON.stringify(emit.mock.calls);
    expect(publicMessages).not.toMatch(/"random"|"seed"|"plan"|"awaitingAck"/);
    runtime.retire();
  });
  it("cancels bot timers when the room closes without publishing results", async () => {
    const { runtime, advance, timers, store } = setup(); runtime.start(); await advance(COUNTDOWN_MS + 100);
    runtime.roomClosed(); await advance(30_000);
    expect(timers.size).toBe(0); expect(store.finalizeRace).not.toHaveBeenCalled();
  });
});
