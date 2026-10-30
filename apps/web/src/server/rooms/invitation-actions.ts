"use server";

import { createRoomInvitation, revokeRoomInvitation, listRoomInvitations, joinRoomByInvitation,
  findActiveHumanMembership } from "@incision/database";
import { headers } from "next/headers";
import { authDatabase } from "../auth/store";
import { CLIENT_ADDRESS_HEADER } from "../http/client-address";
import { refreshGuestActionCookie } from "../identity/guest-request";
import { invitationActor } from "./invitation-actor";
import { invitationAddressDigest, issueInvitationToken } from "./invitation-credentials";
import { invitationAdmission, invitationId, invitationPage, invitationRoomCode } from "./invitation-form";
import { allowRoomChange, allowSettingsChange } from "./room-change-limiter";
import { codeAttempts, requestAddressKey } from "./code-attempts";
import { notifyRoomChanged } from "./room-events";

const unavailable = { error: "UNAVAILABLE" } as const;
const refused = { error: "INVITATION_UNAVAILABLE" } as const;

export async function createInvitationAction(form: FormData) {
  const code = invitationRoomCode(form); if (code === undefined) return refused;
  try {
    const identity = await invitationActor(); if (identity === undefined) return refused;
    if (!allowSettingsChange(identity.key)) return { error: "RATE_LIMITED" } as const;
    // Do not issue unusable links when the server has no binding key configured.
    if (invitationAddressDigest({ address: "127.0.0.1", lobbyId: "configuration-check", key: process.env.INVITATION_IP_SECRET }) === undefined) return unavailable;
    const credential = issueInvitationToken();
    const result = await createRoomInvitation(authDatabase(), { ...identity.actor, code, tokenDigest: credential.digest });
    if (!result.ok) return refused;
    if (identity.guest && result.guestSession) await refreshGuestActionCookie(identity.guest, result.guestSession);
    notifyRoomChanged(result.lobbyId);
    // Fragment keeps the secret out of HTTP paths, referrers and access logs.
    return { path: `/invite#${credential.token}` };
  } catch { return unavailable; }
}

export async function revokeInvitationAction(form: FormData) {
  const code = invitationRoomCode(form), id = invitationId(form);
  if (code === undefined || id === undefined) return refused;
  try {
    const identity = await invitationActor(); if (identity === undefined) return refused;
    if (!allowSettingsChange(identity.key)) return { error: "RATE_LIMITED" } as const;
    const result = await revokeRoomInvitation(authDatabase(), { ...identity.actor, code, invitationId: id });
    if (!result.ok) return refused;
    if (identity.guest && "guestSession" in result && result.guestSession) await refreshGuestActionCookie(identity.guest, result.guestSession);
    notifyRoomChanged(result.lobbyId); return { ok: true } as const;
  } catch { return unavailable; }
}

export async function listInvitationsAction(form: FormData) {
  const code = invitationRoomCode(form), page = invitationPage(form);
  if (code === undefined || page === undefined) return refused;
  try {
    const identity = await invitationActor(); if (identity === undefined) return refused;
    if (!allowSettingsChange(identity.key)) return { error: "RATE_LIMITED" } as const;
    const result = await listRoomInvitations(authDatabase(), { ...identity.actor, code, page });
    return result.ok ? result : refused;
  } catch { return unavailable; }
}

export async function joinInvitationAction(form: FormData) {
  const input = invitationAdmission(form); if (input === undefined) return refused;
  try {
    const identity = await invitationActor(); if (identity === undefined) return { error: "UNAUTHORIZED" } as const;
    if (identity.actor.accountId === null && input.nickname === undefined) return { error: "INVALID_GUEST_NICKNAME" } as const;
    if (!allowRoomChange(identity.key)) return { error: "RATE_LIMITED" } as const;
    const address = (await headers()).get(CLIENT_ADDRESS_HEADER) ?? undefined;
    const actor = identity.actor.accountId !== null
      ? { kind: "account" as const, accountId: identity.actor.accountId }
      : { kind: "guest" as const, proof: identity.actor.guestProof, nickname: input.nickname! };
    const attempt = await codeAttempts().attempt(await requestAddressKey(), () => joinRoomByInvitation(authDatabase(), {
      tokenDigest: input.tokenDigest, actor, role: input.role,
      addressDigestForRoom: (lobbyId) => invitationAddressDigest({ address, lobbyId, key: process.env.INVITATION_IP_SECRET }),
    }), (result) => !result.ok && result.error === "INVITATION_UNAVAILABLE");
    if (!attempt.ok) return { error: attempt.refusal } as const;
    const result = attempt.value;
    if (!result.ok) return { error: result.error === "INVALID_GUEST_SESSION" ? "UNAUTHORIZED" : result.error } as const;
    if (identity.guest && "guestSession" in result && result.guestSession) await refreshGuestActionCookie(identity.guest, result.guestSession);
    notifyRoomChanged(result.lobbyId);
    const member = await findActiveHumanMembership(authDatabase(), actor.kind === "account" ? actor : { kind: "guest", guestSessionId: actor.proof.id });
    return member?.lobbyId === result.lobbyId ? { code: member.code } : unavailable;
  } catch { return unavailable; }
}
