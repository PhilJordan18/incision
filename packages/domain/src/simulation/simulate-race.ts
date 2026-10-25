import { createBot, stepBot, type BotState } from "../bots/engine";
import type { BotLevel } from "../bots/profiles";
import type { EntrantId } from "../ids";
import { createRace } from "../race/create";
import { reduceRace } from "../race/reduce";
import type { CreateRaceInput, RaceEnd, RaceEvent, RaceState } from "../race/types";
import type { RandomState } from "../random/prng";
import { asInstant, MAX_INSTANT } from "../time";

export type SimulatedBot = { readonly entrantId: EntrantId; readonly level: BotLevel; readonly seed: RandomState };
/** Human actions only; the simulator owns ticks and every bot's input. */
export type ScriptedHumanEvent = Exclude<RaceEvent, { readonly type: "tick" | "interrupt" }>;
export type SimulationInput = {
  readonly race: CreateRaceInput;
  readonly bots: readonly SimulatedBot[];
  /** Nondecreasing timestamps; ties preserve array order and precede bot intentions. */
  readonly humanEvents?: readonly ScriptedHumanEvent[];
  /** Scheduling iterations, not simulated milliseconds. Hard ceiling: one million. */
  readonly maxSteps?: number;
  /** Virtual duration from countdown creation. Hard ceiling: one hour. */
  readonly maxDurationMs?: number;
};
export type SimulationResult =
  | { readonly ok: true; readonly race: RaceState; readonly end: RaceEnd; readonly steps: number }
  | { readonly ok: false; readonly reason: "INVALID_LIMITS" | "INVALID_RACE" | "INVALID_BOTS" | "INVALID_SCRIPT" | "EVENT_REFUSED" | "STEP_LIMIT" | "TIME_LIMIT" | "STALLED" };

/**
 * Offline seed preparation, not a realtime driver or a persistence API. Uses the real reducer's
 * results without rewriting measures or ranks. Inputs are trusted typed seed configuration;
 * createRace's programming errors (invalid branded ids/text/clock) still throw. No wall clock,
 * IO, global randomness, bonus effects or live account identity is involved.
 */
export function simulateRace(input: SimulationInput): SimulationResult {
  const maxSteps = input.maxSteps ?? 100_000;
  const duration = input.maxDurationMs ?? 600_000;
  if (!Number.isSafeInteger(maxSteps) || maxSteps < 1 || maxSteps > 1_000_000 ||
      !Number.isSafeInteger(duration) || duration < 1 || duration > 3_600_000 || input.race.now + duration > MAX_INSTANT) {
    return { ok: false, reason: "INVALID_LIMITS" };
  }
  const created = createRace(input.race);
  if (!created.ok) return { ok: false, reason: "INVALID_RACE" };
  const bots = prepareBots(created.race, input.bots);
  if (bots === undefined) return { ok: false, reason: "INVALID_BOTS" };
  const script = input.humanEvents ?? [];
  if (!validScript(created.race, script)) return { ok: false, reason: "INVALID_SCRIPT" };
  const horizon = input.race.now + duration;
  let output = reduceRace(created.race, { type: "tick", now: created.race.clock });
  let cursor = 0;

  simulation: for (let steps = 1; steps <= maxSteps; steps += 1) {
    const { state } = output;
    const event = script[cursor];
    if (event !== undefined && event.now === state.clock) {
      output = reduceRace(state, event);
      if (output.ignored !== undefined || (event.type === "keystrokes" && output.keystrokes?.outcome !== "applied")) {
        return { ok: false, reason: "EVENT_REFUSED" };
      }
      cursor += 1;
      if (output.ended) return { ok: true, race: output.state, end: output.ended, steps };
      continue;
    }
    let next = Math.min(output.nextDeadline ?? Infinity, event?.now ?? Infinity);
    // Registration order breaks ties, independently of the order of bot configuration entries.
    for (let index = 0; index < bots.length; index += 1) {
      const previous = bots[index]!;
      const entrant = state.entrants.find((item) => item.entrantId === previous.entrantId)!;
      const step = stepBot(previous, state.clock, { raceId: state.raceId, phase: state.phase, errorMode: state.errorMode, entrant });
      bots[index] = step.bot;
      if (step.batch !== undefined) {
        output = reduceRace(state, { type: "keystrokes", now: state.clock, batch: step.batch });
        if (output.keystrokes?.outcome !== "applied") return { ok: false, reason: "EVENT_REFUSED" };
        if (output.ended) return { ok: true, race: output.state, end: output.ended, steps };
        continue simulation;
      }
      if (step.nextAt !== undefined) next = Math.min(next, step.nextAt);
    }
    if (!Number.isFinite(next) || next <= state.clock) return { ok: false, reason: "STALLED" };
    if (next > horizon) return { ok: false, reason: "TIME_LIMIT" };
    output = reduceRace(state, { type: "tick", now: asInstant(next) });
    if (output.ended) return { ok: true, race: output.state, end: output.ended, steps };
  }
  return { ok: false, reason: "STEP_LIMIT" };
}

function prepareBots(race: RaceState, configurations: readonly SimulatedBot[]): BotState[] | undefined {
  const entrants = race.entrants.filter((entrant) => entrant.kind === "bot");
  if (configurations.length !== entrants.length || new Set(configurations.map((bot) => bot.entrantId)).size !== entrants.length) return undefined;
  try {
    return entrants.map((entrant) => {
      const config = configurations.find((bot) => bot.entrantId === entrant.entrantId);
      if (config === undefined) throw new RangeError("Missing bot configuration");
      return createBot({ ...config, raceId: race.raceId, startsAt: race.startsAt });
    });
  } catch (error: unknown) {
    if (error instanceof RangeError) return undefined;
    throw error;
  }
}

function validScript(race: RaceState, events: readonly ScriptedHumanEvent[]): boolean {
  if (events.length > 100_000) return false;
  let previous = race.countdownAt;
  for (const event of events) {
    if (!Number.isSafeInteger(event.now) || event.now < previous || event.now > MAX_INSTANT) return false;
    const id = event.type === "keystrokes" ? event.batch.entrantId : event.entrantId;
    if (!race.entrants.some((entrant) => entrant.entrantId === id && entrant.kind === "human")) return false;
    if (event.type === "keystrokes" && event.batch.raceId !== race.raceId) return false;
    previous = event.now;
  }
  return true;
}
