import { createServer, type Server as HttpServer } from "node:http";
import type { Server } from "socket.io";
import { io as connect, type Socket } from "socket.io-client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RACE_BATCH_EVENT, RACE_CONTROL_EVENT, RACE_START_EVENT } from "../../races/protocol";
import type { RaceService } from "../races/race-service";
import { handshakeLocale, registerRaceChannel, START_LIMIT } from "./race-channel";
import { SessionRegistry } from "./session-registry";
import { attachRealtimeServer } from "./socket-server";
import type { HandshakeAuthentication } from "./socket-session";

const ALICE = "0b6f3c1e-5d2a-4f7b-9c8e-1a2b3c4d5e6f";
const RACE = "6f1d2c3b-4a5e-4f60-8a7b-9c8d7e6f5a4b";

let httpServer: HttpServer;
let io: Server;
let baseUrl: string;
const clients: Socket[] = [];
const following = new Set<string>();
const races = {
  start: vi.fn<RaceService["start"]>(async () => ({ ok: true })),
  keystrokes: vi.fn<RaceService["keystrokes"]>(() => ({ ok: false, error: "NO_RACE" })),
  takeControl: vi.fn<RaceService["takeControl"]>(() => ({ ok: true })),
};

async function authenticate(cookie: string | undefined): Promise<HandshakeAuthentication> {
  return cookie?.includes("session=alice") === true
    ? { kind: "authenticated", session: { accountId: ALICE, sessionVersion: 1, expiresAt: Date.now() + 60_000 } }
    : { kind: "anonymous" };
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
  following.clear();
  vi.clearAllMocks();
  io = attachRealtimeServer(httpServer, { allowedOrigin: baseUrl, isProduction: true, authenticate, registry });
  registerRaceChannel(io, { allowedOrigin: baseUrl, registry, races, followedRoom: (socket) => (following.has(socket.id) ? "lobby-1" : undefined) });
});

afterEach(async () => {
  clients.splice(0).forEach((client) => client.close());
  await io.close();
});

function open(cookie?: string): Promise<Socket> {
  const client = connect(baseUrl, { reconnection: false, transports: ["websocket"], extraHeaders: { origin: baseUrl, ...(cookie === undefined ? {} : { cookie }) } });
  clients.push(client);
  return new Promise((resolve, reject) => {
    client.once("connect", () => resolve(client));
    client.once("connect_error", reject);
  });
}

const ask = (client: Socket, event: string, payload: unknown) => client.timeout(3_000).emitWithAck(event, payload);

describe("race channel", () => {
  it("refuses every race message from a socket without a session", async () => {
    const anonymous = await open();
    expect(await ask(anonymous, RACE_START_EVENT, {})).toEqual({ ok: false, error: "UNAUTHORIZED" });
    expect(await ask(anonymous, RACE_BATCH_EVENT, {})).toEqual({ ok: false, error: "UNAUTHORIZED" });
    expect(await ask(anonymous, RACE_CONTROL_EVENT, { raceId: RACE })).toEqual({ ok: false, error: "UNAUTHORIZED" });
    expect(races.start).not.toHaveBeenCalled();
    expect(races.keystrokes).not.toHaveBeenCalled();
    expect(races.takeControl).not.toHaveBeenCalled();
  });

  it("starts for the session's account, with the tab's language, whatever the payload claims", async () => {
    const alice = await open("session=alice; locale=en");
    expect(await ask(alice, RACE_START_EVENT, { accountId: "someone-else" })).toEqual({ ok: true });
    const [connection, payload] = races.start.mock.calls[0] ?? [];
    expect(connection).toMatchObject({ id: alice.id, accountId: ALICE, locale: "en" });
    // The payload goes to the service, which refuses anything but an empty object.
    expect(payload).toEqual({ accountId: "someone-else" });
  });

  it("takes keystrokes and control requests only from a tab that follows its room", async () => {
    const alice = await open("session=alice");
    expect(await ask(alice, RACE_BATCH_EVENT, { raceId: RACE })).toEqual({ ok: false, error: "NO_RACE" });
    expect(await ask(alice, RACE_CONTROL_EVENT, { raceId: RACE })).toEqual({ ok: false, error: "NO_RACE" });
    expect(races.keystrokes).not.toHaveBeenCalled();
    following.add(alice.id ?? "");
    await ask(alice, RACE_BATCH_EVENT, { raceId: RACE });
    expect(races.keystrokes).toHaveBeenCalledOnce();
    expect(races.keystrokes.mock.calls[0]?.[0]).toMatchObject({ id: alice.id, accountId: ALICE });
    expect(await ask(alice, RACE_CONTROL_EVENT, { raceId: RACE })).toEqual({ ok: true });
  });

  it("answers a burst of starts from one socket with RATE_LIMITED beyond its window", async () => {
    const alice = await open("session=alice");
    const answers = [];
    for (let attempt = 0; attempt <= START_LIMIT.maxStarts; attempt += 1) {
      answers.push(await ask(alice, RACE_START_EVENT, {}));
    }
    expect(answers.at(-1)).toEqual({ ok: false, error: "RATE_LIMITED" });
    expect(races.start).toHaveBeenCalledTimes(START_LIMIT.maxStarts);
  });

  it("reads the tab's language from its explicit choice, then from its browser", () => {
    expect(handshakeLocale({ cookie: "a=b; locale=en; c=d" })).toBe("en");
    expect(handshakeLocale({ cookie: "locale=de", "accept-language": "en-GB" })).toBe("en");
    expect(handshakeLocale({})).toBe("fr");
  });
});
