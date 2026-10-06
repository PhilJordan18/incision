import type { EventEmitter } from "node:events";
import { describeDatabaseError, type ActiveMembership, type RoomSnapshot } from "@incision/database";
import { parseRoomCode } from "@incision/domain";
import type { Server, Socket } from "socket.io";
import { ROOM_SNAPSHOT_EVENT, ROOM_WATCH_EVENT, type RoomWatchAck, roomWatchPayloadSchema } from "../../rooms/protocol";
import { publicSnapshot } from "../../rooms/public-snapshot";
import type { RoomEvents } from "../rooms/room-events";
import type { RoomPresence } from "./room-presence";
import type { SessionRegistry } from "./session-registry";
import { currentSession } from "./socket-server";

export type RoomChannelDependencies = {
  readonly allowedOrigin: string;
  readonly registry: SessionRegistry;
  readonly presence: RoomPresence;
  /** Committed membership changes, emitted by the server actions. */
  readonly events: EventEmitter<RoomEvents>;
  readonly findActiveMembership: (accountId: string) => Promise<ActiveMembership | undefined>;
  readonly readRoomSnapshot: (lobbyId: string) => Promise<RoomSnapshot | undefined>;
  readonly now?: () => number;
};

/**
 * `room:watch` events a socket may send per window. A page sends one per connection
 * (and a few retries); more is abuse: each watch reads the shared database pool.
 */
export const WATCH_LIMIT = { maxWatches: 5, windowMs: 10_000 } as const;

type WatchedRoom = { readonly lobbyId: string; readonly memberId: string };
type WatchBudget = { startedAt: number; used: number; inFlight: boolean };

const channelOf = (lobbyId: string) => `lobby:${lobbyId}`;

/**
 * Realtime presence of rooms (CP-06). A socket watches the room of its own session only:
 * the account comes from the session cookie and membership from the database, never from
 * the payload or `socket.id`. Members get a fresh snapshot after every committed change
 * and whenever someone's connection comes or goes.
 */
