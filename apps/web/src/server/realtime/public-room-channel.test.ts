import { createServer, type Server as HttpServer } from "node:http";
import type { Server } from "socket.io";
import { io as connect, type Socket } from "socket.io-client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { PUBLIC_ROOMS_EVENT, PUBLIC_ROOMS_UNWATCH_EVENT, PUBLIC_ROOMS_WATCH_EVENT, PUBLIC_ROOMS_WATCH_LIMIT, type PublicRoomEntry } from "../../rooms/public-rooms-protocol";
import { publicRoomWatchers, publishPublicRooms, registerPublicRoomChannel } from "./public-room-channel";
import { SessionRegistry } from "./session-registry";
import { attachRealtimeServer } from "./socket-server";

const entry: PublicRoomEntry = { code: "ABCDEF", hostName: "Julie", phase: "waiting", participants: 1, capacity: 30, textLanguage: "fr",
  complexity: "medium", textKind: "coherent", wordCount: 50, arcade: false, joinable: true };

let httpServer: HttpServer;
let io: Server;
let baseUrl: string;
let reads = 0;
let failing = false;
const clients: Socket[] = [];

beforeEach(async () => {
  httpServer = createServer();
  await new Promise<void>((resolve) => httpServer.listen(0, "127.0.0.1", resolve));
  const address = httpServer.address();
  if (address === null || typeof address === "string") throw new Error("expected a TCP address");
  baseUrl = `http://127.0.0.1:${address.port}`;
  reads = 0; failing = false;
  io = attachRealtimeServer(httpServer, { allowedOrigin: baseUrl, isProduction: true, registry: new SessionRegistry(),
    authenticate: async () => ({ kind: "anonymous" }) });
  registerPublicRoomChannel(io, { allowedOrigin: baseUrl, feed: { current: async () => {
    reads += 1;
    if (failing) throw new Error("down");
    return [entry];
  } } });
});
afterEach(async () => { clients.splice(0).forEach((client) => client.close()); await io.close(); });

async function open(): Promise<Socket> {
  const client = connect(baseUrl, { transports: ["websocket"], extraHeaders: { origin: baseUrl }, reconnection: false, forceNew: true });
  clients.push(client);
  await new Promise<void>((resolve, reject) => { client.once("connect", resolve); client.once("connect_error", reject); });
  return client;
}

describe("public room channel (JOIN-02)", () => {
  it("lets an anonymous socket watch, answers with the list, then pushes updates", async () => {
    const client = await open();
    expect(await client.emitWithAck(PUBLIC_ROOMS_WATCH_EVENT, null)).toEqual({ ok: true, rooms: [entry] });
    expect(publicRoomWatchers(io)).toBe(1);
    const pushed = new Promise((resolve) => client.once(PUBLIC_ROOMS_EVENT, resolve));
    publishPublicRooms(io, [{ ...entry, participants: 2 }]);
    expect(await pushed).toEqual({ rooms: [{ ...entry, participants: 2 }] });
    client.emit(PUBLIC_ROOMS_UNWATCH_EVENT);
    await expect.poll(() => publicRoomWatchers(io)).toBe(0);
  });

  it("answers UNAVAILABLE when the list cannot be read", async () => {
    failing = true;
    const client = await open();
    expect(await client.emitWithAck(PUBLIC_ROOMS_WATCH_EVENT, null)).toEqual({ ok: false, error: "UNAVAILABLE" });
  });

  it("cuts a socket that watches far more than a page does", async () => {
    const client = await open();
    for (let watch = 0; watch < PUBLIC_ROOMS_WATCH_LIMIT.maxWatches; watch += 1) {
      expect(await client.emitWithAck(PUBLIC_ROOMS_WATCH_EVENT, null)).toMatchObject({ ok: true });
    }
    const disconnected = new Promise((resolve) => client.once("disconnect", resolve));
    expect(await client.emitWithAck(PUBLIC_ROOMS_WATCH_EVENT, null)).toEqual({ ok: false, error: "RATE_LIMITED" });
    await disconnected;
    expect(reads).toBe(PUBLIC_ROOMS_WATCH_LIMIT.maxWatches);
  });
});
