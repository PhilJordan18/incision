import { ROOM_MAX_CAPACITY } from "./room-admission";

/** SALLE-03: private rooms never accept a code as an invitation. */
export const ROOM_VISIBILITIES = ["public", "code", "private"] as const;
export type RoomVisibility = (typeof ROOM_VISIBILITIES)[number];

export const ROOM_MIN_CAPACITY = 2;

export type CapacityRefusal = "INVALID_CAPACITY" | "CAPACITY_BELOW_OCCUPANCY";

/** Call with the participant count read under the room lock, including bots. */
export function capacityRefusal(input: {
  readonly capacity: number;
  readonly activeParticipants: number;
}): CapacityRefusal | undefined {
  if (!Number.isInteger(input.capacity) || input.capacity < ROOM_MIN_CAPACITY || input.capacity > ROOM_MAX_CAPACITY) {
    return "INVALID_CAPACITY";
  }
  if (input.capacity < input.activeParticipants) return "CAPACITY_BELOW_OCCUPANCY";
  return undefined;
}

/** Visibility alone does not authorize admission: identity, phase and quotas still apply. */
export function acceptsRoomCode(visibility: RoomVisibility): boolean {
  return visibility !== "private";
}

/** Code-only and private rooms must never appear in a public discovery projection. */
export function isPublicRoom(visibility: RoomVisibility): boolean {
  return visibility === "public";
}
