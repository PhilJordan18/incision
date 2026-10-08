import { describeDatabaseError, type Recovery } from "@incision/database";

/**
 * Delays between attempts when the database does not answer at boot, or when races were left
 * for later; then the attempts stop.
 */
export const BOOT_RECOVERY_RETRY_DELAYS_MS = [5_000, 15_000, 45_000] as const;

export type BootRecoveryOptions = {
  /** Interrupts the races whose owner stopped renewing (`recoverAbandonedRaces`). */
  readonly recover: () => Promise<Recovery>;
  /** Told about each room that went back to WAITING, so its members get a fresh snapshot. */
  readonly onRecovered: (lobbyId: string) => void;
  readonly schedule: (callback: () => void, delayMs: number) => void;
  readonly log: (message: string) => void;
  readonly logError: (message: string) => void;
  readonly retryDelaysMs?: readonly number[];
};

/**
 * At boot, recovers the races a previous process left (ADR-0004), without delaying the server:
 * pages that never touch the database keep working while Neon wakes up. One transaction per
 * attempt, never a periodic one. It tries again a few times, spaced out, while the database
 * does not answer or while another transaction holds a race to recover; then it stops, and a
 * race still owned by a live process is left alone. One log line per attempt.
 */
export function recoverRacesAtBoot({
  recover,
  onRecovered,
  schedule,
  log,
  logError,
  retryDelaysMs = BOOT_RECOVERY_RETRY_DELAYS_MS,
}: BootRecoveryOptions): void {
  const attempt = (retry: number) => {
    const delay = retryDelaysMs[retry];
    const next = delay === undefined ? ", giving up" : ", retrying";
    Promise.resolve()
      .then(recover)
      .then(
        ({ rooms, orphans, remaining }) => {
          log(
            `[races] boot recovery: ${rooms.length} race(s) interrupted in their room, ${orphans} no longer current in their room, ${remaining} left for later${remaining > 0 ? next : ""}`,
          );
          for (const lobbyId of rooms) {
            onRecovered(lobbyId);
          }
          if (remaining > 0 && delay !== undefined) {
            schedule(() => attempt(retry + 1), delay);
          }
        },
        (error: unknown) => {
          logError(`[races] boot recovery failed: ${describeDatabaseError(error)}${next}`);
          if (delay !== undefined) {
            schedule(() => attempt(retry + 1), delay);
          }
        },
      )
      // A failing listener must not become an unhandled rejection: the recovery itself committed.
      .catch((error: unknown) => logError(`[races] boot recovery listener failed: ${error instanceof Error ? error.name : "unknown error"}`));
  };
  attempt(0);
}
