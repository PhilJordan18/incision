import { checkDatabaseConnection, describeDatabaseError, getDatabasePool } from "@incision/database";

export type DatabaseStatus = "up" | "down" | "not_configured";

/**
 * Neon's free compute sleeps after a few idle minutes and its monthly hours are limited.
 * A healthy result is reused for an hour, so periodic anonymous calls cannot keep it
 * awake; a failure is retried after 30 s. A new process (each deployment) always probes
 * afresh, and callers share one probe at a time.
 */
const PROBE_TTL_MS = { up: 60 * 60_000, down: 30_000 } as const;

let lastProbe: { readonly status: "up" | "down"; readonly at: number } | undefined;
let probeInFlight: Promise<"up" | "down"> | undefined;

/** Commit set by the custom server from `build-info.json`; "unknown" outside it (e.g. tests). */
export function deployedCommit(): string {
  return process.env.INCISION_DEPLOYED_COMMIT ?? "unknown";
}

export async function readDatabaseStatus(databaseUrl: string | undefined): Promise<DatabaseStatus> {
  if (!databaseUrl) {
    return "not_configured";
  }
  if (lastProbe && Date.now() - lastProbe.at < PROBE_TTL_MS[lastProbe.status]) {
    return lastProbe.status;
  }
  probeInFlight ??= probeDatabase(databaseUrl).finally(() => {
    probeInFlight = undefined;
  });
  return probeInFlight;
}

async function probeDatabase(databaseUrl: string): Promise<"up" | "down"> {
  const check = await checkDatabaseConnection(getDatabasePool(databaseUrl));
  if (!check.reachable) {
    console.error("[health] database unreachable:", describeDatabaseError(check.error));
  }
  lastProbe = { status: check.reachable ? "up" : "down", at: Date.now() };
  return lastProbe.status;
}
