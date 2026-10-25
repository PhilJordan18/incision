import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import type { BrowserContext } from "@playwright/test";
import { Server } from "socket.io";
import type { PublicRoomSnapshot } from "../src/rooms/protocol";
import { raceProgressPayloadSchema, raceRevealPayloadSchema } from "../src/races/protocol";

/** Browser rendering fixture only: validated 4Hz wire data, NOT a runtime/load/SQL proof.
 * Production pages/assets remain real; only Socket.IO is routed to this local test server.
 */
export async function trackFixture(room: PublicRoomSnapshot, count = 30) {
  const http = createServer();
  const io = new Server(http, { transports: ["polling"], cors: { origin: true, credentials: true } });
  await new Promise<void>(resolve => http.listen(0, "127.0.0.1", resolve));
  const address = http.address();
  if (!address || typeof address === "string") throw new Error("No track fixture port");
  const raceId = randomUUID();
  const startsAt = Date.now() - 1000;
  const text = [..."La mer reste calme. ".repeat(50)];
  const entrants = Array.from({ length: count }, (_, i) => ({ entrantId: `runner-${String(i).padStart(2, "0")}`, displayName: i === 15 ? "Capitaine" : `Matelot ${i + 1}` }));
  let revision = 1;
  let step = 0;
  function progress() {
    return raceProgressPayloadSchema.parse({ serverNow: Date.now(), broadcast: { raceId, revision, phase: "racing", startsAt, timeLimit: null,
      entrants: entrants.map((e, i) => ({ entrantId: e.entrantId, kind: i % 4 === 0 ? "bot" : "human", status: i === 29 ? "abandoned" : "racing",
        position: Math.min(95, (i === 15 ? 20 : (i * 13) % 80) + step * 2), length: 100, netWpm: 30 + i, inactive: i === 28 })) } });
  }
  io.on("connection", socket => {
    socket.on("room:watch", (_payload, ack) => {
      const selfEntrantId = socket.handshake.query.spectator === "1" ? null : entrants[15]!.entrantId;
      socket.emit("race:reveal", raceRevealPayloadSchema.parse({ reveal: { raceId, text, errorMode: "mandatory", countdownAt: startsAt - 3000, startsAt, timeLimit: null },
        language: "fr", entrants, selfEntrantId, serverNow: Date.now() }));
      socket.emit("race:progress", progress());
      if (selfEntrantId) socket.emit("race:self", { snapshot: { raceId, entrantId: selfEntrantId, textVersion: 0, target: text, typed: [], pendingError: false,
        ackSeq: 0, status: "racing", counters: { correctInserts: 0, totalInserts: 0 } }, measures: { netWpm: 45, accuracy: 0 }, control: "controlling" });
      ack({ ok: true, selfMemberId: room.members[0]!.memberId, snapshot: { ...room, revision: 1000, phase: "racing", capacity: 30,
        race: { raceId, state: "racing", interruptionReason: null } } });
    });
  });
  return {
    advance() { step++; revision++; io.emit("race:progress", progress()); },
    async route(context: BrowserContext, spectator = false) {
      await context.route("**/socket.io/**", async route => {
        const target = new URL(route.request().url()); target.hostname = "127.0.0.1"; target.port = String(address.port); target.searchParams.set("spectator", spectator ? "1" : "0");
        const response = await route.fetch({ url: target.toString(), headers: { ...await route.request().allHeaders(), cookie: "" } });
        await route.fulfill({ response });
      });
    },
    async close() { await io.close(); },
  };
}
