import { describe, expect, it, vi } from "vitest";
import { changeDisplayName } from "./change-display-name";

function form(value?: string): FormData {
  const result = new FormData();
  if (value !== undefined) result.set("displayName", value);
  return result;
}

describe("display name application boundary", () => {
  it("normalizes with D-14 and ignores forged identity fields", async () => {
    const submitted = form("  Ａlice   Mer  ");
    submitted.set("accountId", "victim");
    const update = vi.fn(async () => ({ displayName: "Alice Mer" }));
    expect(await changeDisplayName({ accountId: "session", form: submitted }, update))
      .toEqual({ status: "saved", value: "Alice Mer" });
    expect(update).toHaveBeenCalledExactlyOnceWith({ accountId: "session", displayName: "Alice Mer" });
  });

  it.each([undefined, "", " ", "a".repeat(41), "a".repeat(1025), "A\u200bB"])("rejects invalid input without writing (%s)", async (value) => {
    const update = vi.fn();
    expect((await changeDisplayName({ accountId: "session", form: form(value) }, update)).status).toBe("invalid");
    expect(update).not.toHaveBeenCalled();
  });

  it("refuses duplicate fields and files", async () => {
    for (const submitted of [form("Alice"), form()]) {
      submitted.append("displayName", new File(["Alice"], "name.txt"));
      const update = vi.fn();
      expect((await changeDisplayName({ accountId: "session", form: submitted }, update)).status).toBe("invalid");
      expect(update).not.toHaveBeenCalled();
    }
    const duplicate = form("Alice");
    duplicate.append("displayName", "Bob");
    const update = vi.fn();
    expect((await changeDisplayName({ accountId: "session", form: duplicate }, update)).status).toBe("invalid");
    expect(update).not.toHaveBeenCalled();
  });

  it("preserves attempted input on a missing account or database failure, without leaking errors", async () => {
    for (const update of [async () => undefined, async () => { throw new Error("secret SQL parameters"); }]) {
      expect(await changeDisplayName({ accountId: "session", form: form("  Alice  ") }, update))
        .toEqual({ status: "unavailable", value: "  Alice  " });
    }
  });
});
