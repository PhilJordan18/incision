import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ session: vi.fn(), read: vi.fn(), database: vi.fn(), save: vi.fn(), upload: vi.fn(), revalidate: vi.fn() }));
vi.mock("@incision/database", () => ({ readProfilePhoto: mocks.read, saveProfilePhoto: mocks.save }));
vi.mock("@/server/auth/session", () => ({ getAccountSession: mocks.session }));
vi.mock("@/server/auth/store", () => ({ authDatabase: mocks.database }));
vi.mock("@/server/config", () => ({ parseServerEnv: () => ({ appOrigin: "http://local" }) }));
vi.mock("@/server/profile/photo-upload", () => ({ uploadProfilePhoto: mocks.upload }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
import { GET, POST } from "./route";

beforeEach(() => { vi.resetAllMocks(); mocks.session.mockResolvedValue({ accountId: "session" }); mocks.database.mockReturnValue("db"); });
it("serves only the session's photo, privately and without sniffing", async () => {
  mocks.read.mockResolvedValue(Buffer.from("webp"));
  const response = await GET();
  expect(mocks.read).toHaveBeenCalledExactlyOnceWith("db", "session");
  expect(response.headers.get("content-type")).toBe("image/webp");
  expect(response.headers.get("cache-control")).toBe("private, no-store");
  expect(response.headers.get("x-content-type-options")).toBe("nosniff");
  expect(response.headers.get("cross-origin-resource-policy")).toBe("same-origin");
  expect(await response.text()).toBe("webp");
});
it("does not query an image for an anonymous caller", async () => {
  mocks.session.mockResolvedValue(null); expect((await GET()).status).toBe(401);
  expect(mocks.read).not.toHaveBeenCalled(); expect(mocks.database).not.toHaveBeenCalled();
});
it("returns no data for a missing photo or a storage failure", async () => {
  mocks.read.mockResolvedValue(undefined); expect((await GET()).status).toBe(404);
  mocks.read.mockRejectedValue(new Error("private SQL details"));
  const response = await GET(); expect(response.status).toBe(503); expect(await response.text()).toBe("");
});

function uploadRequest(form = new FormData(), headers: Record<string, string> = {}): Request {
  return new Request("http://local/api/account/photo", { method: "POST", body: form, headers: { origin: "http://local", accept: "application/json", ...headers } });
}
it("authenticates uploads and ignores an account selected in the form", async () => {
  mocks.upload.mockImplementation(async (input, save) => {
    await save({ accountId: input.accountId, webp: Buffer.from("encoded") }); return { status: "saved" };
  });
  const form = new FormData(); form.set("accountId", "victim"); form.set("photo", new File(["image"], "p.png"));
  expect(await (await POST(uploadRequest(form))).json()).toEqual({ status: "saved" });
  expect(mocks.save).toHaveBeenCalledExactlyOnceWith("db", { accountId: "session", webp: Buffer.from("encoded") });
  expect(mocks.revalidate).toHaveBeenCalledExactlyOnceWith("/account");
});
it.each(["https://attacker.invalid", "null", ""])("rejects Origin %s before session, body or image processing", async (origin) => {
  const request = uploadRequest(undefined, { origin });
  expect((await POST(request)).status).toBe(403); expect(request.bodyUsed).toBe(false);
  expect(mocks.session).not.toHaveBeenCalled(); expect(mocks.upload).not.toHaveBeenCalled();
});
it("rejects unauthenticated uploads before reading their body", async () => {
  mocks.session.mockResolvedValue(null); const request = uploadRequest();
  expect((await POST(request)).status).toBe(401); expect(request.bodyUsed).toBe(false);
  expect(mocks.upload).not.toHaveBeenCalled(); expect(mocks.database).not.toHaveBeenCalled();
});
it("returns an ordinary refusal for more than3MB without decoding or saving", async () => {
  const form = new FormData(); form.set("photo", new File([new Uint8Array(4 * 1024 * 1024)], "p.png"));
  expect(await (await POST(uploadRequest(form))).json()).toEqual({ status: "invalid" });
  expect(mocks.upload).not.toHaveBeenCalled(); expect(mocks.save).not.toHaveBeenCalled();
  expect(mocks.revalidate).not.toHaveBeenCalled();
});
it("redirects native forms only to the fixed account page with a controlled status", async () => {
  mocks.upload.mockResolvedValue({ status: "invalid" });
  const form = new FormData(); form.set("returnTo", "https://attacker.invalid");
  const response = await POST(uploadRequest(form, { accept: "text/html" }));
  expect(response.status).toBe(303);
  expect(response.headers.get("location")).toBe("/account?photo=invalid#profile-photo");
  expect(mocks.revalidate).not.toHaveBeenCalled();
});
it("contains storage errors without claiming success or returning private details", async () => {
  mocks.upload.mockRejectedValue(new Error("private database detail"));
  expect(await (await POST(uploadRequest())).json()).toEqual({ status: "unavailable" });
  expect(mocks.revalidate).not.toHaveBeenCalled();
});
