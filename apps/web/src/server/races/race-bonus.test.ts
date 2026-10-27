import { asDuration, asEntrantId, asInstant, asRaceId, createBonusRace, createRandom, BONUS_KINDS, type BonusKind, type RandomState, type BonusContent } from "@incision/domain";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { bonusSelfSchema, RACE_BONUS_ANNOUNCEMENT_EVENT, RACE_BONUS_SELF_EVENT, type BonusSelf } from "../../races/bonus-protocol";
import { RACE_SELF_EVENT, type RaceSelfPayload } from "../../races/protocol";
import { RaceRuntime, type RaceConnection } from "./race-runtime";
import type { LeaseState } from "./race-lease";

const RACE = "6f1d2c3b-4a5e-4f60-8a7b-9c8d7e6f5a4b";
const TEXT = "aa bb cc dd ee ff gg hh ii jj";
const command = { raceId: RACE, seq: 1, milestone: 25 as const };
function seedFor(kind: BonusKind): RandomState {
  for (let n = 1; n < 1000; n++) {
    const seed: RandomState = [1, n * 1234567, 3, 4];
    if (BONUS_KINDS[createRandom(seed).index(3)] === kind) return seed;
  }
  throw new Error("No deterministic test seed");
}
function tab(id: string, accountId = id) {
  const emit = vi.fn<RaceConnection["emit"]>();
  return { id, accountId, pageId: id, emit };
}
const latest = <T>(connection: ReturnType<typeof tab>, event: string): T => connection.emit.mock.calls.filter(([name]) => name === event).at(-1)?.[1] as T;

async function setup(kind: BonusKind = "shortenSelf", options: { content?: BonusContent; enabled?: boolean; timeLimit?: number } = {}) {
  const result = createBonusRace({ enabled: options.enabled ?? true, random: seedFor(kind), race: {
    raceId: asRaceId(RACE), now: asInstant(0), text: TEXT, errorMode: "mandatory", timeLimit: asDuration(options.timeLimit ?? 120_000),
    participants: ["actor", "leader"].map((id) => ({ entrantId: asEntrantId(id), kind: "human" })),
  } });
  if (!result.ok) throw new Error(result.reason);
  const actor = tab("actor"), leader = tab("leader"), observer = tab("observer", "actor"), spectator = tab("spectator");
  const followers = [actor, leader, observer, spectator];
  let leaseState: LeaseState = "held";
  const won = { won: true, alreadyDone: false } as const;
  const store = { beginRacing: vi.fn(async () => won), finalizeRace: vi.fn(async () => won), interruptOwnRace: vi.fn(async () => won) };
  const runtime = new RaceRuntime({ state: result.state, ownership: { raceId: RACE, lobbyId: "room", ownerId: "owner", ownerEpoch: 1 },
    entrants: ["actor", "leader"].map((id) => ({ entrantId: id, accountId: id, displayName: id })), language: "en", store,
    lease: { start: () => {}, stop: () => {}, get state() { return leaseState; }, isAuthoritative: () => leaseState === "held", suspendedForMs: () => undefined },
    now: Date.now, schedule: (callback, ms) => { const timer = setTimeout(callback, ms); return () => clearTimeout(timer); },
    followers: () => followers, onSettled: vi.fn(), log: vi.fn(), ...(options.content ? { bonusContent: options.content } : {}),
  });
  runtime.start();
  await vi.advanceTimersByTimeAsync(5000);
  const typed = runtime.keystrokes(leader, { raceId: RACE, seq: 1, textVersion: 0, events: [...TEXT.slice(0, 22)].map((grapheme) => ({ type: "insert", grapheme })) });
  expect(typed).toMatchObject({ ok: true, result: { outcome: "applied" } });
  return { runtime, actor, leader, observer, spectator, store, followers, lease: (state: LeaseState) => { leaseState = state; runtime.leaseChanged(state); } };
}
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(0); });
afterEach(() => vi.useRealTimers());

