import type { GuestSessionReader } from "./human-handshake";
import type { EventEmitter } from "node:events";
import { describeDatabaseError, type ActiveMembership, type RoomRecovery, type RoomSnapshot } from "@incision/database";
import { humanSubjectKey, type HumanSubject, parseRoomCode, type RoomPhase } from "@incision/domain";
import type { Server, Socket } from "socket.io";
import { ROOM_SNAPSHOT_EVENT, ROOM_WATCH_EVENT, type RoomWatchAck, roomWatchPayloadSchema, WATCH_LIMIT } from "../../rooms/protocol";
import { publicSnapshot } from "../../rooms/public-snapshot";
import type { RaceService } from "../races/race-service";
import type { RoomEvents } from "../rooms/room-events";
import { connectionOf } from "./race-channel";
import type { RoomPresence } from "./room-presence";
import type { SessionRegistry } from "./session-registry";
import { currentGuestSession, currentSession } from "./socket-server";

export type RoomChannelDependencies = {
  readonly allowedOrigin: string;
  readonly registry: SessionRegistry;
  readonly presence: RoomPresence;
  /** Committed membership changes, emitted by the server actions. */
  readonly events: EventEmitter<RoomEvents>;
  readonly findActiveMembership: (accountId: string) => Promise<ActiveMembership | undefined>;
  readonly findGuestMembership?: (guestSessionId: string) => Promise<ActiveMembership | undefined>;
  readonly readGuest?: GuestSessionReader;
  readonly readRoomSnapshot: (lobbyId: string) => Promise<RoomSnapshot | undefined>;
  /** Recovery of races nobody runs any more (ADR-0004); both parts together, or none. */
  readonly raceRecovery?: {
    /** `recoverRoomIfAbandoned`: recovers the room's race once its owner stopped renewing. */
    readonly recover: (lobbyId: string) => Promise<RoomRecovery>;
    /** Whether this process runs the room's race; such a race is never recovered here. */
    readonly ownsRace: (lobbyId: string) => boolean;
  };
  /** The races this process runs: told which tabs follow which room, once the membership is checked. */
  readonly races?: Pick<RaceService, "follow" | "unfollow">;
  /** Looks at a room whose race lost its end while the database fails: how often, how many times. */
  readonly recoveryTiming?: { readonly failedLookRetryMs: number; readonly maxFailedLooks: number };
  readonly now?: () => number;
};

/** What the server needs from the channel when it stops. */
export type RoomChannel = {
  /** Resolves once every broadcast under way has gone out. */
  readonly whenIdle: () => Promise<void>;
};

/**
 * Watches one account may have in progress at once, across all its sockets: many sockets
 * of one account cannot hold more of the database pool than this.
 */
export const ACCOUNT_WATCHES_IN_FLIGHT = 2;

type WatchedRoom = {
  readonly lobbyId: string;
  readonly memberId: string;
  /**
   * Revision of the snapshot that admitted the socket; Infinity while its watch reads it.
   * Only a snapshot at least this new can show that the member left.
   */
  readonly since: number;
};
type WatchBudget = { startedAt: number; used: number; inFlight: boolean };

const channelOf = (lobbyId: string) => `lobby:${lobbyId}`;

/**
 * Realtime presence of rooms (CP-06). A socket watches the room of its own session only:
 * the account comes from the session cookie and membership from the database, never from
 * the payload or `socket.id`. Members get a fresh snapshot after every committed change
 * and whenever someone's connection comes or goes.
 */
