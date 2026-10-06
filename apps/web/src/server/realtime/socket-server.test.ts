import { createServer, type Server as HttpServer } from "node:http";
import type { Server } from "socket.io";
import { io as connect, type ManagerOptions, type Socket, type SocketOptions } from "socket.io-client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { PING_EVENT } from "./ping";
import { attachRealtimeServer } from "./socket-server";

let httpServer: HttpServer;
let io: Server;
let baseUrl: string;
const clients: Socket[] = [];

beforeEach(async () => {
  httpServer = createServer();
  await new Promise<void>((resolve) => httpServer.listen(0, "127.0.0.1", resolve));
  const address = httpServer.address();
  if (address === null || typeof address === "string") {
    throw new Error("expected a TCP address");
  }
  baseUrl = `http://127.0.0.1:${address.port}`;
  io = attachRealtimeServer(httpServer, { allowedOrigin: baseUrl, isProduction: true });
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
});
