import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { encodeProfilePhoto, MAX_PHOTO_BYTES } from "./photo-image";

describe("profile photo re-encoding", () => {
  it.each(["jpeg", "png", "webp"] as const)("decodes %s, crops to 256px and strips metadata", async (format) => {
    const input = await sharp({ create: { width: 320, height: 180, channels: 3, background: "navy" } })
      .withExif({ IFD0: { Artist: "must not persist" } }).toFormat(format).toBuffer();
    const result = await encodeProfilePhoto(input);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("Expected a valid fixture");
    const output = await sharp(result.webp).metadata();
    expect(output).toMatchObject({ format: "webp", width: 256, height: 256 });
    expect(output.exif).toBeUndefined();
    expect(output.icc).toBeUndefined();
    expect(output.xmp).toBeUndefined();
    expect(result.webp.equals(input)).toBe(false);
  });

  it("refuses excessive bytes, empty files, vectors and forged raster signatures", async () => {
    for (const input of [Buffer.alloc(0), Buffer.alloc(MAX_PHOTO_BYTES + 1),
      Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"/>'),
      Buffer.from([0xff, 0xd8, 0xff, 1, 2, 3]), Buffer.from("RIFF0000WEBPbad")]) {
      expect(await encodeProfilePhoto(input)).toEqual({ ok: false });
    }
  });

  it("rejects compressed large dimensions before pixel decoding", async () => {
    const large = await sharp({ create: { width: 4001, height: 4000, channels: 3, background: "black" } }).png().toBuffer();
    expect(large.length).toBeLessThan(MAX_PHOTO_BYTES);
    expect(await encodeProfilePhoto(large)).toEqual({ ok: false });
    const long = await sharp({ create: { width: 8193, height: 1, channels: 3, background: "black" } }).png().toBuffer();
    expect(await encodeProfilePhoto(long)).toEqual({ ok: false });
  });

  it("refuses a truncated image instead of persisting a partial decode", async () => {
    const input = await sharp({ create: { width: 320, height: 180, channels: 3, background: "navy" } }).jpeg().toBuffer();
    expect(await encodeProfilePhoto(input.subarray(0, input.length / 2))).toEqual({ ok: false });
  });

  it("rejects animated WebP even though its format is otherwise allowed", async () => {
    const pixels = Buffer.concat([Buffer.alloc(4 * 4 * 3, 0), Buffer.alloc(4 * 4 * 3, 255)]);
    const animated = await sharp(pixels, { raw: { width: 4, height: 8, channels: 3, pageHeight: 4 } })
      .webp({ loop: 0, delay: [100, 100] }).toBuffer();
    expect((await sharp(animated).metadata()).pages).toBe(2);
    expect(await encodeProfilePhoto(animated)).toEqual({ ok: false });
  });

  it("refuses an APNG control chunk before allowing a first-frame-only decode", async () => {
    const png = await sharp({ create: { width: 4, height: 4, channels: 3, background: "black" } }).png().toBuffer();
    // The pre-decode rejection does not depend on libvips' APNG support or on CRC validation.
    const control = Buffer.alloc(20); control.writeUInt32BE(8); control.write("acTL", 4);
    expect(await encodeProfilePhoto(Buffer.concat([png.subarray(0, 33), control, png.subarray(33)]))).toEqual({ ok: false });
  });
});
