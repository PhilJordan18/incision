import { describe, expect, it } from "vitest";
import { asEntrantId, asRaceId } from "../ids";
import { computeMeasures } from "../measures/compute";
import { createRace } from "../race/create";
import { reduceRace } from "../race/reduce";
import type { ErrorMode, RaceState } from "../race/types";
import type { RandomState } from "../random/prng";
import { asDuration, asInstant, MAX_INSTANT } from "../time";
import { botWordDifficulty, createBot, maxBotCompletionMs, stepBot, type BotContext, type BotState } from "./engine";
import { BOT_LEVELS, BOT_PROFILES, type BotLevel } from "./profiles";

const RACE = asRaceId("bot-race");
const BOT = asEntrantId("bot-1");
const SEED: RandomState = [1, 2, 3, 4];

function setup(text = "le bateau au port", errorMode: ErrorMode = "mandatory", level: BotLevel = "noob", seed = SEED) {
  const result = createRace({
    raceId: RACE, text, errorMode, timeLimit: null, now: asInstant(0),
    participants: [{ entrantId: asEntrantId("human"), kind: "human" }, { entrantId: BOT, kind: "bot" }],
  });
  if (!result.ok) throw new Error(result.reason);
  const race = reduceRace(result.race, { type: "tick", now: result.race.startsAt }).state;
  const bot = createBot({ raceId: RACE, entrantId: BOT, level, seed, startsAt: race.startsAt });
  return { race, bot };
}

function context(race: RaceState): BotContext {
  const entrant = race.entrants.find((candidate) => candidate.entrantId === BOT);
  if (!entrant) throw new Error("Missing test bot");
  return { raceId: race.raceId, phase: race.phase, errorMode: race.errorMode, entrant };
}

function simulate(text: string, mode: ErrorMode, level: BotLevel, seed = SEED) {
  let { race, bot } = setup(text, mode, level, seed);
  let now = race.startsAt;
  const trace: { at: number; grapheme: string }[] = [];
  const bound = maxBotCompletionMs(level, race.text.length);
  for (let calls = 0; calls <= race.text.length * 4 + 4; calls += 1) {
    const current = context(race);
    if (current.entrant.status !== "racing") {
      const elapsed = asDuration(now - race.startsAt);
      return { trace, bot, entrant: current.entrant, elapsed, measures: computeMeasures(current.entrant.counters, elapsed) };
    }
    const step = stepBot(bot, now, current);
    bot = step.bot;
    if (step.batch) {
      const event = step.batch.events[0];
      if (event?.type !== "insert") throw new Error("Unexpected deletion");
      trace.push({ at: now, grapheme: event.grapheme });
      const output = reduceRace(race, { type: "keystrokes", batch: step.batch, now });
      if (context(output.state).entrant.ackSeq !== step.batch.seq) throw new Error("Bot batch was refused");
      race = output.state;
    } else if (step.nextAt !== undefined) {
      now = step.nextAt;
    } else throw new Error("Bot stopped before completion");
    if (now - race.startsAt > bound) throw new Error("Termination bound exceeded");
  }
  throw new Error("Too many bot steps");
}

