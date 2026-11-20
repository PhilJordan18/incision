import { describe, expect, it } from "vitest";
import { asEntrantId, asRaceId } from "../ids";
import type { EntrantKind } from "../race/start";
import { createRandom } from "../random/prng";
import { awardBonuses, createBonusAwards } from "./awards";
import {
  BONUS_KINDS, type BonusAwardsResult, type BonusAwardsSnapshot, type BonusAwardsState,
  type BonusProgress, type CreateBonusAwardsInput,
} from "./types";

const id = asEntrantId;
const raceId = asRaceId("race");
const seed = [1, 2, 3, 4] as const;
const a = (position: number, name = "a", length = 100, status: BonusProgress["status"] = "racing"): BonusProgress =>
  ({ entrantId: id(name), position, length, status });
const input = (names = ["a", "b", "c"]): CreateBonusAwardsInput => ({
  raceId, enabled: true, random: seed,
  participants: names.map((name) => ({ entrantId: id(name), kind: name === "a" ? "human" : "bot" })),
});
function ok(result: BonusAwardsResult): Extract<BonusAwardsResult, { ok: true }> {
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error(result.reason);
  return result;
}
const initial = (options: Partial<CreateBonusAwardsInput> = {}): BonusAwardsState =>
  ok(createBonusAwards({ ...input(), ...options })).state;
const snapshot = (entrants: readonly BonusProgress[], revision = 0, phase: BonusAwardsSnapshot["phase"] = "racing"): BonusAwardsSnapshot =>
  ({ raceId, entrants, revision, phase });
const award = (entrants: readonly BonusProgress[], state = initial(), revision = 0) =>
  ok(awardBonuses(state, snapshot(entrants, revision)));
const recipients = (result: ReturnType<typeof award>) => result.grants.map((g) => `${g.milestone}:${g.entrantId}`);

