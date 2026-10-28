import { z } from "zod";
import { encodeProfilePhoto, MAX_PHOTO_BYTES } from "./photo-image";

import type { PhotoState } from "@/profile/photo-contract";
export type { PhotoState } from "@/profile/photo-contract";
const photoField = z.array(z.file().min(1).max(MAX_PHOTO_BYTES)).length(1);

// Bound memory and native decoding work for this single-process deployment. No unbounded waiting queue.
let encoding = false;

/** The caller supplies the authenticated identity; neither a form field nor the previous UI state can choose it. */
export async function uploadProfilePhoto(
  input: { readonly accountId: string; readonly form: FormData },
  save: (input: { readonly accountId: string; readonly webp: Buffer }) => Promise<boolean>,
): Promise<PhotoState> {
  const fields = photoField.safeParse(input.form.getAll("photo"));
  if (!fields.success) return { status: "invalid" };
  const file = fields.data[0];
  if (file === undefined) return { status: "invalid" };
  if (encoding) return { status: "busy" };
  encoding = true;
  try {
    const result = await encodeProfilePhoto(Buffer.from(await file.arrayBuffer()));
    if (!result.ok) return { status: "invalid" };
    return { status: await save({ accountId: input.accountId, webp: result.webp }) ? "saved" : "unavailable" };
  } catch {
    return { status: "unavailable" };
  } finally {
    encoding = false;
  }
}
