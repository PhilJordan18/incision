import type { PublicRoom } from "@incision/database";
import { describe, expect, it, vi } from "vitest";
import { PublicRoomFeed, publicRoomEntry } from "./public-room-feed";

function room(overrides: Partial<PublicRoom> = {}): PublicRoom {
  return { id: "00000000-0000-4000-8000-000000000001", code: "ABCDEF", hostName: "Julie", phase: "waiting", participants: 1, capacity: 30,
    textLanguage: "fr", complexity: "medium", textKind: "coherent", wordCount: 50, arcade: false, createdAt: new Date(0), ...overrides };
}

function harness(rooms: () => PublicRoom[], watched = true) {
  let clock = 0;
  const timers: { at: number; callback: () => void; cancelled: boolean }[] = [];
  const load = vi.fn(async () => rooms());
  const publish = vi.fn();
  const logError = vi.fn();
  const state = { watched };
  const feed = new PublicRoomFeed({ load, publish, logError, watched: () => state.watched, now: () => clock,
    schedule: (callback, delayMs) => { const timer = { at: clock + delayMs, callback, cancelled: false }; timers.push(timer); return () => { timer.cancelled = true; }; },
    throttleMs: 1_000, refreshMs: 15_000 });
  async function advance(ms: number) {
    const until = clock + ms;
    for (;;) {
      const next = timers.filter((timer) => !timer.cancelled && timer.at <= until).sort((a, b) => a.at - b.at)[0];
      if (next === undefined) break;
      clock = next.at; next.cancelled = true; next.callback();
      await vi.waitFor(() => undefined);
      await Promise.resolve();
    }
    clock = until;
  }
  return { feed, load, publish, logError, state, advance };
}

describe("publicRoomEntry", () => {
  it("drops the id and creation time, and says whether a participant can join now", () => {
    const entry = publicRoomEntry(room());
    expect(entry).not.toHaveProperty("id");
    expect(entry).not.toHaveProperty("createdAt");
    expect(entry.joinable).toBe(true);
    expect(publicRoomEntry(room({ phase: "results" })).joinable).toBe(true);
    expect(publicRoomEntry(room({ phase: "racing" })).joinable).toBe(false);
    expect(publicRoomEntry(room({ phase: "countdown" })).joinable).toBe(false);
    expect(publicRoomEntry(room({ participants: 30 })).joinable).toBe(false);
  });
});

describe("PublicRoomFeed (JOIN-02)", () => {
  it("serves new watchers from one read while fresh", async () => {
    const { feed, load } = harness(() => [room()]);
    const [first, second] = await Promise.all([feed.current(), feed.current()]);
    expect(first).toEqual(second);
    await feed.current();
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("throttles many changes into one read and one broadcast", async () => {
    let participants = 1;
    const { feed, load, publish, advance } = harness(() => [room({ participants })]);
    await feed.current();
    for (let change = 0; change < 20; change += 1) { participants += 1; feed.changed(); }
    await advance(999);
    expect(load).toHaveBeenCalledTimes(1);
    await advance(1);
    expect(load).toHaveBeenCalledTimes(2);
    expect(publish).toHaveBeenCalledTimes(1);
    expect(publish.mock.calls[0]?.[0]).toMatchObject([{ participants: 21 }]);
  });

  it("does not broadcast an unchanged list", async () => {
    const { feed, publish, load, advance } = harness(() => [room()]);
    await feed.current();
    feed.changed();
    await advance(1_000);
    expect(load).toHaveBeenCalledTimes(2);
    expect(publish).not.toHaveBeenCalled();
  });

  it("still broadcasts a change that a new watcher's read saw first", async () => {
    let participants = 1;
    const { feed, publish, advance } = harness(() => [room({ participants })]);
    await feed.current();
    await advance(1_500);
    participants = 2;
    feed.changed();
    // Another visitor arrives before the planned broadcast and reads the new list.
    await expect(feed.current()).resolves.toMatchObject([{ participants: 2 }]);
    await advance(1);
    expect(publish).toHaveBeenCalledTimes(1);
    expect(publish.mock.calls[0]?.[0]).toMatchObject([{ participants: 2 }]);
  });

  it("serves a list read less than the throttle ago, so visitors cannot force reads", async () => {
    let participants = 1;
    const { feed, load, publish, advance } = harness(() => [room({ participants })]);
    await feed.current();
    await advance(100);
    participants = 2;
    feed.changed();
    for (let visitor = 0; visitor < 10; visitor += 1) await expect(feed.current()).resolves.toMatchObject([{ participants: 1 }]);
    expect(load).toHaveBeenCalledTimes(1);
    await advance(900);
    expect(load).toHaveBeenCalledTimes(2);
    expect(publish.mock.calls[0]?.[0]).toMatchObject([{ participants: 2 }]);
  });

  it("reads nothing while nobody watches", async () => {
    const { feed, load, advance } = harness(() => [room()], false);
    feed.changed();
    await advance(60_000);
    expect(load).not.toHaveBeenCalled();
  });

  it("refreshes while watched, for changes another process made", async () => {
    let code = "ABCDEF";
    const { feed, publish, advance, state } = harness(() => [room({ code })]);
    await feed.current();
    code = "GHJKMN";
    await advance(15_000);
    expect(publish).toHaveBeenCalledTimes(1);
    state.watched = false;
    code = "PQRSTU";
    await advance(60_000);
    expect(publish).toHaveBeenCalledTimes(1);
  });

  it("keeps serving after a failed read, logging only the error's name", async () => {
    let fail = true;
    const { feed, logError } = harness(() => { if (fail) throw new Error("secret detail"); return [room()]; });
    await expect(feed.current()).rejects.toThrow();
    expect(logError).toHaveBeenCalledWith("[rooms] public room list unavailable: Error");
    fail = false;
    await expect(feed.current()).resolves.toHaveLength(1);
  });

  it("stops scheduling once stopped", async () => {
    const { feed, load, advance } = harness(() => [room()]);
    await feed.current();
    feed.stop();
    feed.changed();
    await advance(60_000);
    expect(load).toHaveBeenCalledTimes(1);
  });
});
