import type { Server, Socket } from "socket.io";
import {
  PUBLIC_ROOMS_EVENT, PUBLIC_ROOMS_UNWATCH_EVENT, PUBLIC_ROOMS_WATCH_EVENT, PUBLIC_ROOMS_WATCH_LIMIT,
  type PublicRoomEntry, type PublicRoomsWatchAck,
} from "../../rooms/public-rooms-protocol";
import type { PublicRoomFeed } from "../rooms/public-room-feed";
import { isAllowedRequest } from "./socket-server";

/** The Socket.IO room of the explorer's watchers. */
export const PUBLIC_ROOMS_CHANNEL = "public-rooms";

type Options = {
  readonly allowedOrigin: string;
  readonly feed: Pick<PublicRoomFeed, "current">;
  readonly now?: () => number;
};

/**
 * The public room explorer (JOIN-02). Any socket from the site's origin may watch, with or
 * without a session: the list holds only PUBLIC rooms and what they show to anyone. A watch
 * answers from the shared feed, so many watchers cost one read per interval, not one each.
 */
export function registerPublicRoomChannel(io: Server, { allowedOrigin, feed, now = Date.now }: Options): void {
  io.on("connection", (socket: Socket) => {
    const budget = { startedAt: now(), used: 0 };
    socket.on(PUBLIC_ROOMS_WATCH_EVENT, (_payload: unknown, acknowledge: unknown) => {
      if (typeof acknowledge !== "function") return;
      if (now() - budget.startedAt >= PUBLIC_ROOMS_WATCH_LIMIT.windowMs) { budget.startedAt = now(); budget.used = 0; }
      budget.used += 1;
      if (budget.used > PUBLIC_ROOMS_WATCH_LIMIT.maxWatches) {
        acknowledge({ ok: false, error: "RATE_LIMITED" } satisfies PublicRoomsWatchAck);
        socket.disconnect(true);
        return;
      }
      if (!isAllowedRequest(socket.handshake, allowedOrigin)) {
        acknowledge({ ok: false, error: "UNAVAILABLE" } satisfies PublicRoomsWatchAck);
        return;
      }
      void socket.join(PUBLIC_ROOMS_CHANNEL);
      feed.current().then(
        (rooms) => { if (socket.connected) acknowledge({ ok: true, rooms: [...rooms] } satisfies PublicRoomsWatchAck); },
        () => acknowledge({ ok: false, error: "UNAVAILABLE" } satisfies PublicRoomsWatchAck),
      );
    });
    socket.on(PUBLIC_ROOMS_UNWATCH_EVENT, () => { void socket.leave(PUBLIC_ROOMS_CHANNEL); });
  });
}

export function publicRoomWatchers(io: Server): number {
  return io.sockets.adapter.rooms.get(PUBLIC_ROOMS_CHANNEL)?.size ?? 0;
}

export function publishPublicRooms(io: Server, rooms: readonly PublicRoomEntry[]): void {
  io.to(PUBLIC_ROOMS_CHANNEL).emit(PUBLIC_ROOMS_EVENT, { rooms: [...rooms] });
}
