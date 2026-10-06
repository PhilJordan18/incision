import { EventEmitter } from "node:events";
import { createServer, type Server as HttpServer } from "node:http";
import type { ActiveMembership, RoomSnapshot } from "@incision/database";
import type { Server } from "socket.io";
import { io as connect, type Socket } from "socket.io-client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ROOM_SNAPSHOT_EVENT, ROOM_WATCH_EVENT } from "../../rooms/protocol";
import type { RoomEvents } from "../rooms/room-events";
import { registerRoomChannel, WATCH_LIMIT } from "./room-channel";
import { RoomPresence } from "./room-presence";
import { SessionRegistry } from "./session-registry";
import { attachRealtimeServer } from "./socket-server";
import type { HandshakeAuthentication } from "./socket-session";

const ALICE = "0b6f3c1e-5d2a-4f7b-9c8e-1a2b3c4d5e6f";
const BOB = "9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d";
const CLO = "5c4d3e2f-1a0b-4c9d-8e7f-6a5b4c3d2e1f";
const ACCOUNTS: Record<string, string> = { "session=alice": ALICE, "session=bob": BOB, "session=clo": CLO };

let httpServer: HttpServer;
let io: Server;
let baseUrl: string;
let events: EventEmitter<RoomEvents>;
let presence: RoomPresence;
let registry: SessionRegistry;
let findActiveMembership: (accountId: string) => Promise<ActiveMembership | undefined>;
let readRoomSnapshot: (lobbyId: string) => Promise<RoomSnapshot | undefined>;
const memberships = new Map<string, ActiveMembership>();
const snapshots = new Map<string, RoomSnapshot>();
const clients: Socket[] = [];

async function authenticate(cookie: string | undefined): Promise<HandshakeAuthentication> {
  const accountId = cookie === undefined ? undefined : ACCOUNTS[cookie];
  return accountId === undefined
    ? { kind: "anonymous" }
    : { kind: "authenticated", session: { accountId, sessionVersion: 1, expiresAt: Date.now() + 60_000 } };
}

function member(memberId: string, accountId: string, displayName: string, isHost = false) {
  return { memberId, accountId, displayName, role: "participant" as const, isHost };
}

beforeEach(async () => {
  httpServer = createServer();
  await new Promise<void>((resolve) => httpServer.listen(0, "127.0.0.1", resolve));
  const address = httpServer.address();
  if (address === null || typeof address === "string") {
    throw new Error("expected a TCP address");
  }
  baseUrl = `http://127.0.0.1:${address.port}`;
  registry = new SessionRegistry();
  events = new EventEmitter();
  presence = new RoomPresence();
  memberships.clear();
  memberships.set(ALICE, { lobbyId: "lobby-1", code: "ABCDEF", memberId: "member-a" });
  memberships.set(BOB, { lobbyId: "lobby-1", code: "ABCDEF", memberId: "member-b" });
  memberships.set(CLO, { lobbyId: "lobby-2", code: "BCDEFG", memberId: "member-c" });
  snapshots.clear();
  snapshots.set("lobby-1", {
    lobbyId: "lobby-1",
    code: "ABCDEF",
    phase: "waiting",
    capacity: 30,
    revision: 1,
    members: [member("member-a", ALICE, "Alice", true), member("member-b", BOB, "Bob")],
  });
  snapshots.set("lobby-2", {
    lobbyId: "lobby-2",
    code: "BCDEFG",
    phase: "waiting",
    capacity: 30,
    revision: 1,
    members: [member("member-c", CLO, "Clo", true)],
  });
  findActiveMembership = vi.fn(async (accountId: string) => memberships.get(accountId));
  readRoomSnapshot = vi.fn(async (lobbyId: string) => snapshots.get(lobbyId));
  io = attachRealtimeServer(httpServer, { allowedOrigin: baseUrl, isProduction: true, authenticate, registry });
  registerRoomChannel(io, {
    allowedOrigin: baseUrl,
    registry,
    presence,
    events,
    findActiveMembership: (accountId) => findActiveMembership(accountId),
    readRoomSnapshot: (lobbyId) => readRoomSnapshot(lobbyId),
  });
});

function snapshotOf(lobbyId: string): RoomSnapshot {
  const snapshot = snapshots.get(lobbyId);
  if (snapshot === undefined) {
    throw new Error(`no snapshot for ${lobbyId}`);
  }
  return snapshot;
}

afterEach(async () => {
  clients.splice(0).forEach((client) => client.close());
  await io.close();
});

function open(cookie?: string): Promise<Socket> {
  const client = connect(baseUrl, {
    reconnection: false,
    transports: ["websocket"],
    extraHeaders: { origin: baseUrl, ...(cookie === undefined ? {} : { cookie }) },
  });
  clients.push(client);
  return new Promise((resolve, reject) => {
    client.once("connect", () => resolve(client));
    client.once("connect_error", reject);
  });
}

function watch(client: Socket, code: unknown = "ABCDEF"): Promise<unknown> {
  return client.timeout(3_000).emitWithAck(ROOM_WATCH_EVENT, { code });
}

/** The next snapshot this client receives, or "silent" after a short wait. */
function nextSnapshot(client: Socket, waitMs = 300): Promise<unknown> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve("silent"), waitMs);
    client.once(ROOM_SNAPSHOT_EVENT, (snapshot: unknown) => {
      clearTimeout(timer);
      resolve(snapshot);
    });
  });
}

function until(condition: () => boolean): Promise<void> {
  return vi.waitFor(() => expect(condition()).toBe(true), { timeout: 2_000, interval: 10 });
}