export function registerRoomChannel(io: Server, dependencies: RoomChannelDependencies): RoomChannel {
  const { presence, events, now = Date.now } = dependencies;
  // One snapshot read per room at a time; changes during a read trigger one more read.
  const broadcasting = new Map<string, { again: boolean; done: Promise<void> }>();
  const watchesInFlight = new Map<string, number>();
  // Newest revision broadcast per followed room, to catch a watch that read an older one.
  const lastBroadcast = new Map<string, number>();

  function scheduleBroadcast(lobbyId: string): void {
    const running = broadcasting.get(lobbyId);
    if (running !== undefined) {
      running.again = true;
      return;
    }
    const state = { again: false, done: Promise.resolve() };
    broadcasting.set(lobbyId, state);
    state.done = (async () => {
      try {
        do {
          state.again = false;
          await broadcast(lobbyId);
        } while (state.again);
      } finally {
        broadcasting.delete(lobbyId);
      }
    })();
  }

  async function broadcast(lobbyId: string): Promise<void> {
    if ((io.sockets.adapter.rooms.get(channelOf(lobbyId))?.size ?? 0) === 0) {
      lastBroadcast.delete(lobbyId);
      return;
    }
    let snapshot: RoomSnapshot | undefined;
    try {
      snapshot = await dependencies.readRoomSnapshot(lobbyId);
    } catch (error: unknown) {
      console.error("[rooms] snapshot broadcast failed:", describeDatabaseError(error));
      return;
    }
    if (snapshot === undefined) {
      return;
    }
    const members = new Set(snapshot.members.map((member) => member.memberId));
    // Everyone following the room gets the snapshot, including the members who just left
    // or whose room closed: that is how their pages learn it. Then they stop following.
    io.to(channelOf(lobbyId)).emit(ROOM_SNAPSHOT_EVENT, publicSnapshot(snapshot, presence.onlineMembers(lobbyId)));
    lastBroadcast.set(lobbyId, Math.max(snapshot.revision, lastBroadcast.get(lobbyId) ?? -1));
    for (const socket of await io.in(channelOf(lobbyId)).fetchSockets()) {
      const watched = watchedRoomOf(socket.data);
      // A read that started before this member joined must not drop its socket.
      if (watched?.lobbyId === lobbyId && !members.has(watched.memberId) && snapshot.revision >= watched.since) {
        socket.leave(channelOf(lobbyId));
        presence.remove(lobbyId, watched.memberId, socket.id);
        socket.data.room = undefined;
        dependencies.races?.unfollow(socket.id);
      }
    }
  }

  events.on("changed", scheduleBroadcast);
  const recovery = recoveryOnWatch(dependencies, {
    scheduleBroadcast,
    followed: (lobbyId) => (io.sockets.adapter.rooms.get(channelOf(lobbyId))?.size ?? 0) > 0,
  });
  events.on("raceLost", recovery.afterLoss);

  io.on("connection", (socket: Socket) => {
    const budget: WatchBudget = { startedAt: now(), used: 0, inFlight: false };

    socket.on(ROOM_WATCH_EVENT, (payload: unknown, acknowledge: unknown) => {
      if (typeof acknowledge !== "function") {
        return;
      }
      if (now() - budget.startedAt >= WATCH_LIMIT.windowMs) {
        budget.startedAt = now();
        budget.used = 0;
      }
      budget.used += 1;
      if (budget.used > WATCH_LIMIT.maxWatches) {
        // Beyond any page's needs: the socket is cut, and the page shows that its session
        // ended (a server disconnect is not retried by the client).
        socket.disconnect(true);
        return;
      }
      if (budget.inFlight) {
        acknowledge({ ok: false, error: "RATE_LIMITED" } satisfies RoomWatchAck);
        return;
      }
      budget.inFlight = true;
      void watchAsHuman(socket, payload)
        .catch((): RoomWatchAck => ({ ok: false, error: "UNAVAILABLE" }))
        .then((answer) => acknowledge(answer))
        .finally(() => { budget.inFlight = false; });
    });

    socket.on("disconnect", () => {
      dependencies.races?.unfollow(socket.id);
      const watched = watchedRoomOf(socket.data);
      if (watched !== undefined && presence.remove(watched.lobbyId, watched.memberId, socket.id)) {
        scheduleBroadcast(watched.lobbyId);
      }
    });
  });

  async function watchAsHuman(socket: Socket, payload: unknown): Promise<RoomWatchAck> {
    const account = currentSession(socket, dependencies);
    const guest = account === undefined ? currentGuestSession(socket, dependencies) : undefined;
    const subject: HumanSubject | undefined = account !== undefined
      ? { kind: "account", accountId: account.accountId }
      : guest === undefined ? undefined : { kind: "guest", guestSessionId: guest.proof.id };
    if (subject === undefined) return { ok: false, error: "UNAUTHORIZED" };
    // Reserve the shared budget before any SQL, including guest proof revalidation.
    const key = humanSubjectKey(subject);
    const inFlight = watchesInFlight.get(key) ?? 0;
    if (inFlight >= ACCOUNT_WATCHES_IN_FLIGHT) return { ok: false, error: "RATE_LIMITED" };
    watchesInFlight.set(key, inFlight + 1);
    try {
      if (guest !== undefined) {
        if (dependencies.readGuest === undefined || dependencies.findGuestMembership === undefined) {
          return { ok: false, error: "UNAUTHORIZED" };
        }
        const verified = await dependencies.readGuest(guest.proof);
        if (verified.kind !== "valid" || verified.session.id !== guest.proof.id ||
          !Number.isFinite(verified.session.expiresAt.getTime()) || verified.session.expiresAt.getTime() <= now()) {
          socket.disconnect(true);
          return { ok: false, error: "UNAUTHORIZED" };
        }
        dependencies.registry.refreshGuest(verified.session.id, verified.session.expiresAt.getTime());
        if (!socket.connected || currentGuestSession(socket, dependencies) === undefined) {
          return { ok: false, error: "UNAUTHORIZED" };
        }
      }
      return await watch(socket, payload, subject);
    } finally {
      const left = (watchesInFlight.get(key) ?? 1) - 1;
      if (left > 0) watchesInFlight.set(key, left); else watchesInFlight.delete(key);
    }
  }

  function follow(socket: Socket, room: WatchedRoom): boolean {
    const previous = watchedRoomOf(socket.data);
    if (previous !== undefined && (previous.lobbyId !== room.lobbyId || previous.memberId !== room.memberId)) {
      unfollow(socket, previous);
    }
    socket.data.room = room;
    void socket.join(channelOf(room.lobbyId));
    return presence.add(room.lobbyId, room.memberId, socket.id);
  }

  /** Stops following; the others learn it if this was the member's last socket. */
  function unfollow(socket: Socket, room: Omit<WatchedRoom, "since">): void {
    void socket.leave(channelOf(room.lobbyId));
    socket.data.room = undefined;
    dependencies.races?.unfollow(socket.id);
    if (presence.remove(room.lobbyId, room.memberId, socket.id)) {
      scheduleBroadcast(room.lobbyId);
    }
  }

  /** Follows the room of `accountId`, whose session the caller has just checked. */
  async function watch(socket: Socket, payload: unknown, subject: HumanSubject): Promise<RoomWatchAck> {
    const parsed = roomWatchPayloadSchema.safeParse(payload);
    const code = parsed.success ? parseRoomCode(parsed.data.code) : undefined;
    if (code === undefined || !code.ok) {
      return { ok: false, error: "INVALID_PAYLOAD" };
    }
    let membership: ActiveMembership | undefined;
    try {
      membership = await (subject.kind === "account" ? dependencies.findActiveMembership(subject.accountId) : dependencies.findGuestMembership?.(subject.guestSessionId));
    } catch (error: unknown) {
      console.error("[rooms] membership check failed:", describeDatabaseError(error));
      return { ok: false, error: "UNAVAILABLE" };
    }
    // The socket may have closed meanwhile: its disconnect handler has already run.
    if (!socket.connected) {
      return { ok: false, error: "UNAVAILABLE" };
    }
    if (membership === undefined || membership.code !== code.code) {
      return { ok: false, error: "NOT_A_MEMBER" };
    }
    if (subject.kind === "guest" && currentGuestSession(socket, dependencies) === undefined) {
      return { ok: false, error: "UNAUTHORIZED" };
    }
    // Follow before reading, so no change between the read and the join is missed.
    const room = { lobbyId: membership.lobbyId, memberId: membership.memberId };
    const cameOnline = follow(socket, { ...room, since: Number.POSITIVE_INFINITY });
    let snapshot: RoomSnapshot | undefined;
    try {
      snapshot = await dependencies.readRoomSnapshot(room.lobbyId);
    } catch (error: unknown) {
      console.error("[rooms] snapshot read failed:", describeDatabaseError(error));
    }
    if (snapshot === undefined || !snapshot.members.some((member) => member.memberId === room.memberId)) {
      if (socket.connected) {
        unfollow(socket, room);
      }
      return { ok: false, error: snapshot === undefined ? "UNAVAILABLE" : "NOT_A_MEMBER" };
    }
    if (subject.kind === "guest" && (!socket.connected || currentGuestSession(socket, dependencies) === undefined)) {
      return { ok: false, error: "UNAUTHORIZED" };
    }
    if (socket.connected) {
      socket.data.room = { ...room, since: snapshot.revision } satisfies WatchedRoom;
      // A member now: the race run here, if any, reaches this tab.
      if (subject.kind === "account") dependencies.races?.follow(room.lobbyId, connectionOf(socket, subject.accountId, parsed.data?.pageId));
    }
    await recovery.onWatch(room.lobbyId, snapshot.phase);
    // A broadcast newer than this read went out meanwhile and skipped this socket: one more
    // tells it (and drops it if the member left in between).
    if (cameOnline || (lastBroadcast.get(room.lobbyId) ?? -1) > snapshot.revision) {
      scheduleBroadcast(room.lobbyId);
    }
    return {
      ok: true,
      selfMemberId: room.memberId,
      snapshot: publicSnapshot(snapshot, presence.onlineMembers(room.lobbyId)),
    };
  }

  return {
    whenIdle: async () => {
      while (broadcasting.size > 0) {
        await Promise.all([...broadcasting.values()].map((state) => state.done));
      }
    },
  };
}

