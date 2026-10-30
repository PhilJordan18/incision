"use server";

import { changeRoomBots, closeRoom, configureRoom, leaveGuestRoom, startNextRound } from "@incision/database";
import { parseRoomCode } from "@incision/domain";
import { redirect } from "next/navigation";
import { z } from "zod";
import { authDatabase } from "../auth/store";
import { safeRedirectPath } from "../auth/safe-redirect";
import { clearGuestActionCookie, refreshGuestActionCookie, requestGuest } from "../identity/guest-request";
import { roomPresence } from "../realtime/room-presence";
import { temporaryRoomResults } from "../races/temporary-room-results";
import type { ConfigureRoomState, HostActionState, LeaveRoomState } from "./actions";
import { allowRoomChange, allowSettingsChange } from "./room-change-limiter";
import { notifyGuestLeft, notifyRoomChanged, roomEvents } from "./room-events";
import type { BotActionState } from "./bot-actions";
import { parseBotForm } from "./bot-form";
import { parseConfigureRoomForm } from "./room-settings";
import { randomWordsProblem, roomTextSettings, textSettingsCheck } from "./text-settings";

export async function guestNextRoundAction(formData: FormData): Promise<HostActionState> {
  try {
    const guest = await requestGuest(); if (guest === undefined) return { error: "NOT_IN_A_ROOM" };
    const raceId = z.uuid().transform((id) => id.toLowerCase()).safeParse(formData.get("raceId"));
    if (!raceId.success) return { error: "NOT_ON_RESULTS" };
    if (!allowRoomChange(`guest:${guest.proof.id}`)) return { error: "RATE_LIMITED" };
    const result = await startNextRound(authDatabase(), { accountId: null, guestProof: guest.proof, raceId: raceId.data });
    if (!result.ok) return { error: result.error };
    temporaryRoomResults().discard(result.lobbyId);
    if (result.guestSession !== undefined) await refreshGuestActionCookie(guest, result.guestSession);
    notifyRoomChanged(result.lobbyId); return {};
  } catch { return { error: "UNAVAILABLE" }; }
}

export async function guestConfigureRoomAction(formData: FormData): Promise<ConfigureRoomState> {
  try {
    const guest = await requestGuest(); if (guest === undefined) return { error: "NOT_IN_A_ROOM" };
    const input = parseConfigureRoomForm(formData); if (input === undefined) return { error: "INVALID_SETTINGS" };
    const textSettings = roomTextSettings(input.settings);
    const refusal = textSettingsCheck(textSettings);
    if (refusal !== undefined) return { error: "TEXT_SETTINGS_REFUSED", textProblem: refusal };
    if (!allowSettingsChange(`guest:${guest.proof.id}`)) return { error: "RATE_LIMITED" };
    // The proofs on the word lists only within the budget, as for accounts.
    const textProblem = randomWordsProblem(textSettings);
    if (textProblem !== undefined) return { error: "TEXT_SETTINGS_REFUSED", textProblem };
    const result = await configureRoom(authDatabase(), { ...input, accountId: null, guestProof: guest.proof });
    if (!result.ok) return { error: result.error };
    if (result.guestSession !== undefined) await refreshGuestActionCookie(guest, result.guestSession);
    notifyRoomChanged(result.lobbyId); return { revision: result.revision };
  } catch { return { error: "UNAVAILABLE" }; }
}

export async function guestCloseRoomAction(formData: FormData): Promise<HostActionState> {
  try {
    const guest = await requestGuest(); if (guest === undefined) return { error: "NOT_IN_A_ROOM" };
    const code = parseRoomCode(z.string().catch("").parse(formData.get("code")));
    if (!code.ok) return { error: "NOT_IN_A_ROOM" };
    if (!allowRoomChange(`guest:${guest.proof.id}`)) return { error: "RATE_LIMITED" };
    const result = await closeRoom(authDatabase(), { accountId: null, guestProof: guest.proof, code: code.code });
    if (!result.ok) return { error: result.error };
    temporaryRoomResults().discard(result.lobbyId);
    await clearGuestActionCookie(guest);
    roomEvents().emit("closed", result.lobbyId);
    notifyRoomChanged(result.lobbyId); return {};
  } catch { return { error: "UNAVAILABLE" }; }
}

export async function guestLeaveRoomAction(_previous: LeaveRoomState, formData: FormData): Promise<LeaveRoomState> {
  try {
    const guest = await requestGuest(); if (guest === undefined) return { error: "UNAVAILABLE" };
    if (!allowRoomChange(`guest:${guest.proof.id}`)) return { error: "RATE_LIMITED" };
    const left = await leaveGuestRoom(authDatabase(), guest.proof, (lobbyId) => roomPresence().onlineMembers(lobbyId));
    if (left !== undefined && left.memberId !== undefined) {
      notifyGuestLeft(left.lobbyId, left.memberId, left.closed); notifyRoomChanged(left.lobbyId);
    }
    await clearGuestActionCookie(guest);
  } catch { return { error: "UNAVAILABLE" }; }
  redirect(safeRedirectPath(formData.get("returnTo")));
}


export async function guestChangeRoomBotAction(form: FormData): Promise<BotActionState> {
  try {
    const guest = await requestGuest(); if (guest === undefined) return { error: "NOT_IN_A_ROOM" };
    const request = parseBotForm(form); if (request === undefined) return { error: "INVALID_BOT" };
    if (!allowSettingsChange(`guest:${guest.proof.id}`)) return { error: "RATE_LIMITED" };
    const result = await changeRoomBots(authDatabase(), { ...request, accountId: null, guestProof: guest.proof });
    if (!result.ok) return { error: result.error };
    if (result.guestSession !== undefined) await refreshGuestActionCookie(guest, result.guestSession);
    notifyRoomChanged(result.lobbyId); return { revision: result.revision };
  } catch { return { error: "UNAVAILABLE" }; }
}
