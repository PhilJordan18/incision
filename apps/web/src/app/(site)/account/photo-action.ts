"use server";

import { saveProfilePhoto } from "@incision/database";
import { revalidatePath } from "next/cache";
import { requireAccountSession } from "@/server/auth/session";
import { authDatabase } from "@/server/auth/store";
import { uploadProfilePhoto, type PhotoState } from "@/server/profile/photo-upload";

export async function uploadPhotoAction(_previous: unknown, form: FormData): Promise<PhotoState> {
  const { accountId } = await requireAccountSession("/account");
  const state = await uploadProfilePhoto({ accountId, form }, (input) => saveProfilePhoto(authDatabase(), input));
  if (state.status === "saved") revalidatePath("/account");
  return state;
}
