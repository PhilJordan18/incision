import { EventEmitter } from "node:events";

export type RoomEvents = {
  changed: [lobbyId: string];
  /** A member left (committed); `closed` when the room closed with it (the host left). */
  left: [lobbyId: string, accountId: string, closed: boolean];
  /** A race stopped in this process without a confirmed end: its room is watched until it has one. */
  raceLost: [lobbyId: string];
};

const processGlobal = globalThis as typeof globalThis & { incisionRoomEvents?: EventEmitter<RoomEvents> };

/**
 * Room changes made by server actions (Next bundles) reach the Socket.IO server (custom
 * server) through this process-wide emitter, like the session registry (one instance).
 */
export function roomEvents(): EventEmitter<RoomEvents> {
  processGlobal.incisionRoomEvents ??= new EventEmitter<RoomEvents>();
  return processGlobal.incisionRoomEvents;
}

/** Called after a committed change of membership: members receive a fresh snapshot. */
export function notifyRoomChanged(lobbyId: string): void {
  roomEvents().emit("changed", lobbyId);
}

/**
 * Called after a committed departure, before `notifyRoomChanged`: a race this process runs in
 * the room ends for that member (an abandon), or ends altogether if the room closed.
 */
export function notifyMemberLeft(lobbyId: string, accountId: string, closed: boolean): void {
  roomEvents().emit("left", lobbyId, accountId, closed);
}
