import { createServer, type Server as HttpServer } from "node:http";
import type { Server } from "socket.io";
import { io as connect, type Socket } from "socket.io-client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RACE_ABANDON_EVENT, RACE_BATCH_EVENT, RACE_CONTROL_EVENT, RACE_PRESENT_EVENT, RACE_START_EVENT } from "../../races/protocol";
import type { RaceService } from "../races/race-service";
import { RACE_BONUS_ACTIVATE_EVENT } from "../../races/bonus-protocol";
import { CONTROL_LIMIT, connectionOf, ENTRANT_ACTION_LIMIT, registerRaceChannel, START_LIMIT } from "./race-channel";
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
  activateBonus: vi.fn<RaceService["activateBonus"]>(() => ({ ok: false, error: "NO_RACE" })),
  start: vi.fn<RaceService["start"]>(async () => ({ ok: true })),
  keystrokes: vi.fn<RaceService["keystrokes"]>(() => ({ ok: false, error: "NO_RACE" })),
  takeControl: vi.fn<RaceService["takeControl"]>(() => ({ ok: true })),
  present: vi.fn<RaceService["present"]>(() => ({ ok: true })),
  abandon: vi.fn<RaceService["abandon"]>(() => ({ ok: true })),
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
  it("guards bonus activation with the current session and followed room", async () => {
    const payload = { raceId: RACE, seq: 1, milestone: 25 };
    const anonymous = await open();
    expect(await ask(anonymous, RACE_BONUS_ACTIVATE_EVENT, payload)).toEqual({ ok: false, error: "UNAUTHORIZED" });
    const alice = await open("session=alice");
    expect(await ask(alice, RACE_BONUS_ACTIVATE_EVENT, payload)).toEqual({ ok: false, error: "NO_RACE" });
    expect(races.activateBonus).not.toHaveBeenCalled();
    following.add(alice.id!);
    await ask(alice, RACE_BONUS_ACTIVATE_EVENT, payload);
    expect(races.activateBonus).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ accountId: ALICE, id: alice.id }), payload);
    const serverSocket = io.sockets.sockets.get(alice.id!);
    serverSocket!.data.session.expiresAt = 0;
    // The existing session guard disconnects an expired socket before its ack can arrive.
    await expect(ask(alice, RACE_BONUS_ACTIVATE_EVENT, payload)).rejects.toThrow("disconnected");
    expect(races.activateBonus).toHaveBeenCalledTimes(1);
  });
  it("refuses every race message from a socket without a session", async () => {
    const anonymous = await open();
    expect(await ask(anonymous, RACE_START_EVENT, {})).toEqual({ ok: false, error: "UNAUTHORIZED" });
    expect(await ask(anonymous, RACE_BATCH_EVENT, {})).toEqual({ ok: false, error: "UNAUTHORIZED" });
    expect(await ask(anonymous, RACE_CONTROL_EVENT, { raceId: RACE })).toEqual({ ok: false, error: "UNAUTHORIZED" });
    expect(await ask(anonymous, RACE_PRESENT_EVENT, { raceId: RACE })).toEqual({ ok: false, error: "UNAUTHORIZED" });
    expect(await ask(anonymous, RACE_ABANDON_EVENT, { raceId: RACE })).toEqual({ ok: false, error: "UNAUTHORIZED" });
    expect(races.start).not.toHaveBeenCalled();
    expect(races.keystrokes).not.toHaveBeenCalled();
    expect(races.takeControl).not.toHaveBeenCalled();
    expect(races.present).not.toHaveBeenCalled();
    expect(races.abandon).not.toHaveBeenCalled();
  });

  it("starts for the session's account, whatever the payload claims", async () => {
    const alice = await open("session=alice; locale=en");
    expect(await ask(alice, RACE_START_EVENT, { accountId: "someone-else" })).toEqual({ ok: true });
    const [connection, payload] = races.start.mock.calls[0] ?? [];
    expect(connection).toMatchObject({ id: alice.id, accountId: ALICE });
    // The text language is the room's setting (F-03.1), never the tab's.
    expect(connection).not.toHaveProperty("locale");
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

  it("takes « Je suis là » and abandons only from a tab that follows its room, for the session's account", async () => {
    const alice = await open("session=alice");
    expect(await ask(alice, RACE_PRESENT_EVENT, { raceId: RACE })).toEqual({ ok: false, error: "NO_RACE" });
    expect(await ask(alice, RACE_ABANDON_EVENT, { raceId: RACE })).toEqual({ ok: false, error: "NO_RACE" });
    expect(races.present).not.toHaveBeenCalled();
    following.add(alice.id ?? "");
    expect(await ask(alice, RACE_PRESENT_EVENT, { raceId: RACE, accountId: "someone-else" })).toEqual({ ok: true });
    expect(races.present.mock.calls[0]?.[0]).toMatchObject({ id: alice.id, accountId: ALICE });
    expect(await ask(alice, RACE_ABANDON_EVENT, { raceId: RACE })).toEqual({ ok: true });
    expect(races.abandon.mock.calls[0]?.[0]).toMatchObject({ id: alice.id, accountId: ALICE });
  });

  it("answers a burst of « Je suis là » and abandons from one socket with RATE_LIMITED beyond their shared window", async () => {
    const alice = await open("session=alice");
    following.add(alice.id ?? "");
    const answers = [];
    for (let attempt = 0; attempt <= ENTRANT_ACTION_LIMIT.maxRequests; attempt += 1) {
      answers.push(await ask(alice, attempt % 2 === 0 ? RACE_PRESENT_EVENT : RACE_ABANDON_EVENT, { raceId: RACE }));
    }
    expect(answers.at(-1)).toEqual({ ok: false, error: "RATE_LIMITED" });
    expect(races.present.mock.calls.length + races.abandon.mock.calls.length).toBe(ENTRANT_ACTION_LIMIT.maxRequests);
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

  it("answers a burst of control requests from one socket with RATE_LIMITED beyond its window", async () => {
    const alice = await open("session=alice");
    following.add(alice.id ?? "");
    const answers = [];
    for (let attempt = 0; attempt <= CONTROL_LIMIT.maxRequests; attempt += 1) {
      answers.push(await ask(alice, RACE_CONTROL_EVENT, { raceId: RACE }));
    }
    expect(answers.at(-1)).toEqual({ ok: false, error: "RATE_LIMITED" });
    expect(races.takeControl).toHaveBeenCalledTimes(CONTROL_LIMIT.maxRequests);
  });

  it("routes the replaceable messages through Socket.IO's volatile emit, and the others through emit", () => {
    const sent: string[] = [];
    const socket = {
      id: "s-1",
      handshake: { headers: {} },
      emit: (event: string) => sent.push(`emit ${event}`),
      volatile: { emit: (event: string) => sent.push(`volatile ${event}`) },
    } as unknown as Parameters<typeof connectionOf>[0];
    const connection = connectionOf(socket, ALICE, "4b7f2c1e-3d5a-4e6f-8a9b-0c1d2e3f4a5b");
    connection.emit("race:progress", {}, { volatile: true });
    connection.emit("race:reveal", {});
    expect(sent).toEqual(["volatile race:progress", "emit race:reveal"]);
    expect(connection).toMatchObject({ id: "s-1", accountId: ALICE, pageId: "4b7f2c1e-3d5a-4e6f-8a9b-0c1d2e3f4a5b" });
  });
});
