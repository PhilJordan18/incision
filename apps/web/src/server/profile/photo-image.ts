import sharp from "sharp";

import { MAX_PHOTO_BYTES } from "@/profile/photo-contract";
export { MAX_PHOTO_BYTES } from "@/profile/photo-contract";
export const MAX_PHOTO_PIXELS = 16_000_000;
export const MAX_PHOTO_EDGE = 8192;
export const MAX_STORED_PHOTO_BYTES = 256 * 1024;

export type PhotoEncoding = { readonly ok: true; readonly webp: Buffer } | { readonly ok: false };

/** Restrict the decoder before reading metadata: never pass SVG, PDF or an arbitrary path to libvips. */
function allowedSignature(bytes: Buffer): boolean {
  return (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff)
    || (bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])))
    || (bytes.length >= 12 && bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP");
}

/** Some PNG loaders expose only APNG's first frame; reject its animation-control chunk explicitly. */
function animatedPng(bytes: Buffer): boolean {
  if (bytes[0] !== 137) return false;
  for (let offset = 8; offset + 12 <= bytes.length;) {
    const length = bytes.readUInt32BE(offset);
    const type = bytes.toString("ascii", offset + 4, offset + 8);
    if (type === "acTL") return true;
    if (type === "IEND") return false;
    offset += length + 12;
  }
  return false;
}

/** D-23: discard the original, orientation/EXIF and every other metadata field. No image URL is accepted. */
export async function encodeProfilePhoto(bytes: Buffer): Promise<PhotoEncoding> {
  if (bytes.length === 0 || bytes.length > MAX_PHOTO_BYTES || !allowedSignature(bytes) || animatedPng(bytes)) return { ok: false };
  const image = sharp(bytes, { limitInputPixels: MAX_PHOTO_PIXELS, failOn: "warning", unlimited: false })
    .timeout({ seconds: 3 });
  try {
    const metadata = await image.metadata();
    if (!["jpeg", "png", "webp"].includes(metadata.format)
      || metadata.width < 1 || metadata.height < 1
      || metadata.width > MAX_PHOTO_EDGE || metadata.height > MAX_PHOTO_EDGE
      || metadata.width * metadata.height > MAX_PHOTO_PIXELS
      || (metadata.pages ?? 1) !== 1) return { ok: false };
    const webp = await image.autoOrient().resize(256, 256, { fit: "cover", position: "centre" })
      .webp({ quality: 80, effort: 3 }).toBuffer();
    if (webp.length === 0 || webp.length > MAX_STORED_PHOTO_BYTES) return { ok: false };
    return { ok: true, webp };
  } catch {
    // Decoder errors can include metadata from an untrusted file. Do not return or log them.
    return { ok: false };
  } finally {
    image.destroy();
  }
}