describe("bot scheduling and authoritative integration", () => {
  it.each(BOT_LEVELS)("finishes both modes through the real reducer: %s", (level) => {
    for (const mode of ["mandatory", "free"] as const) {
      const result = simulate("Été au port : le voilier avance. ".repeat(8), mode, level);
      expect(result.entrant.status).toBe("finished");
      expect(result.entrant.counters.totalInserts).toBe(result.trace.length);
      expect(result.elapsed).toBeLessThanOrEqual(maxBotCompletionMs(level, result.entrant.target.length));
      if (mode === "mandatory") expect(result.entrant.typed).toEqual(result.entrant.target);
    }
  });

  it("repeats exactly, but another seed changes the cadence", () => {
    const text = "Le marin quitte le port. ".repeat(8);
    expect(simulate(text, "mandatory", "expert")).toEqual(simulate(text, "mandatory", "expert"));
    expect(simulate(text, "mandatory", "expert", [4, 3, 2, 1]).trace).not.toEqual(simulate(text, "mandatory", "expert").trace);
  });

  it("resumes a JSON state, does not mutate inputs, and draws nothing on an early call", () => {
    const { race, bot } = setup();
    Object.freeze(bot);
    const plan = stepBot(bot, race.startsAt, context(race));
    const saved: BotState = JSON.parse(JSON.stringify(plan.bot));
    expect(stepBot(saved, asInstant(plan.nextAt!), context(race))).toEqual(stepBot(plan.bot, asInstant(plan.nextAt!), context(race)));
    const early = stepBot(plan.bot, race.startsAt, context(race));
    expect(early.bot).toEqual(plan.bot);
    expect(early.batch).toBeUndefined();
  });

  it("waits for authority: repeated calls cannot emit twice or advance counters", () => {
    const { race, bot } = setup();
    const current = context(race);
    const plan = stepBot(bot, race.startsAt, current);
    const emitted = stepBot(plan.bot, plan.nextAt!, current);
    expect(emitted.batch?.seq).toBe(1);
    const repeat = stepBot(emitted.bot, plan.nextAt!, current);
    expect(repeat.batch).toBeUndefined();
    expect(repeat.nextAt).toBeUndefined();
    expect(current.entrant.counters.totalInserts).toBe(0);
    const refused = stepBot(repeat.bot, plan.nextAt!, {
      ...current, reply: { outcome: "refused", seq: 1, reason: "WRONG_RACE" },
    });
    expect(refused.batch).toBeUndefined();
    expect(refused.nextAt).toBeGreaterThan(plan.nextAt!);
    expect(refused.bot.plan?.seq).toBe(1);
  });

  it("ignores stale replies while waiting for its own acknowledgement", () => {
    const { race, bot } = setup();
    const plan = stepBot(bot, race.startsAt, context(race));
    const sent = stepBot(plan.bot, plan.nextAt!, context(race));
    expect(stepBot(sent.bot, plan.nextAt!, {
      ...context(race), reply: { outcome: "refused", seq: 9, reason: "WRONG_RACE" },
    }).bot.awaitingAck).toBe(true);
  });

  it("invalidates an old target intention, even when one is awaiting acknowledgement", () => {
    const { race, bot } = setup("abc", "mandatory", "impossible");
    const plan = stepBot(bot, race.startsAt, context(race));
    const sent = stepBot(plan.bot, plan.nextAt!, context(race));
    for (const previous of [plan.bot, sent.bot]) {
      const current = context(race);
      const changed = { ...current, entrant: { ...current.entrant, target: ["z", "b"], textVersion: 1 } };
      const reset = stepBot(previous, plan.nextAt!, changed);
      expect(reset.batch).toBeUndefined();
      expect(reset.bot.plan?.expected).toBe("z");
      expect(reset.bot.plan?.textVersion).toBe(1);
      expect(reset.bot.plan?.seq).toBe(1);
    }
  });

  it("never types before the start, in countdown, after finish or interruption", () => {
    const { race, bot } = setup();
    const current = context(race);
    expect(stepBot(bot, asInstant(race.startsAt - 1), current).batch).toBeUndefined();
    expect(stepBot(bot, race.startsAt, { ...current, phase: "countdown" }).batch).toBeUndefined();
    for (const phase of ["ended", "interrupted"] as const) {
      expect(stepBot(bot, race.startsAt, { ...current, phase }).nextAt).toBeUndefined();
    }
    for (const status of ["finished", "timedOut", "abandoned"] as const) {
      expect(stepBot(bot, race.startsAt, { ...current, entrant: { ...current.entrant, status } }).batch).toBeUndefined();
    }
  });

  it("resynchronises a version-only change when the next grapheme stays the same", () => {
    const { race, bot } = setup("abc");
    const current = context(race);
    const plan = stepBot(bot, race.startsAt, current);
    for (const target of [["a", "b"], ["a", "b", "c", "d", "e"]]) {
      const changed = { ...current, entrant: { ...current.entrant, target, textVersion: 1 } };
      const reset = stepBot(plan.bot, plan.nextAt!, changed);
      expect(reset.batch).toBeUndefined();
      expect(reset.bot.plan?.textVersion).toBe(1);
      expect(reset.bot.plan?.expected).toBe("a");
      expect(reset.nextAt).toBeGreaterThan(plan.nextAt!);
      const emitted = stepBot(reset.bot, reset.nextAt!, changed);
      const updatedRace = { ...race, entrants: race.entrants.map((entrant) => entrant.entrantId === BOT ? changed.entrant : entrant) };
      const applied = reduceRace(updatedRace, { type: "keystrokes", batch: emitted.batch!, now: reset.nextAt! });
      expect(context(applied.state).entrant.ackSeq).toBe(1);
    }
  });

  it("handles a huge late call in one event, and never backdates the next event", () => {
    const { race, bot } = setup("a".repeat(200));
    const plan = stepBot(bot, race.startsAt, context(race));
    const late = asInstant(1_000_000);
    const emitted = stepBot(plan.bot, late, context(race));
    expect(emitted.batch?.events).toHaveLength(1);
    const nextRace = reduceRace(race, { type: "keystrokes", batch: emitted.batch!, now: late }).state;
    expect(stepBot(emitted.bot, late, context(nextRace)).nextAt).toBeGreaterThan(late);
    expect(stepBot(emitted.bot, race.startsAt, context(nextRace)).batch).toBeUndefined();
  });

  it("forces a correct mandatory repair and gives it a cost", () => {
    const { race, bot } = setup("a");
    const current = context(race);
    const repair = stepBot(bot, race.startsAt, { ...current, entrant: { ...current.entrant, pendingError: true } });
    expect(repair.bot.plan?.grapheme).toBe("a");
    expect(repair.nextAt! - race.startsAt).toBeGreaterThan(12_000 / 15 * 1.2);
  });

  it("uses a bounded spelling heuristic without a dictionary", () => {
    expect(botWordDifficulty(["m", "e", "r"], 1)).toBe(0);
    expect(botWordDifficulty([..."extraordinaire"], 2)).toBeGreaterThan(0);
    expect(botWordDifficulty([..."été"], 1)).toBeGreaterThan(0);
    expect(botWordDifficulty([..."é".repeat(4_000)], 0)).toBeCloseTo(0.3);
    expect(() => botWordDifficulty([], 0)).toThrow(RangeError);
  });

  it("actually slows a hard word under the same random draws", () => {
    const easy = setup("mer");
    const hard = setup("extraordinaire");
    expect(stepBot(hard.bot, hard.race.startsAt, context(hard.race)).nextAt)
      .toBeGreaterThan(stepBot(easy.bot, easy.race.startsAt, context(easy.race)).nextAt!);
  });

  it("charges a free-mode error before even the last character, without rewriting it", () => {
    const free = simulate("a", "free", "noob");
    expect(free.entrant.counters).toEqual({ correctInserts: 0, totalInserts: 1 });
    expect(free.entrant.typed).toEqual(["x"]);
    expect(free.entrant.status).toBe("finished");
    const mandatory = simulate("a", "mandatory", "noob");
    expect(mandatory.entrant.counters).toEqual({ correctInserts: 1, totalInserts: 2 });
    expect(free.trace[0]!.at).toBeGreaterThan(mandatory.trace[0]!.at);
    expect(mandatory.trace.map((entry) => entry.grapheme)).toEqual(["x", "a"]);
    expect(simulate("x", "free", "noob").entrant.typed).toEqual(["z"]);
  });

  it("honours a real time limit rather than promising that a slow bot finishes in two minutes", () => {
    const { race, bot } = setup("a".repeat(4_000));
    const timed = reduceRace({ ...race, timeLimit: asDuration(120_000) }, {
      type: "tick", now: asInstant(race.startsAt + 120_000),
    }).state;
    expect(context(timed).entrant.status).toBe("timedOut");
    expect(stepBot(bot, timed.clock, context(timed)).batch).toBeUndefined();
  });

  it("rejects invalid inputs, identities and arithmetic overflow", () => {
    const { bot, race } = setup();
    const current = context(race);
    expect(() => stepBot(bot, race.startsAt, { ...current, raceId: asRaceId("other") })).toThrow(RangeError);
    expect(() => stepBot(bot, race.startsAt, { ...current, entrant: { ...current.entrant, kind: "human" } })).toThrow(RangeError);
    expect(() => createBot({ ...bot, seed: [0, 0, 0, 0] })).toThrow(RangeError);
    expect(() => maxBotCompletionMs("noob", 0)).toThrow(RangeError);
    expect(() => maxBotCompletionMs("noob", 4_001)).toThrow(RangeError);
    expect(() => stepBot(bot, asInstant(MAX_INSTANT), current)).toThrow(RangeError);
  });

  it("terminates 200 long words at the slowest level within the derived bound", () => {
    const result = simulate(Array.from({ length: 200 }, () => "extraordinairement").join(" "), "mandatory", "noob");
    expect(result.entrant.status).toBe("finished");
    expect(result.elapsed).toBeGreaterThan(120_000);
  });

  it.each(BOT_LEVELS)("calibrates %s against net measures, both modes and many fixed seeds", (level) => {
    const profile = BOT_PROFILES[level];
    for (const mode of ["free", "mandatory"] as const) {
      let correct = 0;
      let inserts = 0;
      let elapsed = 0;
      const intervals = new Set<number>();
      for (let seed = 1; seed <= 80; seed += 1) {
        const result = simulate("le marin au port the ship at sea ".repeat(8), mode, level, [seed, 82, 374, 997]);
        correct += result.entrant.counters.correctInserts;
        inserts += result.entrant.counters.totalInserts;
        elapsed += result.elapsed;
        for (let i = 1; i < result.trace.length; i += 1) intervals.add(result.trace[i]!.at - result.trace[i - 1]!.at);
      }
      const net = correct * 12_000 / elapsed;
      expect(net).toBeGreaterThanOrEqual(profile.minWpm);
      expect(net).toBeLessThanOrEqual(profile.maxWpm);
      // Six binomial standard deviations, plus finite-length repair bias: fixed seeds, no flaky RNG.
      const tolerance = 6 * Math.sqrt(profile.errorRate * (1 - profile.errorRate) / inserts) + 0.001;
      expect(Math.abs((inserts - correct) / inserts - profile.errorRate)).toBeLessThan(tolerance);
      expect(intervals.size).toBeGreaterThan(20);
    }
  });
});
