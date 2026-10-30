import { EventEmitter } from "node:events";
import { createServer, type Server as HttpServer } from "node:http";
import { type ActiveMembership, DEFAULT_BONUS_SETTINGS, DEFAULT_TEXT_SETTINGS, type RoomRecovery, type RoomSnapshot } from "@incision/database";
import type { Server } from "socket.io";
import { io as connect, type Socket } from "socket.io-client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ROOM_SNAPSHOT_EVENT, ROOM_WATCH_EVENT, WATCH_LIMIT } from "../../rooms/protocol";
import type { RoomEvents } from "../rooms/room-events";
import { ACCOUNT_WATCHES_IN_FLIGHT, registerRoomChannel } from "./room-channel";
import { GuestPresenceGrace } from "./guest-presence-grace";
import { RoomPresence } from "./room-presence";
import { SessionRegistry } from "./session-registry";
import { attachRealtimeServer } from "./socket-server";
import type { HumanHandshake, GuestSessionReader } from "./human-handshake";

const ALICE = "0b6f3c1e-5d2a-4f7b-9c8e-1a2b3c4d5e6f";
const BOB = "9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d";
const CLO = "5c4d3e2f-1a0b-4c9d-8e7f-6a5b4c3d2e1f";
const ACCOUNTS: Record<string, string> = { "session=alice": ALICE, "session=bob": BOB, "session=clo": CLO };

let channel: ReturnType<typeof registerRoomChannel>;
let httpServer: HttpServer;
let io: Server;
let baseUrl: string;
let events: EventEmitter<RoomEvents>;
let presence: RoomPresence;
let guestGrace: GuestPresenceGrace;
let graceNow: number;
let registry: SessionRegistry;
let findActiveMembership: (accountId: string) => Promise<ActiveMembership | undefined>;
let readGuest: GuestSessionReader;
let findGuestMembership: (id: string) => Promise<ActiveMembership | undefined>;
let canResumeMembership: () => Promise<boolean>;
let readRoomSnapshot: (lobbyId: string) => Promise<RoomSnapshot | undefined>;
let recoverAbandonedRace: (lobbyId: string) => Promise<RoomRecovery>;
const ownedRaces = new Set<string>();
const raceFollows: { lobbyId: string; id: string; accountId: string | null; pageId?: string }[] = [];
const raceUnfollows: string[] = [];
const raceFollowFails = { next: false };
const memberships = new Map<string, ActiveMembership>();
const snapshots = new Map<string, RoomSnapshot>();
const SETTINGS = { revision: 3, textLanguage: "en", wordCount: 50, timeLimitMs: 90_000, errorMode: "mandatory", ...DEFAULT_TEXT_SETTINGS, ...DEFAULT_BONUS_SETTINGS } as const;
const clients: Socket[] = [];

