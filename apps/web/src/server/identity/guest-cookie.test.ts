import { describe, expect, it } from "vitest";
import { guestCookieName, guestSetCookie, guestSigningKey, issueGuestCookie, readGuestCookie } from "./guest-cookie";

const key = "guest-cookie-test-only-key-32-bytes-long";
const read = (value: string) => readGuestCookie(`__Host-incision.guest=${value}`, { secure: true, key });

describe("guest signed cookies", () => {
  it("round trips only a signed identity and stores a digest, not its proof", () => {
    const issued = issueGuestCookie(key);
    expect(read(issued.value)).toEqual({ kind: "valid", ...issued });
    expect(issued.credential.secretDigest).toMatch(/^[a-f0-9]{64}$/);
    expect(issued.value).not.toContain(issued.credential.secretDigest);
    expect(issueGuestCookie(key).credential.id).not.toBe(issued.credential.id);
  });

  it("refuses changing any field and a wrong key", () => {
    const { value } = issueGuestCookie(key);
    const parts = value.split(".");
    for (let i = 0; i < 4; i += 1) {
      const changed = [...parts];
      changed[i] = `X${changed[i]?.slice(1)}`;
      expect(read(changed.join("."))).toEqual({ kind: "invalid" });
    }
    expect(readGuestCookie(`__Host-incision.guest=${value}`, { secure: true, key: "other-test-only-key-at-least-32-bytes" })).toEqual({ kind: "invalid" });
  });

  it.each(["", "v1", "x".repeat(513), "a.b.c.d.e", "v1.invalid.!.!"])("rejects malformed %j", (value) => {
    expect(read(value)).toEqual({ kind: "invalid" });
  });

  it("refuses duplicate names, padding, noncanonical base64url and a bare cookie name", () => {
    const { value } = issueGuestCookie(key);
    expect(readGuestCookie(`__Host-incision.guest=${value}; __Host-incision.guest=${value}`, { secure: true, key })).toEqual({ kind: "invalid" });
    expect(readGuestCookie("__Host-incision.guest", { secure: true, key })).toEqual({ kind: "invalid" });
    expect(read(`${value}=`)).toEqual({ kind: "invalid" });
    expect(read(`${value.slice(0, -1)}B`)).toEqual({ kind: "invalid" });
    expect(readGuestCookie(null, { secure: true, key })).toEqual({ kind: "absent" });
  });

  it("isolates local and HTTPS cookie names with bounded key configuration", () => {
    expect(guestSigningKey(undefined)).toBeUndefined();
    expect(guestSigningKey("short")).toBeUndefined();
    expect(guestSigningKey("x".repeat(1025))).toBeUndefined();
    expect(guestCookieName(false)).toBe("incision.guest");
    expect(guestSetCookie("signed", true)).toBe("__Host-incision.guest=signed; Path=/; Max-Age=86400; HttpOnly; SameSite=Lax; Secure");
    expect(guestSetCookie("signed", false)).not.toContain("Secure");
    expect(readGuestCookie(`incision.guest=${issueGuestCookie(key).value}`, { secure: true, key })).toEqual({ kind: "absent" });
  });
});
