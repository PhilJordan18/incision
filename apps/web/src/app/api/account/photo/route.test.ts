import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ session: vi.fn(), read: vi.fn(), database: vi.fn() }));
vi.mock("@incision/database", () => ({ readProfilePhoto: mocks.read }));
vi.mock("@/server/auth/session", () => ({ getAccountSession: mocks.session }));
vi.mock("@/server/auth/store", () => ({ authDatabase: mocks.database }));
import { GET } from "./route";

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
