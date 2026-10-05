import { checkDatabaseConnection, getDatabasePool } from "@incision/database";

type DatabaseStatus = "up" | "down" | "not_configured";

/**
 * Liveness and readiness for Azure's health check and the smoke test. Always 200 while
 * the process runs, so a Neon cold start never gets the only instance restarted;
 * `status` says whether the database answers. No internal detail is exposed.
 */
export async function GET(): Promise<Response> {
  const database = await readDatabaseStatus();
  return Response.json(
    {
      status: database === "down" ? "degraded" : "ok",
      commit: process.env.APP_COMMIT_SHA ?? "unknown",
      database,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}

async function readDatabaseStatus(): Promise<DatabaseStatus> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    return "not_configured";
  }
  const check = await checkDatabaseConnection(getDatabasePool(databaseUrl));
  if (!check.reachable) {
    console.error("[health] database unreachable:", check.error instanceof Error ? check.error.message : check.error);
    return "down";
  }
  return "up";
}
