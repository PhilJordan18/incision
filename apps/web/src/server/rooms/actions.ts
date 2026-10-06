"use server";

import { randomInt } from "node:crypto";
import { createRoomWithHost, describeDatabaseError, findActiveMembership, joinRoomByCode, leaveCurrentRoom } from "@incision/database";
import { MEMBER_ROLES, type MemberRole, parseRoomCode, ROOM_MAX_CAPACITY, type RoomCodeError } from "@incision/domain";
import { redirect } from "next/navigation";
import { z } from "zod";
import { CODE_INPUT_MAX_LENGTH } from "@/rooms/code-input";
import { safeRedirectPath } from "@/server/auth/safe-redirect";
import { getAccountSession, requireAccountSession } from "@/server/auth/session";
import { authDatabase } from "@/server/auth/store";
import { allowRoomChange } from "./room-change-limiter";
import { notifyRoomChanged } from "./room-events";

export type JoinError =
  | RoomCodeError
  | "ROOM_NOT_FOUND"
  | "ROOM_NOT_ADMITTING"
  | "ROOM_FULL"
  | "ALREADY_IN_ANOTHER_ROOM"
  | "RATE_LIMITED"
  | "UNAVAILABLE";

export type JoinFormState = {
  readonly error?: JoinError;
  /** What was typed, kept in the field after an error. */
  readonly code?: string;
  /** The room the account already occupies, for ALREADY_IN_ANOTHER_ROOM. */
  readonly currentCode?: string;
};

const roleSchema = z.enum(MEMBER_ROLES);
/** A same-site path only; anything else goes home. */
const returnToSchema = z
  .string()
  .refine((path) => safeRedirectPath(path) === path)
  .catch("/");

/**
 * The role a form asks for. The "I race" checkbox follows a hidden `spectator` value, so
 * the last value wins; a form without the choice (the home field) joins as participant.
 */
function requestedRole(formData: FormData): MemberRole | undefined {
  const values = formData.getAll("role");
  if (values.length === 0) {
    return "participant";
  }
  const role = roleSchema.safeParse(values.at(-1));
  return role.success ? role.data : undefined;
}

function logFailure(action: string, error: unknown): void {
  console.error(`[rooms] ${action} failed:`, describeDatabaseError(error));
}

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
  const role = requestedRole(formData);
  if (role === undefined) {
    return { error: "UNAVAILABLE", code: typed };
  }
  if (!allowRoomChange(session.accountId)) {
    return { error: "RATE_LIMITED", code: typed };
  }
  let joined: Awaited<ReturnType<typeof joinRoomByCode>>;
  try {
    joined = await joinRoomByCode(authDatabase(), { accountId: session.accountId, code: parsed.code, role });
  } catch (error: unknown) {
    logFailure("join", error);
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

export type CreateRoomState = {
  readonly error?: "ALREADY_IN_ROOM" | "RATE_LIMITED" | "UNAVAILABLE";
  readonly currentCode?: string;
};

/** Create a room by code as its host (SALLE-01/02): only a signed-in account can. */
export async function createRoomAction(_previous: CreateRoomState, formData: FormData): Promise<CreateRoomState> {
  const { accountId } = await requireAccountSession("/rooms/new");
  const role = requestedRole(formData);
  if (role === undefined) {
    return { error: "UNAVAILABLE" };
  }
  if (!allowRoomChange(accountId)) {
    return { error: "RATE_LIMITED" };
  }
  const db = authDatabase();
  let created: Awaited<ReturnType<typeof createRoomWithHost>>;
  try {
    created = await createRoomWithHost(db, {
      accountId,
      role,
      visibility: "code",
      capacity: ROOM_MAX_CAPACITY,
      randomIndex: (upperBound) => randomInt(upperBound),
    });
  } catch (error: unknown) {
    logFailure("create", error);
    return { error: "UNAVAILABLE" };
  }
  if (!created.ok) {
    if (created.error !== "ALREADY_IN_ROOM") {
      return { error: "UNAVAILABLE" };
    }
    const current = await findActiveMembership(db, accountId).catch((error: unknown) => {
      logFailure("current room lookup", error);
      return undefined;
    });
    return { error: "ALREADY_IN_ROOM", currentCode: current?.code };
  }
  notifyRoomChanged(created.room.id);
  redirect(`/rooms/${created.room.code}`);
}

export type LeaveRoomState = { readonly error?: "RATE_LIMITED" | "UNAVAILABLE" };

/**
 * Leave the current room, then go on to `returnTo` (a same-site path). The host leaving
 * closes the room at the checkpoint (host succession comes with SALLE-08).
 */
export async function leaveRoomAction(_previous: LeaveRoomState, formData: FormData): Promise<LeaveRoomState> {
  const { accountId } = await requireAccountSession("/");
  if (!allowRoomChange(accountId)) {
    return { error: "RATE_LIMITED" };
  }
  let left: Awaited<ReturnType<typeof leaveCurrentRoom>>;
  try {
    left = await leaveCurrentRoom(authDatabase(), accountId);
  } catch (error: unknown) {
    logFailure("leave", error);
    return { error: "UNAVAILABLE" };
  }
  if (left !== undefined) {
    notifyRoomChanged(left.lobbyId);
  }
  redirect(returnToSchema.parse(formData.get("returnTo")));
}
