# ADR-0004 — A fenced lease for the process that runs a race

- Status: **accepted**, October 8, 2026, for F-04.0 (first complete race). Implemented in its data foundations; the runtime that uses it comes with the integration.
- Requirements: COURSE-01, COURSE-06, COURSE-09, RES-05; decisions D-06 (no result for an interrupted race) and D-17.
- Related: [ADR-0001](0001-realtime.md) (one process, race state in memory), [ADR-0002](0002-hosting.md) (one App Service instance, Neon free plan).

## Context

A race in progress lives in the memory of one server process: positions, keystroke batches, timers. Only its transitions are written to PostgreSQL. Three situations must not produce a wrong official result:

- a process stops (deployment, crash) in the middle of a race;
- during a deployment, the old and the new process briefly run at the same time;
- a process loses PostgreSQL for a while, then gets it back.

A recovery at boot that interrupts every race in COUNTDOWN or RACING would interrupt the races of the other process during an overlap. A session-level advisory lock would show which process is alive, but Neon's pooled connection runs in transaction mode and does not keep session locks. A dedicated direct connection would need a new App Service setting, and it might keep the free compute awake.

## Decision

Each race records the process that runs it, the generation of that ownership, and a lease on the database clock:

- `races.owner_id`: a random identity drawn when the process starts.
- `races.owner_epoch`: the ownership generation, 1 at the start.
- `races.lease_expires_at`: `statement_timestamp()` + 30 s at the start and at each renewal.

**Acquisition.** The process that starts the race becomes its owner in the start transaction, under the room lock. There is no separate step.

**Renewal.** Every 10 s while the race counts down or runs, the owner updates the race row, on condition of its own owner id, its generation and an active state. If no row changes, the race ended, was interrupted or was taken over, and the owner stops for good. The renewal touches only the race row, never the room, so it cannot deadlock with a transition, which locks the room first, then the race.

**Every owner write is fenced.** Starting the race, finalising it with its results, and interrupting it when the process stops all carry the same condition (owner id, generation, active state) in the compare-and-set that moves the room. After a takeover, the generation has changed: a late write from the former owner changes nothing, its transaction rolls back, and nothing is broadcast. Results are published only after a write that won has committed.

**Takeover.** Another process, or the next process at boot, may interrupt a race only once its lease has expired on the database clock. It does so under the room lock, raises the generation and puts the room back in WAITING, with no result (D-06). A race whose owner keeps renewing is never interrupted, even when two processes overlap. If the lease expired but nobody took the race over, the owner may still renew and finalise; when a finalisation and a takeover cross, one transaction wins under the room lock.

**The owner's local view** (`apps/web/src/server/races/race-lease.ts`). The SQL generation protects the database writes, not the keystrokes and broadcasts held in memory. So the runtime:

- counts its ownership from the moment it *sent* the last renewal the database confirmed, plus 30 s, minus a 5 s safety margin, on a monotonic clock;
- past that deadline, suspends: it accepts no keystroke and makes no authoritative broadcast;
- resumes only when a renewal is confirmed (same owner, same generation, race still active), and only up to what that renewal proves; an old answer that arrives late proves little;
- once refused, or after a minute without any confirmation, stops for good, and no later answer reactivates it;
- keeps at most one renewal in flight, spaced 10 s apart, or 2 s apart while suspended, with a watchdog so that a renewal that never answers cannot freeze the lease.

**Process stop** (with the runtime). On SIGTERM, a process refuses new starts and interrupts its own races (reason `server_stopped`) through the fenced write. A crash leaves the lease to expire.

**Recovery.** At boot, one transaction interrupts the races whose lease has expired (reason `owner_lost`). It locks the rooms in id order, and also interrupts expired races whose room no longer points to them. If the database does not answer, it retries three times, then stops. A race whose lease was still valid at boot is recovered later, when someone opens or joins its room.

**A new process receiving a player of a race another process still owns** (with the runtime). This is the deployment overlap. The new process creates no runtime for that race and interrupts nothing before the lease expires. It answers that the race is running elsewhere, and the page keeps reconnecting. Once the lease has expired, the next opening of the room recovers it, and the player sees that the race was interrupted. Only one runtime ever exists for a race: the owner's.

## Timing

- **10 s renewal, 30 s lease.** The lease covers three renewal intervals, so two missed renewals (a network blip, Neon waking up) are tolerated before anyone may take the race over. A shorter interval multiplies the queries for little gain; a longer lease leaves a room blocked longer after a crash.
- **When a crashed race is cleaned up.** Its lease is expired 30 s after the last renewal. The cleanup itself happens at the next boot or the next time someone opens or joins the room: there is no guarantee on that delay, and no periodic job, so that nothing queries an idle database.

## Cost on Neon's free plan (estimate, not yet measured)

- Renewals happen only while a race counts down or runs: about 6 one-row updates per minute and per active race, about 13 for a race of 120 s.
- With nobody racing, there is no renewal and no periodic query.
- Neon counts compute as size × active time and suspends the compute after 5 minutes without activity. A race of 120 s already ends with its finalisation, and the 5 minutes count from that last query, so renewals inside such a race should not extend the active time.
- This reasoning is an estimate. It is checked against the real metrics of the Neon console (compute size and active time) before being written as a fact.

## Consequences

- The tables carry three more columns per race and a partial index on the leases of active races.
- A process cut off from PostgreSQL for more than about 25 s stops acting for its races. If nobody took them over and PostgreSQL answers within a minute, it resumes; otherwise it gives them up.
- A race interrupted by a takeover ends without results, like any interruption (D-06).

## Evidence

- `packages/database/test/races.db.test.ts`, deterministic interleavings under a held room lock:
  - renewal and no takeover while the lease runs;
  - A losing the database, its lease expiring, B taking over, then A unable to renew, finalise or interrupt;
  - renewal after expiry without a takeover;
  - two concurrent takeovers, only one winning;
  - finalisation against takeover, in both orders;
  - recovery limited to one room;
  - orphan races at boot;
  - a process interrupting its own race.
- `apps/web/src/server/races/race-lease.test.ts`, with a fake monotonic clock:
  - the suspension at the local deadline;
  - one renewal in flight;
  - resuming only after a confirmation;
  - the A/B scenario, ignored late answers, the bound from a slow renewal, giving up after a minute.
- `apps/web/src/server/races/boot-recovery.test.ts`: the boot recovery, its retries and the stop.
- Still to do with the runtime: the integration test with two processes on one database, including a process stopped during a race.
