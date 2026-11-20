import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ read: vi.fn(), auth: vi.fn(), locale: vi.fn(), store: vi.fn() }));
vi.mock("@incision/database", async (importOriginal) => ({
  ...await importOriginal<typeof import("@incision/database")>(), readAccountHistory: mocks.read,
}));
vi.mock("@/server/auth/session", () => ({ requireAccountSession: mocks.auth }));
vi.mock("@/server/auth/store", () => ({ authDatabase: mocks.store }));
vi.mock("@/i18n/server", () => ({ getRequestLocale: mocks.locale }));
import History from "./page";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.auth.mockResolvedValue({ accountId: "trusted-session-account" });
  mocks.locale.mockResolvedValue("en");
  mocks.read.mockResolvedValue({ rows: [] });
});
const render = async (search: Record<string, string | string[]> = {}) => renderToStaticMarkup(await History({
  params: Promise.resolve({}), searchParams: Promise.resolve(search),
}));

it("takes identity only from the session and refuses repeated cursors before the history query", async () => {
  await render({ accountId: "another-account" });
  expect(mocks.read.mock.calls[0]?.[1]).toEqual({ accountId: "trusted-session-account", cursor: undefined });
  mocks.read.mockClear();
  expect(await render({ cursor: ["one", "two"] })).toContain("This history page is not valid.");
  expect(mocks.read).not.toHaveBeenCalled();
});

it("distinguishes an unavailable history from an empty one, without leaking the failure", async () => {
  expect(await render()).toContain("No races on this page.");
  mocks.read.mockRejectedValueOnce(new Error("PRIVATE FAILURE"));
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  try {
    const html = await render();
    expect(html).toContain("Your history is unavailable right now.");
    expect(html).not.toContain("No races on this page.");
    expect(html).not.toContain("PRIVATE FAILURE");
  } finally { log.mockRestore(); }
});