describe("bonus awards — D-11 and the approved slice-A conventions", () => {
  it("copies and sorts the frozen roster and seed without mutating initialization input", () => {
    const source = input(["c", "a", "b"]);
    const before: CreateBonusAwardsInput = JSON.parse(JSON.stringify(source));
    const state = ok(createBonusAwards(source)).state;
    expect(state.participants.map((p) => p.entrantId)).toEqual(["a", "b", "c"]);
    expect(state.participants).not.toBe(source.participants);
    expect(state.random).not.toBe(source.random);
    expect(source).toEqual(before);
    expect(state.revision).toBe(-1);
  });

  it("awards at exactly 25%, but never before", () => {
    const below = award([a(24), a(20, "b"), a(10, "c")]);
    expect(below.grants).toEqual([]);
    expect(below.state.random).toEqual(seed);
    expect(recipients(award([a(25), a(20, "b"), a(10, "c")], below.state, 1))).toEqual(["25:c"]);
  });

  it("does not round fractional progress into a milestone", () => {
    expect(award([a(1, "a", 5), a(0, "b"), a(0, "c")]).grants).toEqual([]);
    expect(recipients(award([a(1, "a", 4), a(0, "b"), a(0, "c")]))).toEqual(["25:b", "25:c"]);
  });

  it("awards last-place ties, but not a tie with the leader", () => {
    expect(recipients(award([a(25), a(10, "b"), a(20, "c", 200)]))).toEqual(["25:b", "25:c"]);
    const tied = award([a(25), a(50, "b", 200), a(1, "c", 4)]);
    expect(tied.grants).toEqual([]);
    expect(tied.state.milestones).toEqual([25]);
    expect(tied.state.random).toEqual(seed);
  });

  it("uses a strictly greater 25-point gap unless the entrant is last", () => {
    const exact = award([a(50), a(25, "b"), a(0, "c")]);
    expect(recipients(exact)).toEqual(["25:c", "50:c"]);
    expect(recipients(award([a(50), a(24, "b"), a(0, "c")]))).toEqual(["25:b", "25:c", "50:b", "50:c"]);
    expect(recipients(award([a(50), a(25, "b"), a(25, "c")]))).toEqual(["25:b", "25:c", "50:b", "50:c"]);
  });

  it("keeps comparisons exact at the safe-integer boundary, including a sub-ULP gap", () => {
    const n = 9_007_199_254_740_988; // Divisible by four; products greatly exceed JS integer precision.
    expect(recipients(award([a(n / 2, "a", n), a(n / 4, "b", n), a(0, "c", n)]))).toEqual(["25:c", "50:c"]);
    expect(recipients(award([a(n / 2, "a", n), a(n / 4 - 1, "b", n), a(0, "c", n)])))
      .toEqual(["25:b", "25:c", "50:b", "50:c"]);
  });

  it("consumes milestones with no recipients, never granting retrospectively", () => {
    const tied = award([a(50), a(50, "b"), a(50, "c")]);
    expect(tied.state.milestones).toEqual([25, 50]);
    expect(award([a(50), a(40, "b"), a(0, "c")], tied.state, 1).grants).toEqual([]);
  });

  it("processes a multi-milestone jump in order using one snapshot, at most three per entrant", () => {
    const result = award([a(80), a(40, "b"), a(10, "c")]);
    expect(recipients(result)).toEqual(["25:b", "25:c", "50:b", "50:c", "75:b", "75:c"]);
    const lower = award([a(10), a(0, "b"), a(0, "c")], result.state, 1);
    const newLeader = award([a(10), a(100, "b", 100, "finished"), a(0, "c")], lower.state, 2);
    expect(newLeader.grants).toEqual([]);
    expect(newLeader.state.grants).toEqual(result.grants);
  });

  it("retains a finished leader as the reference but never awards to terminal entrants", () => {
    expect(recipients(award([a(100, "a", 100, "finished"), a(30, "b"), a(0, "c", 100, "abandoned")])))
      .toEqual(["25:b", "50:b", "75:b"]);
    expect(award([a(100, "a", 100, "abandoned"), a(20, "b"), a(10, "c")]).grants).toEqual([]);
    expect(award([a(100, "a", 100, "timedOut"), a(20, "b"), a(10, "c")]).grants).toEqual([]);
    expect(award([a(100, "a", 100, "finished"), a(10, "b", 100, "abandoned"), a(10, "c", 100, "timedOut")]).grants).toEqual([]);
  });

  it("treats humans and bots equally and has no inactive/disconnected recipient filter", () => {
    const entries = [a(50), a(0, "b"), a(10, "c")];
    const humans = initial({ participants: input().participants.map((p) => ({ ...p, kind: "human" })) });
    expect(award(entries).grants).toEqual(award(entries, humans).grants);
  });

  it("never draws for disabled bonuses or a non-racing phase", () => {
    const entries = [a(80), a(10, "b"), a(0, "c")];
    for (const phase of ["countdown", "ended", "interrupted"] as const) {
      const result = ok(awardBonuses(initial(), snapshot(entries, 0, phase)));
      expect(result.grants).toEqual([]);
      expect(result.state.random).toEqual(seed);
      expect(result.state.milestones).toEqual([]);
    }
    const disabled = award(entries, initial({ enabled: false }));
    expect(disabled.grants).toEqual([]);
    expect(disabled.state.random).toEqual(seed);
  });

  it("makes duplicate revisions idempotent even with a different valid payload", () => {
    const first = award([a(25), a(20, "b"), a(10, "c")]);
    const duplicate = award([a(90), a(0, "b"), a(0, "c")], first.state);
    expect(duplicate.state).toBe(first.state);
    expect(duplicate.grants).toEqual([]);
    const next = award([a(90), a(0, "b"), a(0, "c")], first.state, 10);
    expect(next.state.grants.filter((g) => g.entrantId === "c")).toHaveLength(3);
  });

  it("cannot reopen a terminal race or return from racing to countdown", () => {
    const entries = [a(80), a(10, "b"), a(0, "c")];
    for (const phase of ["ended", "interrupted"] as const) {
      const state = ok(awardBonuses(initial(), snapshot(entries, 0, phase))).state;
      expect(awardBonuses(state, snapshot(entries, 1))).toEqual({ ok: false, reason: "INVALID_PHASE" });
      expect(ok(awardBonuses(state, snapshot(entries, 1, phase))).grants).toEqual([]);
    }
    const state = award(entries).state;
    expect(awardBonuses(state, snapshot(entries, 1, "countdown"))).toEqual({ ok: false, reason: "INVALID_PHASE" });
  });

  it("uses exactly one uniform three-way draw per grant and supports serialization/resumption", () => {
    const first = award([a(25), a(10, "b"), a(0, "c")]);
    const resumed: BonusAwardsState = JSON.parse(JSON.stringify(first.state));
    const entries = [a(80), a(10, "b"), a(0, "c")];
    const result = award(entries, resumed, 1);
    expect(result).toEqual(award(entries, first.state, 1));
    const random = createRandom(seed);
    expect(result.state.grants.map((g) => g.kind)).toEqual(result.state.grants.map(() => BONUS_KINDS[random.index(3)]));
    expect(result.state.random).toEqual(random.state());
  });

  it("is independent of roster and progress order", () => {
    const entries = [a(80), a(10, "b"), a(0, "c")];
    const baseline = award(entries);
    for (const permutation of permutations(entries)) {
      const state = initial({ participants: permutation.map((e) => ({ entrantId: e.entrantId, kind: e.entrantId === "a" ? "human" : "bot" })) });
      expect(award(permutation, state)).toEqual(baseline);
    }
  });

  it("does not mutate deeply frozen input or state, on success or refusal", () => {
    const state = freeze(initial());
    const snap = freeze(snapshot([a(80), a(10, "b"), a(0, "c")]));
    const before: { state: BonusAwardsState; snap: BonusAwardsSnapshot } = JSON.parse(JSON.stringify({ state, snap }));
    expect(awardBonuses(state, snap).ok).toBe(true);
    expect(awardBonuses(state, { ...snap, raceId: asRaceId("other") }).ok).toBe(false);
    expect({ state, snap }).toEqual(before);
  });

  it("supports maximum capacity, with no more than 90 total lifetime grants", () => {
    const names = ["a", ...Array.from({ length: 29 }, (_, i) => `bot-${i}`)];
    const state = initial(input(names));
    const result = award(names.map((name) => a(name === "a" ? 80 : 0, name)), state);
    expect(result.grants).toHaveLength(87);
    expect(new Set(result.grants.map((g) => `${g.entrantId}:${g.milestone}`)).size).toBe(87);
    expect(result.state.random).not.toEqual(seed);
  });
});

