import { asDuration, asEntrantId, asInstant, asRaceId, BONUS_KINDS, type BonusKind, COUNTDOWN_MS, createBonusRace, createRandom, type RandomState } from "@incision/domain";
import { describe, expect, it, vi } from "vitest";
import { RACE_BONUS_ANNOUNCEMENT_EVENT } from "../../races/bonus-protocol";
import type { LeaseState } from "./race-lease";
import { BOT_BONUS_DELAY_MS, RaceRuntime, type RaceConnection, type RaceStore } from "./race-runtime";

/**
 * D-16 on the server: a bot that receives a grant uses it after a delay drawn from its private
 * stream, through the same authoritative transition as a player's Enter.
 */
const START = 1_800_000_000_000;
const RACE = "6f1d2c3b-4a5e-4f60-8a7b-9c8d7e6f5a4b";
const TEXT = "aa bb cc dd ee ff gg hh ii jj";
const HUMAN = { entrantId: "human", accountId: "account", displayName: "Human" };
const BOT = { entrantId: "bot", accountId: null, displayName: "Bot 1", kind: "bot" as const, botLevel: "noob" as const };
const WON = { won: true, alreadyDone: false } as const;
async function settle() { for (let turn = 0; turn < 12; turn++) await Promise.resolve(); }

/** An award seed whose first draw is `kind`, as the coordinator selects it. */
function seedFor(kind: BonusKind): RandomState {
  for (let n = 1; n < 1000; n++) {
    const seed: RandomState = [1, n * 1234567, 3, 4];
    if (BONUS_KINDS[createRandom(seed).index(3)] === kind) return seed;
  }
  throw new Error("No deterministic test seed");
}

function setup({ enabled = true, kind = "shortenSelf" as BonusKind, botBonusSeed = [5, 6, 7, 8] as RandomState } = {}) {
  let now = START; let next = 0; const leaseState: LeaseState = "held";
  const timers = new Map<number, { at: number; callback: () => void }>();
  const schedule = (callback: () => void, delay: number) => { const id = ++next; timers.set(id, { at: now + delay, callback }); return () => { timers.delete(id); }; };
  const created = createBonusRace({ enabled, random: seedFor(kind), race: {
    raceId: asRaceId(RACE), now: asInstant(START), text: TEXT, errorMode: "mandatory", timeLimit: asDuration(120_000),
    participants: [{ entrantId: asEntrantId(HUMAN.entrantId), kind: "human" }, { entrantId: asEntrantId(BOT.entrantId), kind: "bot" }],
  } });
  if (!created.ok) throw new Error(created.reason);
  const emit = vi.fn<RaceConnection["emit"]>();
  const connection: RaceConnection = { id: "human-tab", accountId: HUMAN.accountId, emit };
  const store = { beginRacing: vi.fn<RaceStore["beginRacing"]>(async () => WON), finalizeRace: vi.fn<RaceStore["finalizeRace"]>(async () => WON),
    interruptOwnRace: vi.fn<RaceStore["interruptOwnRace"]>(async () => ({ ...WON })) };
  const runtime = new RaceRuntime({ ownership: { raceId: RACE, lobbyId: "room", ownerId: "server", ownerEpoch: 1 },
    state: created.state, entrants: [HUMAN, BOT], language: "fr", store, schedule, now: () => now, followers: () => [connection],
    onSettled: vi.fn(), log: vi.fn(), botSeed: () => [1, 2, 3, 4], botBonusSeed: () => botBonusSeed,
    lease: { start: () => {}, stop: () => {}, isAuthoritative: () => leaseState === "held", get state() { return leaseState; }, suspendedForMs: () => 0 },
  });
  async function advance(ms: number) {
    const target = now + ms;
    for (let calls = 0; ; calls++) {
      if (calls > 100_000) throw new Error("unbounded timer loop");
      const due = [...timers.entries()].filter(([, timer]) => timer.at <= target).sort((a, b) => a[1].at - b[1].at || a[0] - b[0])[0];
      if (!due) break;
      timers.delete(due[0]); now = Math.max(now, due[1].at); due[1].callback(); await settle();
    }
    now = target; await settle();
  }
  /** The human leads past 75 %: the trailing bot crosses no milestone itself and receives the grants. */
  async function humanLeads() {
    runtime.start();
    // One second into the race: 23 inserts stay under the plausibility bound (COURSE-06).
    await advance(COUNTDOWN_MS + 1_000);
    const typed = runtime.keystrokes(connection, { raceId: RACE, seq: 1, textVersion: 0, events: [...TEXT.slice(0, 23)].map((grapheme) => ({ type: "insert" as const, grapheme })) });
    expect(typed, JSON.stringify(typed)).toMatchObject({ ok: true, result: { outcome: "applied" } });
    await settle();
  }
  const botActivations = () => emit.mock.calls.filter(([event, payload]) => event === RACE_BONUS_ANNOUNCEMENT_EVENT
    && (payload as { announcement: { type: string; receipt?: { grant: { entrantId: string } } } }).announcement.receipt?.grant.entrantId === BOT.entrantId);
  return { runtime, advance, humanLeads, botActivations, now: () => now };
}

