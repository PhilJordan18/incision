import {
  beginRacing, createDatabase, createRoomWithHost, finalizeRace, interruptOwnRace,
  joinRoomByCode, readOwnRoomSettings, readRaceForEntrant, startRace,
} from "@incision/database";
import { asDuration, asEntrantId, asInstant, asRaceId, createBonusRace, parseRoomCode } from "@incision/domain";
import pg from "pg";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { RaceRuntime, type RaceConnection } from "../src/server/races/race-runtime";
import { account, DATABASE_URL, prepareDatabase } from "./servers";

let pool: pg.Pool;
beforeAll(async () => {
  await prepareDatabase();
  pool = new pg.Pool({ connectionString: DATABASE_URL });
});
afterAll(async () => { await pool?.end(); });

/** Real engine, runtime, SQL transaction and authorized reader; only clock/lease/transport are doubles. */
it("persists the runtime's frozen series atomically with the results and reads them back", async () => {
  const db = createDatabase(pool);
  const alice = await account("wpm_alice", "Alice");
  const bob = await account("wpm_bob", "Bob");
  const room = await createRoomWithHost(db, {
    accountId: alice.id, role: "participant", visibility: "code", capacity: 2, randomIndex: () => 0,
  });
  if (!room.ok) throw new Error(room.error);
  const code = parseRoomCode(room.room.code);
  if (!code.ok) throw new Error("Invalid test room code");
  const joined = await joinRoomByCode(db, { accountId: bob.id, code: code.code, role: "participant" });
  if (!joined.ok) throw new Error(joined.error);
  const settings = await readOwnRoomSettings(db, alice.id);
  if (!settings) throw new Error("Missing test room settings");
  let now = 1_800_000_000_000;
  const started = await startRace(db, {
    accountId: alice.id, ownerId: "11111111-1111-4111-8111-111111111111",
    lobbyId: room.room.id, settingsRevision: settings.settings.revision,
    rulesVersion: 1, text: "ab", config: { errorMode: "mandatory", bonuses: false },
    create: (race) => {
      const made = createBonusRace({ enabled: false, random: [1, 2, 3, 4], race: {
        raceId: asRaceId(race.raceId), text: "ab", errorMode: "mandatory", timeLimit: asDuration(30_000), now: asInstant(now),
        participants: race.entrants.map((entrant) => ({ ...entrant, entrantId: asEntrantId(entrant.entrantId) })),
      } });
      return made.ok ? { ok: true, race: made.state } : made;
    },
  });
  if (!started.ok) throw new Error(started.error);
  const followers: RaceConnection[] = [alice, bob].map(({ id }) => ({ id, accountId: id, emit: vi.fn() }));
  let nextTimer = 0;
  const timers = new Map<number, { at: number; callback: () => void }>();
  let beginning: Promise<unknown> | undefined;
  const finalize = vi.fn(finalizeRace);
  const runtime = new RaceRuntime({
    ownership: started.race, entrants: started.entrants, state: started.created, language: "fr",
    store: {
      beginRacing: (ownership) => {
        const result = beginRacing(db, ownership);
        beginning = result;
        return result;
      },
      finalizeRace: (ownership, results) => finalize(db, ownership, results),
      interruptOwnRace: (ownership, reason) => interruptOwnRace(db, ownership, reason),
    },
    lease: { state: "held", start: vi.fn(), stop: vi.fn(), isAuthoritative: () => true, suspendedForMs: () => undefined },
    now: () => now, followers: () => followers, onSettled: vi.fn(), log: vi.fn(),
    schedule(callback, delay) {
      const key = nextTimer++;
      timers.set(key, { at: now + delay, callback });
      return () => void timers.delete(key);
    },
  });
  function advance(milliseconds: number) {
    now += milliseconds;
    for (;;) {
      const due = [...timers.entries()].find(([, timer]) => timer.at <= now);
      if (!due) break;
      timers.delete(due[0]);
      due[1].callback();
    }
  }
  try {
    runtime.start();
    advance(3000);
    await beginning;
    advance(1000);
    advance(1000);
    expect(finalize).not.toHaveBeenCalled();
    for (const follower of followers) {
      expect(runtime.keystrokes(follower, {
        raceId: started.race.raceId, seq: 1, textVersion: 0,
        events: [{ type: "insert", grapheme: "a" }, { type: "insert", grapheme: "b" }],
      })).toMatchObject({ ok: true, result: { outcome: "applied" } });
    }
    await runtime.whenSaved();
    expect(runtime.stage).toBe("saved");
    expect(finalize).toHaveBeenCalledOnce();
    const view = await readRaceForEntrant(db, started.race.raceId, alice.id);
    expect(view?.entrants).toHaveLength(2);
    for (const entrant of view?.entrants ?? []) {
      expect(entrant.result?.wpmSeries?.points.map((point) => point.elapsed)).toEqual([0, 1000, 2000]);
      expect(entrant.result?.wpmSeries?.points.at(-1)?.measures).toEqual({ netWpm: 12, rawWpm: 12, accuracy: 100 });
      expect(entrant.result?.elapsedMs).toBe(2000);
    }
    expect(timers.size).toBe(0);
  } finally {
    runtime.retire();
  }
});
