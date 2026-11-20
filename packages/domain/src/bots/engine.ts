import { asEntrantId, asRaceId, type EntrantId, type RaceId } from "../ids";
import { MAX_TEXT_GRAPHEMES } from "../race/limits";
import type { EntrantState, ErrorMode, KeystrokeBatch, KeystrokeResult, RacePhase } from "../race/types";
import { asRandomState, createRandom, type RandomState } from "../random/prng";
import { asDuration, asInstant, MAX_INSTANT, type Duration, type Instant } from "../time";
import { botProfile, type BotLevel } from "./profiles";

/** Version the scheduling rules as well as the saved PRNG state to reproduce a simulation. */
export const BOT_ENGINE_VERSION = "1";
/** At most one event per call, never a catch-up loop after a stalled server. */
export const BOT_MIN_DELAY_MS = 60;

type Plan = {
  readonly seq: number;
  readonly textVersion: number;
  readonly position: number;
  readonly expected: string;
  readonly grapheme: string;
  readonly dueAt: Instant;
};

export type BotState = {
  readonly version: typeof BOT_ENGINE_VERSION;
  readonly raceId: RaceId;
  readonly entrantId: EntrantId;
  readonly level: BotLevel;
  readonly random: RandomState;
  readonly startsAt: Instant;
  readonly clock: Instant;
  readonly plan?: Plan;
  /** A proposed batch has no authority. Wait for its applied snapshot or its refusal. */
  readonly awaitingAck: boolean;
};

export type BotContext = {
  readonly raceId: RaceId;
  readonly phase: RacePhase;
  readonly errorMode: ErrorMode;
  /** The current server-owned entrant, never a client prediction. */
  readonly entrant: EntrantState;
  /** Pass a refusal/resync when a proposed batch was not applied. Stale replies are ignored. */
  readonly reply?: KeystrokeResult;
};

export type BotStep = {
  readonly bot: BotState;
  readonly batch?: KeystrokeBatch;
  readonly nextAt?: Instant;
};

export function createBot(input: {
  readonly raceId: RaceId;
  readonly entrantId: EntrantId;
  readonly level: BotLevel;
  readonly seed: RandomState;
  readonly startsAt: Instant;
}): BotState {
  botProfile(input.level);
  return {
    version: BOT_ENGINE_VERSION,
    raceId: asRaceId(input.raceId),
    entrantId: asEntrantId(input.entrantId),
    level: input.level,
    random: asRandomState(input.seed),
    startsAt: asInstant(input.startsAt),
    clock: asInstant(input.startsAt),
    awaitingAck: false,
  };
}

/**
 * Proposes one insert; the caller applies it through reduceRace at the SAME server `now`, then
 * calls again with the returned entrant. No counters, position or score are calculated here.
 * Early/repeated calls draw nothing. A late call emits at most one event at now, never in the past.
 * Same seed, authoritative snapshots, replies and clock readings reproduce the same output.
 */
export function stepBot(previous: BotState, now: Instant, context: BotContext): BotStep {
  validate(previous, now, context);
  const clock = asInstant(Math.max(now, previous.clock));
  let bot: BotState = { ...previous, clock };
  const { entrant } = context;
  if (context.phase === "ended" || context.phase === "interrupted" || entrant.status !== "racing") {
    return { bot: withoutPlan(bot) };
  }
  if (now < previous.clock || now < bot.startsAt || context.phase === "countdown") {
    return { bot, nextAt: asInstant(Math.max(bot.startsAt, clock)) };
  }

  const plan = bot.plan;
  const stale = plan !== undefined && (
    plan.seq !== entrant.ackSeq + 1 || plan.textVersion !== entrant.textVersion ||
    plan.position !== entrant.typed.length || plan.expected !== entrant.target[entrant.typed.length]
  );
  const refused = bot.awaitingAck && context.reply?.seq === plan?.seq &&
    (context.reply?.outcome === "refused" || context.reply?.outcome === "resync");
  if (stale || refused) bot = withoutPlan(bot);
  if (bot.awaitingAck) return { bot };
  if (bot.plan === undefined) {
    bot = schedule(bot, context);
    return { bot, nextAt: bot.plan?.dueAt };
  }
  if (clock < bot.plan.dueAt) return { bot, nextAt: bot.plan.dueAt };
  return {
    bot: { ...bot, awaitingAck: true },
    batch: {
      raceId: bot.raceId, entrantId: bot.entrantId,
      seq: bot.plan.seq, textVersion: bot.plan.textVersion,
      events: [{ type: "insert", grapheme: bot.plan.grapheme }],
    },
  };
}