describe("bots use their bonuses (D-16)", () => {
  it("activates the first grant after a delay drawn from the bot's private stream, within its bounds", async () => {
    const { advance, humanLeads, botActivations } = setup();
    await humanLeads();
    const [min, max] = BOT_BONUS_DELAY_MS;
    await advance(min - 1);
    expect(botActivations()).toHaveLength(0);
    await advance(max - min + 1);
    expect(botActivations().length).toBeGreaterThanOrEqual(1);
    const [, first] = botActivations()[0]!;
    expect(first).toMatchObject({ raceId: RACE, announcement: { type: "activated", receipt: { grant: { entrantId: "bot", milestone: 25, kind: "shortenSelf" }, targetId: "bot" } } });
  });

  it("uses its grants in order, each once, and loses the rest when it finishes (D-16)", async () => {
    const { advance, humanLeads, botActivations, runtime } = setup();
    await humanLeads();
    await advance(4 * BOT_BONUS_DELAY_MS[1]);
    const milestones = botActivations().map(([, payload]) => (payload as { announcement: { receipt: { grant: { milestone: number } } } }).announcement.receipt.grant.milestone);
    // Two shortenSelf grants shorten the bot's text until it finishes: its 75 % grant is never used.
    expect(milestones).toEqual([25, 50]);
    expect(runtime.state.entrants.find((entrant) => entrant.entrantId === "bot")?.status).toBe("finished");
    await advance(30_000);
    expect(botActivations()).toHaveLength(2);
  });

  it("draws the same delays from the same private seed, and other delays from another", async () => {
    const at = async (seed: RandomState) => {
      const run = setup({ botBonusSeed: seed });
      await run.humanLeads();
      const start = run.now();
      for (let waited = 0; run.botActivations().length === 0 && waited < BOT_BONUS_DELAY_MS[1] + 10; waited += 10) await run.advance(10);
      return run.now() - start;
    };
    const first = await at([5, 6, 7, 8]);
    expect(await at([5, 6, 7, 8])).toBe(first);
    const seeds: readonly RandomState[] = [[9, 9, 9, 9], [11, 12, 13, 14], [21, 22, 23, 24]];
    const others = await Promise.all(seeds.map((seed) => at(seed)));
    expect(others.some((delay) => delay !== first)).toBe(true);
  });

  it("does nothing in training: a race without bonuses grants and activates nothing", async () => {
    const { advance, humanLeads, botActivations } = setup({ enabled: false });
    await humanLeads();
    await advance(20_000);
    expect(botActivations()).toHaveLength(0);
  });

  it("keeps a grant the coordinator refuses (no extension words), then retries after a new delay", async () => {
    // extendLeader without approved content: CONTENT_UNAVAILABLE never consumes the grant.
    const { advance, humanLeads, botActivations, runtime } = setup({ kind: "extendLeader" });
    await humanLeads();
    await advance(2 * BOT_BONUS_DELAY_MS[1]);
    expect(botActivations()).toHaveLength(0);
    expect(runtime.state.entrants.find((entrant) => entrant.entrantId === "bot")?.status).toBe("racing");
  });
});
