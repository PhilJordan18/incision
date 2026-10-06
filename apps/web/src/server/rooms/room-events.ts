import { EventEmitter } from "node:events";

export type RoomEvents = { changed: [lobbyId: string] };

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
