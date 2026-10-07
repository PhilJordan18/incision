import { deployedCommit } from "@/server/health";

/** Liveness for the Azure health check: answers while the process runs, never touches the database. */
export function GET(): Response {
  return Response.json({ status: "ok", commit: deployedCommit() }, { headers: { "Cache-Control": "no-store" } });
}
