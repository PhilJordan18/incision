import { createServer } from "node:http";
import { io as connect, type Socket } from "socket.io-client";
import { expect, it, vi } from "vitest";
import type { StartRaceInput } from "@incision/database";
import type { BonusRaceState, CreateRaceRefusal } from "@incision/domain";
import { RaceService } from "../races/race-service";
import { connectionOf, registerRaceChannel } from "./race-channel";
import { SessionRegistry } from "./session-registry";
import { attachRealtimeServer } from "./socket-server";
import { BonusClient } from "../../races/bonus-client";
import { raceBatchAckSchema } from "../../races/protocol";

const RACE = "6f1d2c3b-4a5e-4f60-8a7b-9c8d7e6f5a4b";
const TEXT = "aa bb cc dd ee ff gg hh ii jj";

/** Real channel, service and engine. Authentication/admission and persistence are
 * explicit doubles, not production or database integration evidence. Only this
 * store fixture enables bonuses; the production service still freezes them off.
 */
it("browser controller retries a lost socket acknowledgement without a second effect and typing continues", async () => {
  const http = createServer();
  await new Promise<void>(resolve => http.listen(0, "127.0.0.1", resolve));
  const address = http.address();
  if (!address || typeof address === "string") throw new Error("Missing test address");
  const origin = `http://127.0.0.1:${address.port}`;
  const registry = new SessionRegistry();
  const io = attachRealtimeServer(http, { allowedOrigin: origin, isProduction: true, registry,
    authenticate: async cookie => ({ kind: "authenticated", session: {
      accountId: cookie === "test=leader" ? "leader" : cookie === "test=spectator" ? "spectator" : "actor",
      sessionVersion: 1, expiresAt: Date.now() + 60_000,
    } }),
  });
  let now = 0;
  const won = { won: true, alreadyDone: false } as const;
  const store = {
    startRace: vi.fn(async (input: StartRaceInput<CreateRaceRefusal, BonusRaceState>) => {
      const entrants = ["actor", "leader"].map((id, index) => ({ entrantId: id, accountId: id, memberId: id, ordinal: index + 1, displayName: id }));
      const created = input.create({ raceId: RACE, entrants: entrants.map(e => ({ entrantId: e.entrantId, kind: "human" })) });
      if (!created.ok) throw new Error(created.reason);
      return { ok: true as const,
        race: { raceId: RACE, lobbyId: "room", ownerId: "owner", ownerEpoch: 1, roundNo: 1, countdownAt: new Date(0), leaseExpiresAt: new Date(30000) },
        entrants, created: { ...created.race, awards: { ...created.race.awards, enabled: true } },
      };
    }),
    beginRacing: vi.fn(async () => won), finalizeRace: vi.fn(async () => won),
    interruptOwnRace: vi.fn(async () => won), renewRaceLease: vi.fn(async () => ({ renewed: true })),
  };
  const service = new RaceService({ ownerId: "owner", store, now: () => now, monotonic: () => now,
    schedule: () => () => {}, onRoomChanged: () => {}, log: () => {}, racesOpen: true,
    texts: { fr: { id: "socket-fixture", text: TEXT }, en: { id: "socket-fixture", text: TEXT } },
  });
  const following = new Set<string>();
  registerRaceChannel(io, { allowedOrigin: origin, registry, races: service, followedRoom: socket => following.has(socket.id) ? "room" : undefined });
  const clients: Socket[] = [];
  async function open(account: string, page: string, prepare?: (client: Socket) => void) {
    const client = connect(origin, { reconnection: false, transports: ["websocket"], extraHeaders: { origin, cookie: `test=${account}` } });
    clients.push(client);
    await new Promise<void>((resolve, reject) => { client.once("connect", resolve); client.once("connect_error", reject); });
    const socket = io.sockets.sockets.get(client.id!)!;
    following.add(socket.id);
    prepare?.(client);
    service.follow("room", connectionOf(socket, account, page));
    socket.on("disconnect", () => { following.delete(socket.id); service.unfollow(socket.id); });
    return client;
  }
  const ask = (socket: Socket, event: string, payload: unknown) => socket.timeout(3000).emitWithAck(event, payload);
  const browser = new BonusClient({ serverNow: () => now, schedule: (callback, delay) => {
    const timer = setTimeout(callback, delay);
    return () => clearTimeout(timer);
  } });
  browser.begin({ raceId: RACE, entrantId: "actor" });
  let loseAck = true;
  const sent: unknown[] = [];
  const prepare = (socket: Socket) => {
    browser.connect({ send: async command => {
      sent.push(command);
      const reply: unknown = await ask(socket, "race:bonus:activate", command);
      if (loseAck) { loseAck = false; throw new Error("Test lost acknowledgement"); }
      return reply;
    } });
    socket.on("race:bonus:self", payload => browser.self(payload));
    socket.on("race:bonus:announcement", payload => browser.announce(payload));
    browser.context({ controlling: true, racing: true });
  };
  try {
    const actor = await open("actor", "page-a", prepare);
    const leader = await open("leader", "page-b");
    const observer = await open("actor", "page-observer");
    const spectator = await open("spectator", "page-spectator");
    const messages: { event: string; payload: unknown }[] = [];
    spectator.onAny((event: string, payload: unknown) => messages.push({ event, payload }));
    expect(await ask(actor, "race:start", {})).toEqual({ ok: true });
    now = 5000;
    expect(await ask(leader, "race:batch", { raceId: RACE, seq: 1, textVersion: 0,
      events: [...TEXT.slice(0, 22)].map(grapheme => ({ type: "insert", grapheme })) }))
      .toMatchObject({ ok: true, result: { outcome: "applied" } });
    const command = { raceId: RACE, seq: 1, milestone: 25 };
    expect(await ask(observer, "race:bonus:activate", command)).toEqual({ ok: false, error: "NOT_CONTROLLING" });
    expect(await ask(spectator, "race:bonus:activate", command)).toEqual({ ok: false, error: "NOT_AN_ENTRANT" });
    expect(await ask(actor, "race:bonus:activate", { ...command, targetId: "leader" })).toEqual({ ok: false, error: "INVALID_PAYLOAD" });
    await vi.waitFor(() => expect(browser.getState().self?.grants.length).toBeGreaterThan(0));
    expect(browser.activate()).toBe(true);
    await vi.waitFor(() => expect(browser.getState().error).toBe("OFFLINE"));
    expect(browser.getState().pending).toEqual(command);
    const serverSocket = io.sockets.sockets.get(actor.id!)!;
    const disconnected = new Promise<void>(resolve => serverSocket.once("disconnect", () => resolve()));
    browser.disconnect();
    actor.close();
    await disconnected;
    const resumed = await open("actor", "page-a", prepare);
    await vi.waitFor(() => expect(browser.getState().synchronized).toBe(true));
    expect(browser.activate()).toBe(true);
    await vi.waitFor(() => expect(browser.getState().reply).toMatchObject({ ok: true, seq: 1 }));
    expect(sent).toEqual([command, command]);
    expect(browser.getState().self?.ackSeq).toBe(1);
    const stale = raceBatchAckSchema.parse(await ask(resumed, "race:batch", { raceId: RACE, seq: 1, textVersion: 0,
      events: [{ type: "insert", grapheme: "a" }] }));
    expect(stale).toMatchObject({ ok: true, result: { outcome: "resync", reason: "TEXT_VERSION_CHANGED" } });
    if (!stale.ok) throw new Error("Expected authoritative recovery snapshot");
    expect(await ask(resumed, "race:batch", { raceId: RACE, seq: 1, textVersion: stale.self.snapshot.textVersion,
      events: [{ type: "insert", grapheme: "a" }] })).toMatchObject({ ok: true, result: { outcome: "applied" } });
    await vi.waitFor(() => expect(messages.filter(m => m.event === "race:bonus:announcement")).toHaveLength(1));
    expect(messages.some(m => m.event === "race:bonus:self")).toBe(false);
    const announcement = JSON.stringify(messages.filter(m => m.event === "race:bonus:announcement"));
    for (const forbidden of ['"random"', '"grants"', '"target"', '"typed"', '"cursors"']) expect(announcement).not.toContain(forbidden);
    expect(store.beginRacing).toHaveBeenCalledTimes(1);
    expect(store.finalizeRace).not.toHaveBeenCalled();
    expect(store.startRace).toHaveBeenCalledTimes(1);
  } finally {
    browser.dispose();
    clients.forEach(client => client.close());
    await io.close();
  }
});

