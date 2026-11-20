import { MAX_PHOTO_BYTES } from "@/profile/photo-contract";

// Bound the entire multipart message before asking the platform parser to allocate fields.
export const MAX_PHOTO_BODY_BYTES = MAX_PHOTO_BYTES + 64 * 1024;

export async function readPhotoForm(request: Request): Promise<FormData | undefined> {
  const type = request.headers.get("content-type") ?? "";
  const declared = request.headers.get("content-length");
  if (!type.toLowerCase().startsWith("multipart/form-data;") ||
      (declared !== null && (!/^\d+$/.test(declared) || Number(declared) > MAX_PHOTO_BODY_BYTES))) {
    void request.body?.cancel().catch(() => undefined);
    return undefined;
  }
  if (request.body === null) return undefined;
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_PHOTO_BODY_BYTES) {
        void reader.cancel().catch(() => undefined);
        return undefined;
      }
      chunks.push(value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    return await new Response(bytes, { headers: { "content-type": type } }).formData();
  } catch {
    return undefined;
  } finally {
    reader.releaseLock();
  }
}
