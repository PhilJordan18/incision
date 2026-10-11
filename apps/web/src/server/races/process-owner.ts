import { randomUUID } from "node:crypto";

// Next bundles route handlers and server actions separately from the custom server: a
// module-level value would give each bundle its own identity. One per process instead.
const processGlobal = globalThis as typeof globalThis & { incisionRaceOwnerId?: string };

/**
 * This process's identity as the owner of the races it runs (ADR-0004): drawn at random once
 * per process, never derived from the host or the instance, so two processes overlapping on
 * one App Service instance never share it.
 */
export function processOwnerId(): string {
  processGlobal.incisionRaceOwnerId ??= randomUUID();
  return processGlobal.incisionRaceOwnerId;
}
