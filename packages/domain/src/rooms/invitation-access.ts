import { humanSubjectKey, type HumanSubject } from "../identity/human-subject";

export type InvitationBinding = {
  readonly subject: HumanSubject;
  /** Server-derived, room-scoped HMAC of a canonical full IP, never a /64 rate-limit key. */
  readonly addressDigest: string;
};

export type InvitationAccess =
  | { readonly ok: true; readonly kind: "bind" | "reuse" }
  | { readonly ok: false; readonly error: "INVITATION_UNAVAILABLE" };

/**
 * SALLE-04 / D-02. Evaluate under the room lock after verifying the token digest.
 * A positive answer is not admission: capacity, phase, identity and bans still apply.
 * Persist a first binding only in the same transaction as a successful admission.
 * There is deliberately no arbitrary elapsed-time expiry for an open invitation.
 */
export function invitationAccess(input: {
  readonly roomClosed: boolean;
  readonly revoked: boolean;
  readonly binding: InvitationBinding | null;
  readonly subject: HumanSubject;
  readonly addressDigest: string | undefined;
}): InvitationAccess {
  if (input.roomClosed || input.revoked || input.addressDigest === undefined || input.addressDigest.length === 0) {
    return { ok: false, error: "INVITATION_UNAVAILABLE" };
  }
  if (input.binding === null) return { ok: true, kind: "bind" };
  if (humanSubjectKey(input.binding.subject) !== humanSubjectKey(input.subject)
    || input.binding.addressDigest !== input.addressDigest) {
    return { ok: false, error: "INVITATION_UNAVAILABLE" };
  }
  return { ok: true, kind: "reuse" };
}
