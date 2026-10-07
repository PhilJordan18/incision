import type { Server as HttpServer, IncomingMessage } from "node:http";
import { type DefaultEventsMap, Server, type Socket } from "socket.io";
import { isAllowedHandshake } from "./origin";
import { answerPing, PING_EVENT } from "./ping";
import type { SessionRegistry } from "./session-registry";
import type { HandshakeAuthentication, SocketSession } from "./socket-session";

/** Protected event of the checkpoint: answers the account of the socket's session. */
export const SESSION_EVENT = "session:whoami";

export type SessionAck =
  | { readonly ok: true; readonly accountId: string }
  | { readonly ok: false; readonly error: "UNAUTHORIZED" };

type RealtimeOptions = {
  readonly allowedOrigin: string;
  readonly isProduction: boolean;
  /** Reads the session from the handshake's cookies (socket-session.ts). */
  readonly authenticate: (cookieHeader: string | undefined) => Promise<HandshakeAuthentication>;
  readonly registry: SessionRegistry;
};

type SocketData = { session?: SocketSession };
type SessionSocket = Socket<DefaultEventsMap, DefaultEventsMap, DefaultEventsMap, SocketData>;

export function attachRealtimeServer(httpServer: HttpServer, options: RealtimeOptions): Server {
  const { allowedOrigin, isProduction, authenticate, registry } = options;
  const io = new Server<DefaultEventsMap, DefaultEventsMap, DefaultEventsMap, SocketData>(httpServer, {
    serveClient: false,
    // Close upgrade requests nobody handles; in development Next's reload socket needs them open.
    destroyUpgrade: isProduction,
    allowRequest: (request, callback) => {
      callback(null, isAllowedRequest(request, allowedOrigin));
    },
  });

  // The account comes only from the session cookie, never from the client's payload.
  io.use((socket, next) => {
    authenticate(socket.request.headers.cookie)
      .then((result) => {
        if (result.kind === "refused") {
          next(new Error("UNAUTHORIZED"));
          return;
        }
        if (result.kind === "authenticated") {
          socket.data.session = result.session;
        }
        next();
      })
      .catch(() => next(new Error("UNAUTHORIZED")));
  });

  io.on("connection", (socket) => {
    const { session } = socket.data;
    if (session !== undefined) {
      // A sign-out may have happened while the handshake was being checked.
      if (!registry.register(socket, session)) {
        socket.disconnect(true);
        return;
      }
      socket.on("disconnect", () => registry.unregister(socket.id));
    }

    socket.on(PING_EVENT, (payload: unknown, acknowledge: unknown) => {
      if (typeof acknowledge === "function") {
        acknowledge(answerPing(payload, Date.now));
      }
    });

    socket.on(SESSION_EVENT, (_payload: unknown, acknowledge: unknown) => {
      const current = currentSession(socket, { allowedOrigin, registry });
      if (typeof acknowledge === "function") {
        const answer: SessionAck = current ? { ok: true, accountId: current.accountId } : { ok: false, error: "UNAUTHORIZED" };
        acknowledge(answer);
      }
    });
  });

  return io;
}

/**
 * Guard of protected events (SEC-01): the socket must carry a session that has not
 * expired, has not been revoked in this process, and came from the allowed origin. An
 * expired or revoked session also ends the connection.
 */
export function currentSession(
  socket: Pick<SessionSocket, "data" | "handshake" | "disconnect">,
  { allowedOrigin, registry, now = Date.now }: { allowedOrigin: string; registry: SessionRegistry; now?: () => number },
): SocketSession | undefined {
  const { session } = socket.data;
  if (session === undefined || !isAllowedRequest(socket.handshake, allowedOrigin)) {
    return undefined;
  }
  if (now() >= session.expiresAt || !registry.isCurrent(session)) {
    socket.disconnect(true);
    return undefined;
  }
  return session;
}

function isAllowedRequest(request: Pick<IncomingMessage, "headers" | "url">, allowedOrigin: string): boolean {
  const secFetchSite = request.headers["sec-fetch-site"];
  const origin = request.headers.origin;
  return isAllowedHandshake(
    {
      origin: Array.isArray(origin) ? origin[0] : origin,
      secFetchSite: Array.isArray(secFetchSite) ? secFetchSite[0] : secFetchSite,
      isJsonp: new URL(request.url ?? "/", "http://localhost").searchParams.has("j"),
    },
    allowedOrigin,
  );
}
