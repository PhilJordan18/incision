import { existsSync, readFileSync } from "node:fs";
import { createServer } from "node:http";
import path from "node:path";
import {
  beginRacing,
  endDisconnectedGuestPresence,
  endDisconnectedHostPresence,
  runGuestMemberCommand,
  finalizeRace,
  findActiveMembership,
  findActiveHumanMembership,
  readGuestSession,
  readGuestRoomSettings,
  getDatabase,
  interruptOwnRace,
  loadActiveCorpus,
  readOwnRoomSettings,
  readRoomSnapshot,
  readSessionVersion,
  recoverAbandonedRaces,
  recoverRoomIfAbandoned,
  renewRaceLease,
  startRace,
} from "@incision/database";
import next from "next";
import { parseServerEnv, type ServerEnv } from "./src/server/config";
import { assignClientAddress } from "./src/server/http/client-address";
import { registerRaceChannel } from "./src/server/realtime/race-channel";
import { followedMember, followedRoom, registerRoomChannel } from "./src/server/realtime/room-channel";
import { GuestCommandGate } from "./src/server/realtime/guest-command-gate";
import { HostPresenceGrace } from "./src/server/realtime/host-presence-grace";
import { currentSession, currentGuestSession } from "./src/server/realtime/socket-server";
import { GuestPresenceGrace } from "./src/server/realtime/guest-presence-grace";
import { roomPresence } from "./src/server/realtime/room-presence";
import { getSessionRegistry } from "./src/server/realtime/session-registry";
import { attachRealtimeServer } from "./src/server/realtime/socket-server";
import { authenticateHumanHandshake } from "./src/server/realtime/human-handshake";
import { recoverRacesAtBoot } from "./src/server/races/boot-recovery";
import { processOwnerId } from "./src/server/races/process-owner";
import { RaceService, serverClock } from "./src/server/races/race-service";
import { racesOpenOf, racesSwitchNotice } from "./src/server/races/races-switch";
import { CorpusTexts, FIXTURE_RACE_TEXTS, fixedRaceTexts } from "./src/server/races/race-texts";
import { notifyRoomChanged, roomEvents } from "./src/server/rooms/room-events";

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
    assignClientAddress(request, env.trustedProxyHops);
    void handle(request, response);
  });
  // The same registry as the sign-out server action: both read it from globalThis.
  const registry = getSessionRegistry();
  // Attached after Next so Socket.IO can intercept its own path and pass the rest on.
  const io = attachRealtimeServer(httpServer, {
    allowedOrigin: env.appOrigin,
    isProduction: env.isProduction,
    authenticate: (cookieHeader) =>
      authenticateHumanHandshake(cookieHeader, {
        guestKey: process.env.GUEST_SESSION_SECRET,
        readGuest: (proof) => readGuestSession(databaseOf(env), proof),
        secret: env.authSecret,
        secureCookie: env.secureCookies,
        readVersion: (accountId) => readSessionVersion(databaseOf(env), accountId),
      }),
    registry,
  });
  // The race texts (F-02.3b): drawn from the active corpus, unless a test build asks for the short fixtures.
  const corpusTexts = env.fixtureRaceTexts
    ? undefined
    : new CorpusTexts({ load: () => loadActiveCorpus(databaseOf(env)), log: (message) => console.log(message), logError: (message) => console.error(message) });
  // The races this process runs (F-04.0, ADR-0004): every write fenced by owner and generation.
  const races = new RaceService({
    ownerId: processOwnerId(),
    store: {
      startRace: (input) => startRace(databaseOf(env), input),
      readOwnRoomSettings: (accountId) => readOwnRoomSettings(databaseOf(env), accountId),
      readGuestRoomSettings: (proof) => readGuestRoomSettings(databaseOf(env), proof),
      beginRacing: (ownership) => beginRacing(databaseOf(env), ownership),
      finalizeRace: (ownership, results) => finalizeRace(databaseOf(env), ownership, results),
      interruptOwnRace: (ownership, reason) => interruptOwnRace(databaseOf(env), ownership, reason),
      renewRaceLease: (ownership) => renewRaceLease(databaseOf(env), ownership),
    },
    now: serverClock,
    monotonic: () => performance.now(),
    schedule: (callback, delayMs) => {
      const timer = setTimeout(callback, delayMs);
      timer.unref();
      return () => clearTimeout(timer);
    },
    onRoomChanged: notifyRoomChanged,
    onGuestActivity: (session) => registry.refreshGuest(session.id, session.expiresAt.getTime()),
    onRaceLost: (lobbyId) => roomEvents().emit("raceLost", lobbyId),
    texts: corpusTexts ?? fixedRaceTexts(FIXTURE_RACE_TEXTS),
    // Whether races may start at all; never which texts they run (the fixtures stay local only).
    racesOpen: racesOpenOf(env.racesSwitch),
    log: (message) => console.log(message),
    logError: (message) => console.error(message),
  });
  console.log(
    corpusTexts === undefined
      ? "[races] RACE_FIXTURE_TEXTS=allowed: races run the test fixture texts, not the corpus"
      : "[races] race texts: drawn from the active corpus (coherent, room word count, medium)",
  );
  // Loaded now, without delaying the server; a failure is retried by a later start, at most every CORPUS_RETRY_MS.
  if (corpusTexts !== undefined && env.databaseUrl !== undefined) {
    void corpusTexts.warm();
  }
  const racesNotice = racesSwitchNotice(env.racesSwitch);
  (racesNotice.level === "warn" ? console.warn : console.log)(racesNotice.message);
  // A departure committed by a server action ends the leaver's race, or the race if the room closed.
  // It runs inside that action: a failure here must not turn the committed departure into an error.
  roomEvents().on("left", (lobbyId, accountId, closed) => {
    try {
      races.memberLeft(lobbyId, accountId, { roomClosed: closed });
    } catch (error: unknown) {
      console.error("[races] departure not applied to the race:", error instanceof Error ? error.name : "unknown error");
    }
  });
  const hostGrace = new HostPresenceGrace({
    now: Date.now,
    schedule: (callback, delayMs) => { const timer = setTimeout(callback, delayMs); timer.unref(); return () => clearTimeout(timer); },
    online: ({ lobbyId, memberId }) => roomPresence().onlineMembers(lobbyId).has(memberId),
    membersOnline: (lobbyId) => {
      const members = new Set<string>();
      for (const socket of io.sockets.sockets.values()) {
        const member = followedMember(socket);
        if (member?.lobbyId !== lobbyId || !socket.connected) continue;
        const guard = { allowedOrigin: env.appOrigin, registry };
        if (currentSession(socket, guard) !== undefined || currentGuestSession(socket, guard) !== undefined) members.add(member.memberId);
      }
      return members;
    },
    end: (input) => endDisconnectedHostPresence(databaseOf(env), input),
    departed: ({ lobbyId, memberId }, result) => {
      try {
        if (result.closed) races.roomClosed(lobbyId);
        else if (result.accountId === null) races.guestMemberLeft(lobbyId, memberId);
        else races.memberLeft(lobbyId, result.accountId, { roomClosed: false });
      } finally { notifyRoomChanged(lobbyId); }
    },
    failed: () => console.error("[rooms] host departure unavailable; retry scheduled"),
  });
  const guestGrace = new GuestPresenceGrace({
    now: Date.now,
    schedule: (callback, delayMs) => { const timer = setTimeout(callback, delayMs); timer.unref(); return () => clearTimeout(timer); },
    online: ({ lobbyId, memberId }) => roomPresence().onlineMembers(lobbyId).has(memberId),
    end: (input) => endDisconnectedGuestPresence(databaseOf(env), input),
    departed: ({ lobbyId, memberId }) => {
      try { races.guestMemberLeft(lobbyId, memberId); }
      finally { notifyRoomChanged(lobbyId); }
    },
    failed: () => console.error("[guests] presence departure unavailable; retry scheduled"),
  });
  // Room presence (CP-06): membership from the database, changes from the server actions.
  const roomChannel = registerRoomChannel(io, {
    allowedOrigin: env.appOrigin,
    registry,
    presence: roomPresence(),
    events: roomEvents(),
    findActiveMembership: (accountId) => findActiveMembership(databaseOf(env), accountId),
    findGuestMembership: (guestSessionId) => findActiveHumanMembership(databaseOf(env), { kind: "guest", guestSessionId }),
    readGuest: (proof) => readGuestSession(databaseOf(env), proof),
    guestGrace,
    hostGrace,
    readRoomSnapshot: (lobbyId) => readRoomSnapshot(databaseOf(env), lobbyId),
    raceRecovery: {
      recover: (lobbyId) => recoverRoomIfAbandoned(databaseOf(env), lobbyId),
      ownsRace: (lobbyId) => races.ownsRace(lobbyId),
    },
    races,
  });
  const guestCommands = new GuestCommandGate({ registry, now: Date.now,
    store: (input) => runGuestMemberCommand(databaseOf(env), input),
  });
  registerRaceChannel(io, { allowedOrigin: env.appOrigin, registry, races, followedRoom, followedMember, guestCommands,
    guestStart: (connection, proof, payload) => races.startGuest(connection, proof, payload),
  });

  // Races a previous process left behind (ADR-0004): recovered without delaying the server.
  if (env.databaseUrl !== undefined) {
    recoverRacesAtBoot({
      recover: () => recoverAbandonedRaces(databaseOf(env)),
      onRecovered: notifyRoomChanged,
      schedule: (callback, delayMs) => void setTimeout(callback, delayMs).unref(),
      log: (message) => console.log(message),
      logError: (message) => console.error(message),
    });
  }

  httpServer.listen(env.port, () => {
    console.log(`[server] ${env.isProduction ? "production" : "development"} on port ${env.port}`);
  });

  // App Service sends SIGTERM before replacing the process: stop accepting work, then exit.
  process.once("SIGTERM", () => {
    console.log("[server] SIGTERM received, closing");
    guestGrace.stop();
    hostGrace.stop();
    setTimeout(() => process.exit(0), SHUTDOWN_GRACE_MS).unref();
    // Own races first (ADR-0004): no new start, then each one ends through its own shutdown
    // (its frozen results saved, or interrupted as server_stopped); their rooms are told before
    // the sockets close.
    void (async () => {
      try {
        const report = await races.stop({ onEnded: (lobbyId) => notifyRoomChanged(lobbyId), timeoutMs: RACE_STOP_MS });
        if (report.finalised + report.interrupted + report.left > 0) {
          console.log(`[races] stopped: ${report.finalised} finalised, ${report.interrupted} interrupted, ${report.left} left to their lease`);
        }
        await Promise.race([roomChannel.whenIdle(), new Promise((resolve) => setTimeout(resolve, BROADCAST_DRAIN_MS).unref())]);
      } catch (error: unknown) {
        console.error("[races] stop failed:", error instanceof Error ? error.name : "unknown error");
      } finally {
        void io.close(() => process.exit(0));
      }
    })();
  });
}

const SHUTDOWN_GRACE_MS = 10_000;
/** Part of the grace given to ending the races this process runs, then to telling their rooms. */
const RACE_STOP_MS = 5_000;
const BROADCAST_DRAIN_MS = 2_000;

/**
 * Opened on first use: the boot recovery, then authenticated handshakes. Anonymous sockets
 * never reach the database.
 */
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
