import { GUEST_ACTIVITY_EVENT } from "../../identity/guest-contract";
import { RACE_BONUS_ACTIVATE_EVENT, type BonusActivationAck } from "../../races/bonus-protocol";
import type { Server, Socket } from "socket.io";
import {
  RACE_ABANDON_EVENT,
  RACE_BATCH_EVENT,
  RACE_CONTROL_EVENT,
  RACE_PRESENT_EVENT,
  RACE_START_EVENT,
  type RaceBatchAck,
  type RaceControlAck,
  type RaceEntrantActionAck,
  type RaceStartAck,
} from "../../races/protocol";
import type { RaceService, RoomConnection } from "../races/race-service";
import type { SessionRegistry } from "./session-registry";
import type { GuestCommandGate } from "./guest-command-gate";
import { currentGuestSession, currentSession } from "./socket-server";

export type RaceChannelDependencies = {
  readonly allowedOrigin: string;
  readonly registry: SessionRegistry;
  readonly races: Pick<RaceService, "start" | "keystrokes" | "takeControl" | "present" | "abandon" | "activateBonus">;
  /** The room the socket follows, as the room channel admitted it. */
  readonly followedRoom: (socket: Socket) => string | undefined;
  readonly guestCommands?: GuestCommandGate;
  readonly followedMember?: (socket: Socket) => { readonly lobbyId: string; readonly memberId: string } | undefined;
  readonly now?: () => number;
};

/** `race:start` messages a socket may send per window; a page sends one per click. */
export const START_LIMIT = { maxStarts: 5, windowMs: 10_000 } as const;
/** `race:control` messages a socket may send per window; a page sends one per click. */
export const CONTROL_LIMIT = { maxRequests: 3, windowMs: 10_000 } as const;
/** `race:present` and `race:abandon` messages a socket may send per window, together; one per click. */
export const ENTRANT_ACTION_LIMIT = { maxRequests: 5, windowMs: 10_000 } as const;

/**
 * Race messages over Socket.IO (F-04.0). Every message passes the session guard (SEC-01); the
 * account comes from the session cookie, never from the payload. Keystrokes and control
 * requests are accepted only from a tab that follows its room through the room channel, which
 * checked the membership in the database.
 */