describe("bounded typed refusals", () => {
  it.each([
    [{ participants: [] }, "NOT_ENOUGH_PARTICIPANTS"],
    [{ participants: input().participants.slice(0, 1) }, "NOT_ENOUGH_PARTICIPANTS"],
    [{ participants: input().participants.map((p) => ({ ...p, kind: "bot" as const })) }, "NO_HUMAN_PARTICIPANT"],
    [{ participants: [...input().participants, input().participants[0]!] }, "INVALID_ROSTER"],
    [{ participants: input(Array.from({ length: 31 }, (_, i) => `p${i}`)).participants }, "INVALID_ROSTER"],
    [{ participants: [{ entrantId: id("a"), kind: "spectator" as EntrantKind }, input().participants[1]!] }, "INVALID_ROSTER"],
    [{ random: [0, 0, 0, 0] as const }, "INVALID_RANDOM_STATE"],
    [{ random: [1, 2, 3, -1] as const }, "INVALID_RANDOM_STATE"],
  ])("rejects invalid initialization %#", (patch, reason) => {
    expect(createBonusAwards({ ...input(), ...patch })).toEqual({ ok: false, reason });
  });

  it("refuses wrong race, stale revision and malformed envelopes", () => {
    const entries = [a(25), a(10, "b"), a(0, "c")];
    const state = award(entries, initial(), 3).state;
    expect(awardBonuses(state, snapshot(entries, 2))).toEqual({ ok: false, reason: "STALE_REVISION" });
    expect(awardBonuses(state, { ...snapshot(entries, 4), raceId: asRaceId("other") })).toEqual({ ok: false, reason: "WRONG_RACE" });
    for (const revision of [-1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
      expect(awardBonuses(state, snapshot(entries, revision))).toEqual({ ok: false, reason: "INVALID_INPUT" });
    }
    expect(awardBonuses(state, null as unknown as BonusAwardsSnapshot)).toEqual({ ok: false, reason: "INVALID_INPUT" });
  });

  it.each([
    [a(-1), a(0, "b"), a(0, "c")],
    [a(NaN), a(0, "b"), a(0, "c")],
    [a(0, "a", 0), a(0, "b"), a(0, "c")],
    [a(101), a(0, "b"), a(0, "c")],
    [a(1.5), a(0, "b"), a(0, "c")],
    [a(0, "a", Number.MAX_SAFE_INTEGER + 1), a(0, "b"), a(0, "c")],
    [a(99, "a", 100, "finished"), a(0, "b"), a(0, "c")],
    [a(1, "a", 100, "unknown" as BonusProgress["status"]), a(0, "b"), a(0, "c")],
  ])("refuses invalid progress %#", (...entries) => {
    expect(awardBonuses(initial(), snapshot(entries))).toEqual({ ok: false, reason: "INVALID_PROGRESS" });
  });

  it("refuses changed, missing and duplicate entrants", () => {
    for (const entries of [[a(25), a(0, "b")], [a(25), a(0, "b"), a(0, "b")], [a(25), a(0, "b"), a(0, "stranger")]]) {
      expect(awardBonuses(initial(), snapshot(entries))).toEqual({ ok: false, reason: "INVALID_ROSTER" });
    }
  });

  it("refuses corrupted persisted history instead of exceeding the award cap", () => {
    const good = award([a(80), a(10, "b"), a(0, "c")]).state;
    const cases = [
      { ...good, grants: [...good.grants, good.grants[0]!] },
      { ...good, grants: Array.from({ length: 91 }, () => good.grants[0]!) },
      { ...good, milestones: [50] },
      { ...good, milestones: [25, 25] },
      { ...good, enabled: false },
      { ...good, revision: -1 },
      { ...good, phase: "countdown" },
      { ...good, random: [0, 0, 0, 0] },
      { ...good, version: 2 },
      { ...good, participants: [...good.participants].reverse() },
      { ...good, grants: [{ ...good.grants[0], entrantId: "stranger" }] },
      { ...good, grants: [{ ...good.grants[0], kind: "unknown" }] },
      null,
    ];
    for (const bad of cases) {
      expect(awardBonuses(bad as BonusAwardsState, snapshot([a(90), a(0, "b"), a(0, "c")], 1)))
        .toEqual({ ok: false, reason: "INVALID_STATE" });
    }
  });
});

describe("independent award oracle", () => {
  it("exhausts 729 small progress combinations, with exactly representable fractions", () => {
    for (let x = 0; x <= 8; x++) for (let y = 0; y <= 8; y++) for (let z = 0; z <= 8; z++) {
      const entries = [a(x, "a", 8), a(y, "b", 8), a(z, "c", 8)];
      expect(recipients(award(entries))).toEqual(oracle(entries));
    }
  });

  it("checks seeded multi-step histories, arbitrary order, regressions and maximum awards", () => {
    const random = createRandom([42, 7, 11, 19]);
    for (let run = 0; run < 50; run++) {
      let state = initial();
      const seen = new Set<number>();
      for (let revision = 0; revision < 20; revision++) {
        const entries = ["a", "b", "c"].map((name) => a(random.index(101), name));
        const expected = oracle(entries, seen);
        const result = award(entries.reverse(), state, revision);
        expect(recipients(result)).toEqual(expected);
        state = result.state;
        for (const name of ["a", "b", "c"]) expect(state.grants.filter((g) => g.entrantId === name).length).toBeLessThanOrEqual(3);
      }
    }
  });
});

/** Deliberately simple, separate implementation: used only for exact small fractions above. */
function oracle(entries: readonly BonusProgress[], seen = new Set<number>()): string[] {
  const active = entries.filter((e) => e.status === "racing");
  const leader = Math.max(...entries.filter((e) => e.status === "racing" || e.status === "finished").map((e) => e.position / e.length));
  const last = Math.min(...active.map((e) => e.position / e.length));
  const output: string[] = [];
  for (const milestone of [25, 50, 75]) {
    if (seen.has(milestone) || leader * 100 < milestone) continue;
    seen.add(milestone);
    for (const entrant of [...active].sort((a, b) => a.entrantId < b.entrantId ? -1 : 1)) {
      const progress = entrant.position / entrant.length;
      // Integer percentages in the randomized oracle avoid floating subtraction at the 25 boundary.
      const gap = Math.round(leader * 1_000_000) - Math.round(progress * 1_000_000);
      if (progress < leader && (progress === last || gap > 250_000)) output.push(`${milestone}:${entrant.entrantId}`);
    }
  }
  return output;
}

function permutations<T>(items: readonly T[]): T[][] {
  if (items.length === 0) return [[]];
  return items.flatMap((item, index) => permutations(items.filter((_, i) => i !== index)).map((tail) => [item, ...tail]));
}

function freeze<T>(value: T): T {
  if (value !== null && typeof value === "object") {
    Object.freeze(value);
    for (const child of Object.values(value)) freeze(child);
  }
  return value;
}
