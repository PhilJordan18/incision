"use server";

import { changeRoomCapacity, type ChangeRoomCapacityResult } from "@incision/database";
import { requireAccountSession } from "@/server/auth/session";
import { authDatabase } from "@/server/auth/store";
import { requestGuest, refreshGuestActionCookie } from "@/server/identity/guest-request";
import { parseCapacityForm } from "./capacity-form";
import { allowSettingsChange } from "./room-change-limiter";
import { notifyRoomChanged } from "./room-events";

export type CapacityActionState = {
  readonly error?: Extract<ChangeRoomCapacityResult, { ok: false }>["error"] | "RATE_LIMITED" | "UNAVAILABLE";
  readonly revision?: number;
};

export async function changeCapacityAction(form: FormData): Promise<CapacityActionState> {
  const { accountId } = await requireAccountSession("/");
  const input = parseCapacityForm(form);
  if (input === undefined) return { error: "INVALID_CAPACITY" };
  if (!allowSettingsChange(accountId)) return { error: "RATE_LIMITED" };
  try {
    const result = await changeRoomCapacity(authDatabase(), { accountId, ...input });
    if (!result.ok) return { error: result.error };
    notifyRoomChanged(result.lobbyId);
    return { revision: result.revision };
  } catch { return { error: "UNAVAILABLE" }; }
}

export async function guestChangeCapacityAction(form: FormData): Promise<CapacityActionState> {
  try {
    const guest = await requestGuest();
    if (guest === undefined) return { error: "NOT_IN_A_ROOM" };
    const input = parseCapacityForm(form);
    if (input === undefined) return { error: "INVALID_CAPACITY" };
    if (!allowSettingsChange(`guest:${guest.proof.id}`)) return { error: "RATE_LIMITED" };
    const result = await changeRoomCapacity(authDatabase(), { accountId: null, guestProof: guest.proof, ...input });
    if (!result.ok) return { error: result.error };
    if (result.guestSession !== undefined) await refreshGuestActionCookie(guest, result.guestSession);
    notifyRoomChanged(result.lobbyId);
    return { revision: result.revision };
  } catch { return { error: "UNAVAILABLE" }; }
}
