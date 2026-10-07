import { createServer, type Server as HttpServer } from "node:http";
import type { Server } from "socket.io";
import { io as connect, type ManagerOptions, type Socket, type SocketOptions } from "socket.io-client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { PING_EVENT } from "./ping";
import { SessionRegistry } from "./session-registry";
import { attachRealtimeServer, SESSION_EVENT } from "./socket-server";
import type { HandshakeAuthentication } from "./socket-session";

let httpServer: HttpServer;
let io: Server;
let baseUrl: string;
let registry: SessionRegistry;
const clients: Socket[] = [];

const alice = "0b6f3c1e-5d2a-4f7b-9c8e-1a2b3c4d5e6f";

/** Stands in for the cookie check (tested in socket-session.test.ts), keyed by the Cookie header. */
async function authenticate(cookieHeader: string | undefined): Promise<HandshakeAuthentication> {
  if (cookieHeader === undefined) {
    return { kind: "anonymous" };
  }
  if (cookieHeader === "session=alice") {
    return { kind: "authenticated", session: { accountId: alice, sessionVersion: 1, expiresAt: Date.now() + 60_000 } };
  }
  if (cookieHeader === "session=short") {
    return { kind: "authenticated", session: { accountId: alice, sessionVersion: 1, expiresAt: Date.now() + 300 } };
  }
  return { kind: "refused", reason: "INVALID_TOKEN" };
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
  io = attachRealtimeServer(httpServer, { allowedOrigin: baseUrl, isProduction: true, authenticate, registry });
});

afterEach(async () => {
  clients.splice(0).forEach((client) => client.close());
  await io.close();
});

function open(options: Partial<ManagerOptions & SocketOptions>): Promise<Socket> {
  const client = connect(baseUrl, { reconnection: false, timeout: 3_000, ...options });
  clients.push(client);
  return new Promise((resolve, reject) => {
    client.once("connect", () => resolve(client));
    client.once("connect_error", reject);
  });
}

describe("attachRealtimeServer", () => {
  it("accepts the default client, which starts with a same-origin polling request", async () => {
    const client = await open({});
    expect(await client.timeout(3_000).emitWithAck(PING_EVENT, { sentAt: 1 })).toMatchObject({ ok: true });
  });

  it("accepts a WebSocket handshake from the site's own origin", async () => {
    const client = await open({ transports: ["websocket"], extraHeaders: { origin: baseUrl } });
    expect(await client.timeout(3_000).emitWithAck(PING_EVENT, { sentAt: 1 })).toMatchObject({ ok: true });
  });

  const refusedHandshakes: { label: string; transports: ("websocket" | "polling")[]; headers: Record<string, string> }[] = [
    { label: "WebSocket from another origin", transports: ["websocket"], headers: { origin: "https://evil.example" } },
    { label: "polling from another origin", transports: ["polling"], headers: { origin: "https://evil.example" } },
    { label: "polling marked cross-site", transports: ["polling"], headers: { "sec-fetch-site": "cross-site" } },
  ];

  it.each(refusedHandshakes)("refuses $label", async ({ transports, headers }) => {
    await expect(open({ transports, extraHeaders: headers })).rejects.toThrow();
  });

  it("refuses a JSONP polling handshake", async () => {
    const response = await fetch(`${baseUrl}/socket.io/?EIO=4&transport=polling&j=0`);
    expect(response.status).toBe(403);
  });

  it("answers an invalid ping with an error and survives a ping without acknowledgement", async () => {
    const client = await open({});
    client.emit(PING_EVENT, { sentAt: 1 });
    expect(await client.timeout(3_000).emitWithAck(PING_EVENT, { sentAt: "now" })).toEqual({
      ok: false,
      error: "INVALID_PAYLOAD",
    });
  });

  it("keeps an anonymous socket out of protected events", async () => {
    const client = await open({});
    expect(await client.timeout(3_000).emitWithAck(SESSION_EVENT, {})).toEqual({ ok: false, error: "UNAUTHORIZED" });
  });

  it("answers the account of an authenticated socket, from its cookie only", async () => {
    const client = await open({ extraHeaders: { cookie: "session=alice" } });
    expect(await client.timeout(3_000).emitWithAck(SESSION_EVENT, { accountId: "someone-else" })).toEqual({ ok: true, accountId: alice });
    expect(registry.size).toBe(1);
  });

  it("refuses the handshake of an invalid session cookie", async () => {
    await expect(open({ extraHeaders: { cookie: "session=forged" } })).rejects.toThrow("UNAUTHORIZED");
  });

  it("disconnects the account's sockets on revocation and forgets them", async () => {
    const client = await open({ extraHeaders: { cookie: "session=alice" } });
    const disconnected = new Promise<string>((resolve) => client.once("disconnect", resolve));
    registry.revoke(alice, 2, Date.now() + 60_000);
    expect(await disconnected).toBe("io server disconnect");
    expect(registry.size).toBe(0);
  });

  it("disconnects a socket when its session expires", async () => {
    const client = await open({ extraHeaders: { cookie: "session=short" } });
    const disconnected = new Promise<string>((resolve) => client.once("disconnect", resolve));
    expect(await disconnected).toBe("io server disconnect");
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(registry.size).toBe(0);
  });
});