describe("room channel", () => {
  it("gives a member the room's snapshot with the member online, from the session only", async () => {
    const alice = await open("session=alice");
    const ack = await watch(alice, " abcdef ");
    expect(ack).toMatchObject({
      ok: true,
      selfMemberId: "member-a",
      snapshot: { code: "ABCDEF", members: [{ memberId: "member-a", online: true }, { memberId: "member-b", online: false }] },
    });
    expect(JSON.stringify(ack)).not.toContain(ALICE);
  });

  it.each([
    ["an anonymous socket", undefined, { code: "ABCDEF" }, "UNAUTHORIZED"],
    ["a member of another room", "session=clo", { code: "ABCDEF" }, "NOT_A_MEMBER"],
    ["a malformed payload", "session=alice", { code: 42 }, "INVALID_PAYLOAD"],
    ["a payload naming an account", "session=bob", { code: "ABCDEF", accountId: ALICE }, "INVALID_PAYLOAD"],
    ["a code outside the alphabet", "session=alice", { code: "ABCDE0" }, "INVALID_PAYLOAD"],
  ])("refuses %s", async (_label, cookie, payload, error) => {
    const client = await open(cookie);
    expect(await client.timeout(3_000).emitWithAck(ROOM_WATCH_EVENT, payload)).toEqual({ ok: false, error });
  });

  it("tells the others when a member comes online and goes offline", async () => {
    const alice = await open("session=alice");
    await watch(alice);
    const bob = await open("session=bob");
    const online = nextSnapshot(alice);
    await watch(bob);
    expect(await online).toMatchObject({ members: [{ memberId: "member-a", online: true }, { memberId: "member-b", online: true }] });

    const offline = nextSnapshot(alice);
    bob.close();
    expect(await offline).toMatchObject({ members: [{ online: true }, { memberId: "member-b", online: false }] });
  });

  it("sends every follower the new snapshot after a change, the departing member included", async () => {
    const alice = await open("session=alice");
    await watch(alice);
    const received = nextSnapshot(alice);
    snapshots.set("lobby-1", { ...snapshotOf("lobby-1"), phase: "closed", revision: 2, members: [] });
    events.emit("changed", "lobby-1");
    expect(await received).toMatchObject({ phase: "closed", revision: 2, members: [] });

    // Having left, the socket no longer follows the room.
    const nothing = nextSnapshot(alice);
    events.emit("changed", "lobby-1");
    expect(await nothing).toBe("silent");
  });

  it("keeps rooms apart: a change in one room reaches nobody in another", async () => {
    const clo = await open("session=clo");
    await watch(clo, "BCDEFG");
    const nothing = nextSnapshot(clo);
    events.emit("changed", "lobby-1");
    expect(await nothing).toBe("silent");
  });

  it("does not leave a member online when the socket closes during the membership check", async () => {
    let release: () => void = () => undefined;
    findActiveMembership = vi.fn(async (accountId: string) => {
      await new Promise<void>((resolve) => {
        release = resolve;
      });
      return memberships.get(accountId);
    });
    const alice = await open("session=alice");
    alice.emit(ROOM_WATCH_EVENT, { code: "ABCDEF" }, () => undefined);
    await until(() => vi.mocked(findActiveMembership).mock.calls.length === 1);
    alice.close();
    await until(() => io.sockets.sockets.size === 0);
    release();
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(presence.onlineMembers("lobby-1")).toEqual(new Set());
  });

  it("answers one watch at a time per socket and cuts a socket that floods", async () => {
    let release: () => void = () => undefined;
    findActiveMembership = vi.fn(async (accountId: string) => {
      await new Promise<void>((resolve) => {
        release = resolve;
      });
      return memberships.get(accountId);
    });
    const alice = await open("session=alice");
    const first = watch(alice);
    await until(() => vi.mocked(findActiveMembership).mock.calls.length === 1);
    expect(await watch(alice)).toEqual({ ok: false, error: "RATE_LIMITED" });
    release();
    expect(await first).toMatchObject({ ok: true });

    const cut = new Promise((resolve) => alice.once("disconnect", resolve));
    for (let index = 0; index < WATCH_LIMIT.maxWatches; index += 1) {
      alice.emit(ROOM_WATCH_EVENT, { code: "ABCDEF" }, () => undefined);
    }
    expect(await cut).toBe("io server disconnect");
    expect(vi.mocked(findActiveMembership).mock.calls.length).toBeLessThanOrEqual(WATCH_LIMIT.maxWatches);
  });

  it("cuts the socket of a revoked session, which then stops following the room", async () => {
    const alice = await open("session=alice");
    await watch(alice);
    const cut = new Promise((resolve) => alice.once("disconnect", resolve));
    registry.revoke(ALICE, 2, Date.now() + 60_000);
    expect(await cut).toBe("io server disconnect");
    await until(() => presence.onlineMembers("lobby-1").size === 0);
  });

  it("reads a room at most twice for a burst of changes, and not at all without followers", async () => {
    events.emit("changed", "lobby-2");
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(readRoomSnapshot).not.toHaveBeenCalled();

    const alice = await open("session=alice");
    await watch(alice);
    await new Promise((resolve) => setTimeout(resolve, 50));
    vi.mocked(readRoomSnapshot).mockClear();
    for (let index = 0; index < 10; index += 1) {
      events.emit("changed", "lobby-1");
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(vi.mocked(readRoomSnapshot).mock.calls.length).toBeGreaterThanOrEqual(1);
    expect(vi.mocked(readRoomSnapshot).mock.calls.length).toBeLessThanOrEqual(2);
  });
});
