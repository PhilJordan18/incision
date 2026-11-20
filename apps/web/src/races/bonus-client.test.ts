import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { BonusClient } from "./bonus-client";
import type { BonusActivationPayload, BonusSelf } from "./bonus-protocol";

const RACE = "6f1d2c3b-4a5e-4f60-8a7b-9c8d7e6f5a4b";
const OTHER = "af1d2c3b-4a5e-4f60-8a7b-9c8d7e6f5a4b";
const snapshot = (change: Partial<BonusSelf> = {}): BonusSelf => ({
  raceId: RACE, revision: 1, ackSeq: 0, enabled: true, grants: [{ milestone: 25, kind: "shortenSelf" }], fog: null, ...change,
});
const receipt = { id: `${RACE}:actor:25`, grant: { entrantId: "actor", milestone: 25, kind: "shortenSelf" }, targetId: "actor", at: 100 };
const ack = () => ({ ok: true, result: { ok: true, seq: 1, receipt }, self: snapshot({ revision: 2, ackSeq: 1, grants: [] }) });
const clients: BonusClient[] = [];
function setup(send: (command: BonusActivationPayload) => Promise<unknown> = async () => ack()) {
  const client = new BonusClient({ serverNow: () => Date.now(), schedule: (callback, delay) => {
    const timer = setTimeout(callback, delay);
    return () => clearTimeout(timer);
  } });
  clients.push(client);
  client.begin({ raceId: RACE, entrantId: "actor" });
  client.connect({ send });
  client.context({ controlling: true, racing: true });
  return client;
}
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(100); });
afterEach(() => { clients.splice(0).forEach(client => client.dispose()); vi.useRealTimers(); });

it("waits for authoritative self, selects FIFO and never optimistically consumes", async () => {
  const send = vi.fn(async () => ack());
  const client = setup(send);
  expect(client.activate()).toBe(false);
  client.self(snapshot());
  expect(client.activate()).toBe(true);
  expect(client.activate()).toBe(false);
  expect(client.getState().self?.grants).toHaveLength(1);
  await vi.advanceTimersByTimeAsync(0);
  expect(send).toHaveBeenCalledExactlyOnceWith({ raceId: RACE, seq: 1, milestone: 25 });
  expect(client.getState()).toMatchObject({ sending: false, pending: undefined, self: { ackSeq: 1, grants: [] }, reply: { ok: true } });
});

it("replays the same lost intent after fresh reconnect state, not the next grant", async () => {
  const send = vi.fn< (command: BonusActivationPayload) => Promise<unknown> >().mockImplementationOnce(() => new Promise(() => {})).mockResolvedValue(ack());
  const client = setup(send);
  client.self(snapshot()); client.activate();
  await vi.advanceTimersByTimeAsync(3000);
  expect(client.getState().error).toBe("ACK_TIMEOUT");
  client.disconnect(); client.connect({ send });
  expect(client.activate()).toBe(false);
  client.self(snapshot({ revision: 2, ackSeq: 1, grants: [{ milestone: 50, kind: "fogLeader" }] }));
  expect(client.activate()).toBe(true);
  await vi.advanceTimersByTimeAsync(0);
  expect(send.mock.calls[1][0]).toEqual(send.mock.calls[0][0]);
  expect(client.getState().pending).toBeUndefined();
});

it("does not spin on transport refusals or advance their sequence", async () => {
  const send = vi.fn(async () => ({ ok: false, error: "RATE_LIMITED" }));
  const client = setup(send); client.self(snapshot()); client.activate();
  await vi.advanceTimersByTimeAsync(60_000);
  expect(send).toHaveBeenCalledTimes(1);
  expect(client.getState()).toMatchObject({ error: "RATE_LIMITED", pending: { seq: 1 }, self: { ackSeq: 0 } });
  client.activate(); await vi.advanceTimersByTimeAsync(0);
  expect(send.mock.calls).toHaveLength(2);
});

