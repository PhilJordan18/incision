import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ session: vi.fn(), save: vi.fn(), upload: vi.fn(), database: vi.fn(), revalidate: vi.fn() }));
vi.mock("@incision/database", () => ({ saveProfilePhoto: mocks.save }));
vi.mock("@/server/auth/session", () => ({ requireAccountSession: mocks.session }));
vi.mock("@/server/auth/store", () => ({ authDatabase: mocks.database }));
vi.mock("@/server/profile/photo-upload", () => ({ uploadProfilePhoto: mocks.upload }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
import { uploadPhotoAction } from "./photo-action";

beforeEach(() => {
  vi.resetAllMocks(); mocks.session.mockResolvedValue({ accountId: "session" }); mocks.database.mockReturnValue("db");
  mocks.save.mockResolvedValue(true);
  mocks.upload.mockImplementation(async (input, save) => {
    await save({ accountId: input.accountId, webp: Buffer.from("encoded") }); return { status: "saved" };
  });
});

it("authenticates each upload, ignoring forged state and fields", async () => {
  const form = new FormData(); form.set("accountId", "victim");
  expect(await uploadPhotoAction({ accountId: "victim" }, form)).toEqual({ status: "saved" });
  expect(mocks.session).toHaveBeenCalledWith("/account");
  expect(mocks.save).toHaveBeenCalledExactlyOnceWith("db", { accountId: "session", webp: Buffer.from("encoded") });
  expect(mocks.revalidate).toHaveBeenCalledExactlyOnceWith("/account");
});
it("does not decode or write without a valid session", async () => {
  mocks.session.mockRejectedValue(new Error("redirect"));
  await expect(uploadPhotoAction(null, new FormData())).rejects.toThrow("redirect");
  expect(mocks.upload).not.toHaveBeenCalled(); expect(mocks.database).not.toHaveBeenCalled();
});
it("does not refresh or claim success after a refusal", async () => {
  mocks.upload.mockResolvedValue({ status: "invalid" });
  expect(await uploadPhotoAction(null, new FormData())).toEqual({ status: "invalid" });
  expect(mocks.revalidate).not.toHaveBeenCalled();
});
