import { checkDatabaseConnection, describeDatabaseError, getDatabasePool } from "@incision/database";

export type DatabaseStatus = "up" | "down" | "not_configured";

/**
 * Anonymous callers share one probe at a time and its result for 30 s, so the public
 * endpoint can neither flood the pool nor keep Neon's compute awake.
 */
const PROBE_TTL_MS = 30_000;

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
  if (lastProbe && Date.now() - lastProbe.at < PROBE_TTL_MS) {
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
