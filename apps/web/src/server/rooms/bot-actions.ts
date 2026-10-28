"use server";

import { changeRoomBots, type ChangeRoomBotsResult, describeDatabaseError } from "@incision/database";
import { requireAccountSession } from "@/server/auth/session";
import { authDatabase } from "@/server/auth/store";
import { parseBotForm } from "./bot-form";
import { allowSettingsChange } from "./room-change-limiter";
import { notifyRoomChanged } from "./room-events";

export type BotActionError = Extract<ChangeRoomBotsResult, { ok: false }>["error"] | "INVALID_BOT" | "RATE_LIMITED" | "UNAVAILABLE";
export type BotActionState = { readonly error?: BotActionError; readonly revision?: number };

export async function changeRoomBotAction(form: FormData): Promise<BotActionState> {
  const { accountId } = await requireAccountSession("/");
  const request = parseBotForm(form);
  if (request === undefined) return { error: "INVALID_BOT" };
  if (!allowSettingsChange(accountId)) return { error: "RATE_LIMITED" };
  try {
    const result = await changeRoomBots(authDatabase(), { ...request, accountId });
    if (!result.ok) return { error: result.error };
    notifyRoomChanged(result.lobbyId);
    return { revision: result.revision };
  } catch (error) {
    console.error("[rooms] bot change failed:", describeDatabaseError(error));
    return { error: "UNAVAILABLE" };
  }
}