export function registerRaceChannel(io: Server, dependencies: RaceChannelDependencies): void {
  const { now = Date.now } = dependencies;
  io.on("connection", (socket: Socket) => {
    const starts = { windowStart: now(), used: 0 };
    const controls = { windowStart: now(), used: 0 };
    const entrantActions = { windowStart: now(), used: 0 };

    function guestCommand(kind: "batch" | "control" | "present" | "abandon", payload: unknown, acknowledge: (answer: unknown) => void): void {
      const guest = currentGuestSession(socket, dependencies);
      const member = dependencies.followedMember?.(socket);
      const gate = dependencies.guestCommands;
      if (guest === undefined || gate === undefined) { acknowledge({ ok: false, error: "UNAUTHORIZED" }); return; }
      if (member === undefined) { acknowledge({ ok: false, error: "NO_RACE" }); return; }
      const budget = kind === "control" ? controls : entrantActions;
      const limit = kind === "control" ? CONTROL_LIMIT : ENTRANT_ACTION_LIMIT;
      if (kind !== "batch") {
        if (now() - budget.windowStart >= limit.windowMs) { budget.windowStart = now(); budget.used = 0; }
        budget.used += 1;
        if (budget.used > limit.maxRequests) { acknowledge({ ok: false, error: "RATE_LIMITED" }); return; }
      }
      const connection = guestConnectionOf(socket, member.memberId);
      void gate.run<RaceBatchAck | RaceControlAck | RaceEntrantActionAck>({
        proof: guest.proof, ...member,
        alive: () => socket.connected && currentGuestSession(socket, dependencies) !== undefined &&
          dependencies.followedMember?.(socket)?.memberId === member.memberId,
        apply: () => {
          if (kind === "batch") {
            const answer = dependencies.races.keystrokes(connection, payload);
            return { answer, activity: answer.ok && answer.result.outcome === "applied" };
          }
          const answer = kind === "control" ? dependencies.races.takeControl(connection, payload)
            : kind === "present" ? dependencies.races.present(connection, payload) : dependencies.races.abandon(connection, payload);
          return { answer, activity: answer.ok };
        },
      }).then((answer) => {
        acknowledge(answer);
        if (answer.ok && (kind !== "batch" || ("result" in answer && answer.result.outcome === "applied"))) {
          socket.emit(GUEST_ACTIVITY_EVENT, {});
        }
        if (!answer.ok && answer.error === "UNAUTHORIZED") socket.disconnect(true);
      });
    }

    socket.on(RACE_BONUS_ACTIVATE_EVENT, (payload: unknown, acknowledge: unknown) => {
      if (typeof acknowledge !== "function") return;
      const session = currentSession(socket, dependencies);
      if (session === undefined) {
        acknowledge({ ok: false, error: "UNAUTHORIZED" } satisfies BonusActivationAck);
        return;
      }
      if (dependencies.followedRoom(socket) === undefined) {
        acknowledge({ ok: false, error: "NO_RACE" } satisfies BonusActivationAck);
        return;
      }
      acknowledge(dependencies.races.activateBonus(connectionOf(socket, session.accountId), payload));
    });

    socket.on(RACE_START_EVENT, (payload: unknown, acknowledge: unknown) => {
      if (typeof acknowledge !== "function") {
        return;
      }
      const session = currentSession(socket, dependencies);
      if (session === undefined) {
        acknowledge({ ok: false, error: "UNAUTHORIZED" } satisfies RaceStartAck);
        return;
      }
      if (now() - starts.windowStart >= START_LIMIT.windowMs) {
        starts.windowStart = now();
        starts.used = 0;
      }
      starts.used += 1;
      if (starts.used > START_LIMIT.maxStarts) {
        acknowledge({ ok: false, error: "RATE_LIMITED" } satisfies RaceStartAck);
        return;
      }
      void dependencies.races
        .start(connectionOf(socket, session.accountId), payload)
        .catch((): RaceStartAck => ({ ok: false, error: "UNAVAILABLE" }))
        .then((answer) => acknowledge(answer));
    });

    socket.on(RACE_BATCH_EVENT, (payload: unknown, acknowledge: unknown) => {
      if (typeof acknowledge !== "function") {
        return;
      }
      const session = currentSession(socket, dependencies);
      if (session === undefined) {
        guestCommand("batch", payload, (answer) => acknowledge(answer));
        return;
      }
      if (dependencies.followedRoom(socket) === undefined) {
        acknowledge({ ok: false, error: "NO_RACE" } satisfies RaceBatchAck);
        return;
      }
      acknowledge(dependencies.races.keystrokes(connectionOf(socket, session.accountId), payload));
    });

    socket.on(RACE_CONTROL_EVENT, (payload: unknown, acknowledge: unknown) => {
      if (typeof acknowledge !== "function") {
        return;
      }
      const session = currentSession(socket, dependencies);
      if (session === undefined) {
        guestCommand("control", payload, (answer) => acknowledge(answer));
        return;
      }
      if (now() - controls.windowStart >= CONTROL_LIMIT.windowMs) {
        controls.windowStart = now();
        controls.used = 0;
      }
      controls.used += 1;
      if (controls.used > CONTROL_LIMIT.maxRequests) {
        acknowledge({ ok: false, error: "RATE_LIMITED" } satisfies RaceControlAck);
        return;
      }
      if (dependencies.followedRoom(socket) === undefined) {
        acknowledge({ ok: false, error: "NO_RACE" } satisfies RaceControlAck);
        return;
      }
      acknowledge(dependencies.races.takeControl(connectionOf(socket, session.accountId), payload));
    });

    // « Je suis là » (D-17) and the confirmed abandon (COURSE-07): the entrant's own decisions,
    // from any tab of its own that follows the room.
    for (const [event, act] of [
      [RACE_PRESENT_EVENT, dependencies.races.present.bind(dependencies.races)],
      [RACE_ABANDON_EVENT, dependencies.races.abandon.bind(dependencies.races)],
    ] as const) {
      socket.on(event, (payload: unknown, acknowledge: unknown) => {
        if (typeof acknowledge !== "function") {
          return;
        }
        const session = currentSession(socket, dependencies);
        if (session === undefined) {
          guestCommand(event === RACE_PRESENT_EVENT ? "present" : "abandon", payload, (answer) => acknowledge(answer));
          return;
        }
        if (now() - entrantActions.windowStart >= ENTRANT_ACTION_LIMIT.windowMs) {
          entrantActions.windowStart = now();
          entrantActions.used = 0;
        }
        entrantActions.used += 1;
        if (entrantActions.used > ENTRANT_ACTION_LIMIT.maxRequests) {
          acknowledge({ ok: false, error: "RATE_LIMITED" } satisfies RaceEntrantActionAck);
          return;
        }
        if (dependencies.followedRoom(socket) === undefined) {
          acknowledge({ ok: false, error: "NO_RACE" } satisfies RaceEntrantActionAck);
          return;
        }
        acknowledge(act(connectionOf(socket, session.accountId), payload));
      });
    }
  });
}

/** The tab as the races see it: its id and its session's account (the room settings give the text language, F-03.1). */
export function connectionOf(socket: Pick<Socket, "id" | "emit" | "volatile">, accountId: string, pageId?: string): RoomConnection & { readonly accountId: string } {
  return {
    id: socket.id,
    accountId,
    ...(pageId === undefined ? {} : { pageId }),
    emit: (event, payload, options) => void (options?.volatile === true ? socket.volatile.emit(event, payload) : socket.emit(event, payload)),
  };
}

/** Guest members come from the server's validated room watch, never from event payloads. */
export function guestConnectionOf(socket: Pick<Socket, "id" | "emit" | "volatile">, memberId: string, pageId?: string): RoomConnection {
  return { id: socket.id, accountId: null, memberId, ...(pageId === undefined ? {} : { pageId }),
    emit: (event, payload, options) => void (options?.volatile === true ? socket.volatile.emit(event, payload) : socket.emit(event, payload)),
  };
}
