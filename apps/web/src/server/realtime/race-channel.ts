import type { IncomingHttpHeaders } from "node:http";
import type { Server, Socket } from "socket.io";
import { type Locale, LOCALE_COOKIE, resolveLocale } from "../../i18n/locale";
import { RACE_BATCH_EVENT, RACE_CONTROL_EVENT, RACE_START_EVENT, type RaceBatchAck, type RaceControlAck, type RaceStartAck } from "../../races/protocol";
import type { RaceService, RoomConnection } from "../races/race-service";
import type { SessionRegistry } from "./session-registry";
import { currentSession } from "./socket-server";

export type RaceChannelDependencies = {
  readonly allowedOrigin: string;
  readonly registry: SessionRegistry;
  readonly races: Pick<RaceService, "start" | "keystrokes" | "takeControl">;
  /** The room the socket follows, as the room channel admitted it. */
  readonly followedRoom: (socket: Socket) => string | undefined;
  readonly now?: () => number;
};

/** `race:start` messages a socket may send per window; a page sends one per click. */
export const START_LIMIT = { maxStarts: 5, windowMs: 10_000 } as const;

/**
 * Race messages over Socket.IO (F-04.0). Every message passes the session guard (SEC-01); the
 * account comes from the session cookie, never from the payload. Keystrokes and control
 * requests are accepted only from a tab that follows its room through the room channel, which
 * checked the membership in the database.
 */
export function registerRaceChannel(io: Server, dependencies: RaceChannelDependencies): void {
  const { now = Date.now } = dependencies;
  io.on("connection", (socket: Socket) => {
    const starts = { windowStart: now(), used: 0 };

    socket.on(RACE_START_EVENT, (payload: unknown, acknowledge: unknown) => {
      if (typeof acknowledge !== "function") {
        return;
      }
      const session = currentSession(socket, dependencies);
      if (session === undefined) {
        acknowledge({ ok: false, error: "UNAUTHORIZED" } satisfies RaceStartAck);
        return;
      }
      if (now() - starts.windowStart >= START_LIMIT.windowMs) {
        starts.windowStart = now();
        starts.used = 0;
      }
      starts.used += 1;
      if (starts.used > START_LIMIT.maxStarts) {
        acknowledge({ ok: false, error: "RATE_LIMITED" } satisfies RaceStartAck);
        return;
      }
      void dependencies.races
        .start(connectionOf(socket, session.accountId), payload)
        .catch((): RaceStartAck => ({ ok: false, error: "UNAVAILABLE" }))
        .then((answer) => acknowledge(answer));
    });

    socket.on(RACE_BATCH_EVENT, (payload: unknown, acknowledge: unknown) => {
      if (typeof acknowledge !== "function") {
        return;
      }
      const session = currentSession(socket, dependencies);
      if (session === undefined) {
        acknowledge({ ok: false, error: "UNAUTHORIZED" } satisfies RaceBatchAck);
        return;
      }
      if (dependencies.followedRoom(socket) === undefined) {
        acknowledge({ ok: false, error: "NO_RACE" } satisfies RaceBatchAck);
        return;
      }
      acknowledge(dependencies.races.keystrokes(connectionOf(socket, session.accountId), payload));
    });

    socket.on(RACE_CONTROL_EVENT, (payload: unknown, acknowledge: unknown) => {
      if (typeof acknowledge !== "function") {
        return;
      }
      const session = currentSession(socket, dependencies);
      if (session === undefined) {
        acknowledge({ ok: false, error: "UNAUTHORIZED" } satisfies RaceControlAck);
        return;
      }
      if (dependencies.followedRoom(socket) === undefined) {
        acknowledge({ ok: false, error: "NO_RACE" } satisfies RaceControlAck);
        return;
      }
      acknowledge(dependencies.races.takeControl(connectionOf(socket, session.accountId), payload));
    });
  });
}

/** The tab as the races see it: its id, its session's account and the language of its pages. */
export function connectionOf(socket: Pick<Socket, "id" | "emit" | "handshake">, accountId: string): RoomConnection {
  return {
    id: socket.id,
    accountId,
    locale: handshakeLocale(socket.handshake.headers),
    emit: (event, payload) => void socket.emit(event, payload),
  };
}

/** The language the pages of this browser use: the explicit cookie, then its languages, then French. */
export function handshakeLocale(headers: IncomingHttpHeaders): Locale {
  const prefix = `${LOCALE_COOKIE}=`;
  const raw = (headers.cookie ?? "")
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(prefix))
    ?.slice(prefix.length);
  const acceptLanguage = headers["accept-language"];
  return resolveLocale(raw, typeof acceptLanguage === "string" ? acceptLanguage : null);
}
