import { expect, it, vi } from "vitest";
import { MAX_PHOTO_BODY_BYTES, readPhotoForm } from "./photo-body";
import { MAX_PHOTO_BYTES } from "@/profile/photo-contract";

it("accepts a full 2 MiB file with multipart overhead", async () => {
  const form = new FormData(); form.set("photo", new File([new Uint8Array(MAX_PHOTO_BYTES)], "photo.jpg"));
  const result = await readPhotoForm(new Request("http://local", { method: "POST", body: form }));
  expect((result?.get("photo") as File).size).toBe(MAX_PHOTO_BYTES);
});
it.each([undefined, "1"])("bounds actual streamed bytes with Content-Length %s and cancels on overflow", async (declared) => {
  const cancel = vi.fn(); let reads = 0;
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) { reads += 1; controller.enqueue(new Uint8Array(64 * 1024)); }, cancel,
  }, { highWaterMark: 0 });
  const request = new Request("http://local", {
    method: "POST", body: stream, duplex: "half",
    headers: { "content-type": "multipart/form-data; boundary=test", ...(declared === undefined ? {} : { "content-length": declared }) },
  } as RequestInit);
  expect(await readPhotoForm(request)).toBeUndefined();
  expect(cancel).toHaveBeenCalledOnce();
  expect(reads).toBe(Math.floor(MAX_PHOTO_BODY_BYTES / (64 * 1024)) + 1);
});
it("refuses an oversized declared body without reading it", async () => {
  const pull = vi.fn(); const cancel = vi.fn();
  const body = new ReadableStream<Uint8Array>({ pull, cancel }, { highWaterMark: 0 });
  const request = new Request("http://local", { method: "POST", body, duplex: "half", headers: {
    "content-type": "multipart/form-data; boundary=x", "content-length": "4000000",
  } } as RequestInit);
  expect(await readPhotoForm(request)).toBeUndefined();
  expect(pull).not.toHaveBeenCalled(); expect(cancel).toHaveBeenCalledOnce();
});
it("refuses malformed multipart and a broken body without exposing parsing errors", async () => {
  expect(await readPhotoForm(new Request("http://local", { method: "POST", body: "bad", headers: { "content-type": "multipart/form-data; boundary=x" } }))).toBeUndefined();
  const body = new ReadableStream({ start(controller) { controller.error(new Error("private transport detail")); } });
  expect(await readPhotoForm(new Request("http://local", { method: "POST", body, duplex: "half", headers: { "content-type": "multipart/form-data; boundary=x" } } as RequestInit))).toBeUndefined();
});
