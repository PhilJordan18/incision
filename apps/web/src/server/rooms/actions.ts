"use server";

import { randomInt } from "node:crypto";
import { createRoomWithHost, findActiveMembership, joinRoomByCode, leaveCurrentRoom } from "@incision/database";
import { parseRoomCode, ROOM_MAX_CAPACITY, type RoomCodeError } from "@incision/domain";
import { redirect } from "next/navigation";
import { z } from "zod";
import { CODE_INPUT_MAX_LENGTH } from "@/rooms/code-input";
import { safeRedirectPath } from "@/server/auth/safe-redirect";
import { getAccountSession, requireAccountSession } from "@/server/auth/session";
import { authDatabase } from "@/server/auth/store";
import { notifyRoomChanged } from "./room-events";

export type JoinError =
  | RoomCodeError
  | "ROOM_NOT_FOUND"
  | "ROOM_NOT_ADMITTING"
  | "ROOM_FULL"
  | "ALREADY_IN_ANOTHER_ROOM"
  | "UNAVAILABLE";

export type JoinFormState = {
  readonly error?: JoinError;
  /** What was typed, kept in the field after an error. */
  readonly code?: string;
  /** The room the account already occupies, for ALREADY_IN_ANOTHER_ROOM. */
  readonly currentCode?: string;
};

const roleSchema = z.enum(["participant", "spectator"]).catch("participant");
const returnToSchema = z.string().transform(safeRedirectPath).catch("/");

/**
 * Join a room by code (JOIN-01, SALLE-06/09): the code is checked with the domain rule,
 * then the account is admitted in one transaction. A visitor without a session signs in
 * first and comes back to the room's page.
 */
export async function joinRoomAction(_previous: JoinFormState, formData: FormData): Promise<JoinFormState> {
  const input = formData.get("code");
  const typed = typeof input === "string" ? input.slice(0, CODE_INPUT_MAX_LENGTH) : "";
  const parsed = parseRoomCode(typed);
  if (!parsed.ok) {
    return { error: parsed.error, code: typed };
  }
  const session = await getAccountSession();
  if (session === null) {
    redirect(`/sign-in?${new URLSearchParams({ callbackUrl: `/rooms/${parsed.code}` })}`);
  }
  let joined: Awaited<ReturnType<typeof joinRoomByCode>>;
  try {
    joined = await joinRoomByCode(authDatabase(), {
      accountId: session.accountId,
      code: parsed.code,
      role: roleSchema.parse(formData.get("role")),
    });
  } catch {
    return { error: "UNAVAILABLE", code: typed };
  }
  if (!joined.ok) {
    // An account deleted meanwhile cannot join: its session is refused on the next request.
    const error = joined.error === "ACCOUNT_NOT_FOUND" ? "UNAVAILABLE" : joined.error;
    return { error, code: typed, currentCode: "currentCode" in joined ? joined.currentCode : undefined };
  }
  if (!joined.alreadyMember) {
    notifyRoomChanged(joined.lobbyId);
  }
  redirect(`/rooms/${parsed.code}`);
}

export type CreateRoomState = { readonly error?: "ALREADY_IN_ROOM" | "UNAVAILABLE"; readonly currentCode?: string };

/** Create a room by code as its host (SALLE-01/02): only a signed-in account can. */
export async function createRoomAction(_previous: CreateRoomState, formData: FormData): Promise<CreateRoomState> {
  const { accountId } = await requireAccountSession("/rooms/new");
  const db = authDatabase();
  let created: Awaited<ReturnType<typeof createRoomWithHost>>;
  try {
    created = await createRoomWithHost(db, {
      accountId,
      role: roleSchema.parse(formData.get("role")),
      visibility: "code",
      capacity: ROOM_MAX_CAPACITY,
      randomIndex: (upperBound) => randomInt(upperBound),
    });
  } catch {
    return { error: "UNAVAILABLE" };
  }
  if (!created.ok) {
    if (created.error === "ALREADY_IN_ROOM") {
      return { error: "ALREADY_IN_ROOM", currentCode: (await findActiveMembership(db, accountId))?.code };
    }
    return { error: "UNAVAILABLE" };
  }
  notifyRoomChanged(created.room.id);
  redirect(`/rooms/${created.room.code}`);
}

/**
 * Leave the current room, then go on to `returnTo` (a same-site path). The host leaving
 * closes the room at the checkpoint (host succession comes with SALLE-08).
 */
export async function leaveRoomAction(formData: FormData): Promise<void> {
  const { accountId } = await requireAccountSession("/");
  const left = await leaveCurrentRoom(authDatabase(), accountId);
  if (left !== undefined) {
    notifyRoomChanged(left.lobbyId);
  }
  redirect(returnToSchema.parse(formData.get("returnTo")));
}
