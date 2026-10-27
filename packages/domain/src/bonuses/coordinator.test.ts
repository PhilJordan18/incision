import { describe, expect, it, vi } from "vitest";
import { asEntrantId, asRaceId } from "../ids";
import { asInstant } from "../time";
import type { InputEvent } from "../race/types";
import { availableBonusGrants, createBonusRace, reduceBonusRace } from "./coordinator";
import type { ActivateBonus, BonusContent, BonusRaceEvent, BonusRaceState } from "./coordinator-types";
import type { BonusKind } from "./types";

const actor = asEntrantId("actor"), leader = asEntrantId("leader"), raceId = asRaceId("race");
const text = "aa bb cc dd ee ff gg hh ii jj";
const words: BonusContent = () => ["mer", "port", "voile"];
function initial(enabled = true): BonusRaceState {
  const result = createBonusRace({ enabled, random: [1, 2, 3, 4], race: {
    raceId, now: asInstant(0), text, errorMode: "mandatory", timeLimit: null,
    participants: [{ entrantId: actor, kind: "human" }, { entrantId: leader, kind: "human" }],
  } });
  if (!result.ok) throw new Error(result.reason);
  return result.state;
}
function step(state: BonusRaceState, event: BonusRaceEvent, content: BonusContent = words) {
  const result = reduceBonusRace(state, event, content);
  if (!result.ok) throw new Error(result.reason);
  return result;
}
const tick = (now: number): BonusRaceEvent => ({ type: "tick", now: asInstant(now) });
function typing(state: BonusRaceState, entrantId = leader, events?: readonly InputEvent[], now = 5000): BonusRaceEvent {
  const entrant = state.race.entrants.find((item) => item.entrantId === entrantId)!;
  return { type: "keystrokes", now: asInstant(now), batch: {
    raceId, entrantId, seq: entrant.ackSeq + 1, textVersion: entrant.textVersion,
    events: events ?? entrant.target.slice(0, 22).map((grapheme) => ({ type: "insert", grapheme })),
  } };
}
function ready(kind?: BonusKind): BonusRaceState {
  let state = step(initial(), tick(3000)).state;
  state = step(state, typing(state)).state;
  // Explicit typed grant fixtures exercise every effect; real seeded grants are tested separately.
  return kind ? { ...state, awards: { ...state.awards, grants: state.awards.grants.map((grant) => ({ ...grant, kind })) } } : state;
}
function activate(overrides: Partial<ActivateBonus> = {}): ActivateBonus {
  return { type: "activate", raceId, entrantId: actor, seq: 1, milestone: 25, now: asInstant(5000), ...overrides };
}

