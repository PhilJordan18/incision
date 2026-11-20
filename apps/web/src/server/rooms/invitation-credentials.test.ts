import { describe, expect, it } from "vitest";
import { assignClientAddress, CLIENT_ADDRESS_HEADER } from "../http/client-address";
import { invitationAddressDigest, invitationTokenDigest, issueInvitationToken } from "./invitation-credentials";

const key = "synthetic-test-key-not-a-real-secret";
function addressDigest(address: string | undefined, lobbyId = "room-a") {
  return invitationAddressDigest({ address, lobbyId, key });
}
describe("invitation credentials", () => {
  it("issues canonical 256-bit tokens and stores a one-way digest only", () => {
    const first = issueInvitationToken(); const second = issueInvitationToken();
    expect(Buffer.from(first.token, "base64url")).toHaveLength(32);
    expect(first.token).not.toBe(second.token);
    expect(first.digest).toMatch(/^[a-f0-9]{64}$/);
    expect(invitationTokenDigest(first.token)).toBe(first.digest);
    expect(first.digest).not.toContain(first.token);
  });
  it.each([null, undefined, 12, "", "a".repeat(42), "a".repeat(44), "=".repeat(43), " "+"a".repeat(43)])("rejects malformed token %s", (token) => {
    expect(invitationTokenDigest(token)).toBeUndefined();
  });
  it("rejects noncanonical base64 trailing bits", () => {
    expect(invitationTokenDigest("A".repeat(42) + "B")).toBeUndefined();
  });
  it("canonicalizes equivalent IPv4 and mapped IPv6 representations", () => {
    const expected = addressDigest("192.0.2.1");
    expect(expected).toMatch(/^[a-f0-9]{64}$/);
    for (const address of ["192.0.2.1:443", "::ffff:192.0.2.1", "::ffff:c000:201", "[0:0:0:0:0:ffff:c000:0201]:443"]) {
      expect(addressDigest(address)).toBe(expected);
    }
  });
  it("uses a full canonical IPv6 address rather than its /64 subnet", () => {
    expect(addressDigest("2001:db8::1")).toBe(addressDigest("2001:0DB8:0:0:0:0:0:0001"));
    expect(addressDigest("2001:db8::1")).not.toBe(addressDigest("2001:db8::2"));
  });
  it("scopes the digest to the room and key", () => {
    expect(addressDigest("192.0.2.1")).not.toBe(addressDigest("192.0.2.1", "room-b"));
    expect(addressDigest("192.0.2.1")).not.toBe(invitationAddressDigest({ address: "192.0.2.1", lobbyId: "room-a", key: key + "another" }));
  });
  it.each([undefined, "unknown", "unparsed:bad", "", "2001:db8::/64", "attacker.invalid"])("fails closed for %s", (address) => {
    expect(addressDigest(address)).toBeUndefined();
  });
  it("requires a nonempty room and usable server key", () => {
    for (const invalid of [undefined, "short", "a".repeat(1025)]) {
      expect(invitationAddressDigest({ address: "192.0.2.1", lobbyId: "room", key: invalid })).toBeUndefined();
    }
    expect(addressDigest("192.0.2.1", "")).toBeUndefined();
  });
  it("does not trust a client-supplied internal or forwarded header locally", () => {
    const request = { headers: { [CLIENT_ADDRESS_HEADER]: "198.51.100.2", "x-forwarded-for": "198.51.100.2" }, socket: { remoteAddress: "192.0.2.1" } };
    assignClientAddress(request, 0);
    expect(addressDigest(request.headers[CLIENT_ADDRESS_HEADER])).toBe(addressDigest("192.0.2.1"));
  });
});
