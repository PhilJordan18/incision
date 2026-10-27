# ADR-0004 — A fenced lease for the process that runs a race

- Status: **accepted**, October 8, 2026, for F-04.0 (first complete race). Implemented in its data foundations (#101) and in the runtime of the integrated race (October 11: `apps/web/src/server/races/`).
- Requirements: COURSE-01, COURSE-06, COURSE-09, RES-05; decisions D-06 (no result for an interrupted race) and D-17 (inactivity: a runner silent for 120 s abandons, so a race with no time limit still ends once its last runner stops typing).
- Related: [ADR-0001](0001-realtime.md) (one process, race state in memory), [ADR-0002](0002-hosting.md) (one App Service instance, Neon free plan).

## Context

A race in progress lives in the memory of one server process: positions, keystroke batches, timers. Only its transitions are written to PostgreSQL. Three situations must not produce a wrong official result:

- a process stops (deployment, crash) in the middle of a race;
- during a deployment, the old and the new process may briefly run at the same time (not verified on App Service Linux, so it is assumed);
- a process loses PostgreSQL for a while, then gets it back.

A recovery at boot that interrupts every race in COUNTDOWN or RACING would interrupt the races of the other process during an overlap. A session-level advisory lock would show which process is alive, but Neon's pooled connection runs in transaction mode and does not keep session locks. A dedicated direct connection would need a new App Service setting, and it might keep the free compute awake.

## Decision

Each race records the process that runs it, the generation of that ownership, and a lease on the database clock:

- `races.owner_id`: a random identity drawn when the process starts.
- `races.owner_epoch`: the ownership generation, 1 at the start.
- `races.lease_expires_at`: `statement_timestamp()` + 30 s at the start and at each renewal.

**Acquisition.** The process that starts the race becomes its owner in the start transaction, under the room lock. There is no separate step.

**Renewal.** Every 10 s while the race counts down or runs, the owner updates the race row, on condition of its own owner id, its generation and an active state. If no row changes, the race ended, was interrupted or was taken over, and the owner stops for good. The renewal touches only the race row, never the room, so it cannot deadlock with a transition, which locks the room first, then the race. It is bounded on the server like every race transaction (`boundedTransaction`): a renewal stuck behind a lock ends with an error from PostgreSQL within 2 s, which the owner treats like an unreachable database. The owner's local view below stays conservative, and a late answer still proves nothing beyond what it shows.

**Every owner write is fenced.** Moving the race from COUNTDOWN to RACING, finalising it with its results, and interrupting it (the process stops, the results cannot be saved, or the engine failed) all carry the same condition (owner id, generation, active state) in the compare-and-set that moves the room. A late write from a former owner changes nothing, its transaction rolls back, and nothing is broadcast. Results are published only after a write that won has committed. Today a takeover always ends the race, so the active state alone would refuse such a write; the generation also covers a later takeover that would let a race continue, and tells a retry of the same owner apart from a write that lost. A retry whose earlier attempt committed (its answer lost to a client timeout) is told so (`alreadyDone`); an interruption that lost to this owner's own finalisation is told that the results are saved. If a release without races closed the room during a deployment overlap, the owner's next write interrupts the race (`room_closed`) instead.

**Bounded waits.** Every race transaction goes through `boundedTransaction` (F-00.4), which sets, for that transaction only, a 2 s lock wait, a 3 s statement limit and a 4 s idle-in-transaction limit on the server, below the pool's 5 s client timeout (`SERVER_LIMITS_MS`). A stuck wait then ends with an error from PostgreSQL and a clean rollback. The pool destroys a connection after a client-side failure (a timeout, a stalled or cut network) instead of reusing it, so no request ever runs inside an abandoned transaction. The 4 s idle limit concerns a transaction, never a race: no game delay, network exchange with players or user wait happens inside an open SQL transaction.

**Takeover.** Another process, or the next process at boot, may interrupt a race only once its lease has expired on the database clock, checked again on the latest race row: a renewal that commits while the takeover waits keeps the race. It does so under the room lock, raises the generation and puts the room back in WAITING, with no result (D-06). A race whose owner keeps renewing is never interrupted, even when two processes overlap. If the lease expired but nobody took the race over, the owner may still renew and finalise; when a finalisation and a takeover cross, one transaction wins under the room lock.

**The owner's local view** (`apps/web/src/server/races/race-lease.ts`). The SQL generation protects the database writes, not the keystrokes and broadcasts held in memory. So the runtime:

- counts its ownership from the moment it *sent* the last renewal the database confirmed, plus 30 s, minus a 5 s safety margin, on a monotonic clock;
- past that deadline, suspends: it accepts no keystroke and broadcasts no progress; time transitions (the start, the time limit) and departures still apply, and their writes stay fenced;
- while suspended, pauses inactivity (D-17, #168), because nobody can answer « Tu es toujours là ? »: no new marker and no `inactivity` abandon from the deadline that passed, even when the suspension is noticed later; once held again, each runner gets back exactly the inactivity time left. The time limit and the 30 s grace keep running;
- resumes only when a renewal is confirmed (same owner, same generation, race still active), and only up to what that renewal proves; an old answer that arrives late proves little;
- once refused, or after a minute of suspension without any confirmation (about 85 s after the last confirmed renewal was sent), stops for good, and no later answer reactivates it;
- keeps at most one renewal in flight, spaced 10 s apart, or 2 s apart while suspended, with a watchdog so that a renewal that never answers cannot freeze the lease;
- wakes up at its local deadline and at its give-up time, so the runtime learns of a suspension when it happens, not at the next renewal.

**Process stop.** On SIGTERM, a process refuses new starts and ends each of its races within 5 s, every wait budgeted against that deadline. A race whose results are frozen gets one attempt to save them while its ownership holds (the same idempotent finalisation, so an earlier commit is recognised); otherwise the race is interrupted (reason `server_stopped`) through the fenced write. A race whose results committed is never interrupted. Past the deadline, or when the database does not answer, the race is left to its lease. A crash leaves the lease to expire.

**Engine failure.** An unexpected exception of the engine (`reduceRace` or one of its views) ends the affected race only: the runtime interrupts the last good state in memory (the reducer is pure, so that state is intact) and in the database with the reason `engine_error` (additive migration `0003`), with bounded retries, then the room waits again and its members read why. If none of those retries is confirmed, the runtime stops for this race anyway and its lease expires, so the race is recovered later as `owner_lost`. The server and the other races carry on. Decision of October 11: no existing reason described a fault of the engine, and session B confirmed that the engine contract needs no change for it.

**Results that cannot be saved** (with the runtime):

- The owner freezes the results at the end of the race and keeps them until a transaction confirms them; every attempt sends that same frozen array.
- A transient failure (database unreachable, timeout, a wait ended by the server) or a lost answer is never an abandonment: the owner retries the finalisation, a bounded number of times, on failure only.
- The retry is idempotent: when an earlier attempt committed but its answer was lost, it returns `alreadyDone` and the frozen results are published as saved. A saved result is never reported as lost.
- `save_failed` is used only for an explicit, terminal abandonment after the bounded retries: the owner interrupts its race with it, without results, like any interruption (D-06). If that call reports `resultsSaved`, an earlier finalisation had committed after all, and the saved results are published, not an interruption.
- If the database stays unreachable so that neither the results nor the interruption can be confirmed, the owner publishes neither: players see that the results are being confirmed, and the pages show what the database holds once it answers (the results, or later an `owner_lost` interruption once the lease has expired).

**Recovery.** At boot, one transaction interrupts the races whose lease has expired (reason `owner_lost`). It locks the rooms and their races together, in room order, and also interrupts expired races no longer current in their room. It never waits for a row: a room or race that another transaction holds (a transition or a renewal under way) is skipped (`SKIP LOCKED`) and counted as left for later; only a table lock (a migration) is waited for, within the bounded waits. While the database does not answer, or while races are left for later, it tries again after 5, 15 and 45 s, then stops. A race whose lease was still valid at boot, or still left for later, is recovered when someone opens or joins its room (with the runtime).

**A new process receiving a player of a race another process still owns** (with the runtime). This is the deployment overlap. The new process creates no runtime for that race and interrupts nothing before the lease expires. It answers that the race is running elsewhere, and the page keeps reconnecting. Once the lease has expired, the next opening of the room recovers it, and the player sees that the race was interrupted. Only one runtime ever exists for a race: the owner's.

## Timing

- **10 s renewal, 30 s lease.** The lease covers three renewal intervals, so two missed renewals (a network blip, Neon waking up) are tolerated before anyone may take the race over. A shorter interval multiplies the queries for little gain; a longer lease leaves a room blocked longer after a crash.
- **When a crashed race is cleaned up.** Its lease is expired 30 s after the last renewal. The cleanup itself happens at the next boot or the next time someone opens or joins the room: there is no guarantee on that delay, and no periodic job, so that nothing queries an idle database.

## Cost on Neon's free plan (estimate, not yet measured)

- Renewals happen only while a race counts down or runs: about 6 one-row updates per minute and per active race, about 13 for a race of 120 s. Each is one bounded transaction of four round trips (BEGIN, the limits, the update, COMMIT), which changes no compute-time reasoning below.
- With nobody racing, there is no renewal and no periodic query: only one recovery transaction when a process starts (a few more if it fails or leaves races for later).
- Neon counts compute as size × active time and suspends the compute after 5 minutes without activity. A race of 120 s already ends with its finalisation, and the 5 minutes count from that last query, so renewals inside such a race should not extend the active time.
- This reasoning is an estimate. It is checked against the real metrics of the Neon console (compute size and active time) before being written as a fact.

## Consequences

- The tables carry three more columns per race and a partial index on the leases of active races.
- A process cut off from PostgreSQL for more than about 25 s stops acting for its races. If nobody took them over and PostgreSQL answers within a minute of that suspension, it resumes; otherwise it gives them up.
- A race interrupted by a takeover ends without results, like any interruption (D-06).

## Evidence

- `packages/database/test/races.db.test.ts`, deterministic interleavings under a held room lock:
  - renewal and no takeover while the lease runs;
  - A losing the database, its lease expiring, B taking over, then A unable to renew, finalise or interrupt;
  - renewal after expiry without a takeover, and a race whose renewal is under way skipped, then left alone once renewed;
  - two concurrent takeovers, only one winning each race;
  - finalisation against takeover, in both orders;
  - a room held by another transaction skipped and recovered later, a table lock ending the recovery on the server;
  - a transition stuck behind a lock, with the production client timeout, ending on the server and leaving its connection clean;
  - retried transitions told that their earlier attempt committed, every other late writer refused, a finished race missing results never reported as saved;
  - a room closed by a release without races, the owner's next write interrupting the race;
  - recovery limited to one room;
  - orphan races at boot, never one whose lease runs;
  - a process interrupting its own race (`server_stopped`, `save_failed`);
  - the same winners under a SERIALIZABLE server default.
- `apps/web/src/server/races/race-lease.test.ts`, with a fake monotonic clock:
  - the suspension at the local deadline;
  - one renewal in flight;
  - resuming only after a confirmation;
  - the A/B scenario, ignored late answers, the bound from a slow renewal (counted from its sending);
  - a suspension reported at the deadline, a refusal while held, a second suspension after resuming, giving up exactly a minute after the suspension;
  - the instant a suspension began, already dated when the lease reports it, kept when a renewal confirmed too late moves the deadline, and forgotten once held again (D-17).
- `apps/web/src/server/races/race-inactivity-pause.test.ts`, with the real engine, a fake lease on its own monotonic clock, and timers that run 1 ms late at the soonest, as Node's do (D-17):
  - a suspension noticed only at the abandon's tick, or within the handling of an event: no inactivity abandon, no reduction from inside the lease's report, the pause dated from the deadline that passed (never late, about 1 ms early at most);
  - a pause and a resume queued back to back, two suspensions, an answer at the moved deadline;
  - the time limit and the grace unchanged, a lease lost or a server stopped while a pause is applied or still queued;
  - the results identical to a race with no suspension, and a WPM series that never moves back, even for a sample due before a queued pause is reduced, and ends on the result;
  - the real `RaceLease` wired to the runtime: a renewal confirmed too late keeps the pause and the next one resumes it; the race given up 60 s into a suspension, with no abandon and no result.
- `apps/web/src/server/races/boot-recovery.test.ts`: the boot recovery, its retries and the stop.
- `apps/web/src/server/races/race-runtime.test.ts`, with a fake clock and the real engine: transitions from `nextDeadline`, the controlling tab, nothing accepted or broadcast while the lease is unconfirmed, frozen results retried unchanged, `save_failed` only as the explicit give-up, nothing published while the database never answers, a lost lease never coming back, `engine_error`, the shutdown budget.
- `apps/web/integration/race.integration.test.ts`: two processes of the production build on one database. Process A freezes (SIGSTOP) during a race; process B leaves the race alone while the lease runs, then recovers it (`owner_lost`) once it has expired; A wakes up, its renewal is refused, nothing it does is applied, and no result exists. A process stopped (SIGTERM) during a race interrupts it (`server_stopped`) and exits.
