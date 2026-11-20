import { createHash } from "node:crypto";
import { asEntrantId, asInstant, asRaceId, asDuration, createBot, createRace, reduceRace, simulateRace, stepBot,
  type BotLevel, type ScriptedHumanEvent } from "@incision/domain";
import type { CheckedCorpus } from "../corpus/check";

export const HISTORY_SEED_VERSION = "demo-history-v1";
/** Stable namespace, independent of wall-clock time. Never used for real identities. */
export function fixtureId(key: string): string {
  const hex = createHash("sha256").update(`${HISTORY_SEED_VERSION}:${key}`).digest("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

export const HISTORY_ACCOUNTS = [
  { id: fixtureId("alice"), login: "demo-history-alice", displayName: "Alice (demo history)", password: "brume-history-alice-4817" },
  { id: fixtureId("bruno"), login: "demo-history-bruno", displayName: "Bruno (demo history)", password: "brume-history-bruno-2096" },
] as const;

/** Public fictional credentials, no privilege, unrelated to real/demo-login accounts. */
export function historyFixtures(corpus: CheckedCorpus) {
  return ["fr", "en"].flatMap((language, languageIndex) => {
    const passage = corpus.passages.filter((p) => p.language === language && p.status === "retained")
      .sort((a, b) => a.text.length - b.text.length || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))[0];
    if (!passage) throw new Error("History seed needs a retained passage per language");
    return ["finished", "abandoned", "timed_out"].map((scenario, index) => {
      const id = asRaceId(fixtureId(`${corpus.checksum}:${language}:${scenario}`));
      const participants = HISTORY_ACCOUNTS.map((account) => ({ entrantId: asEntrantId(fixtureId(`${id}:${account.id}`)), kind: "human" as const }));
      const scripts = participants.flatMap(({ entrantId }, accountIndex) => {
        const generated = botScript(passage.text, accountIndex === 0 ? "expert" : "beginner", accountIndex + 1);
        const events: ScriptedHumanEvent[] = generated.map((event) => ({ ...event, batch: { ...event.batch, raceId: id, entrantId } }));
        if (scenario === "abandoned" && accountIndex === 1) {
          return [...events.filter((event) => event.now < 6000), { type: "abandon" as const, entrantId, now: asInstant(6000) }];
        }
        if (scenario === "timed_out") {
          // Both remain present but intentionally stop typing before the deadline.
          return [...events.filter((event) => event.now < 5000), { type: "present" as const, entrantId, now: asInstant(20_000) }];
        }
        return events;
      }).sort((a, b) => a.now - b.now);
      const simulation = simulateRace({ race: { raceId: id, text: passage.text, now: asInstant(0), errorMode: "mandatory",
        timeLimit: scenario === "timed_out" ? asDuration(30_000) : null, participants }, bots: [], humanEvents: scripts });
      if (!simulation.ok) throw new Error(`History simulation refused: ${simulation.reason}`);
      const epoch = Date.UTC(2026, 9, 1 + languageIndex * 3 + index, 12);
      return { id, passage, participants, simulation, epoch, scenario, language };
    });
  });
}

/**
 * Record the real bot engine's inputs in a disposable virtual race. Replay INPUTS (never scores)
 * as fictional human scripts: the persisted schema has human accounts, not playable bot identity.
 */
function botScript(text: string, level: BotLevel, seed: number) {
  const raceId = asRaceId("history-script");
  const entrantId = asEntrantId("script-bot");
  const spectator = asEntrantId("script-human");
  const created = createRace({ raceId, text, now: asInstant(0), errorMode: "mandatory", timeLimit: null,
    participants: [{ entrantId, kind: "bot" }, { entrantId: spectator, kind: "human" }] });
  if (!created.ok) throw new Error("Cannot prepare history script");
  let output = reduceRace(created.race, { type: "abandon", entrantId: spectator, now: created.race.startsAt });
  let bot = createBot({ raceId, entrantId, startsAt: created.race.startsAt, level, seed: [seed, 2, 3, 4] });
  const events: Extract<ScriptedHumanEvent, { type: "keystrokes" }>[] = [];
  for (let steps = 0; steps < 100_000 && output.state.clock <= 600_000; steps++) {
    if (output.ended) return events;
    const step = stepBot(bot, output.state.clock, { raceId, phase: output.state.phase, errorMode: "mandatory", entrant: output.state.entrants[0]! });
    bot = step.bot;
    if (step.batch) {
      const event = { type: "keystrokes" as const, now: output.state.clock, batch: step.batch };
      output = reduceRace(output.state, event);
      if (output.keystrokes?.outcome !== "applied") throw new Error("Bot script input refused");
      events.push(event);
    } else {
      const next = Math.min(step.nextAt ?? Infinity, output.nextDeadline ?? Infinity);
      if (!Number.isFinite(next) || next <= output.state.clock) throw new Error("Bot script stalled");
      output = reduceRace(output.state, { type: "tick", now: asInstant(next) });
    }
  }
  throw new Error("Bot script exceeded its work budget");
}