async function authenticate(cookie: string | undefined): Promise<HumanHandshake> {
  if (cookie === "session=guest") return { kind: "guest", session: { proof: { id: ALICE, secretDigest: "synthetic-digest" }, expiresAt: Date.now() + 60_000 } };
  const session = cookie
    ?.split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith("session="));
  const accountId = session === undefined ? undefined : ACCOUNTS[session];
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
  memberships.set(ALICE, { lobbyId: "lobby-1", code: "ABCDEF", memberId: "member-a", isHost: true });
  memberships.set(BOB, { lobbyId: "lobby-1", code: "ABCDEF", memberId: "member-b", isHost: false });
  memberships.set(CLO, { lobbyId: "lobby-2", code: "BCDEFG", memberId: "member-c", isHost: true });
  snapshots.clear();
  snapshots.set("lobby-1", {
    lobbyId: "lobby-1",
    code: "ABCDEF",
    phase: "waiting",
    capacity: 30,
    revision: 1,
    members: [member("member-a", ALICE, "Alice", true), member("member-b", BOB, "Bob")],
    bots: [],
    settings: SETTINGS,
  });
  snapshots.set("lobby-2", {
    lobbyId: "lobby-2",
    code: "BCDEFG",
    phase: "waiting",
    capacity: 30,
    revision: 1,
    members: [member("member-c", CLO, "Clo", true)],
    bots: [],
    settings: SETTINGS,
  });
  findActiveMembership = vi.fn(async (accountId: string) => memberships.get(accountId));
  canResumeMembership = vi.fn(async () => true);
  findGuestMembership = vi.fn(async () => ({ lobbyId: "lobby-1", code: "ABCDEF", memberId: "guest-member", isHost: false }));
  readGuest = vi.fn<GuestSessionReader>(async () => ({ kind: "valid", session: { id: ALICE, expiresAt: new Date(Date.now() + 60_000) } }));
  readRoomSnapshot = vi.fn(async (lobbyId: string) => snapshots.get(lobbyId));
  recoverAbandonedRace = vi.fn(async (): Promise<RoomRecovery> => ({ recovered: false }));
  ownedRaces.clear();
  raceFollows.length = 0;
  raceUnfollows.length = 0;
  io = attachRealtimeServer(httpServer, { allowedOrigin: baseUrl, isProduction: true, authenticate, registry });
  graceNow = Date.now();
  guestGrace = new GuestPresenceGrace({
    now: () => graceNow,
    schedule: (callback, delay) => { const timer = setTimeout(callback, delay); timer.unref(); return () => clearTimeout(timer); },
    online: ({ lobbyId, memberId }) => presence.onlineMembers(lobbyId).has(memberId),
    end: async (input) => {
      const snapshot = snapshots.get(input.lobbyId);
      const member = snapshot?.members.find((one) => one.memberId === input.memberId && one.accountId === null);
      if (snapshot === undefined || member === undefined) return { kind: "gone" };
      if (member.isHost) return { kind: "host" };
      const state = { phase: snapshot.phase, expiresAt: graceNow + 86_400_000, expired: false };
      if ((state.phase === "waiting" || state.phase === "results") && input.claim(state)) {
        snapshots.set(input.lobbyId, { ...snapshot, revision: snapshot.revision + 1, members: snapshot.members.filter((one) => one.memberId !== member.memberId) });
        findGuestMembership = vi.fn(async () => undefined);
        return { kind: "departed" };
      }
      return { kind: "retained", ...state };
    },
    departed: ({ lobbyId }) => events.emit("changed", lobbyId),
    failed: () => { throw new Error("Unexpected guest departure failure"); },
  });
  channel = registerRoomChannel(io, {
    allowedOrigin: baseUrl,
    registry,
    presence,
    guestGrace,
    events,
    findActiveMembership: (accountId) => findActiveMembership(accountId),
    readGuest: (proof) => readGuest(proof),
    findGuestMembership: (id) => findGuestMembership(id),
    canResumeMembership: () => canResumeMembership(),
    readRoomSnapshot: (lobbyId) => readRoomSnapshot(lobbyId),
    raceRecovery: { recover: (lobbyId) => recoverAbandonedRace(lobbyId), ownsRace: (lobbyId) => ownedRaces.has(lobbyId) },
    recoveryTiming: { failedLookRetryMs: 50, maxFailedLooks: 3 },
    races: {
      follow: (lobbyId, connection) => {
        if (raceFollowFails.next) {
          raceFollowFails.next = false;
          throw new Error("unexpected");
        }
        raceFollows.push({
          lobbyId,
          id: connection.id,
          accountId: connection.accountId,
          ...(connection.pageId === undefined ? {} : { pageId: connection.pageId }),
        });
      },
      unfollow: (id) => void raceUnfollows.push(id),
    },
  });
});

/** Makes the next room read wait for `release`, returning the room as it was when it started. */
function holdNextRead(): { started: boolean; release: () => void } {
  const control = { started: false, release: () => undefined as void };
  const original = readRoomSnapshot;
  readRoomSnapshot = vi.fn(async (lobbyId: string) => {
    readRoomSnapshot = original;
    const before = snapshots.get(lobbyId);
    control.started = true;
    await new Promise<void>((resolve) => {
      control.release = resolve;
    });
    return before;
  });
  return control;
}

function snapshotOf(lobbyId: string): RoomSnapshot {
  const snapshot = snapshots.get(lobbyId);
  if (snapshot === undefined) {
    throw new Error(`no snapshot for ${lobbyId}`);
  }
  return snapshot;
}

afterEach(async () => {
  guestGrace?.stop();
  clients.splice(0).forEach((client) => client.close());
  await io.close();
});

