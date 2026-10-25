import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ encode: vi.fn() }));
vi.mock("./photo-image", () => ({ encodeProfilePhoto: mocks.encode, MAX_PHOTO_BYTES: 2 * 1024 * 1024 }));
import { uploadProfilePhoto } from "./photo-upload";

function form(file: File = new File(["image"], "avatar.png", { type: "image/png" })) {
  const data = new FormData(); data.set("photo", file); return data;
}
beforeEach(() => {
  vi.resetAllMocks();
  mocks.encode.mockResolvedValue({ ok: true, webp: Buffer.from("encoded") });
});

describe("profile upload boundary", () => {
  it("uses only the supplied session id and encoded bytes, ignoring filename and declared MIME", async () => {
    const data = form(new File(["image"], "../../victim.html", { type: "text/html" }));
    data.set("accountId", "victim");
    const save = vi.fn().mockResolvedValue(true);
    expect(await uploadProfilePhoto({ accountId: "session", form: data }, save)).toEqual({ status: "saved" });
    expect(save).toHaveBeenCalledExactlyOnceWith({ accountId: "session", webp: Buffer.from("encoded") });
  });

  it("refuses missing, duplicate, string, empty and oversized fields before decoding", async () => {
    const string = new FormData(); string.set("photo", "https://example.test/photo");
    const duplicate = form(); duplicate.append("photo", new File(["other"], "other.png"));
    for (const data of [new FormData(), string, duplicate, form(new File([], "empty.png")),
      form(new File([new Uint8Array(2 * 1024 * 1024 + 1)], "large.png"))]) {
      const save = vi.fn();
      expect(await uploadProfilePhoto({ accountId: "session", form: data }, save)).toEqual({ status: "invalid" });
      expect(save).not.toHaveBeenCalled();
    }
    expect(mocks.encode).not.toHaveBeenCalled();
  });

  it("allows the exact byte limit to reach real decoding", async () => {
    mocks.encode.mockResolvedValue({ ok: false });
    expect(await uploadProfilePhoto({ accountId: "session", form: form(new File([new Uint8Array(2 * 1024 * 1024)], "max.png")) }, vi.fn()))
      .toEqual({ status: "invalid" });
    expect(mocks.encode).toHaveBeenCalledOnce();
  });

  it("does not persist an invalid decode or expose storage errors", async () => {
    const save = vi.fn().mockRejectedValue(new Error("private database details"));
    mocks.encode.mockResolvedValueOnce({ ok: false });
    expect(await uploadProfilePhoto({ accountId: "session", form: form() }, save)).toEqual({ status: "invalid" });
    expect(save).not.toHaveBeenCalled();
    expect(await uploadProfilePhoto({ accountId: "session", form: form() }, save)).toEqual({ status: "unavailable" });
    save.mockResolvedValue(false);
    expect(await uploadProfilePhoto({ accountId: "session", form: form() }, save)).toEqual({ status: "unavailable" });
  });

  it("bounds concurrent work and releases its slot after a failure", async () => {
    let release: (() => void) | undefined;
    const waiting = new Promise<void>((resolve) => { release = resolve; });
    mocks.encode.mockImplementationOnce(async () => { await waiting; throw new Error("decode failed"); });
    const first = uploadProfilePhoto({ accountId: "one", form: form() }, vi.fn());
    expect(await uploadProfilePhoto({ accountId: "two", form: form() }, vi.fn())).toEqual({ status: "busy" });
    release?.();
    expect(await first).toEqual({ status: "unavailable" });
    expect(await uploadProfilePhoto({ accountId: "two", form: form() }, vi.fn().mockResolvedValue(true))).toEqual({ status: "saved" });
  });
});
