import { existsSync, readFileSync } from "node:fs";
import { createServer } from "node:http";
import path from "node:path";
import next from "next";
import { parseServerEnv } from "./src/server/config";
import { attachRealtimeServer } from "./src/server/realtime/socket-server";

// One Node process serves Next.js and Socket.IO on the same port (ADR-0001).
async function main(): Promise<void> {
  loadLocalEnvFile();
  const env = parseServerEnv(process.env);
  process.env.APP_COMMIT_SHA ??= readDeployedCommit();

  const httpServer = createServer();
  const app = next({ dev: !env.isProduction, dir: __dirname, httpServer });
  const handle = app.getRequestHandler();
  await app.prepare();

  httpServer.on("request", (request, response) => {
    void handle(request, response);
  });
  // Attached after Next so Socket.IO can intercept its own path and pass the rest on.
  attachRealtimeServer(httpServer, { allowedOrigin: env.appOrigin });

  httpServer.listen(env.port, () => {
    console.log(`[server] ${env.isProduction ? "production" : "development"} on port ${env.port}`);
  });
}

/** Local runs share the root `.env` with Docker Compose; App Service injects app settings instead. */
function loadLocalEnvFile(): void {
  const envFile = path.join(__dirname, "..", "..", ".env");
  if (process.env.NODE_ENV !== "production" && existsSync(envFile)) {
    process.loadEnvFile(envFile);
  }
}

/** The deployment workflow writes `build-info.json`; local runs have none. */
function readDeployedCommit(): string {
  try {
    const content: unknown = JSON.parse(readFileSync(path.join(__dirname, "build-info.json"), "utf8"));
    if (typeof content === "object" && content !== null && "commit" in content && typeof content.commit === "string") {
      return content.commit;
    }
  } catch {
    // No build info outside a deployment.
  }
  return "local";
}

main().catch((error: unknown) => {
  console.error("[server] failed to start:", error instanceof Error ? error.message : error);
  process.exit(1);
});