describe("atomic bonus coordinator", () => {
  it("revalidates shared mutable arrays on every call, including non-shared targets and typed text", () => {
    for (const field of ["target", "typed"] as const) {
      const state = ready();
      expect(step(state, tick(state.race.clock)).ok).toBe(true);
      const parts = state.race.entrants[1]![field] as string[];
      const saved = parts[0]!;
      parts[0] = "two graphemes";
      expect(reduceBonusRace(state, tick(state.race.clock))).toMatchObject({ ok: false, reason: "INVALID_STATE" });
      expect(availableBonusGrants(state, actor)).toEqual([]);
      parts[0] = saved;
      expect(step(state, tick(state.race.clock)).ok).toBe(true);
      const copied = JSON.parse(JSON.stringify(state)) as BonusRaceState;
      (copied.race.entrants[1]![field] as string[])[0] = "e\u0301";
      expect(reduceBonusRace(copied, tick(state.race.clock))).toMatchObject({ ok: false, reason: "INVALID_STATE" });
    }
  });

  it.each(["shortenSelf", "extendLeader", "fogLeader"] as const)("matches the full JSON revision oracle with shared and copied states (%s)", (kind) => {
    let state = ready(kind);
    const events: BonusRaceEvent[] = [tick(5000), { type: "present", entrantId: actor, now: asInstant(5000) },
      activate(), activate(), activate({ seq: 2 }), activate({ seq: 3, milestone: 50 }),
      { type: "connectionLost", entrantId: actor, now: asInstant(5000) },
      { type: "connectionResumed", entrantId: actor, now: asInstant(5000) },
      tick(10000), tick(10000), tick(130001), tick(130001)];
    for (const event of events) {
      const serialized = JSON.stringify(state);
      const result = step(state, event);
      expect(step(JSON.parse(serialized) as BonusRaceState, event)).toEqual(result);
      // Awards observe only after change detection; restore that projection and
      // revision to reconstruct the original full-envelope JSON comparison.
      const candidate = { ...result.state, awards: state.awards, revision: state.revision };
      const changed = JSON.stringify(candidate) !== serialized;
      expect(result.state.revision).toBe(state.revision + Number(changed));
      if (!changed) expect(result.state).toBe(state);
      expect(JSON.stringify(state)).toBe(serialized);
      state = result.state;
    }
  });

  it.each(["shortenSelf", "extendLeader", "fogLeader"] as const)("consumes %s exactly once across retry and JSON resume", (kind) => {
    const before = ready(kind), serialized = JSON.stringify(before);
    const content = vi.fn(words);
    const first = step(before, activate(), content);
    expect(first.activation?.ok).toBe(true);
    expect(first.state.consumed).toHaveLength(1);
    expect(first.announcements).toHaveLength(1);
    expect(first.state.revision).toBe(before.revision + 1);
    const replay = step(JSON.parse(JSON.stringify(first.state)) as BonusRaceState, activate(), content);
    expect(replay.activation).toEqual(first.activation);
    expect(replay.announcements).toEqual([]);
    expect(replay.state).toEqual(first.state);
    expect(content).toHaveBeenCalledTimes(kind === "extendLeader" ? 1 : 0);
    expect(JSON.stringify(before)).toBe(serialized);
  });

  it("processes real seeded grants and never redraws on retries", () => {
    let state = ready();
    expect(state.awards.grants).toHaveLength(3);
    const random = state.awards.random;
    for (const milestone of [25, 50, 75] as const) {
      const seq = state.cursors.find((cursor) => cursor.entrantId === actor)!.seq + 1;
      const event = activate({ milestone, seq, now: asInstant(5000 + seq * 3000) });
      const result = step(state, event);
      expect(step(result.state, event).activation).toEqual(result.activation);
      state = result.state;
    }
    expect(state.awards.random).toEqual(random);
    expect(state.consumed.length).toBeLessThanOrEqual(3);
  });

  it("enforces FIFO, owns grants, and never skips an unusable grant", () => {
    const before = ready("extendLeader");
    expect(step(before, activate({ milestone: 50 })).activation).toMatchObject({ reason: "NOT_FIRST_GRANT" });
    expect(step(before, activate({ entrantId: leader })).activation).toMatchObject({ reason: "UNKNOWN_GRANT" });
    const denied = step(before, activate(), () => undefined);
    expect(denied.activation).toMatchObject({ reason: "CONTENT_UNAVAILABLE" });
    expect(denied.state.consumed).toEqual([]);
    expect(denied.state.race.entrants).toEqual(before.race.entrants);
    expect(step(denied.state, activate()).activation).toEqual(denied.activation);
    const accepted = step(denied.state, activate({ seq: 2 }));
    expect(accepted.activation?.ok).toBe(true);
    expect(step(accepted.state, activate({ seq: 3 })).activation).toMatchObject({ reason: "GRANT_CONSUMED" });
  });

  it("refuses a sequence conflict, a gap and stale commands without selecting the next grant", () => {
    const before = ready("shortenSelf");
    expect(step(before, activate({ seq: 2 })).activation).toMatchObject({ reason: "OUT_OF_ORDER" });
    const applied = step(before, activate());
    expect(step(applied.state, activate({ milestone: 50 })).activation).toMatchObject({ reason: "SEQUENCE_CONFLICT" });
    const next = step(applied.state, activate({ seq: 2, milestone: 50 }));
    expect(step(next.state, activate()).activation).toMatchObject({ reason: "STALE_SEQUENCE" });
    expect(step(next.state, activate()).state.consumed).toEqual(next.state.consumed);
  });

  it("keeps expiry/end when an activation is refused, and emits end only once", () => {
    const before = ready("shortenSelf");
    const event = activate({ now: asInstant(125001) });
    const ended = step(before, event);
    expect(ended.activation).toMatchObject({ reason: "NOT_RACING" });
    expect(ended.raceOutput.ended?.results).toHaveLength(2);
    expect(ended.state.race.phase).toBe("ended");
    expect(ended.state.consumed).toEqual([]);
    expect(step(ended.state, event).raceOutput.ended).toBeUndefined();
  });

  it("does not reset inactivity on activation and expires fog at its own deadline", () => {
    const before = ready("fogLeader");
    const result = step(before, activate());
    expect(result.state.race.entrants.map((item) => item.lastActivityAt)).toEqual(before.race.entrants.map((item) => item.lastActivityAt));
    expect(result.nextDeadline).toBe(8000);
    const denied = step(result.state, activate({ seq: 2, milestone: 50, now: asInstant(7999) }));
    expect(denied.activation).toMatchObject({ reason: "FOG_ALREADY_ACTIVE" });
    expect(denied.state.consumed).toHaveLength(1);
    const atExpiry = step(denied.state, activate({ seq: 3, milestone: 50, now: asInstant(8000) }));
    expect(atExpiry.activation?.ok).toBe(true);
    expect(atExpiry.announcements.map((item) => item.type)).toEqual(["fogExpired", "activated"]);
    expect(atExpiry.state.fog[0]?.expiresAt).toBe(11000);
  });

  it("tracks erased intermediate typing, resyncs stale text and preserves counters", () => {
    let state = ready("shortenSelf");
    state = step(state, typing(state, actor, [
      ...state.race.text.slice(0, 22).map((grapheme) => ({ type: "insert" as const, grapheme })),
      ...Array.from({ length: 22 }, () => ({ type: "deleteBackward" as const })),
    ])).state;
    expect(state.protection.find((item) => item.entrantId === actor)?.position).toBe(22);
    const before = state.race.entrants[0]!;
    const after = step(state, activate()).state;
    expect(after.race.entrants[0]!.target.length).toBeGreaterThanOrEqual(22);
    expect(after.race.entrants[0]!.counters).toEqual(before.counters);
    const stale = typing(after, actor, [{ type: "insert", grapheme: "a" }]);
    if (stale.type !== "keystrokes") throw new Error("fixture");
    const resync = step(after, { ...stale, batch: { ...stale.batch, textVersion: 0 } });
    expect(resync.raceOutput.keystrokes).toMatchObject({ reason: "TEXT_VERSION_CHANGED" });
    expect(resync.state.protection).toEqual(after.protection);
  });

  it("excludes terminal targets, refuses foreign races and disables bonuses", () => {
    const before = ready("extendLeader");
    const finished = step(before, typing(before, leader, before.race.text.slice(22).map((grapheme) => ({ type: "insert", grapheme }))));
    expect(step(finished.state, activate()).activation).toMatchObject({ reason: "NO_VALID_TARGET" });
    expect(step(before, activate({ raceId: asRaceId("other") })).activation).toMatchObject({ reason: "WRONG_RACE" });
    expect(step(initial(false), activate()).activation).toMatchObject({ reason: "BONUSES_DISABLED" });
  });

  it("rejects corrupt saved state and unsafe time without mutation", () => {
    const before = ready();
    expect(reduceBonusRace({ ...before, protection: [] }, tick(5000))).toMatchObject({ ok: false, reason: "INVALID_STATE" });
    expect(reduceBonusRace(before, { type: "tick", now: -1 as ReturnType<typeof asInstant> })).toMatchObject({ ok: false, reason: "INVALID_TIME" });
    const max = { ...before, revision: Number.MAX_SAFE_INTEGER, awards: { ...before.awards, revision: Number.MAX_SAFE_INTEGER } };
    expect(reduceBonusRace(max, tick(5000))).toMatchObject({ ok: false, reason: "REVISION_EXHAUSTED" });
  });

  it("clears fog/inventory on interruption, retaining replay receipts without altering finishers", () => {
    const applied = step(ready("fogLeader"), activate());
    const interrupted = step(applied.state, { type: "interrupt", now: asInstant(6000) });
    expect(interrupted.state.fog).toEqual([]);
    expect(interrupted.announcements).toMatchObject([{ type: "fogExpired", at: 6000 }]);
    expect(availableBonusGrants(interrupted.state, actor)).toEqual([]);
    const retry = step(interrupted.state, activate({ now: asInstant(7000) }));
    expect(retry.activation).toEqual(applied.activation);
    expect(retry.announcements).toEqual([]);
    expect(retry.state.consumed).toEqual(applied.state.consumed);
  });

  it("commits time-limit ties before activation, not an artificial rescue", () => {
    const before = ready("shortenSelf");
    const timed = { ...before, race: { ...before.race, timeLimit: 30000 as NonNullable<typeof before.race.timeLimit> } };
    const result = step(timed, activate({ now: asInstant(33000) }));
    expect(result.activation).toMatchObject({ reason: "NOT_RACING" });
    expect(result.raceOutput.ended?.results.every((row) => row.status === "timedOut")).toBe(true);
    expect(result.state.consumed).toEqual([]);
  });

  it("keeps deadlines if the content source fails and selects the current, not historical, leader", () => {
    const before = ready("extendLeader");
    const failed = step(before, activate({ now: asInstant(63000) }), () => { throw new Error("unavailable"); });
    expect(failed.activation).toMatchObject({ reason: "CONTENT_UNAVAILABLE" });
    expect(failed.state.race.entrants[0]!.inactive).toBe(true);
    expect(failed.state.consumed).toEqual([]);
    const abandoned = step(before, { type: "abandon", entrantId: leader, now: asInstant(5000) });
    expect(step(abandoned.state, activate()).activation).toMatchObject({ reason: "NO_VALID_TARGET" });
  });

  it("treats two serialized competitors for the same grant as one consumption", () => {
    const first = step(ready("extendLeader"), activate());
    const second = step(first.state, activate({ seq: 2 }));
    expect(second.activation).toMatchObject({ reason: "GRANT_CONSUMED" });
    expect(second.state.race.entrants).toEqual(first.state.race.entrants);
    expect(second.state.consumed).toHaveLength(1);
    expect(second.announcements).toEqual([]);
  });

  it("observes new milestones after a text shortening but never rearms old ones", () => {
    let state = step(initial(), tick(3000)).state;
    state = step(state, typing(state, leader, state.race.text.slice(0, 11).map((grapheme) => ({ type: "insert", grapheme })))).state;
    expect(state.awards.milestones).toEqual([25]);
    state = step(state, typing(state, actor, state.race.text.slice(0, 10).map((grapheme) => ({ type: "insert", grapheme })))).state;
    state = { ...state, awards: { ...state.awards, grants: state.awards.grants.map((grant) => ({ ...grant, kind: "shortenSelf" })) } };
    const shortened = step(state, activate());
    expect(shortened.activation?.ok).toBe(true);
    expect(shortened.state.awards.milestones).toEqual([25, 50]);
    expect(shortened.state.awards.milestones.filter((milestone) => milestone === 25)).toHaveLength(1);
    // Explicit terminal progress and target denominator are always those of the actual effect.
    expect(shortened.state.awards.revision).toBe(shortened.state.revision);
  });

  it.each(Array.from({ length: 200 }, (_, index) => index))("preserves bounded receipts and input state for replay sequence %i", (seed) => {
      let state = ready((["shortenSelf", "extendLeader", "fogLeader"] as const)[seed % 3]);
      const ids = new Set<string>();
      for (let index = 0; index < 6; index++) {
        const milestone = ([25, 50, 75] as const)[Math.floor(index / 2)]!;
        const intent = activate({ milestone, seq: index + 1, now: asInstant(5000 + index * 1000 + seed) });
        const saved = JSON.stringify(state);
        const result = step(state, intent);
        expect(JSON.stringify(state)).toBe(saved);
        for (const announcement of result.announcements) if (announcement.type === "activated") {
          expect(ids.has(announcement.receipt.id)).toBe(false);
          ids.add(announcement.receipt.id);
        }
        expect(result.state.consumed.length).toBeLessThanOrEqual(3);
        const replay = step(JSON.parse(JSON.stringify(result.state)) as BonusRaceState, intent);
        expect(replay.activation).toEqual(result.activation);
        expect(replay.announcements).toEqual([]);
        state = replay.state;
      }
  });
});

