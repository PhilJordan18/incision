import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import type { BrowserContext } from "@playwright/test";
import { Server } from "socket.io";
import { asDuration, asEntrantId, asInstant, asRaceId, BONUS_KINDS, createBonusRace, createRandom, type RandomState } from "@incision/domain";
import type { RaceResultRow } from "@incision/database";
import { RaceRuntime, type RaceConnection } from "../src/server/races/race-runtime";
import type { PublicRoomSnapshot } from "../src/rooms/protocol";

export const BONUS_TEXT = "aa bb cc dd ee ff gg hh ii jj";

/** Test-only socket server around the REAL runtime/coordinator. Browser pages and their
 * assets are the production build. Admission, lease, persistence and extension words are
 * explicit doubles here; normal-room E2E separately prove auth, disabled mode and SQL results.
 * No flag, fixture route or enabled-bonus provider is added to the shipped application.
 */
export async function bonusFixture(room: PublicRoomSnapshot, enabled = true) {
  const http = createServer();
  // Polling stays inside Playwright's HTTP routing; no production transport is changed.
  const io = new Server(http, { transports: ["polling"], cors: { origin: true, credentials: true } });
  await new Promise<void>(resolve => http.listen(0, "127.0.0.1", resolve));
  const address = http.address();
  if (address === null || typeof address === "string") throw new Error("No fixture port");
  const origin = `http://127.0.0.1:${address.port}`;
  const raceId = randomUUID();
  const connections = new Map<string, RaceConnection>();
  let runtime: RaceRuntime | undefined;
  let results: readonly RaceResultRow[] = [];
  let commands = 0;
  const won = { won: true, alreadyDone: false } as const;
  const snapshot = (): PublicRoomSnapshot => runtime === undefined ? room : { ...room, revision: room.revision + 1, phase: "racing", race: { raceId, state: "racing", interruptionReason: null } };
  // The actor's three FIFO grants cover all effects, without patching any engine state.
  let seed: RandomState | undefined;
  const candidates = createRandom([1, 2, 3, 4]);
  for (let n = 1; n < 10000; n++) {
    const candidate: RandomState = [candidates.uint32(), candidates.uint32(), candidates.uint32(), candidates.uint32()];
    const random = createRandom(candidate);
    if ([0, 1, 2].every(index => BONUS_KINDS[random.index(3)] === BONUS_KINDS[index])) { seed = candidate; break; }
  }
  if (seed === undefined) throw new Error("No fixture seed");
  const frozenSeed = seed;
  io.on("connection", socket => {
    const memberId = String(socket.handshake.query.member);
    const member = room.members.find(value => value.memberId === memberId);
    if (!member) { socket.disconnect(); return; }
    let connection: RaceConnection | undefined;
    socket.on("room:watch", (payload, ack) => {
      connection = { id: socket.id, accountId: memberId, pageId: payload.pageId,
        emit: (event, value) => { socket.emit(event, value); } };
      connections.set(socket.id, connection);
      runtime?.follow(connection);
      ack({ ok: true, selfMemberId: memberId, snapshot: snapshot() });
    });
    socket.on("race:start", (_payload, ack) => {
      if (!runtime) {
        const created = createBonusRace({ enabled, random: frozenSeed, race: {
          raceId: asRaceId(raceId), now: asInstant(Date.now()), text: BONUS_TEXT, errorMode: "mandatory", timeLimit: asDuration(120000),
          participants: room.members.map(value => ({ entrantId: asEntrantId(value.memberId), kind: "human" })),
        } });
        if (!created.ok) throw new Error(created.reason);
        runtime = new RaceRuntime({ state: created.state, ownership: { raceId, lobbyId: "fixture", ownerId: "fixture", ownerEpoch: 1 },
          entrants: room.members.map(value => ({ entrantId: value.memberId, accountId: value.memberId, displayName: value.displayName })), language: "en",
          store: { beginRacing: async () => won, finalizeRace: async (_owner, rows) => { results = rows; return won; }, interruptOwnRace: async () => won },
          lease: { start: () => {}, stop: () => {}, state: "held", isAuthoritative: () => true, suspendedForMs: () => undefined },
          now: Date.now, schedule: (callback, delay) => { const timer = setTimeout(callback, delay); return () => clearTimeout(timer); },
          followers: () => connections.values(), onSettled: () => {}, log: () => {}, bonusContent: () => ["sea", "port", "sail"],
        });
        runtime.start(); io.emit("room:snapshot", snapshot());
      }
      ack({ ok: true });
    });
    socket.on("race:batch", (payload, ack) => ack(runtime!.keystrokes(connection!, payload)));
    socket.on("race:bonus:activate", (payload, ack) => { commands += 1; ack(runtime!.activateBonus(connection!, payload)); });
    socket.on("race:control", (_payload, ack) => ack({ ok: runtime!.takeControl(connection!) === "ok" }));
    socket.on("disconnect", () => {
      connections.delete(socket.id);
      if (connection) runtime?.unfollow(connection.id, connection.accountId);
    });
  });
  return {
    commands: () => commands,
    results: () => results,
    runtime: () => runtime,
    async route(context: BrowserContext, member: string) {
      const destination = (url: string) => {
        const target = new URL(url); const base = new URL(origin);
        target.hostname = base.hostname; target.port = base.port; target.searchParams.set("member", member);
        return target.toString();
      };
      await context.route("**/socket.io/**", async route => {
        // The fixture identifies its participants explicitly; it has no use for app cookies.
        const response = await route.fetch({ url: destination(route.request().url()), headers: { ...await route.request().allHeaders(), cookie: "" } });
        await route.fulfill({ response });
      });
    },
    async close() {
      if (runtime?.stage === "running") await runtime.shutdown();
      await io.close();
    },
  };
}
