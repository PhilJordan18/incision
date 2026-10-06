"use server";

import { parseRoomCode, type RoomCodeError } from "@incision/domain";
import { redirect } from "next/navigation";

export type JoinFormState = { readonly error?: RoomCodeError; readonly code?: string };

/**
 * Join by code (JOIN-01): the code is checked with the domain rule on the server, then the
 * visitor goes to the room's page, where admission is decided (CP-06).
 */
export async function joinRoomByCode(_previous: JoinFormState, formData: FormData): Promise<JoinFormState> {
  const input = formData.get("code");
  const code = typeof input === "string" ? input : "";
  const parsed = parseRoomCode(code);
  if (!parsed.ok) {
    return { error: parsed.error, code: code.slice(0, 32) };
  }
  redirect(`/rooms/${parsed.code}`);
}
