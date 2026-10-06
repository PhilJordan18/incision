import { canonicalDisplayName, DISPLAY_NAME_MAX_LENGTH } from "../identity/display-name";

/** States of a room (COURSE-01). */
export const ROOM_PHASES = ["waiting", "countdown", "racing", "results", "closed"] as const;
export type RoomPhase = (typeof ROOM_PHASES)[number];

/** What a member does in a room: race, or watch. */
export const MEMBER_ROLES = ["participant", "spectator"] as const;
export type MemberRole = (typeof MEMBER_ROLES)[number];

/** Participants of a room, bots included and spectators excluded (SALLE-05). */
export const ROOM_MAX_CAPACITY = 30;

export type AdmissionRefusal = "ROOM_NOT_ADMITTING" | "ROOM_FULL";

export type AdmissionRequest = {
  readonly phase: RoomPhase;
  readonly role: MemberRole;
  /** Active participants of the room, read under the room lock. */
  readonly activeParticipants: number;
  readonly capacity: number;
};

/**
 * Why a new member cannot enter a room, or undefined when they can. Admissions happen
 * only while waiting or at results (SALLE-09); spectators take no participant place
 * (SALLE-05).
 */
export function admissionRefusal({ phase, role, activeParticipants, capacity }: AdmissionRequest): AdmissionRefusal | undefined {
  if (phase !== "waiting" && phase !== "results") {
    return "ROOM_NOT_ADMITTING";
  }
  if (role === "participant" && activeParticipants >= capacity) {
    return "ROOM_FULL";
  }
  return undefined;
}

/**
 * The account's name in a room: its own, or "name 2", "name 3"… when another active
 * member of the room already uses it (D-04). The account's display name never changes.
 */
export function localDisplayName(displayName: string, takenCanonical: ReadonlySet<string>): string {
  if (!takenCanonical.has(canonicalDisplayName(displayName))) {
    return displayName;
  }
  for (let suffix = 2; ; suffix += 1) {
    const tail = ` ${suffix}`;
    const candidate = `${[...displayName].slice(0, DISPLAY_NAME_MAX_LENGTH - tail.length).join("").trimEnd()}${tail}`;
    if (!takenCanonical.has(canonicalDisplayName(candidate))) {
      return candidate;
    }
  }
}