function open(cookie?: string, headers: Record<string, string> = {}): Promise<Socket> {
  const client = connect(baseUrl, {
    reconnection: false,
    transports: ["websocket"],
    extraHeaders: { origin: baseUrl, ...headers, ...(cookie === undefined ? {} : { cookie }) },
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
  it.each(["session=alice", "session=guest"])("refuses an IP-bound presence before following with %s", async (cookie) => {
    canResumeMembership = vi.fn(async () => false);
    const client = await open(cookie);
    expect(await watch(client)).toEqual({ ok: false, error: "NOT_A_MEMBER" });
    expect(presence.onlineMembers("lobby-1").size).toBe(0);
    expect(raceFollows).toEqual([]);
    expect(readRoomSnapshot).not.toHaveBeenCalled();
  });

  it("gives a member the room's snapshot with the member online and the room settings, from the session only", async () => {
    const alice = await open("session=alice");
    const ack = await watch(alice, " abcdef ");
    expect(ack).toMatchObject({
      ok: true,
      selfMemberId: "member-a",
      snapshot: { code: "ABCDEF", members: [{ memberId: "member-a", online: true }, { memberId: "member-b", online: false }], settings: SETTINGS },
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

  it("applies a change that arrives while the room is being read", async () => {
    const alice = await open("session=alice");
    await watch(alice);
    await new Promise((resolve) => setTimeout(resolve, 50));
    const held = holdNextRead();
    events.emit("changed", "lobby-1");
    await until(() => held.started);
    snapshots.set("lobby-1", { ...snapshotOf("lobby-1"), revision: 2 });
    events.emit("changed", "lobby-1");
    const received: unknown[] = [];
    alice.on(ROOM_SNAPSHOT_EVENT, (snapshot: unknown) => received.push(snapshot));
    held.release();
    await vi.waitFor(() => expect(received).toContainEqual(expect.objectContaining({ revision: 2 })), { timeout: 2_000 });
  });

  it("keeps a member who joined while an older read was in flight", async () => {
    snapshots.set("lobby-1", { ...snapshotOf("lobby-1"), members: [member("member-a", ALICE, "Alice", true)] });
    const alice = await open("session=alice");
    await watch(alice);
    await new Promise((resolve) => setTimeout(resolve, 50));
    // A change starts a read of the room as it was before Bob joined…
    const held = holdNextRead();
    events.emit("changed", "lobby-1");
    await until(() => held.started);
    // …then Bob joins and watches, and only then does the old read come back.
    snapshots.set("lobby-1", {
      ...snapshotOf("lobby-1"),
      revision: 2,
      members: [member("member-a", ALICE, "Alice", true), member("member-b", BOB, "Bob")],
    });
    const bob = await open("session=bob");
    expect(await watch(bob)).toMatchObject({ ok: true });
    held.release();
    await new Promise((resolve) => setTimeout(resolve, 50));

    const later = nextSnapshot(bob, 1_000);
    snapshots.set("lobby-1", { ...snapshotOf("lobby-1"), revision: 3 });
    events.emit("changed", "lobby-1");
    expect(await later).toMatchObject({ revision: 3 });
  });

  it("undoes a watch whose room cannot be read", async () => {
    readRoomSnapshot = vi.fn(async () => {
      throw new Error("database unreachable");
    });
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const alice = await open("session=alice");
    expect(await watch(alice)).toEqual({ ok: false, error: "UNAVAILABLE" });
    expect(presence.onlineMembers("lobby-1")).toEqual(new Set());
    readRoomSnapshot = vi.fn(async (lobbyId: string) => snapshots.get(lobbyId));
    const nothing = nextSnapshot(alice);
    events.emit("changed", "lobby-1");
    expect(await nothing).toBe("silent");
  });

  it("lets one account run only a few watches at once, whatever its number of sockets", async () => {
    const releases: (() => void)[] = [];
    findActiveMembership = vi.fn(async (accountId: string) => {
      await new Promise<void>((resolve) => releases.push(resolve));
      return memberships.get(accountId);
    });
    const sockets = await Promise.all(Array.from({ length: ACCOUNT_WATCHES_IN_FLIGHT + 2 }, () => open("session=alice")));
    const answers = sockets.map((socket) => watch(socket));
    await until(() => vi.mocked(findActiveMembership).mock.calls.length === ACCOUNT_WATCHES_IN_FLIGHT);
    const refused = await Promise.all(answers.slice(ACCOUNT_WATCHES_IN_FLIGHT));
    expect(refused).toEqual(Array.from({ length: 2 }, () => ({ ok: false, error: "RATE_LIMITED" })));
    releases.forEach((release) => release());
    expect(await Promise.all(answers.slice(0, ACCOUNT_WATCHES_IN_FLIGHT))).toEqual(
      Array.from({ length: ACCOUNT_WATCHES_IN_FLIGHT }, () => expect.objectContaining({ ok: true })),
    );
    expect(vi.mocked(findActiveMembership).mock.calls.length).toBe(ACCOUNT_WATCHES_IN_FLIGHT);
  });

  it("tells the others when a member's only socket fails to follow the room", async () => {
    const alice = await open("session=alice");
    await watch(alice);
    await new Promise((resolve) => setTimeout(resolve, 50));
    // Bob's watch reads the room slowly; meanwhile a change shows him online…
    let failRead: (error: Error) => void = () => undefined;
    const original = readRoomSnapshot;
    readRoomSnapshot = vi.fn(async (lobbyId: string) => {
      readRoomSnapshot = original;
      await new Promise<void>((_resolve, reject) => {
        failRead = reject;
      });
      return snapshots.get(lobbyId);
    });
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const bob = await open("session=bob");
    const answer = watch(bob);
    await until(() => presence.onlineMembers("lobby-1").has("member-b"));
    const online = nextSnapshot(alice, 1_000);
    events.emit("changed", "lobby-1");
    expect(await online).toMatchObject({ members: [{ memberId: "member-a" }, { memberId: "member-b", online: true }] });
    // …then the read fails: Alice must learn that Bob is not there after all.
    const offline = nextSnapshot(alice, 1_000);
    failRead(new Error("database unreachable"));
    expect(await answer).toEqual({ ok: false, error: "UNAVAILABLE" });
    expect(await offline).toMatchObject({ members: [{ memberId: "member-a" }, { memberId: "member-b", online: false }] });
  });

  it("drops a second tab whose watch read the room before its member left", async () => {
    const bob1 = await open("session=bob");
    await watch(bob1);
    await new Promise((resolve) => setTimeout(resolve, 50));
    const held = holdNextRead();
    const bob2 = await open("session=bob");
    const answer = watch(bob2);
    await until(() => held.started);
    // Bob leaves while his second tab is still reading the room.
    snapshots.set("lobby-1", { ...snapshotOf("lobby-1"), revision: 2, members: [member("member-a", ALICE, "Alice", true)] });
    events.emit("changed", "lobby-1");
    await new Promise((resolve) => setTimeout(resolve, 50));
    held.release();
    await answer;
    await new Promise((resolve) => setTimeout(resolve, 50));
    const nothing = nextSnapshot(bob2);
    snapshots.set("lobby-1", { ...snapshotOf("lobby-1"), revision: 3 });
    events.emit("changed", "lobby-1");
    expect(await nothing).toBe("silent");
  });
});

describe("recovery of an abandoned race when a member watches its room (ADR-0004)", () => {
  function racing(lobbyId: string, revision = 2): void {
    snapshots.set(lobbyId, { ...snapshotOf(lobbyId), phase: "racing", revision });
  }

  /** The room's race is recovered by the next call: the room goes back to WAITING. */
  function recoveredNext(lobbyId: string): void {
    recoverAbandonedRace = vi.fn(async (): Promise<RoomRecovery> => {
      snapshots.set(lobbyId, { ...snapshotOf(lobbyId), phase: "waiting", revision: snapshotOf(lobbyId).revision + 1 });
      return { recovered: true };
    });
  }

  it("recovers the race of a room in RACING that this process does not run, then tells every member", async () => {
    racing("lobby-1");
    const first = await open("session=alice");
    await watch(first);
    // A second socket of the same member: its watch alone triggers no broadcast.
    recoveredNext("lobby-1");
    const told = nextSnapshot(first, 1_000);
    const second = await open("session=alice");
    expect(await watch(second)).toMatchObject({ ok: true });
    expect(recoverAbandonedRace).toHaveBeenCalledWith("lobby-1");
    expect(await told).toMatchObject({ phase: "waiting", revision: 3 });
  });

  it("never touches a race this process runs, a room in another phase, a non-member's watch or a failed read", async () => {
    racing("lobby-1");
    ownedRaces.add("lobby-1");
    const alice = await open("session=alice");
    await watch(alice);
    const clo = await open("session=clo");
    await watch(clo, "BCDEFG");
    racing("lobby-2");
    // Clo's room again, but Clo is not a member of lobby-1.
    expect(await watch(clo, "ABCDEF")).toMatchObject({ ok: false, error: "NOT_A_MEMBER" });
    ownedRaces.clear();
    const logged = vi.spyOn(console, "error").mockImplementation(() => undefined);
    readRoomSnapshot = vi.fn(async () => {
      throw new Error("connect ECONNREFUSED");
    });
    const bob = await open("session=bob");
    expect(await watch(bob)).toMatchObject({ ok: false, error: "UNAVAILABLE" });
    logged.mockRestore();
    expect(recoverAbandonedRace).not.toHaveBeenCalled();
  });

  it("answers the watch even when the recovery fails, and logs it without detail", async () => {
    racing("lobby-1");
    const logged = vi.spyOn(console, "error").mockImplementation(() => undefined);
    recoverAbandonedRace = vi.fn(async (): Promise<RoomRecovery> => {
      throw new Error("connect ECONNREFUSED");
    });
    const alice = await open("session=alice");
    expect(await watch(alice)).toMatchObject({ ok: true, snapshot: { phase: "racing" } });
    expect(logged).toHaveBeenCalledWith("[races] recovery on watch failed:", "connect ECONNREFUSED");
    logged.mockRestore();
  });

  it("looks again once the lease has run out, while someone still follows the room", async () => {
    racing("lobby-1");
    recoverAbandonedRace = vi.fn(async (lobbyId: string): Promise<RoomRecovery> => {
      // Next time, the lease has expired and the race is recovered.
      recoveredNext(lobbyId);
      return { recovered: false, retryInMs: 50 };
    });
    const alice = await open("session=alice");
    await watch(alice);
    const told = await nextSnapshot(alice, 3_000);
    expect(told).toMatchObject({ phase: "waiting", revision: 3 });
  });

  it("looks again while the database does not answer, then tells every member once it does", async () => {
    racing("lobby-1");
    const logged = vi.spyOn(console, "error").mockImplementation(() => undefined);
    recoverAbandonedRace = vi.fn(async (lobbyId: string): Promise<RoomRecovery> => {
      // The database is back for the next look, and the race is recovered then.
      recoveredNext(lobbyId);
      throw new Error("connect ECONNREFUSED");
    });
    const alice = await open("session=alice");
    await watch(alice);
    expect(await nextSnapshot(alice, 2_000)).toMatchObject({ phase: "waiting", revision: 3 });
    logged.mockRestore();
  });

  it("gives up looking after the bounded number of failures", async () => {
    racing("lobby-1");
    const logged = vi.spyOn(console, "error").mockImplementation(() => undefined);
    recoverAbandonedRace = vi.fn(async (): Promise<RoomRecovery> => {
      throw new Error("connect ECONNREFUSED");
    });
    const alice = await open("session=alice");
    await watch(alice);
    await new Promise((resolve) => setTimeout(resolve, 600));
    // 3 looks at most (the injected bound), then nothing more while the database stays down.
    expect(recoverAbandonedRace).toHaveBeenCalledTimes(3);
    // Another watch looks once, without starting the series again.
    const again = await open("session=alice");
    await watch(again);
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(recoverAbandonedRace).toHaveBeenCalledTimes(4);
    logged.mockRestore();
  });

  it("looks again a bounded number of times after a new loss in a room that had given up", async () => {
    racing("lobby-1");
    const logged = vi.spyOn(console, "error").mockImplementation(() => undefined);
    recoverAbandonedRace = vi.fn(async (): Promise<RoomRecovery> => {
      throw new Error("connect ECONNREFUSED");
    });
    const alice = await open("session=alice");
    await watch(alice);
    await new Promise((resolve) => setTimeout(resolve, 600));
    expect(recoverAbandonedRace).toHaveBeenCalledTimes(3);
    events.emit("raceLost", "lobby-1");
    await new Promise((resolve) => setTimeout(resolve, 600));
    expect(recoverAbandonedRace).toHaveBeenCalledTimes(6);
    logged.mockRestore();
  });

  it("keeps the refresh of a loss asked while a look was pending, and ignores a loss in a room nobody follows", async () => {
    racing("lobby-1");
    let calls = 0;
    recoverAbandonedRace = vi.fn(async (): Promise<RoomRecovery> => {
      calls += 1;
      if (calls < 3) {
        return { recovered: false, retryInMs: 50 };
      }
      // The race was saved meanwhile: nothing to recover, but the pages must learn it.
      snapshots.set("lobby-1", { ...snapshotOf("lobby-1"), phase: "results", revision: 5 });
      return { recovered: false };
    });
    const alice = await open("session=alice");
    await watch(alice);
    const told = nextSnapshot(alice, 3_000);
    // The watch's look left a pending look without refresh; the loss asks for one.
    events.emit("raceLost", "lobby-1");
    expect(await told).toMatchObject({ phase: "results", revision: 5 });
    expect(calls).toBe(3);
    events.emit("raceLost", "lobby-2");
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(recoverAbandonedRace).not.toHaveBeenCalledWith("lobby-2");
  });

  it("after a race stopped here without a confirmed end, sends the members what the database holds", async () => {
    const alice = await open("session=alice");
    await watch(alice);
    // The race ended meanwhile (its results were saved): no active race to recover.
    recoverAbandonedRace = vi.fn(async (): Promise<RoomRecovery> => ({ recovered: false }));
    snapshots.set("lobby-1", { ...snapshotOf("lobby-1"), phase: "results", revision: 5 });
    const told = nextSnapshot(alice, 2_000);
    events.emit("raceLost", "lobby-1");
    expect(await told).toMatchObject({ phase: "results", revision: 5 });
  });

  it("does not look again once nobody follows the room", async () => {
    racing("lobby-1");
    let calls = 0;
    recoverAbandonedRace = vi.fn(async (): Promise<RoomRecovery> => {
      calls += 1;
      return { recovered: false, retryInMs: 50 };
    });
    const alice = await open("session=alice");
    await watch(alice);
    alice.close();
    await new Promise((resolve) => setTimeout(resolve, 1_300));
    expect(calls).toBe(1);
  });
});

describe("the races of the room", () => {
  it("tells the races about a tab once its membership is checked, and when it closes", async () => {
    const refused = await open("session=clo");
    await watch(refused, "ABCDEF");
    expect(raceFollows).toEqual([]);
    const alice = await open("session=alice");
    await watch(alice);
    expect(raceFollows).toEqual([{ lobbyId: "lobby-1", id: alice.id, accountId: ALICE }]);
    const id = alice.id;
    alice.close();
    await until(() => raceUnfollows.includes(id ?? ""));
  });

  it("passes the page id of the watch to the races, and refuses one that is not a UUID", async () => {
    const pageId = "4b7f2c1e-3d5a-4e6f-8a9b-0c1d2e3f4a5b";
    const alice = await open("session=alice");
    expect(await alice.timeout(3_000).emitWithAck(ROOM_WATCH_EVENT, { code: "ABCDEF", pageId: "not-a-uuid" })).toEqual({ ok: false, error: "INVALID_PAYLOAD" });
    expect(await alice.timeout(3_000).emitWithAck(ROOM_WATCH_EVENT, { code: "ABCDEF", pageId })).toMatchObject({ ok: true });
    expect(raceFollows.at(-1)).toMatchObject({ id: alice.id, pageId });
  });

  it("answers the watch UNAVAILABLE, and keeps serving, when following the race fails unexpectedly", async () => {
    raceFollowFails.next = true;
    const alice = await open("session=alice");
    expect(await watch(alice)).toEqual({ ok: false, error: "UNAVAILABLE" });
    const bob = await open("session=bob");
    expect(await watch(bob)).toMatchObject({ ok: true });
  });

  it("drops a tab from the races once its member left the room", async () => {
    const bob = await open("session=bob");
    await watch(bob);
    const received = nextSnapshot(bob);
    snapshots.set("lobby-1", { ...snapshotOf("lobby-1"), revision: 2, members: [member("member-a", ALICE, "Alice", true)] });
    events.emit("changed", "lobby-1");
    await received;
    await until(() => raceUnfollows.includes(bob.id ?? ""));
  });
});


describe("guest room watch", () => {
  function admitGuest() {
    const snapshot = snapshotOf("lobby-1");
    snapshots.set("lobby-1", { ...snapshot, members: [...snapshot.members, { memberId: "guest-member", accountId: null, displayName: "Guest", role: "participant", isHost: false }] });
  }

  it("disconnects a departed guest before sending any newer private room snapshot", async () => {
    admitGuest();
    const client = await open("session=guest");
    expect(await watch(client)).toMatchObject({ ok: true });
    await channel.whenIdle();
    const received = vi.fn(); client.on(ROOM_SNAPSHOT_EVENT, received);
    const previous = snapshotOf("lobby-1");
    snapshots.set("lobby-1", { ...previous, revision: previous.revision + 1,
      members: previous.members.filter((member) => member.memberId !== "guest-member") });
    events.emit("changed", "lobby-1");
    await until(() => !client.connected);
    expect(received).not.toHaveBeenCalled();
    expect(presence.onlineMembers("lobby-1").has("guest-member")).toBe(false);
  });

  it("uses guest membership despite a matching account UUID, without leaking the proof", async () => {
    admitGuest();
    const client = await open("session=guest");
    const ack = await watch(client);
    expect(ack).toMatchObject({ ok: true, selfMemberId: "guest-member" });
    expect(ack).toMatchObject({ snapshot: { members: expect.arrayContaining([expect.objectContaining({ memberId: "guest-member", isGuest: true })]) } });
    expect(findActiveMembership).not.toHaveBeenCalled();
    expect(findGuestMembership).toHaveBeenCalledExactlyOnceWith(ALICE);
    expect(readGuest).toHaveBeenCalledExactlyOnceWith({ id: ALICE, secretDigest: "synthetic-digest" });
    expect(JSON.stringify(ack)).not.toContain(ALICE);
    expect(JSON.stringify(ack)).not.toContain("synthetic-digest");
    expect(raceFollows).toMatchObject([{ lobbyId: "lobby-1", accountId: null }]);
  });

  it("keeps one member online until its last tab disconnects", async () => {
    admitGuest();
    const first = await open("session=guest"), second = await open("session=guest");
    await watch(first); await watch(second);
    first.close();
    await until(() => io.sockets.sockets.size === 1);
    expect(presence.onlineMembers("lobby-1").has("guest-member")).toBe(true);
    second.close();
    await until(() => !presence.onlineMembers("lobby-1").has("guest-member"));
  });

  it("reconnects the same member before grace, then refuses it after the last-socket timeout", async () => {
    admitGuest();
    const first = await open("session=guest"); await watch(first); first.close();
    await until(() => !presence.onlineMembers("lobby-1").has("guest-member"));
    graceNow += 29_999;
    const returning = await open("session=guest");
    expect(await watch(returning)).toMatchObject({ ok: true, selfMemberId: "guest-member" });
    returning.close(); await until(() => !presence.onlineMembers("lobby-1").has("guest-member"));
    graceNow += 30_001; guestGrace.changed("lobby-1");
    await until(() => !snapshotOf("lobby-1").members.some((one) => one.memberId === "guest-member"));
    const late = await open("session=guest");
    expect(await watch(late)).toEqual({ ok: false, error: "NOT_A_MEMBER" });
    expect(presence.onlineMembers("lobby-1").has("guest-member")).toBe(false);
  });

  it("does not allow a signed identity to watch a room without membership", async () => {
    findGuestMembership = vi.fn(async () => undefined);
    const client = await open("session=guest");
    expect(await watch(client)).toEqual({ ok: false, error: "NOT_A_MEMBER" });
    expect(readRoomSnapshot).not.toHaveBeenCalled();
  });

  it("revalidates SQL proof before reading membership and disconnects revoked identities", async () => {
    readGuest = vi.fn<GuestSessionReader>(async () => ({ kind: "invalid" }));
    const client = await open("session=guest");
    const disconnected = new Promise<void>((resolve) => client.once("disconnect", () => resolve()));
    client.emit(ROOM_WATCH_EVENT, { code: "ABCDEF" }, () => undefined);
    await disconnected;
    expect(findGuestMembership).not.toHaveBeenCalled();
    expect(readRoomSnapshot).not.toHaveBeenCalled();
  });

  it("bounds SQL revalidations across concurrent tabs, then releases the shared budget", async () => {
    admitGuest();
    let release = () => undefined as void;
    const held = new Promise<void>((resolve) => { release = resolve; });
    readGuest = vi.fn<GuestSessionReader>(async () => { await held; return { kind: "valid", session: { id: ALICE, expiresAt: new Date(Date.now() + 60_000) } }; });
    const a = await open("session=guest"), b = await open("session=guest"), c = await open("session=guest");
    const first = watch(a), second = watch(b);
    await until(() => vi.mocked(readGuest).mock.calls.length === 2);
    expect(await watch(c)).toEqual({ ok: false, error: "RATE_LIMITED" });
    expect(readGuest).toHaveBeenCalledTimes(2);
    release();
    await Promise.all([first, second]);
    expect(await watch(c)).toMatchObject({ ok: true });
  });
});
