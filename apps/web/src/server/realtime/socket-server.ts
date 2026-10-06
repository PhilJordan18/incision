import type { Server as HttpServer } from "node:http";
import { Server } from "socket.io";
import { isAllowedHandshake } from "./origin";
import { answerPing, PING_EVENT } from "./ping";

type RealtimeOptions = {
  readonly allowedOrigin: string;
  readonly isProduction: boolean;
};

export function attachRealtimeServer(httpServer: HttpServer, { allowedOrigin, isProduction }: RealtimeOptions): Server {
  const io = new Server(httpServer, {
    serveClient: false,
    // Close upgrade requests nobody handles; in development Next's reload socket needs them open.
    destroyUpgrade: isProduction,
    allowRequest: (request, callback) => {
      const secFetchSite = request.headers["sec-fetch-site"];
      const allowed = isAllowedHandshake(
        {
          origin: request.headers.origin,
          secFetchSite: Array.isArray(secFetchSite) ? secFetchSite[0] : secFetchSite,
          isJsonp: new URL(request.url ?? "/", "http://localhost").searchParams.has("j"),
        },
        allowedOrigin,
      );
      callback(null, allowed);
    },
  });

  io.on("connection", (socket) => {
    socket.on(PING_EVENT, (payload: unknown, acknowledge: unknown) => {
      if (typeof acknowledge === "function") {
        acknowledge(answerPing(payload, Date.now));
      }
    });
  });

  return io;
}
