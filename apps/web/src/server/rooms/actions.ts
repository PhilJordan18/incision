"use server";

import { randomInt } from "node:crypto";
import {
  type CloseRoomResult,
  closeRoom,
  configureRoom,
  type ConfigureRoomResult,
  createRoomWithHost,
  describeDatabaseError,
  findActiveMembership,
  joinRoomByCode,
  leaveCurrentRoom,
  type NextRoundResult,
  startNextRound,
} from "@incision/database";
import { MEMBER_ROLES, type MemberRole, parseRoomCode, ROOM_MAX_CAPACITY, type RoomCodeError } from "@incision/domain";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getRequestLocale } from "@/i18n/server";
import { CODE_INPUT_MAX_LENGTH } from "@/rooms/code-input";
import { safeRedirectPath } from "@/server/auth/safe-redirect";
import { getAccountSession, requireAccountSession } from "@/server/auth/session";
import { authDatabase } from "@/server/auth/store";
import type { CodeAttempt, CodeAttemptRefusal } from "./code-attempt-limiter";
import { codeAttempts, findOwnRoom, joinSpendsBudget, type OwnRoom, requestAddressKey } from "./code-attempts";
import { allowRoomChange, allowSettingsChange, forgiveRoomChange } from "./room-change-limiter";
import { parseConfigureRoomForm } from "./room-settings";
import { notifyMemberLeft, notifyRoomChanged } from "./room-events";

export type JoinError =
  | RoomCodeError
  | "ROOM_NOT_FOUND"
  | "ROOM_NOT_ADMITTING"
  | "ROOM_FULL"
  | "SPECTATORS_FULL"
  | "ALREADY_IN_ANOTHER_ROOM"
  | "RATE_LIMITED"
  | CodeAttemptRefusal
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
 * Join a room by code (JOIN-01, SALLE-06/09/10): the code is checked with the domain rule,
 * then the account is admitted in one transaction, within its address's budget of failed
 * code attempts. A visitor without a session signs in first and comes back to the room's
 * page. Once the budget is spent, every code gets the same answer, before any lookup.
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
  const db = authDatabase();
  const addressKey = await requestAddressKey();
  // One's own room first, by account id: it never waits in the code queue nor spends the budget.
  let own: OwnRoom;
  try {
    own = await findOwnRoom({ addressKey, accountId: session.accountId, code: parsed.code }, (accountId) =>
      findActiveMembership(db, accountId),
    );
  } catch (error: unknown) {
    logFailure("current room lookup", error);
    return { error: "UNAVAILABLE", code: typed };
  }
  if (own.kind === "limited") {
    return { error: "CODE_RATE_LIMITED", code: typed };
  }
  if (own.kind === "own") {
    redirect(`/rooms/${parsed.code}`);
  }
  if (!allowRoomChange(session.accountId)) {
    return { error: "RATE_LIMITED", code: typed };
  }
  let attempt: CodeAttempt<Awaited<ReturnType<typeof joinRoomByCode>>>;
  try {
    attempt = await codeAttempts().attempt(
      addressKey,
      () => joinRoomByCode(db, { accountId: session.accountId, code: parsed.code, role }),
      joinSpendsBudget,
    );
  } catch (error: unknown) {
    logFailure("join", error);
    return { error: "UNAVAILABLE", code: typed };
  }
  if (!attempt.ok) {
    // Refused before any lookup: no room change happened.
    forgiveRoomChange(session.accountId);
    return { error: attempt.refusal, code: typed };
  }
  const joined = attempt.value;
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

/**
 * Create a room by code as its host (SALLE-01/02): only a signed-in account can. Its texts start in
 * the creator's interface language (D-19); the host may change it in the waiting room (F-03.1).
 */
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
      textLanguage: await getRequestLocale(),
    });
  } catch (error: unknown) {
    logFailure("create", error);
    return { error: "UNAVAILABLE" };
  }
  if (!created.ok) {
    if (created.error !== "ALREADY_IN_ROOM") {
      // CODE_ATTEMPTS_EXHAUSTED means a broken generator; ACCOUNT_NOT_FOUND a deleted account.
      console.error("[rooms] create refused:", created.error);
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
 * closes the room at the checkpoint (host succession comes with SALLE-08). Leaving during a
 * race is an immediate abandon (state-machines §3); the host leaving interrupts it (D-06).
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
    notifyMemberLeft(left.lobbyId, accountId, left.closed);
    notifyRoomChanged(left.lobbyId);
  }
  redirect(returnToSchema.parse(formData.get("returnTo")));
}