export function registerRoomChannel(io: Server, dependencies: RoomChannelDependencies): void {
  const { presence, events, now = Date.now } = dependencies;
  // One snapshot read per room at a time; changes during a read trigger one more read.
  const broadcasting = new Map<string, { again: boolean }>();

  function scheduleBroadcast(lobbyId: string): void {
    const running = broadcasting.get(lobbyId);
    if (running !== undefined) {
      running.again = true;
      return;
    }
    const state = { again: false };
    broadcasting.set(lobbyId, state);
    void (async () => {
      try {
        do {
          state.again = false;
          await broadcast(lobbyId);
        } while (state.again);
      } finally {
        broadcasting.delete(lobbyId);
      }
    })();
  }

  async function broadcast(lobbyId: string): Promise<void> {
    if ((io.sockets.adapter.rooms.get(channelOf(lobbyId))?.size ?? 0) === 0) {
      return;
    }
    let snapshot: RoomSnapshot | undefined;
    try {
      snapshot = await dependencies.readRoomSnapshot(lobbyId);
    } catch (error: unknown) {
      console.error("[rooms] snapshot broadcast failed:", describeDatabaseError(error));
      return;
    }
    if (snapshot === undefined) {
      return;
    }
    const members = new Set(snapshot.members.map((member) => member.memberId));
    // Everyone following the room gets the snapshot, including the members who just left
    // or whose room closed: that is how their pages learn it. Then they stop following.
    io.to(channelOf(lobbyId)).emit(ROOM_SNAPSHOT_EVENT, publicSnapshot(snapshot, presence.onlineMembers(lobbyId)));
    for (const socket of await io.in(channelOf(lobbyId)).fetchSockets()) {
      const watched = watchedRoomOf(socket.data);
      if (watched?.lobbyId === lobbyId && !members.has(watched.memberId)) {
        socket.leave(channelOf(lobbyId));
        presence.remove(lobbyId, watched.memberId, socket.id);
        socket.data.room = undefined;
      }
    }
  }

  events.on("changed", scheduleBroadcast);

  io.on("connection", (socket: Socket) => {
    const budget: WatchBudget = { startedAt: now(), used: 0, inFlight: false };

    socket.on(ROOM_WATCH_EVENT, (payload: unknown, acknowledge: unknown) => {
      if (typeof acknowledge !== "function") {
        return;
      }
      if (now() - budget.startedAt >= WATCH_LIMIT.windowMs) {
        budget.startedAt = now();
        budget.used = 0;
      }
      budget.used += 1;
      if (budget.used > WATCH_LIMIT.maxWatches) {
        // Beyond any page's needs: the socket is cut, its page reconnects later.
        socket.disconnect(true);
        return;
      }
      if (budget.inFlight) {
        acknowledge({ ok: false, error: "RATE_LIMITED" } satisfies RoomWatchAck);
        return;
      }
      budget.inFlight = true;
      void watch(socket, payload)
        .then((answer) => acknowledge(answer))
        .finally(() => {
          budget.inFlight = false;
        });
    });

    socket.on("disconnect", () => {
      const watched = watchedRoomOf(socket.data);
      if (watched !== undefined && presence.remove(watched.lobbyId, watched.memberId, socket.id)) {
        scheduleBroadcast(watched.lobbyId);
      }
    });
  });

  function follow(socket: Socket, room: WatchedRoom): boolean {
    const previous = watchedRoomOf(socket.data);
    if (previous !== undefined && (previous.lobbyId !== room.lobbyId || previous.memberId !== room.memberId)) {
      unfollow(socket, previous);
    }
    socket.data.room = room;
    void socket.join(channelOf(room.lobbyId));
    return presence.add(room.lobbyId, room.memberId, socket.id);
  }

  function unfollow(socket: Socket, room: WatchedRoom): void {
    void socket.leave(channelOf(room.lobbyId));
    presence.remove(room.lobbyId, room.memberId, socket.id);
    socket.data.room = undefined;
  }

  async function watch(socket: Socket, payload: unknown): Promise<RoomWatchAck> {
    const parsed = roomWatchPayloadSchema.safeParse(payload);
    const code = parsed.success ? parseRoomCode(parsed.data.code) : undefined;
    if (code === undefined || !code.ok) {
      return { ok: false, error: "INVALID_PAYLOAD" };
    }
    const session = currentSession(socket, dependencies);
    if (session === undefined) {
      return { ok: false, error: "UNAUTHORIZED" };
    }
    let membership: ActiveMembership | undefined;
    try {
      membership = await dependencies.findActiveMembership(session.accountId);
    } catch (error: unknown) {
      console.error("[rooms] membership check failed:", describeDatabaseError(error));
      return { ok: false, error: "UNAVAILABLE" };
    }
    // The socket may have closed meanwhile: its disconnect handler has already run.
    if (!socket.connected) {
      return { ok: false, error: "UNAVAILABLE" };
    }
    if (membership === undefined || membership.code !== code.code) {
      return { ok: false, error: "NOT_A_MEMBER" };
    }
    // Follow before reading, so no change between the read and the join is missed.
    const room = { lobbyId: membership.lobbyId, memberId: membership.memberId };
    const cameOnline = follow(socket, room);
    let snapshot: RoomSnapshot | undefined;
    try {
      snapshot = await dependencies.readRoomSnapshot(room.lobbyId);
    } catch (error: unknown) {
      console.error("[rooms] snapshot read failed:", describeDatabaseError(error));
    }
    if (snapshot === undefined || !snapshot.members.some((member) => member.memberId === room.memberId)) {
      if (socket.connected) {
        unfollow(socket, room);
      }
      return { ok: false, error: snapshot === undefined ? "UNAVAILABLE" : "NOT_A_MEMBER" };
    }
    if (cameOnline) {
      scheduleBroadcast(room.lobbyId);
    }
    return {
      ok: true,
      selfMemberId: room.memberId,
      snapshot: publicSnapshot(snapshot, presence.onlineMembers(room.lobbyId)),
    };
  }
}

function watchedRoomOf(data: unknown): WatchedRoom | undefined {
  if (typeof data !== "object" || data === null || !("room" in data)) {
    return undefined;
  }
  const { room } = data;
  return typeof room === "object" &&
    room !== null &&
    "lobbyId" in room &&
    typeof room.lobbyId === "string" &&
    "memberId" in room &&
    typeof room.memberId === "string"
    ? { lobbyId: room.lobbyId, memberId: room.memberId }
    : undefined;
}
