import { describe, expect, it, vi } from "vitest";
import { SessionRegistry } from "../realtime/session-registry";
import { revokeOnSignOutEvent, signOutEverywhere } from "./revocation";

const accountId = "0b6f3c1e-5d2a-4f7b-9c8e-1a2b3c4d5e6f";
const now = () => 1_800_000_000_000;

function dependencies(currentVersion = 1) {
  return {
    revokeSessions: vi.fn(async () => currentVersion + 1),
    readSessionVersion: vi.fn(async () => currentVersion),
    registry: new SessionRegistry(now),
    now,
  };
}

describe("signOutEverywhere", () => {
  it("increments the version and closes the account's sockets", async () => {
    const deps = dependencies();
    const socket = { id: "s1", disconnect: vi.fn() };
    deps.registry.register(socket, { accountId, sessionVersion: 1, expiresAt: now() + 60_000 });
    await signOutEverywhere(accountId, deps);
    expect(deps.revokeSessions).toHaveBeenCalledWith(accountId);
    expect(socket.disconnect).toHaveBeenCalledWith(true);
    expect(deps.registry.isCurrent({ accountId, sessionVersion: 1 })).toBe(false);
  });

  it("propagates a database failure and leaves sockets untouched", async () => {
    const deps = { ...dependencies(), revokeSessions: vi.fn(async () => Promise.reject(new Error("down"))) };
    const socket = { id: "s1", disconnect: vi.fn() };
    deps.registry.register(socket, { accountId, sessionVersion: 1, expiresAt: now() + 60_000 });
    await expect(signOutEverywhere(accountId, deps)).rejects.toThrow("down");
    expect(socket.disconnect).not.toHaveBeenCalled();
  });
});

describe("revokeOnSignOutEvent", () => {
  const token = { sub: accountId, sessionVersion: 1, authTime: Math.floor(now() / 1000) - 60 };

  it("revokes for a valid session", async () => {
    const deps = dependencies(1);
    await revokeOnSignOutEvent({ token }, deps);
    expect(deps.revokeSessions).toHaveBeenCalledWith(accountId);
  });

  it("does nothing for an already revoked or malformed session", async () => {
    const revoked = dependencies(2);
    await revokeOnSignOutEvent({ token }, revoked);
    await revokeOnSignOutEvent({ token: null }, revoked);
    await revokeOnSignOutEvent({}, revoked);
    expect(revoked.revokeSessions).not.toHaveBeenCalled();
  });
});