/**
 * Recovery of a race nobody runs any more, when a member watches its room, or when this process
 * stopped running it without a confirmed end (ADR-0004); while the database does not answer, the
 * room is looked at again about every 5 s, 24 times at most until a look succeeds. Inside
 * the watch, so within its budget; only in an active phase and for a race this process does
 * not run. A recovered room is broadcast: every member learns that the race was interrupted.
 * While the lease still runs (its owner may be gone, or alive elsewhere), the room is looked at
 * again when it ends, one pending look per room, and only while someone follows it: a live
 * owner elsewhere costs one read per lease period, an empty room none.
 */
function recoveryOnWatch(
  dependencies: RoomChannelDependencies,
  room: { readonly scheduleBroadcast: (lobbyId: string) => void; readonly followed: (lobbyId: string) => boolean },
) {
  const retryMs = dependencies.recoveryTiming?.failedLookRetryMs ?? FAILED_LOOK_RETRY_MS;
  const maxFailedLooks = dependencies.recoveryTiming?.maxFailedLooks ?? MAX_FAILED_LOOKS;
  const lookAgain = new Map<string, { readonly timer: NodeJS.Timeout; refresh: boolean }>();
  /**
   * Failed looks per room, bounded, then given up. Kept until a look succeeds or a race of the
   * room is lost here, so that watches cannot start the series again; dropped too when a pending
   * look finds that nobody follows the room any more (the next watch then starts a new series).
   */
  const failures = new Map<string, number>();
  const later = (lobbyId: string, delayMs: number, refresh: boolean) => {
    const pending = lookAgain.get(lobbyId);
    if (pending !== undefined) {
      // One pending look per room; a refresh asked meanwhile is kept.
      pending.refresh ||= refresh;
      return;
    }
    const timer = setTimeout(() => {
      const next = lookAgain.get(lobbyId);
      lookAgain.delete(lobbyId);
      if (room.followed(lobbyId)) {
        void recover(lobbyId, next?.refresh ?? refresh);
      } else {
        failures.delete(lobbyId);
      }
    }, delayMs);
    timer.unref();
    lookAgain.set(lobbyId, { timer, refresh });
  };
  /** `refresh`: the members' pages may show an end the database never confirmed; send them what it holds. */
  const recover = async (lobbyId: string, refresh: boolean): Promise<void> => {
    const recovery = dependencies.raceRecovery;
    if (recovery === undefined || recovery.ownsRace(lobbyId)) {
      return;
    }
    try {
      const outcome = await recovery.recover(lobbyId);
      failures.delete(lobbyId);
      if (outcome.recovered) {
        room.scheduleBroadcast(lobbyId);
      } else if (outcome.retryInMs !== undefined) {
        later(lobbyId, outcome.retryInMs + LOOK_AGAIN_MARGIN_MS, refresh);
      } else if (refresh) {
        // No active race any more (saved or interrupted meanwhile): the pages learn which.
        room.scheduleBroadcast(lobbyId);
      }
    } catch (error: unknown) {
      console.error("[races] recovery on watch failed:", describeDatabaseError(error));
      const failed = (failures.get(lobbyId) ?? 0) + 1;
      failures.set(lobbyId, failed);
      if (failed < maxFailedLooks) {
        // Jittered, so that the rooms of one outage do not look in lockstep.
        later(lobbyId, retryMs * (0.8 + 0.4 * Math.random()), refresh);
      }
    }
  };
  return {
    onWatch: async (lobbyId: string, phase: RoomPhase): Promise<void> => {
      if (phase === "countdown" || phase === "racing") {
        await recover(lobbyId, false);
      }
    },
    /**
     * A race stopped here without a confirmed end: its room is looked at until the database holds
     * one, with a new bounded series (a loss comes from this process, never from a client).
     */
    afterLoss: (lobbyId: string): void => {
      if (room.followed(lobbyId)) {
        failures.delete(lobbyId);
        void recover(lobbyId, true);
      }
    },
  };
}

/** While the database does not answer, the room is looked at again this often, this many times. */
const FAILED_LOOK_RETRY_MS = 5_000;
const MAX_FAILED_LOOKS = 24;

/** After the lease's end on the database clock, a margin for the clocks and the last renewal. */
const LOOK_AGAIN_MARGIN_MS = 1_000;

/** The room a socket follows, once the room channel admitted it. */
export function followedRoom(socket: Pick<Socket, "data">): string | undefined {
  return watchedRoomOf(socket.data)?.lobbyId;
}

function watchedRoomOf(data: unknown): WatchedRoom | undefined {
  if (typeof data !== "object" || data === null || !("room" in data)) {
    return undefined;
  }
  const { room } = data;
  return typeof room === "object" &&
    room !== null &&
    "lobbyId" in room &&
    typeof room.lobbyId === "string" &&
    "memberId" in room &&
    typeof room.memberId === "string" &&
    "since" in room &&
    typeof room.since === "number"
    ? { lobbyId: room.lobbyId, memberId: room.memberId, since: room.since }
    : undefined;
}