describe("authoritative bonus runtime", () => {
  it.each(BONUS_KINDS)("applies %s once, privately recovers it and announces no duplicate", async (kind) => {
    const content = vi.fn(() => ["sea", "port", "sail"]);
    const { runtime, actor, observer, spectator, store } = await setup(kind, { content });
    const initial = latest<BonusSelf>(actor, RACE_BONUS_SELF_EVENT);
    expect(initial.grants[0]?.kind).toBe(kind);
    expect(bonusSelfSchema.safeParse(initial).success).toBe(true);
    const first = runtime.activateBonus(actor, command);
    expect(first).toMatchObject({ ok: true, result: { ok: true, seq: 1 } });
    const after = JSON.stringify(runtime.state);
    expect(runtime.activateBonus(actor, command)).toEqual(first);
    expect(JSON.stringify(runtime.state)).toBe(after);
    expect(actor.emit.mock.calls.filter(([event]) => event === RACE_BONUS_ANNOUNCEMENT_EVENT)).toHaveLength(1);
    expect(content).toHaveBeenCalledTimes(kind === "extendLeader" ? 1 : 0);
    expect(latest<BonusSelf>(observer, RACE_BONUS_SELF_EVENT).ackSeq).toBe(1);
    expect(spectator.emit.mock.calls.some(([event]) => event === RACE_BONUS_SELF_EVENT)).toBe(false);
    const announcement = JSON.stringify(latest(spectator, RACE_BONUS_ANNOUNCEMENT_EVENT));
    for (const forbidden of ["random", "protection", "cursors", "target\"", "typed", "grants"]) expect(announcement).not.toContain(forbidden);
    expect(store.finalizeRace).not.toHaveBeenCalled();
    expect(store.beginRacing).toHaveBeenCalledTimes(1);
  });

  it("rejects observers, spectators, other races and suspended owners without consumption", async () => {
    const { runtime, actor, observer, spectator, lease } = await setup();
    expect(runtime.activateBonus(observer, command)).toEqual({ ok: false, error: "NOT_CONTROLLING" });
    expect(runtime.activateBonus(spectator, command)).toEqual({ ok: false, error: "NOT_AN_ENTRANT" });
    expect(runtime.activateBonus(actor, { ...command, raceId: "another" })).toEqual({ ok: false, error: "NO_RACE" });
    lease("suspended");
    expect(runtime.activateBonus(actor, command)).toEqual({ ok: false, error: "SUSPENDED" });
    lease("held");
    expect(runtime.activateBonus(actor, command)).toMatchObject({ ok: true, result: { ok: true } });
    lease("lost");
    expect(runtime.activateBonus(actor, { ...command, seq: 2 })).toEqual({ ok: false, error: "NO_RACE" });
  });

  it("resumes a lost acknowledgement on the same page, but refuses the previous socket", async () => {
    const { runtime, actor, followers } = await setup();
    const answer = runtime.activateBonus(actor, command);
    followers.splice(followers.indexOf(actor), 1);
    runtime.unfollow(actor.id, actor.accountId);
    const resumed = { ...tab("resumed", "actor"), pageId: actor.pageId };
    followers.push(resumed);
    runtime.follow(resumed);
    expect(latest<BonusSelf>(resumed, RACE_BONUS_SELF_EVENT).ackSeq).toBe(1);
    expect(runtime.activateBonus(resumed, command)).toMatchObject({ ok: true, result: answer.ok ? answer.result : undefined });
    expect(runtime.activateBonus(actor, command)).toEqual({ ok: false, error: "NOT_CONTROLLING" });
  });

  it("refuses missing content without discarding the grant or advancing typing activity", async () => {
    const { runtime, actor } = await setup("extendLeader");
    const before = runtime.state.entrants[0];
    const answer = runtime.activateBonus(actor, command);
    expect(answer).toMatchObject({ ok: true, result: { ok: false, reason: "CONTENT_UNAVAILABLE" }, self: { ackSeq: 1 } });
    expect(answer.ok && answer.self.grants).toHaveLength(3);
    expect(runtime.state.entrants[0]).toEqual(before);
  });

  it("sends the target's new text privately and resynchronises an in-flight old-version batch", async () => {
    const { runtime, actor, leader } = await setup("extendLeader", { content: () => ["sea", "port", "sail"] });
    runtime.activateBonus(actor, command);
    expect(latest<RaceSelfPayload>(leader, RACE_SELF_EVENT).snapshot.textVersion).toBe(1);
    const ack = runtime.keystrokes(leader, { raceId: RACE, seq: 2, textVersion: 0, events: [{ type: "insert", grapheme: TEXT[22]! }] });
    expect(ack).toMatchObject({ ok: true, result: { outcome: "resync", reason: "TEXT_VERSION_CHANGED" }, self: { snapshot: { textVersion: 1, ackSeq: 1 } } });
    expect(runtime.keystrokes(leader, { raceId: RACE, seq: 2, textVersion: 1, events: [{ type: "insert", grapheme: TEXT[22]! }] }))
      .toMatchObject({ ok: true, result: { outcome: "applied" } });
  });

  it("expires fog on the coordinator deadline without another player message", async () => {
    const { runtime, actor, leader } = await setup("fogLeader");
    runtime.activateBonus(actor, command);
    expect(latest<BonusSelf>(leader, RACE_BONUS_SELF_EVENT).fog?.expiresAt).toBe(8000);
    await vi.advanceTimersByTimeAsync(3000);
    expect(latest<BonusSelf>(leader, RACE_BONUS_SELF_EVENT).fog).toBeNull();
    expect(latest(leader, RACE_BONUS_ANNOUNCEMENT_EVENT)).toMatchObject({ announcement: { type: "fogExpired", at: 8000 } });
  });

  it("keeps disabled races disabled and does not give an inventory", async () => {
    const { runtime, actor } = await setup("shortenSelf", { enabled: false });
    expect(runtime.activateBonus(actor, command)).toMatchObject({ ok: true, result: { ok: false, reason: "BONUSES_DISABLED" }, self: { grants: [], enabled: false } });
  });

  it("refuses out-of-order and conflicting activations without losing the FIFO grant", async () => {
    const { runtime, actor } = await setup();
    expect(runtime.activateBonus(actor, { ...command, seq: 2 })).toMatchObject({ ok: true, result: { reason: "OUT_OF_ORDER" }, self: { ackSeq: 0 } });
    expect(runtime.activateBonus(actor, { ...command, milestone: 50 })).toMatchObject({ ok: true, result: { reason: "NOT_FIRST_GRANT" }, self: { ackSeq: 1 } });
    expect(runtime.activateBonus(actor, command)).toMatchObject({ ok: true, result: { reason: "SEQUENCE_CONFLICT" } });
    expect(runtime.activateBonus(actor, { ...command, seq: 2 })).toMatchObject({ ok: true, result: { ok: true } });
  });

  it("applies a due deadline before activation even when its timer has not run", async () => {
    const { runtime, actor, store } = await setup("shortenSelf", { timeLimit: 30_000 });
    vi.setSystemTime(33_000);
    expect(runtime.activateBonus(actor, command)).toMatchObject({ ok: true, result: { reason: "NOT_RACING" }, self: { grants: [] } });
    expect(store.finalizeRace).toHaveBeenCalledTimes(1);
    expect(actor.emit.mock.calls.filter(([event]) => event === RACE_BONUS_ANNOUNCEMENT_EVENT)).toHaveLength(0);
  });
});