/** The database's refusals, then the action's own. */
export type HostActionError = Extract<NextRoundResult | CloseRoomResult, { readonly ok: false }>["error"] | "RATE_LIMITED" | "UNAVAILABLE";

export type HostActionState = { readonly error?: HostActionError };

/** PostgreSQL writes UUIDs in lower case; the page sends them so, a hand-made request may not. */
const raceIdSchema = z.uuid().transform((id) => id.toLowerCase());

/**
 * The host takes everyone present back to the waiting room for the next round (COURSE-11). The
 * race whose results the page shows comes with the request: a late or repeated one changes
 * nothing. The pages learn it from the room's snapshot; a repeated request tells them again, in
 * case the first telling was lost.
 */
export async function nextRoundAction(formData: FormData): Promise<HostActionState> {
  const { accountId } = await requireAccountSession("/");
  const raceId = raceIdSchema.safeParse(formData.get("raceId"));
  if (!raceId.success) {
    return { error: "NOT_ON_RESULTS" };
  }
  if (!allowRoomChange(accountId)) {
    return { error: "RATE_LIMITED" };
  }
  let result: NextRoundResult;
  try {
    result = await startNextRound(authDatabase(), { accountId, raceId: raceId.data });
  } catch (error: unknown) {
    logFailure("next round", error);
    return { error: "UNAVAILABLE" };
  }
  if (!result.ok) {
    return { error: result.error };
  }
  notifyRoomChanged(result.lobbyId);
  return {};
}

/**
 * The host closes the room its page shows (`code`), from the waiting room or the results
 * (state-machines §1): every member leaves; the races stay in each entrant's history. A page
 * left open on a room the host has since left closes nothing. The host's page then shows the
 * closed room, as everyone else's does.
 */
export async function closeRoomAction(formData: FormData): Promise<HostActionState> {
  const { accountId } = await requireAccountSession("/");
  const code = parseRoomCode(z.string().catch("").parse(formData.get("code")));
  if (!code.ok) {
    return { error: "NOT_IN_A_ROOM" };
  }
  if (!allowRoomChange(accountId)) {
    return { error: "RATE_LIMITED" };
  }
  let result: CloseRoomResult;
  try {
    result = await closeRoom(authDatabase(), { accountId, code: code.code });
  } catch (error: unknown) {
    logFailure("close", error);
    return { error: "UNAVAILABLE" };
  }
  if (!result.ok) {
    return { error: result.error };
  }
  notifyMemberLeft(result.lobbyId, accountId, true);
  notifyRoomChanged(result.lobbyId);
  return {};
}

export type ConfigureRoomError = Extract<ConfigureRoomResult, { readonly ok: false }>["error"] | "INVALID_SETTINGS" | "RATE_LIMITED" | "UNAVAILABLE";

/** `revision`: the settings revision saved, for the page's next change. */
export type ConfigureRoomState = { readonly error?: ConfigureRoomError; readonly revision?: number };

/**
 * The host saves the settings of the room its page shows (`code`), while it waits (F-03.1,
 * CONF-01/02/12): the text language and a time limit of 30 s to 120 s, with the settings revision
 * the page shows. The fields are checked before the budget and the database; the host, the room's
 * phase and the revision under the room lock. Every member's page gets the settings with the room's
 * next snapshot.
 */
export async function configureRoomAction(formData: FormData): Promise<ConfigureRoomState> {
  const { accountId } = await requireAccountSession("/");
  const request = parseConfigureRoomForm(formData);
  if (request === undefined) {
    return { error: "INVALID_SETTINGS" };
  }
  if (!allowSettingsChange(accountId)) {
    return { error: "RATE_LIMITED" };
  }
  let result: ConfigureRoomResult;
  try {
    result = await configureRoom(authDatabase(), { ...request, accountId });
  } catch (error: unknown) {
    logFailure("configure", error);
    return { error: "UNAVAILABLE" };
  }
  if (!result.ok) {
    return { error: result.error };
  }
  notifyRoomChanged(result.lobbyId);
  return { revision: result.revision };
}
