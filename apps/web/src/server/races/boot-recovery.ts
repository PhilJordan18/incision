import { describeDatabaseError } from "@incision/database";

/** Delays between attempts when the database does not answer at boot, then the attempts stop. */
export const BOOT_RECOVERY_RETRY_DELAYS_MS = [5_000, 15_000, 45_000] as const;

export type BootRecoveryOptions = {
  /** Interrupts the races whose owner stopped renewing (`recoverAbandonedRaces`). */
  readonly recover: () => Promise<readonly string[]>;
  /** Told about each room that went back to WAITING, so its members get a fresh snapshot. */
  readonly onRecovered: (lobbyId: string) => void;
  readonly schedule: (callback: () => void, delayMs: number) => void;
  readonly log: (message: string) => void;
  readonly retryDelaysMs?: readonly number[];
};

/**
 * At boot, recovers the races a previous process left (ADR-0004), without delaying the server:
 * pages that never touch the database keep working while Neon wakes up. A few spaced attempts,
 * then it stops: a race still owned by a live process is left alone, and one recovered later is
 * handled when someone opens its room. One query per attempt, never a periodic one.
 */
export function recoverRacesAtBoot({ recover, onRecovered, schedule, log, retryDelaysMs = BOOT_RECOVERY_RETRY_DELAYS_MS }: BootRecoveryOptions): void {
  const attempt = (retry: number) => {
    recover().then(
      (lobbyIds) => {
        if (lobbyIds.length > 0) {
          log(`[races] ${lobbyIds.length} race(s) interrupted at boot`);
        }
        for (const lobbyId of lobbyIds) {
          onRecovered(lobbyId);
        }
      },
      (error: unknown) => {
        const delay = retryDelaysMs[retry];
        log(`[races] boot recovery failed: ${describeDatabaseError(error)}${delay === undefined ? ", giving up" : ""}`);
        if (delay !== undefined) {
          schedule(() => attempt(retry + 1), delay);
        }
      },
    );
  };
  attempt(0);
}
