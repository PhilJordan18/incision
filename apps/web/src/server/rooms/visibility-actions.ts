"use server";

import { changeRoomVisibility, type ChangeRoomVisibilityResult } from "@incision/database";
import { requireAccountSession } from "@/server/auth/session";
import { authDatabase } from "@/server/auth/store";
import { requestGuest, refreshGuestActionCookie } from "@/server/identity/guest-request";
import { allowSettingsChange } from "./room-change-limiter";
import { notifyRoomChanged } from "./room-events";
import { parseVisibilityForm } from "./visibility-form";

export type VisibilityActionState = {
  readonly error?: Extract<ChangeRoomVisibilityResult, { ok: false }>["error"] | "RATE_LIMITED" | "UNAVAILABLE";
  readonly revision?: number;
};

/** The host's visibility choice in the waiting room (SALLE-03, CONF-11); the account comes from the session only. */
export async function changeVisibilityAction(form: FormData): Promise<VisibilityActionState> {
  const { accountId } = await requireAccountSession("/");
  const input = parseVisibilityForm(form);
  if (input === undefined) return { error: "INVALID_VISIBILITY" };
  if (!allowSettingsChange(accountId)) return { error: "RATE_LIMITED" };
  try {
    const result = await changeRoomVisibility(authDatabase(), { accountId, ...input });
    if (!result.ok) return { error: result.error };
    notifyRoomChanged(result.lobbyId);
    return { revision: result.revision };
  } catch { return { error: "UNAVAILABLE" }; }
}

export async function guestChangeVisibilityAction(form: FormData): Promise<VisibilityActionState> {
  try {
    const guest = await requestGuest();
    if (guest === undefined) return { error: "NOT_IN_A_ROOM" };
    const input = parseVisibilityForm(form);
    if (input === undefined) return { error: "INVALID_VISIBILITY" };
    if (!allowSettingsChange(`guest:${guest.proof.id}`)) return { error: "RATE_LIMITED" };
    const result = await changeRoomVisibility(authDatabase(), { accountId: null, guestProof: guest.proof, ...input });
    if (!result.ok) return { error: result.error };
    if (result.guestSession !== undefined) await refreshGuestActionCookie(guest, result.guestSession);
    notifyRoomChanged(result.lobbyId);
    return { revision: result.revision };
  } catch { return { error: "UNAVAILABLE" }; }
}
