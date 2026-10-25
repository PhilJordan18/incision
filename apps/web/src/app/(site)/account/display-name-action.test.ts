import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ session: vi.fn(), update: vi.fn(), database: vi.fn(), revalidate: vi.fn() }));
vi.mock("@incision/database", () => ({ updateAccountDisplayName: mocks.update }));
vi.mock("@/server/auth/session", () => ({ requireAccountSession: mocks.session }));
vi.mock("@/server/auth/store", () => ({ authDatabase: mocks.database }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
import { updateDisplayNameAction } from "./display-name-action";

beforeEach(() => {
  vi.resetAllMocks();
  mocks.session.mockResolvedValue({ accountId: "trusted-session" });
  mocks.database.mockReturnValue("database");
  mocks.update.mockResolvedValue({ displayName: "Alice" });
});

describe("display name authenticated action", () => {
  it("authenticates again and never trusts the previous client state or account id", async () => {
    const form = new FormData();
    form.set("displayName", "Alice");
    form.set("accountId", "victim");
    expect(await updateDisplayNameAction({ accountId: "victim", status: "saved" }, form)).toEqual({ status: "saved", value: "Alice" });
    expect(mocks.session).toHaveBeenCalledWith("/account");
    expect(mocks.update).toHaveBeenCalledExactlyOnceWith("database", { accountId: "trusted-session", displayName: "Alice" });
    expect(mocks.revalidate).toHaveBeenCalledExactlyOnceWith("/account");
  });

  it("never writes for an absent or expired session", async () => {
    mocks.session.mockRejectedValue(new Error("redirect to sign-in"));
    await expect(updateDisplayNameAction(null, new FormData())).rejects.toThrow("redirect to sign-in");
    expect(mocks.database).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.revalidate).not.toHaveBeenCalled();
  });

  it("does not revalidate or announce success after a storage failure", async () => {
    mocks.update.mockRejectedValue(new Error("database unavailable"));
    const form = new FormData(); form.set("displayName", "Alice");
    expect((await updateDisplayNameAction(null, form)).status).toBe("unavailable");
    expect(mocks.revalidate).not.toHaveBeenCalled();
  });
});
