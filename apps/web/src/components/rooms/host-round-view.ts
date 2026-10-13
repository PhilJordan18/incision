import type { HostActionError } from "@/server/rooms/actions";

/** The latest answer of the host's actions only, numbered so the same refusal twice is announced twice. */
export type HostRoundView = { readonly error?: HostActionError; readonly attempt: number };

export const FIRST_VIEW: HostRoundView = { attempt: 0 };

/** The view after one more answer: its refusal, or none once an action went through. */
export function nextHostRoundView(previous: HostRoundView, error: HostActionError | undefined): HostRoundView {
  return { error, attempt: previous.attempt + 1 };
}

/** Refusals meaning the page shows a room or a race that has moved on: the server's page says where it is. */
export function isStaleRefusal(error: HostActionError | undefined): boolean {
  return error === "NOT_IN_A_ROOM" || error === "NOT_ON_RESULTS";
}
