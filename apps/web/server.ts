import { existsSync, readFileSync } from "node:fs";
import { createServer } from "node:http";
import path from "node:path";
import { findActiveMembership, getDatabase, readRoomSnapshot, readSessionVersion } from "@incision/database";
import next from "next";
import { parseServerEnv, type ServerEnv } from "./src/server/config";
import { CLIENT_ADDRESS_HEADER, clientAddress } from "./src/server/http/client-address";
import { registerRoomChannel } from "./src/server/realtime/room-channel";
import { RoomPresence } from "./src/server/realtime/room-presence";
import { getSessionRegistry } from "./src/server/realtime/session-registry";
import { attachRealtimeServer } from "./src/server/realtime/socket-server";
import { authenticateHandshake } from "./src/server/realtime/socket-session";
import { roomEvents } from "./src/server/rooms/room-events";

// One Node process serves Next.js and Socket.IO on the same port (ADR-0001).
async function main(): Promise<void> {
  loadLocalEnvFile();
  const env = parseServerEnv(process.env);
  // Internal hand-off to the health routes, which Next bundles separately; not configuration.
  process.env.INCISION_DEPLOYED_COMMIT = readDeployedCommit();

  const httpServer = createServer();
  const app = next({ dev: !env.isProduction, dir: __dirname, httpServer, port: env.port });
  const handle = app.getRequestHandler();
  await app.prepare();

  httpServer.on("request", (request, response) => {
    // The only source of the client address for Next (rate limits): a value sent by the
    // client under this name is overwritten (TRUSTED_PROXY_HOPS, docs/DEPLOYMENT.md).
    request.headers[CLIENT_ADDRESS_HEADER] = clientAddress(request, env.trustedProxyHops);
    void handle(request, response);
  });
  // The same registry as the sign-out server action: both read it from globalThis.
  const registry = getSessionRegistry();
  // Attached after Next so Socket.IO can intercept its own path and pass the rest on.
  const io = attachRealtimeServer(httpServer, {
    allowedOrigin: env.appOrigin,
    isProduction: env.isProduction,
    authenticate: (cookieHeader) =>
      authenticateHandshake(cookieHeader, {
        secret: env.authSecret,
        secureCookie: env.secureCookies,
        readVersion: (accountId) => readSessionVersion(databaseOf(env), accountId),
      }),
    registry,
  });
  // Room presence (CP-06): membership from the database, changes from the server actions.
  registerRoomChannel(io, {
    allowedOrigin: env.appOrigin,
    registry,
    presence: new RoomPresence(),
    events: roomEvents(),
    findActiveMembership: (accountId) => findActiveMembership(databaseOf(env), accountId),
    readRoomSnapshot: (lobbyId) => readRoomSnapshot(databaseOf(env), lobbyId),
  });

  httpServer.listen(env.port, () => {
    console.log(`[server] ${env.isProduction ? "production" : "development"} on port ${env.port}`);
  });

  // App Service sends SIGTERM before replacing the process: stop accepting work, then exit.
  process.once("SIGTERM", () => {
    console.log("[server] SIGTERM received, closing");
    setTimeout(() => process.exit(0), SHUTDOWN_GRACE_MS).unref();
    void io.close(() => process.exit(0));
  });
}

const SHUTDOWN_GRACE_MS = 10_000;

/** Opened on the first authenticated handshake only: anonymous sockets never reach the database. */
function databaseOf(env: ServerEnv) {
  if (env.databaseUrl === undefined) {
    throw new Error("DATABASE_URL is not set: sessions cannot be checked");
  }
  return getDatabase(env.databaseUrl);
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