function withoutPlan(bot: BotState): BotState {
  const { plan: _plan, ...rest } = bot;
  void _plan;
  return { ...rest, awaitingAck: false };
}

/** A local spelling heuristic, not a linguistic difficulty classifier or a word-list lookup. */
export function botWordDifficulty(target: readonly string[], position: number): number {
  if (!Number.isInteger(position) || position < 0 || position >= target.length || target.length > MAX_TEXT_GRAPHEMES) {
    throw new RangeError("Invalid bot text position");
  }
  let start = position;
  let end = position;
  while (start > 0 && target[start - 1] !== " ") start -= 1;
  while (end < target.length && target[end] !== " ") end += 1;
  const complex = target.slice(start, end).some((part) => !/^[a-zA-Z]$/.test(part));
  return Math.min(0.2, Math.max(0, end - start - 6) * 0.025) + (complex ? 0.1 : 0);
}

function schedule(bot: BotState, context: BotContext): BotState {
  const { entrant, errorMode } = context;
  const position = entrant.typed.length;
  const expected = entrant.target[position];
  if (expected === undefined) throw new RangeError("A racing bot must have a remaining grapheme");
  const profile = botProfile(bot.level);
  const random = createRandom(bot.random);
  // One forced correct repair after a mandatory error, never an unbounded chain of errors.
  const repairing = errorMode === "mandatory" && entrant.pendingError;
  const errorChance = errorMode === "mandatory" ? profile.errorRate / (1 - profile.errorRate) : profile.errorRate;
  const wrong = !repairing && random.uint32() / 2 ** 32 < errorChance;
  const variation = 0.7 + (random.uint32() / 2 ** 32) * 0.5;
  const hesitation = random.uint32() / 2 ** 32 < 0.06 ? 1 : 0;
  const difficulty = botWordDifficulty(entrant.target, position);
  // Free-mode errors pay their cost BEFORE the insert, including an erroneous last character.
  const correction = repairing || (wrong && errorMode === "free") ? 0.5 : 0;
  const baseMs = 12_000 / ((profile.minWpm + profile.maxWpm) / 2);
  const delay = Math.max(BOT_MIN_DELAY_MS, Math.ceil(baseMs * (variation + hesitation + difficulty + correction)));
  const dueAt = asInstant(bot.clock + delay);
  return {
    ...bot,
    random: random.state(),
    plan: {
      seq: entrant.ackSeq + 1, textVersion: entrant.textVersion, position, expected,
      grapheme: wrong ? (expected === "x" ? "z" : "x") : expected, dueAt,
    },
  };
}

/**
 * Conservative bound for a STABLE target, at most one wrong insert + one repair per position.
 * Requires immediate acknowledgements and calls at each nextAt; scheduler stalls add their delay.
 * Time limits/interruptions may terminate a race earlier. Repeated text additions have no such bound.
 */
export function maxBotCompletionMs(level: BotLevel, graphemes: number): Duration {
  const profile = botProfile(level);
  if (!Number.isInteger(graphemes) || graphemes < 1 || graphemes > MAX_TEXT_GRAPHEMES) {
    throw new RangeError("Invalid bot text length");
  }
  // variation <= 1.2, hesitation <= 1, difficulty <= .3, correction <= .5.
  const maxDelay = Math.max(BOT_MIN_DELAY_MS, Math.ceil((12_000 / profile.minWpm) * 3));
  return asDuration(2 * graphemes * maxDelay);
}

function validate(bot: BotState, now: Instant, context: BotContext): void {
  asInstant(now);
  asInstant(bot.clock);
  asInstant(bot.startsAt);
  asRandomState(bot.random);
  botProfile(bot.level);
  const { entrant } = context;
  if (bot.version !== BOT_ENGINE_VERSION || bot.raceId !== context.raceId || bot.entrantId !== entrant.entrantId || entrant.kind !== "bot") {
    throw new RangeError("Bot state does not match its authoritative context");
  }
  if (!["mandatory", "free"].includes(context.errorMode) || !["countdown", "racing", "ended", "interrupted"].includes(context.phase)) {
    throw new RangeError("Invalid bot race configuration");
  }
  if (!Number.isSafeInteger(entrant.ackSeq) || entrant.ackSeq < 0 || entrant.ackSeq >= Number.MAX_SAFE_INTEGER ||
      !Number.isSafeInteger(entrant.textVersion) || entrant.textVersion < 0 ||
      entrant.target.length < 1 || entrant.target.length > MAX_TEXT_GRAPHEMES || entrant.typed.length > entrant.target.length ||
      bot.clock > MAX_INSTANT) throw new RangeError("Invalid authoritative bot state");
}
