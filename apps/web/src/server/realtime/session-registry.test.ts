import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getSessionRegistry, type RegisteredSocket, SessionRegistry } from "./session-registry";

const alice = "0b6f3c1e-5d2a-4f7b-9c8e-1a2b3c4d5e6f";
const bob = "9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d";

function fakeSocket(id: string) {
  const socket = { id, disconnect: vi.fn<(close: boolean) => unknown>() };
  return socket satisfies RegisteredSocket;
}

beforeEach(() => {
  vi.useFakeTimers({ now: 1_000_000 });
});

afterEach(() => {
  vi.useRealTimers();
});

describe("SessionRegistry", () => {
  it("disconnects a socket when its session expires, and forgets it", () => {
    const registry = new SessionRegistry();
    const socket = fakeSocket("s1");
    expect(registry.register(socket, { accountId: alice, sessionVersion: 1, expiresAt: Date.now() + 5_000 })).toBe(true);
    vi.advanceTimersByTime(4_999);
    expect(socket.disconnect).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(socket.disconnect).toHaveBeenCalledWith(true);
  });

  it("closes every socket of a revoked account, not those of other accounts or newer sessions", () => {
    const registry = new SessionRegistry();
    const [first, second, other] = [fakeSocket("a1"), fakeSocket("a2"), fakeSocket("b1")];
    const expiresAt = Date.now() + 60_000;
    registry.register(first, { accountId: alice, sessionVersion: 1, expiresAt });
    registry.register(second, { accountId: alice, sessionVersion: 1, expiresAt });
    registry.register(other, { accountId: bob, sessionVersion: 1, expiresAt });

    expect(registry.revoke(alice, 2, expiresAt)).toBe(2);
    expect(first.disconnect).toHaveBeenCalledWith(true);
    expect(second.disconnect).toHaveBeenCalledWith(true);
    expect(other.disconnect).not.toHaveBeenCalled();
    expect(registry.size).toBe(1);

    const signedInAgain = fakeSocket("a3");
    expect(registry.register(signedInAgain, { accountId: alice, sessionVersion: 2, expiresAt })).toBe(true);
    expect(registry.isCurrent({ accountId: alice, sessionVersion: 2 })).toBe(true);
  });

  it("refuses a handshake that read the old version just before the sign-out", () => {
    const registry = new SessionRegistry();
    registry.revoke(alice, 2, Date.now() + 60_000);
    expect(registry.isCurrent({ accountId: alice, sessionVersion: 1 })).toBe(false);
    expect(registry.register(fakeSocket("late"), { accountId: alice, sessionVersion: 1, expiresAt: Date.now() + 60_000 })).toBe(false);
  });

  it("clears the expiry timer of a socket that leaves", () => {
    const registry = new SessionRegistry();
    const socket = fakeSocket("s1");
    registry.register(socket, { accountId: alice, sessionVersion: 1, expiresAt: Date.now() + 5_000 });
    registry.unregister("s1");
    expect(vi.getTimerCount()).toBe(0);
    vi.advanceTimersByTime(10_000);
    expect(socket.disconnect).not.toHaveBeenCalled();
  });

  it("is shared by the whole process", () => {
    expect(getSessionRegistry()).toBe(getSessionRegistry());
  });
});
