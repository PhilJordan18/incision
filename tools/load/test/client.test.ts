import { EventEmitter } from "node:events";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RaceRevealPayload } from "../../../apps/web/src/races/protocol";

const stub = vi.hoisted(() => ({ ask: vi.fn(), sockets: [] as unknown[] }));
vi.mock("socket.io-client", () => ({
  io: () => {
    const socket = new EventEmitter();
    Object.assign(socket, {
      connect: () => socket.emit("connect"),
      disconnect: () => socket.emit("disconnect"),
      timeout: () => ({ emitWithAck: stub.ask }),
    });
    stub.sockets.push(socket);
    return socket;
  },
}));
import { Client } from "../src/client";

const raceId = "5b20be83-6800-41a2-91a8-b7cb2699ab6c";
function reveal(): RaceRevealPayload {
  return { reveal: { raceId, text: ["a"], errorMode: "mandatory", countdownAt: 0, startsAt: 0, timeLimit: 120000 },
    language: "fr", entrants: [{ entrantId: "runner", displayName: "Runner" }], selfEntrantId: "runner", serverNow: 0 };
}
function applied(seq: number) {
  return { ok: true, result: { outcome: "applied", seq, ackSeq: seq, textVersion: 0 },
    self: { snapshot: { raceId, entrantId: "runner", textVersion: 0, target: ["a"], typed: ["a"], pendingError: false, ackSeq: seq, status: "finished", counters: { correctInserts: 1, totalInserts: 1 } },
      measures: { netWpm: 1, accuracy: 100 }, control: "controlling" } };
}

beforeEach(() => { stub.ask.mockReset(); stub.sockets.length = 0; });
afterEach(() => vi.useRealTimers());

describe("load client", () => {
  it("refuses a remote origin before creating a socket", () => {
    expect(() => new Client({ origin: "https://example.org", cookie: "fixture", spectator: false }, new AbortController().signal)).toThrow();
    expect(stub.sockets).toHaveLength(0);
  });
  it("counts invalid payloads and role mismatches rather than inventing evidence", () => {
    const client = new Client({ origin: "http://127.0.0.1:3420", cookie: "fixture", spectator: true }, new AbortController().signal);
    const socket = stub.sockets[0] as EventEmitter;
    socket.emit("race:reveal", {});
    socket.emit("race:reveal", reveal());
    socket.emit("race:progress", {});
    expect(client.errors).toBe(3);
    expect(client.reveal).toBeUndefined();
    expect(client.progressCount).toBe(0);
    socket.emit("disconnect");
    expect(client.disconnects).toBe(1);
    client.close();
    expect(client.disconnects).toBe(1);
  });
  it("sends actual inserts and counts only applied acknowledgements", async () => {
    const client = new Client({ origin: "http://127.0.0.1:3420", cookie: "fixture", spectator: false }, new AbortController().signal);
    client.reveal = reveal();
    stub.ask.mockResolvedValue(applied(1));
    await client.type(0);
    expect(stub.ask).toHaveBeenCalledExactlyOnceWith("race:batch", { raceId, seq: 1, textVersion: 0, events: [{ type: "insert", grapheme: "a" }] });
    expect(client.acknowledged).toBe(1);
    expect(client.batchLatency.report().count).toBe(1);
    client.close();
  });
  it("fails a refused batch without acknowledging it", async () => {
    const client = new Client({ origin: "http://127.0.0.1:3420", cookie: "fixture", spectator: false }, new AbortController().signal);
    client.reveal = reveal();
    stub.ask.mockResolvedValue({ ok: false, error: "RATE_LIMITED" });
    await expect(client.type(0)).rejects.toThrow("refused");
    expect(client.acknowledged).toBe(0);
    expect(client.errors).toBe(1);
    client.close();
  });
  it("does not send while an acknowledgement is pending", async () => {
    const controller = new AbortController();
    const client = new Client({ origin: "http://127.0.0.1:3420", cookie: "fixture", spectator: false }, controller.signal);
    client.reveal = { ...reveal(), reveal: { ...reveal().reveal, text: ["a", "b"] } };
    let finish: ((value: unknown) => void) | undefined;
    stub.ask.mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
    const typing = client.type(0);
    const handled = typing.catch(() => undefined);
    await vi.waitFor(() => expect(stub.ask).toHaveBeenCalledTimes(1), { timeout: 2_000 });
    await new Promise((resolve) => setTimeout(resolve, 250));
    expect(stub.ask).toHaveBeenCalledTimes(1);
    controller.abort();
    finish?.(applied(1));
    await handled;
    expect(stub.ask).toHaveBeenCalledTimes(1);
    client.close();
  });
});