it("an acknowledged domain refusal keeps the grant but the next intentional try uses the next seq", async () => {
  const send = vi.fn(async (command: BonusActivationPayload) => ({ ok: true,
    result: { ok: false, seq: command.seq, reason: "CONTENT_UNAVAILABLE" },
    self: snapshot({ revision: command.seq + 1, ackSeq: command.seq }),
  }));
  const client = setup(send); client.self(snapshot()); client.activate();
  await vi.advanceTimersByTimeAsync(0);
  expect(client.getState()).toMatchObject({ pending: undefined, error: "CONTENT_UNAVAILABLE" });
  expect(client.getState().self?.grants).toHaveLength(1);
  client.activate(); await vi.advanceTimersByTimeAsync(0);
  expect(send.mock.calls[1][0].seq).toBe(2);
});

it.each([null, {}, { ...snapshot(), raceId: OTHER }, snapshot({ revision: 0 }), snapshot({ grants: [
  { milestone: 50, kind: "shortenSelf" }, { milestone: 25, kind: "fogLeader" },
] }), snapshot({ fog: { startsAt: 300, expiresAt: 200 } })])("ignores invalid/stale self %j", payload => {
  const client = setup(); client.self(snapshot()); const before = client.getState(); client.self(payload);
  expect(client.getState()).toBe(before);
});

it.each([null, { ...ack(), result: { ok: true, seq: 2, receipt } }, { ...ack(), self: snapshot({ raceId: OTHER, revision: 2, ackSeq: 1 }) },
  { ...ack(), self: snapshot({ ackSeq: 0 }) },
  { ...ack(), result: { ok: true, seq: 1, receipt: { ...receipt, grant: { ...receipt.grant, entrantId: "other" } } } },
])("retains the intent after invalid acknowledgement %j", async value => {
  const client = setup(async () => value); client.self(snapshot()); client.activate();
  await vi.advanceTimersByTimeAsync(0);
  expect(client.getState()).toMatchObject({ error: "INVALID_RESPONSE", pending: { seq: 1 }, self: { ackSeq: 0 } });
});

it("uses a fresh server cursor after OUT_OF_ORDER and discards an intent superseded by another tab", async () => {
  const send = vi.fn(async () => ({ ok: true, result: { ok: false, seq: 1, reason: "OUT_OF_ORDER" },
    self: snapshot({ revision: 4, ackSeq: 3 }),
  }));
  const client = setup(send); client.self(snapshot()); client.activate(); await vi.advanceTimersByTimeAsync(0);
  expect(client.getState()).toMatchObject({ pending: undefined, error: "OUT_OF_ORDER", self: { ackSeq: 3 } });
  client.activate(); await vi.advanceTimersByTimeAsync(0);
  expect(send.mock.calls[1]).toEqual([{ raceId: RACE, seq: 4, milestone: 25 }]);
});

it("does not let a delayed private snapshot roll back the cursor", () => {
  const client = setup(); client.self(snapshot({ revision: 3, ackSeq: 2 }));
  const state = client.getState(); client.self(snapshot({ revision: 4, ackSeq: 1 }));
  expect(client.getState()).toBe(state);
});

it("uses corrected server-clock offset without creating historical announcements", () => {
  const client = setup(); client.self(snapshot({ fog: { startsAt: 100, expiresAt: 3100 } }));
  vi.setSystemTime(4000); client.clockChanged();
  expect(client.getState().fogVisible).toBe(false);
  expect(client.getState().announcements).toEqual([]);
  expect(vi.getTimerCount()).toBe(0);
});

it("ignores old asynchronous answers after a race switch", async () => {
  let answer: (value: unknown) => void = () => {};
  const client = setup(() => new Promise(resolve => { answer = resolve; }));
  client.self(snapshot()); client.activate(); await vi.advanceTimersByTimeAsync(0);
  client.begin({ raceId: OTHER, entrantId: "actor" }); answer(ack());
  await vi.advanceTimersByTimeAsync(0);
  expect(client.getState().self).toBeUndefined();
  expect(client.getState().pending).toBeUndefined();
  expect(client.getState().sending).toBe(false);
});

