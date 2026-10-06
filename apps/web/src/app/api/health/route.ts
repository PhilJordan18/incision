import { parseServerEnv } from "@/server/config";
import { deployedCommit, readDatabaseStatus } from "@/server/health";

/**
 * Readiness for the smoke test and manual checks: deployed commit and whether Neon
 * answers. Not the Azure health check path: probing Neon every minute would keep its
 * free compute awake around the clock (see /api/health/live and docs/DEPLOYMENT.md).
 */
export async function GET(): Promise<Response> {
  const database = await readDatabaseStatus(parseServerEnv(process.env).databaseUrl);
  return Response.json(
    // Ready only when the database answers; a missing configuration is degraded too.
    { status: database === "up" ? "ok" : "degraded", commit: deployedCommit(), database },
    { headers: { "Cache-Control": "no-store" } },
  );
}
