import type { HumanSubject } from "../identity/human-subject";
import type { MemberRole, RoomPhase } from "./room-admission";

export type ModerationTarget = {
  readonly memberId: string;
  readonly subject: HumanSubject;
  readonly role: MemberRole;
  readonly active: boolean;
};

export type ExpulsionDecision =
  | { readonly ok: true; readonly memberId: string; readonly bannedSubject: HumanSubject }
  | { readonly ok: false; readonly error: "NOT_HOST" | "ROOM_CLOSED" | "INVALID_TARGET" | "CANNOT_EXPEL_SELF" };

/**
 * SALLE-07 / SEC-01. Inputs are read by the server under the room lock, never
 * supplied as authority by the client. The repository must select the target
 * from this room. A ban identifies one account/guest session, never an IP.
 * Race termination is the established departure flow, not a new ranking rule.
 */
export function decideExpulsion(input: {
  readonly phase: RoomPhase;
  readonly actorMemberId: string | undefined;
  readonly hostMemberId: string | null;
  readonly target: ModerationTarget | undefined;
}): ExpulsionDecision {
  if (input.actorMemberId === undefined || input.hostMemberId !== input.actorMemberId) {
    return { ok: false, error: "NOT_HOST" };
  }
  if (input.phase === "closed") return { ok: false, error: "ROOM_CLOSED" };
  if (input.target === undefined || !input.target.active) return { ok: false, error: "INVALID_TARGET" };
  if (input.target.memberId === input.actorMemberId) return { ok: false, error: "CANNOT_EXPEL_SELF" };
  return { ok: true, memberId: input.target.memberId, bannedSubject: input.target.subject };
}
