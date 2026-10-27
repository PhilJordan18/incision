import { compareIds } from "../ids";

/** A server snapshot, read under the room lock; no field is a client claim. */
export type HostCandidate = {
  readonly memberId: string;
  readonly kind: "account" | "guest" | "bot";
  /** Preserve PostgreSQL microseconds: converting joined_at through Date loses ordering. */
  readonly joinedAtMicros: number;
  readonly active: boolean;
  /** At least one current socket, resolved by the presence owner. */
  readonly connected: boolean;
};

/**
 * SALLE-08 / D-03: the oldest connected human, without account or participant preference.
 * Call only once departure or the host's disconnection grace permits succession. The caller
 * owns time, locking, revalidation and the actual transfer/closure; this function writes nothing.
 * Equal join instants use the existing domain ID order, independent of input order or locale.
 * Throws on inconsistent snapshots, so bad data cannot masquerade as "nobody is left".
 */
export function selectHostSuccessor({ outgoingHostId, members }: {
  readonly outgoingHostId: string;
  readonly members: readonly HostCandidate[];
}): string | undefined {
  assertMemberId(outgoingHostId);
  const seen = new Set<string>();
  let oldest: HostCandidate | undefined;
  for (const member of members) {
    assertMemberId(member.memberId);
    if (seen.has(member.memberId)) throw new RangeError("Duplicate host-candidate member id");
    seen.add(member.memberId);
    if (!Number.isSafeInteger(member.joinedAtMicros) || member.joinedAtMicros < 0 ||
      !["account", "guest", "bot"].includes(member.kind) ||
      typeof member.active !== "boolean" || typeof member.connected !== "boolean") {
      throw new RangeError("Invalid host-candidate snapshot");
    }
    if (member.memberId === outgoingHostId || member.kind === "bot" || !member.active || !member.connected) continue;
    if (oldest === undefined || member.joinedAtMicros < oldest.joinedAtMicros ||
      (member.joinedAtMicros === oldest.joinedAtMicros && compareIds(member.memberId, oldest.memberId) < 0)) {
      oldest = member;
    }
  }
  return oldest?.memberId;
}

function assertMemberId(id: string): void {
  if (typeof id !== "string" || !/^[A-Za-z0-9_-]{1,64}$/.test(id)) {
    throw new RangeError("Invalid host-candidate member id");
  }
}
