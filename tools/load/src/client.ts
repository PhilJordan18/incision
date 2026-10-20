import { io, type Socket } from "socket.io-client";
import { setTimeout as sleep } from "node:timers/promises";
import {
  raceBatchAckSchema, raceProgressPayloadSchema, raceRevealPayloadSchema,
  type RaceRevealPayload,
} from "../../../apps/web/src/races/protocol";
import { Samples } from "./metrics";
import { roomSnapshotSchema } from "../../../apps/web/src/rooms/protocol";

export class Client {
  readonly socket: Socket;
  readonly batchLatency = new Samples();
  readonly broadcastGaps = new Samples();
  reveal: RaceRevealPayload | undefined;
  progressCount = 0;
  terminal = false;
  resultsPublished = false;
  acknowledged = 0;
  errors = 0;
  disconnects = 0;
  private lastProgress: number | undefined;
  private closing = false;
  private latestRevision = -1;

  constructor(input: { origin: string; cookie: string; spectator: boolean }, readonly signal: AbortSignal) {
    if (!/^http:\/\/127\.0\.0\.1:\d+$/.test(input.origin)) throw new Error("Non-local client target");
    this.socket = io(input.origin, {
      autoConnect: false, transports: ["websocket"], reconnection: false,
      timeout: 10_000, extraHeaders: { origin: input.origin, cookie: input.cookie },
    });
    this.socket.on("race:reveal", (payload: unknown) => {
      const parsed = raceRevealPayloadSchema.safeParse(payload);
      if (!parsed.success || (parsed.data.selfEntrantId === null) !== input.spectator) this.errors++;
      else this.reveal = parsed.data;
    });
    this.socket.on("race:progress", (payload: unknown) => {
      const parsed = raceProgressPayloadSchema.safeParse(payload);
      if (!parsed.success) { this.errors++; return; }
      const broadcast = parsed.data.broadcast;
      if (broadcast.revision < this.latestRevision) { this.errors++; return; }
      this.latestRevision = broadcast.revision;
      const now = performance.now();
      // Gaps while racing only; countdown and idle time are not broadcast latency.
      if (broadcast.phase === "racing") {
        if (this.lastProgress !== undefined) this.broadcastGaps.add(now - this.lastProgress);
        this.lastProgress = now;
        this.progressCount++;
      }
      if (broadcast.phase === "ended") this.terminal = true;
    });
    this.socket.on("room:snapshot", (payload: unknown) => {
      const parsed = roomSnapshotSchema.safeParse(payload);
      if (!parsed.success) this.errors++;
      else if (parsed.data.phase === "results" && parsed.data.race?.state === "finished" &&
          parsed.data.race.raceId === this.reveal?.reveal.raceId) {
        this.resultsPublished = true;
        this.terminal = true;
      }
    });
    this.socket.on("disconnect", () => { if (!this.closing) this.disconnects++; });
    this.socket.on("connect_error", () => { this.errors++; });
  }

  async connect() {
    await new Promise<void>((resolve, reject) => {
      const cleanup = () => {
        this.signal.removeEventListener("abort", aborted);
        this.socket.off("connect", connected);
        this.socket.off("connect_error", failed);
      };
      const connected = () => { cleanup(); resolve(); };
      const failed = () => { cleanup(); reject(new Error("Load client connection failed")); };
      const aborted = () => { cleanup(); reject(new Error("Load run aborted")); };
      if (this.signal.aborted) { aborted(); return; }
      this.signal.addEventListener("abort", aborted, { once: true });
      this.socket.once("connect", connected);
      this.socket.once("connect_error", failed);
      this.socket.connect();
    });
  }

  async ask(event: string, payload: unknown): Promise<unknown> {
    this.signal.throwIfAborted();
    return this.socket.timeout(10_000).emitWithAck(event, payload);
  }

  async type(index: number) {
    await waitFor(() => this.reveal !== undefined, this.signal);
    const reveal = this.reveal!;
    // Server clock decides the countdown. RTT is not subtracted; this starts conservatively late.
    await sleep(Math.max(0, reveal.reveal.startsAt - reveal.serverNow) + 200 + index * 7, undefined, { signal: this.signal });
    let seq = 1;
    for (const grapheme of reveal.reveal.text) {
      const before = performance.now();
      const ack = raceBatchAckSchema.parse(await this.ask("race:batch", {
        raceId: reveal.reveal.raceId, seq, textVersion: 0,
        events: [{ type: "insert", grapheme }],
      }));
      this.batchLatency.add(performance.now() - before);
      if (!ack.ok || ack.result.outcome !== "applied" || ack.result.ackSeq !== seq) {
        this.errors++;
        throw new Error(`Runner ${index}: batch ${seq} refused`);
      }
      this.acknowledged++;
      seq++;
      // 6.5–8 batches/s, one in flight; no catch-up burst after a slow response.
      await sleep(125 + (index % 5) * 7, undefined, { signal: this.signal });
    }
  }

  close() {
    this.closing = true;
    this.socket.disconnect();
    this.socket.removeAllListeners();
  }
}

export async function waitFor(predicate: () => boolean, signal: AbortSignal) {
  const deadline = performance.now() + 15_000;
  while (!predicate()) {
    if (performance.now() >= deadline) throw new Error("Load observation timeout");
    await sleep(50, undefined, { signal });
  }
}
