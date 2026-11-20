/** Shared byte limit; safe to import in the browser without the image decoder. */
export const MAX_PHOTO_BYTES = 2 * 1024 * 1024;
export type PhotoStatus = "idle" | "saved" | "invalid" | "unavailable" | "busy";
export type PhotoState = { readonly status: PhotoStatus };

export function photoStatus(value: unknown): PhotoStatus {
  return value === "saved" || value === "invalid" || value === "unavailable" || value === "busy" ? value : "idle";
}
