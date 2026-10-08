import { describe, expect, it } from "vitest";
import { LEASE_TIMING, RaceLease, type LeaseState } from "./race-lease";

/** A monotonic clock and timers that move only when a test says so. */
class FakeTime {
  now = 0;
  #next = 0;
  readonly #timers = new Map<number, { at: number; callback: () => void }>();

  readonly schedule = (callback: () => void, delayMs: number): (() => void) => {
    this.#next += 1;
    const handle = this.#next;
    this.#timers.set(handle, { at: this.now + delayMs, callback });
    return () => this.#timers.delete(handle);
  };

  /** Moves time forward, firing due timers in order, with pending promise callbacks in between. */
  async advance(ms: number): Promise<void> {
    const until = this.now + ms;
    for (;;) {
      const due = [...this.#timers.entries()].filter(([, timer]) => timer.at <= until).sort(([, a], [, b]) => a.at - b.at)[0];
      if (due === undefined) {
        break;
      }
      this.#timers.delete(due[0]);
      this.now = due[1].at;
      due[1].callback();
      await settled();
    }
    this.now = until;
    await settled();
  }

  get pendingTimers(): number {
    return this.#timers.size;
  }
}

const settled = () => new Promise<void>((resolve) => setImmediate(resolve));

type Answer = { resolve: (renewed: boolean) => void; reject: (error: Error) => void };

/** The database's answers to renewals, given by the test one at a time. */
function database() {
  const answers: Answer[] = [];
  let calls = 0;
  let inFlight = 0;
  let maxInFlight = 0;
  const renew = () =>
    new Promise<boolean>((resolve, reject) => {
      calls += 1;
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      answers.push({
        resolve: (renewed) => {
          inFlight -= 1;
          resolve(renewed);
        },
        reject: (error) => {
          inFlight -= 1;
          reject(error);
        },
      });
    });
  return {
    renew,
    /** Answers the oldest pending renewal. */
    answer: async (outcome: boolean | "unreachable") => {
      const next = answers.shift();
      if (next === undefined) {
        throw new Error("No renewal is waiting for an answer");
      }
      if (outcome === "unreachable") {
        next.reject(new Error("connect ECONNREFUSED"));
      } else {
        next.resolve(outcome);
      }
      await settled();
    },
    get calls() {
      return calls;
    },
    get maxInFlight() {
      return maxInFlight;
    },
    get waiting() {
      return answers.length;
    },
  };
}

function setup() {
  const time = new FakeTime();
  const db = database();
  const changes: LeaseState[] = [];
  const lease = new RaceLease({ renew: db.renew, now: () => time.now, schedule: time.schedule, acquiredAt: 0, onChange: (state) => changes.push(state) });
  lease.start();
  return { time, db, lease, changes };
}

describe("RaceLease", () => {
  it("renews every 10 seconds and stays authoritative while the database confirms", async () => {
    const { time, db, lease } = setup();
    for (let round = 1; round <= 6; round += 1) {
      await time.advance(LEASE_TIMING.renewEveryMs);
      expect(db.calls).toBe(round);
      await db.answer(true);
      expect(lease.isAuthoritative()).toBe(true);
    }
  });

  it("stops being authoritative at its local deadline when the database stops answering", async () => {
    const { time, db, lease, changes } = setup();
    await time.advance(LEASE_TIMING.renewEveryMs);
    await db.answer("unreachable");
    // Acquired at 0: the local deadline is 30 s minus the 5 s margin, before the database's own.
    await time.advance(LEASE_TIMING.leaseMs - LEASE_TIMING.safetyMarginMs - LEASE_TIMING.renewEveryMs - 1);
    expect(lease.isAuthoritative()).toBe(true);
    await time.advance(1);
    expect(lease.isAuthoritative()).toBe(false);
    expect(changes).toEqual(["suspended"]);
  });

  it("never has two renewals in flight, and retries every 2 seconds while suspended", async () => {
    const { time, db, lease } = setup();
    await time.advance(LEASE_TIMING.renewEveryMs);
    // The first renewal hangs: no second one is sent meanwhile.
    await time.advance(20_000);
    expect(db.calls).toBe(1);
    expect(lease.state).toBe("suspended");
    await db.answer("unreachable");
    const before = db.calls;
    await time.advance(LEASE_TIMING.retryEveryMs);
    expect(db.calls).toBe(before + 1);
    await db.answer("unreachable");
    await time.advance(LEASE_TIMING.retryEveryMs);
    expect(db.calls).toBe(before + 2);
    expect(db.maxInFlight).toBe(1);
  });

  it("resumes only after the database confirms the same owner and generation", async () => {
    const { time, db, lease, changes } = setup();
    await time.advance(LEASE_TIMING.renewEveryMs);
    await db.answer("unreachable");
    await time.advance(LEASE_TIMING.leaseMs);
    expect(lease.isAuthoritative()).toBe(false);
    // Neon answers again and confirms the lease.
    await time.advance(LEASE_TIMING.retryEveryMs);
    await db.answer(true);
    expect(lease.isAuthoritative()).toBe(true);
    expect(changes).toEqual(["suspended", "held"]);
  });

  it("A loses the database, its lease expires, B takes the race over: A never acts again", async () => {
    const { time, db, lease, changes } = setup();
    await time.advance(LEASE_TIMING.renewEveryMs);
    await db.answer("unreachable");
    await time.advance(LEASE_TIMING.leaseMs);
    expect(lease.isAuthoritative()).toBe(false);
    // Meanwhile B interrupted the race (another generation): A's next renewal is refused.
    await time.advance(LEASE_TIMING.retryEveryMs);
    await db.answer(false);
    expect(lease.state).toBe("lost");
    expect(lease.isAuthoritative()).toBe(false);
    // Nothing is sent any more, and nothing can bring it back.
    const calls = db.calls;
    await time.advance(LEASE_TIMING.leaseMs * 10);
    expect(db.calls).toBe(calls);
    expect(lease.isAuthoritative()).toBe(false);
    expect(changes).toEqual(["suspended", "lost"]);
  });

  it("ignores an answer that arrives after the lease was lost or stopped", async () => {
    const lost = setup();
    await lost.time.advance(LEASE_TIMING.renewEveryMs);
    // The renewal hangs past the suspension limit: the owner gives the race up.
    await lost.time.advance(LEASE_TIMING.maxSuspensionMs + LEASE_TIMING.leaseMs);
    expect(lost.lease.state).toBe("lost");
    // The delayed answer finally says "renewed": the lease stays lost.
    await lost.db.answer(true);
    expect(lost.lease.isAuthoritative()).toBe(false);
    expect(lost.time.pendingTimers).toBe(0);

    const stopped = setup();
    await stopped.time.advance(LEASE_TIMING.renewEveryMs);
    stopped.lease.stop();
    await stopped.db.answer(true);
    expect(stopped.lease.state).toBe("stopped");
    expect(stopped.time.pendingTimers).toBe(0);
  });

  it("extends ownership only up to what a slow renewal proves", async () => {
    const { time, db, lease } = setup();
    await time.advance(LEASE_TIMING.renewEveryMs);
    // Sent at 10 s, answered at 40 s: it proves ownership until 10 + 30 - 5 = 35 s only.
    await time.advance(30_000);
    expect(lease.isAuthoritative()).toBe(false);
    await db.answer(true);
    expect(lease.isAuthoritative()).toBe(false);
    // The next renewal, answered at once, proves it again.
    await time.advance(LEASE_TIMING.retryEveryMs);
    await db.answer(true);
    expect(lease.isAuthoritative()).toBe(true);
  });

  it("gives the race up after a minute without any confirmation", async () => {
    const { time, db, lease, changes } = setup();
    await time.advance(LEASE_TIMING.renewEveryMs);
    await db.answer("unreachable");
    for (let elapsed = 0; elapsed < LEASE_TIMING.leaseMs + LEASE_TIMING.maxSuspensionMs; elapsed += LEASE_TIMING.retryEveryMs) {
      await time.advance(LEASE_TIMING.retryEveryMs);
      if (db.waiting > 0) {
        await db.answer("unreachable");
      }
    }
    expect(lease.state).toBe("lost");
    expect(changes).toEqual(["suspended", "lost"]);
  });
});
