"use server";

import { updateAccountDisplayName } from "@incision/database";
import { revalidatePath } from "next/cache";
import { changeDisplayName, type DisplayNameState } from "@/server/auth/change-display-name";
import { requireAccountSession } from "@/server/auth/session";
import { authDatabase } from "@/server/auth/store";

export async function updateDisplayNameAction(_previous: unknown, form: FormData): Promise<DisplayNameState> {
  const { accountId } = await requireAccountSession("/account");
  const state = await changeDisplayName({ accountId, form }, (input) => updateAccountDisplayName(authDatabase(), input));
  if (state.status === "saved") revalidatePath("/account");
  return state;
}
