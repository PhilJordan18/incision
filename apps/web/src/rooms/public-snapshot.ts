import type { RoomSnapshot } from "@incision/database";
import type { PublicRoomSnapshot } from "./protocol";

/** What members see of a room: member ids, names, roles, host and online flags. */
export function publicSnapshot(snapshot: RoomSnapshot, online: ReadonlySet<string>): PublicRoomSnapshot {
  return {
    code: snapshot.code,
    phase: snapshot.phase,
    capacity: snapshot.capacity,
    revision: snapshot.revision,
    members: snapshot.members.map(({ memberId, displayName, role, isHost }) => ({
      memberId,
      displayName,
      role,
      isHost,
      online: online.has(memberId),
    })),
  };
}
