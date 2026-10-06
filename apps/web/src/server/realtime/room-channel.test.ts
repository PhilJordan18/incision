import { EventEmitter } from "node:events";
import { createServer, type Server as HttpServer } from "node:http";
import type { ActiveMembership, RoomSnapshot } from "@incision/database";
import type { Server } from "socket.io";
import { io as connect, type Socket } from "socket.io-client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ROOM_SNAPSHOT_EVENT, ROOM_WATCH_EVENT } from "../../rooms/protocol";
import { registerRoomChannel } from "./room-channel";
import { RoomPresence } from "./room-presence";
import { SessionRegistry } from "./session-registry";
import { attachRealtimeServer } from "./socket-server";
import type { HandshakeAuthentication } from "./socket-session";

const ALICE = "0b6f3c1e-5d2a-4f7b-9c8e-1a2b3c4d5e6f";
const BOB = "9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d";

let httpServer: HttpServer;
let io: Server;
let baseUrl: string;
let events: EventEmitter<{ changed: [lobbyId: string] }>;
const memberships = new Map<string, ActiveMembership>();
let snapshot: RoomSnapshot;
const clients: Socket[] = [];

async function authenticate(cookie: string | undefined): Promise<HandshakeAuthentication> {
  const accountId = cookie === "session=alice" ? ALICE : cookie === "session=bob" ? BOB : undefined;
  return accountId === undefined
    ? { kind: "anonymous" }
    : { kind: "authenticated", session: { accountId, sessionVersion: 1, expiresAt: Date.now() + 60_000 } };
}

beforeEach(async () => {
  httpServer = createServer();
  await new Promise<void>((resolve) => httpServer.listen(0, "127.0.0.1", resolve));
  const address = httpServer.address();
  if (address === null || typeof address === "string") {
    throw new Error("expected a TCP address");
  }
  baseUrl = `http://127.0.0.1:${address.port}`;
  const registry = new SessionRegistry();
  events = new EventEmitter();
  memberships.clear();
  memberships.set(ALICE, { lobbyId: "lobby-1", code: "ABCDEF", memberId: "member-a" });
  snapshot = {
    lobbyId: "lobby-1",
    code: "ABCDEF",
    phase: "waiting",
    capacity: 30,
    revision: 1,
    members: [{ memberId: "member-a", accountId: ALICE, displayName: "Alice", role: "participant", isHost: true }],
  };
  io = attachRealtimeServer(httpServer, { allowedOrigin: baseUrl, isProduction: true, authenticate, registry });
  registerRoomChannel(io, {
    allowedOrigin: baseUrl,
    registry,
    presence: new RoomPresence(),
    events,
    findActiveMembership: async (accountId) => memberships.get(accountId),
    readRoomSnapshot: async () => snapshot,
  });
});

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

describe("room channel", () => {
  it("gives a member the room's snapshot with the member online, from the session only", async () => {
    const alice = await open("session=alice");
    const ack = await alice.timeout(3_000).emitWithAck(ROOM_WATCH_EVENT, { code: "abcdef" });
    expect(ack).toMatchObject({ ok: true, selfMemberId: "member-a", snapshot: { code: "ABCDEF", members: [{ memberId: "member-a", online: true }] } });
    expect(JSON.stringify(ack)).not.toContain(ALICE);
  });

  it.each([
    ["an anonymous socket", undefined, { code: "ABCDEF" }, "UNAUTHORIZED"],
    ["an account of another room", "session=bob", { code: "ABCDEF" }, "NOT_A_MEMBER"],
    ["a malformed payload", "session=alice", { code: 42 }, "INVALID_PAYLOAD"],
  ])("refuses %s", async (_label, cookie, payload, error) => {
    const client = await open(cookie);
    expect(await client.timeout(3_000).emitWithAck(ROOM_WATCH_EVENT, payload)).toEqual({ ok: false, error });
  });

  it("sends every follower the new snapshot after a change, the departing member included", async () => {
    const alice = await open("session=alice");
    await alice.timeout(3_000).emitWithAck(ROOM_WATCH_EVENT, { code: "ABCDEF" });
    const received = new Promise<unknown>((resolve) => alice.once(ROOM_SNAPSHOT_EVENT, resolve));
    snapshot = { ...snapshot, phase: "closed", revision: 2, members: [] };
    events.emit("changed", "lobby-1");
    expect(await received).toMatchObject({ phase: "closed", revision: 2, members: [] });

    // Having left, the socket no longer follows the room.
    const nothing = new Promise((resolve) => {
      alice.once(ROOM_SNAPSHOT_EVENT, () => resolve("received"));
      setTimeout(() => resolve("silent"), 300);
    });
    events.emit("changed", "lobby-1");
    expect(await nothing).toBe("silent");
  });
});
