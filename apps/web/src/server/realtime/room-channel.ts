import type { EventEmitter } from "node:events";
import type { ActiveMembership, RoomSnapshot } from "@incision/database";
import type { Server, Socket } from "socket.io";
import { ROOM_SNAPSHOT_EVENT, ROOM_WATCH_EVENT, type RoomWatchAck, roomWatchPayloadSchema } from "../../rooms/protocol";
import { publicSnapshot } from "../../rooms/public-snapshot";
import type { RoomPresence } from "./room-presence";
import type { SessionRegistry } from "./session-registry";
import { currentSession } from "./socket-server";

export type RoomChannelDependencies = {
  readonly allowedOrigin: string;
  readonly registry: SessionRegistry;
  readonly presence: RoomPresence;
  /** Committed membership changes, emitted by the server actions. */
  readonly events: EventEmitter<{ changed: [lobbyId: string] }>;
  readonly findActiveMembership: (accountId: string) => Promise<ActiveMembership | undefined>;
  readonly readRoomSnapshot: (lobbyId: string) => Promise<RoomSnapshot | undefined>;
};

type WatchedRoom = { readonly lobbyId: string; readonly memberId: string };

const channelOf = (lobbyId: string) => `lobby:${lobbyId}`;

/**
 * Realtime presence of rooms (CP-06). A socket watches the room of its own session only:
 * the account comes from the session cookie and membership from the database, never from
 * the payload or `socket.id`. Members get a fresh snapshot after every committed change
 * and whenever someone's connection comes or goes.
 */
export function registerRoomChannel(io: Server, dependencies: RoomChannelDependencies): void {
  const { presence, events } = dependencies;

  async function broadcast(lobbyId: string): Promise<void> {
    const snapshot = await dependencies.readRoomSnapshot(lobbyId).catch(() => undefined);
    if (snapshot === undefined) {
      return;
    }
    const members = new Set(snapshot.members.map((member) => member.memberId));
    // Everyone following the room gets the snapshot, including the members who just left
    // or whose room closed: that is how their pages learn it. Then they stop following.
    io.to(channelOf(lobbyId)).emit(ROOM_SNAPSHOT_EVENT, publicSnapshot(snapshot, presence.onlineMembers(lobbyId)));
    for (const socket of await io.in(channelOf(lobbyId)).fetchSockets()) {
      const watched: unknown = socket.data.room;
      if (isWatchedRoom(watched) && !members.has(watched.memberId)) {
        socket.leave(channelOf(lobbyId));
        presence.remove(lobbyId, watched.memberId, socket.id);
        socket.data.room = undefined;
      }
    }
  }

  events.on("changed", (lobbyId) => {
    void broadcast(lobbyId);
  });

  io.on("connection", (socket: Socket) => {
    socket.on(ROOM_WATCH_EVENT, (payload: unknown, acknowledge: unknown) => {
      if (typeof acknowledge !== "function") {
        return;
      }
      void watch(socket, payload).then((answer) => acknowledge(answer));
    });

    socket.on("disconnect", () => {
      const watched: unknown = socket.data.room;
      if (isWatchedRoom(watched) && presence.remove(watched.lobbyId, watched.memberId, socket.id)) {
        void broadcast(watched.lobbyId);
      }
    });
  });

  async function watch(socket: Socket, payload: unknown): Promise<RoomWatchAck> {
    const parsed = roomWatchPayloadSchema.safeParse(payload);
    if (!parsed.success) {
      return { ok: false, error: "INVALID_PAYLOAD" };
    }
    const session = currentSession(socket, dependencies);
    if (session === undefined) {
      return { ok: false, error: "UNAUTHORIZED" };
    }
    try {
      const membership = await dependencies.findActiveMembership(session.accountId);
      if (membership === undefined || membership.code !== parsed.data.code.trim().toUpperCase()) {
        return { ok: false, error: "NOT_A_MEMBER" };
      }
      const previous: unknown = socket.data.room;
      if (isWatchedRoom(previous) && previous.lobbyId !== membership.lobbyId) {
        socket.leave(channelOf(previous.lobbyId));
        presence.remove(previous.lobbyId, previous.memberId, socket.id);
      }
      socket.data.room = { lobbyId: membership.lobbyId, memberId: membership.memberId } satisfies WatchedRoom;
      await socket.join(channelOf(membership.lobbyId));
      const cameOnline = presence.add(membership.lobbyId, membership.memberId, socket.id);
      const snapshot = await dependencies.readRoomSnapshot(membership.lobbyId);
      if (snapshot === undefined) {
        return { ok: false, error: "NOT_A_MEMBER" };
      }
      if (cameOnline) {
        void broadcast(membership.lobbyId);
      }
      return {
        ok: true,
        selfMemberId: membership.memberId,
        snapshot: publicSnapshot(snapshot, presence.onlineMembers(membership.lobbyId)),
      };
    } catch {
      return { ok: false, error: "UNAVAILABLE" };
    }
  }
}

function isWatchedRoom(value: unknown): value is WatchedRoom {
  return typeof value === "object" && value !== null && "lobbyId" in value && "memberId" in value;
}
