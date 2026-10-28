import { isDeepStrictEqual } from "node:util";
import { eq, or, sql } from "drizzle-orm";
import type { Database } from "../client";
import type { CheckedCorpus } from "../corpus/check";
import { hashPassword, verifyPassword } from "../identity/password";
import { accounts, races, raceEntrants, raceResults } from "../schema";
import { boundedTransaction, READ_COMMITTED } from "../transaction";
import { HISTORY_ACCOUNTS, HISTORY_SEED_VERSION, historyFixtures } from "./fixture";

/** Insert-only demo accounts + immutable history, atomically. Any collision rolls everything back. */
export async function seedHistory(db: Database, corpus: CheckedCorpus): Promise<{ created: number; unchanged: number }> {
  // Simulation and new password hashing happen before taking transaction locks.
  // Existing credentials are verified under the lock to handle concurrent seed runs safely.
  const fixtures = historyFixtures(corpus);
  const hashes = await Promise.all(HISTORY_ACCOUNTS.map((account) => hashPassword(account.password)));
  return boundedTransaction(db, async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(1646910070)`);
    for (const [index, definition] of HISTORY_ACCOUNTS.entries()) {
      const [stored] = await tx.select().from(accounts).where(or(eq(accounts.id, definition.id), eq(accounts.loginCanonical, definition.login))).for("update");
      if (stored) {
        if (stored.id !== definition.id || stored.login !== definition.login || stored.displayName !== definition.displayName ||
          !stored.passwordHash || !await verifyPassword(definition.password, stored.passwordHash)) throw new Error("History demo account conflict");
      } else {
        await tx.insert(accounts).values({ id: definition.id, login: definition.login, loginCanonical: definition.login,
          displayName: definition.displayName, passwordHash: hashes[index]! });
      }
    }
    let created = 0;
    let unchanged = 0;
    for (const fixture of fixtures) {
      const { id, simulation, epoch, passage } = fixture;
      const date = (instant: number) => new Date(epoch + instant);
      const race: typeof races.$inferSelect = {
        id, lobbyId: null, roundNo: 1, state: "finished", rulesVersion: 1, textSnapshot: passage.text,
        configSnapshot: { seed: HISTORY_SEED_VERSION, corpus: corpus.version, checksum: corpus.checksum, passage: passage.id,
          language: fixture.language, scenario: fixture.scenario, errorMode: "mandatory", bonuses: false, syntheticHumans: true },
        countdownAt: date(simulation.race.countdownAt), startedAt: date(simulation.race.startsAt), endedAt: date(simulation.end.endedAt),
        interruptionReason: null, ownerId: id, ownerEpoch: 1, leaseExpiresAt: date(simulation.end.endedAt),
      };
      const entrants: (typeof raceEntrants.$inferSelect)[] = fixture.participants.map((participant, i) => ({
        id: participant.entrantId, raceId: id, memberId: null, accountId: HISTORY_ACCOUNTS[i]!.id, ordinal: i + 1,
        displayNameSnapshot: HISTORY_ACCOUNTS[i]!.displayName,
        kind: "human", botLevel: null,
      }));
      const results: (typeof raceResults.$inferSelect)[] = simulation.end.results.map((result) => ({
        raceId: id, entrantId: result.entrantId, rank: result.rank, outcome: result.status === "timedOut" ? "timed_out" : result.status,
        elapsedMs: result.elapsed, position: result.position, length: result.length, correctInputs: result.counters.correctInserts,
        totalInputs: result.counters.totalInserts, ...result.measures, abandonmentReason: result.abandonReason ?? null,
      }));
      const [stored] = await tx.select().from(races).where(eq(races.id, id)).for("update");
      if (stored) {
        const storedEntrants = await tx.select().from(raceEntrants).where(eq(raceEntrants.raceId, id)).orderBy(raceEntrants.ordinal);
        const storedResults = await tx.select().from(raceResults).where(eq(raceResults.raceId, id)).orderBy(raceResults.rank);
        if (!isDeepStrictEqual(stored, race) || !isDeepStrictEqual(storedEntrants, entrants) || !isDeepStrictEqual(storedResults, results)) {
          throw new Error("History race conflict: existing snapshot is never overwritten");
        }
        unchanged++;
      } else {
        await tx.insert(races).values(race);
        await tx.insert(raceEntrants).values(entrants);
        await tx.insert(raceResults).values(results);
        created++;
      }
    }
    return { created, unchanged };
  }, READ_COMMITTED, { lock: 10_000, statement: 15_000, idleInTransaction: 20_000 });
}