describe("paused inactivity through the coordinator (D-17, F-04.6a)", () => {
  it("keeps the pause in the envelope, credits the time on resume, and refuses a pause later than the clock", () => {
    const state = ready();
    const suspended = step(state, { type: "inactivityPaused", since: asInstant(5000), now: asInstant(6000) });
    expect(suspended.state.race.inactivityPausedAt).toBe(5000);
    expect(suspended.raceOutput.changed).toBe(false);
    const later = step(suspended.state, tick(200_000));
    expect(later.state.race.entrants.every((entrant) => entrant.status === "racing" && !entrant.inactive)).toBe(true);
    const resumed = step(later.state, { type: "inactivityResumed", now: asInstant(200_000) });
    expect(resumed.state.race.inactivityPausedAt).toBeUndefined();
    expect(resumed.state.race.entrants.map((entrant) => entrant.lastActivityAt)).toEqual([198_000, 200_000]);
    const invalid = { ...state, race: { ...state.race, inactivityPausedAt: asInstant(state.race.clock + 1) } };
    expect(reduceBonusRace(invalid, tick(state.race.clock))).toMatchObject({ ok: false, reason: "INVALID_STATE" });
  });

  it("refuses a pause from after its now, or from an invalid instant, as it refuses an invalid now", () => {
    const state = ready();
    for (const since of [6001, -5, 1.5]) {
      expect(reduceBonusRace(state, { type: "inactivityPaused", since: since as ReturnType<typeof asInstant>, now: asInstant(6000) })).toMatchObject({ ok: false, state, reason: "INVALID_TIME" });
    }
    // A suspension detected at the very instant it starts is the most likely input.
    expect(step(state, { type: "inactivityPaused", since: asInstant(6000), now: asInstant(6000) }).state.race.inactivityPausedAt).toBe(6000);
  });
});
