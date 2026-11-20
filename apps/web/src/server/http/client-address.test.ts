import { describe, expect, it } from "vitest";
import { addressLimitKey, assignClientAddress, CLIENT_ADDRESS_HEADER, clientAddress, normaliseAddress } from "./client-address";

function request(remoteAddress: string, forwardedFor?: string | string[]) {
  return { headers: { "x-forwarded-for": forwardedFor }, socket: { remoteAddress } };
}

describe("clientAddress", () => {
  it("uses the TCP peer when no proxy is trusted, whatever X-Forwarded-For says", () => {
    expect(clientAddress(request("::ffff:203.0.113.9", "198.51.100.1"), 0)).toBe("203.0.113.9");
  });

  it("takes the entry appended by the trusted proxy, not the ones the client wrote", () => {
    // The client sent "1.1.1.1"; Azure's front end appended the address it saw, with a port.
    expect(clientAddress(request("10.0.0.5", "1.1.1.1, 203.0.113.9:51234"), 1)).toBe("203.0.113.9");
    expect(clientAddress(request("10.0.0.5", ["1.1.1.1", "[2001:db8::1]:443"]), 1)).toBe("2001:db8::1");
  });

  it("falls back to the TCP peer only when the trusted entry is missing", () => {
    expect(clientAddress(request("10.0.0.5"), 1)).toBe("10.0.0.5");
    expect(clientAddress(request("10.0.0.5", "2001:db8::1:443"), 1)).toBe("2001:db8::1:443");
    expect(clientAddress(request("10.0.0.5", "not-an-ip"), 1)).toBe("unparsed:not-an-ip");
  });
});

describe("assignClientAddress", () => {
  it("overwrites an address the client sent under the internal header", () => {
    const behindAzure = {
      headers: { "x-forwarded-for": "198.51.100.7, 203.0.113.9:51234", [CLIENT_ADDRESS_HEADER]: "198.51.100.8" },
      socket: { remoteAddress: "10.0.0.5" },
    };
    assignClientAddress(behindAzure, 1);
    expect(behindAzure.headers[CLIENT_ADDRESS_HEADER]).toBe("203.0.113.9");

    const direct = { headers: { "x-forwarded-for": "198.51.100.7", [CLIENT_ADDRESS_HEADER]: "198.51.100.8" }, socket: { remoteAddress: "::1" } };
    assignClientAddress(direct, 0);
    expect(direct.headers[CLIENT_ADDRESS_HEADER]).toBe("::1");
  });
});

describe("normaliseAddress", () => {
  it.each([
    ["203.0.113.9", "203.0.113.9"],
    ["203.0.113.9:8080", "203.0.113.9"],
    ["[2001:DB8::1]:443", "2001:db8::1"],
    ["::ffff:203.0.113.9", "203.0.113.9"],
    ["unknown", undefined],
  ])("%s → %s", (input, expected) => {
    expect(normaliseAddress(input)).toBe(expected);
  });
});

describe("addressLimitKey", () => {
  it("keeps IPv4 addresses and groups IPv6 addresses by /64", () => {
    expect(addressLimitKey("203.0.113.9")).toBe("203.0.113.9");
    expect(addressLimitKey("2001:db8:0:1:aaaa::1")).toBe("2001:db8:0:1::/64");
    expect(addressLimitKey("2001:db8:0:1:bbbb:cccc:dddd:eeee")).toBe("2001:db8:0:1::/64");
    expect(addressLimitKey("2001:db8::1")).toBe("2001:db8:0:0::/64");
  });
});