it("cancels on control loss, requires resync, and cancels permanently on terminal phase", async () => {
  const send = vi.fn(async () => ack()); const client = setup(send); client.self(snapshot()); client.activate();
  client.context({ controlling: false, racing: true }); await vi.advanceTimersByTimeAsync(0);
  expect(send).not.toHaveBeenCalled(); expect(client.activate()).toBe(false);
  client.context({ controlling: true, racing: true }); expect(client.activate()).toBe(false);
  client.self(snapshot()); expect(client.activate()).toBe(true);
  client.context({ controlling: true, racing: false }); await vi.advanceTimersByTimeAsync(0);
  expect(send).not.toHaveBeenCalled(); expect(client.getState().pending).toBeUndefined();
});

it("handles throwing transports, disabled state, sequence exhaustion and spectators", async () => {
  const client = setup(() => { throw new Error("socket gone"); });
  client.self(snapshot({ enabled: false })); expect(client.activate()).toBe(false);
  client.self(snapshot({ revision: 2 })); client.activate(); await vi.advanceTimersByTimeAsync(0);
  expect(client.getState().error).toBe("OFFLINE");
  client.begin({ raceId: RACE, entrantId: null }); client.connect({ send: async () => ack() });
  client.context({ controlling: true, racing: true }); client.self(snapshot()); expect(client.activate()).toBe(false);
  const exhausted = setup(); exhausted.self(snapshot({ ackSeq: Number.MAX_SAFE_INTEGER }));
  expect(exhausted.activate()).toBe(false);
});

it("expires fog on server time and disposes its timer and subscriptions", async () => {
  const client = setup(); const listener = vi.fn(); client.subscribe(listener);
  client.self(snapshot({ fog: { startsAt: 100, expiresAt: 3100 } }));
  expect(client.getState().fogVisible).toBe(true);
  await vi.advanceTimersByTimeAsync(2999); expect(client.getState().fogVisible).toBe(true);
  await vi.advanceTimersByTimeAsync(1); expect(client.getState().fogVisible).toBe(false);
  client.self(snapshot({ revision: 2, fog: { startsAt: 3200, expiresAt: 6200 } }));
  expect(client.getState().fogVisible).toBe(false);
  await vi.advanceTimersByTimeAsync(100); expect(client.getState().fogVisible).toBe(true);
  client.dispose(); const count = listener.mock.calls.length;
  await vi.advanceTimersByTimeAsync(10_000);
  expect(listener).toHaveBeenCalledTimes(count); expect(vi.getTimerCount()).toBe(0);
});

it("restores fog when the bonus snapshot arrives before the resumed racing phase", async () => {
  const client = setup(); client.context({ controlling: true, racing: false });
  client.self(snapshot({ fog: { startsAt: 100, expiresAt: 3100 } }));
  expect(client.getState().fogVisible).toBe(false);
  client.context({ controlling: true, racing: true });
  expect(client.getState().fogVisible).toBe(true);
  await vi.advanceTimersByTimeAsync(3000);
  expect(client.getState().fogVisible).toBe(false);
});

it.each([{ controlling: false, racing: true }, { controlling: true, racing: false }])(
  "a fresh inventory does not authorize inactive context %j", context => {
    const client = setup(); client.context(context); client.self(snapshot());
    expect(client.getState().synchronized).toBe(true);
    expect(client.activate()).toBe(false);
  },
);

it("deduplicates same-revision announcements, isolates public and self revisions, bounds history", () => {
  const client = setup(); client.self(snapshot({ revision: 100 }));
  const fact = { raceId: RACE, revision: 100, announcement: { type: "activated", receipt } };
  client.announce(fact); client.announce(fact);
  expect(client.getState().announcements).toHaveLength(1);
  client.announce({ ...fact, raceId: OTHER });
  client.announce({ ...fact, revision: 99, announcement: { type: "fogExpired", id: `${RACE}:expired`, entrantId: "actor", at: 100 } });
  expect(client.getState().announcements).toHaveLength(1);
  for (let index = 0; index < 200; index++) client.announce({ ...fact, announcement: {
    type: "fogExpired", id: `${RACE}:${index}:expired`, entrantId: "actor", at: 100,
  } });
  expect(client.getState().announcements).toHaveLength(180);
  client.disconnect(); client.connect({ send: async () => ack() }); client.announce(fact);
  expect(client.getState().announcements).toHaveLength(180);
});
