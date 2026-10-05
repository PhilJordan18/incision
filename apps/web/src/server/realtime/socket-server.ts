import type { Server as HttpServer } from "node:http";
import { Server } from "socket.io";
import { isAllowedOrigin } from "./origin";
import { answerPing, PING_EVENT } from "./ping";

type RealtimeOptions = {
  readonly allowedOrigin: string;
};

export function attachRealtimeServer(httpServer: HttpServer, { allowedOrigin }: RealtimeOptions): Server {
  const io = new Server(httpServer, {
    serveClient: false,
    // Next.js handles its own upgrade requests (dev reload); do not close them.
    destroyUpgrade: false,
    allowRequest: (request, callback) => {
      callback(null, isAllowedOrigin(request.headers.origin, allowedOrigin));
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
