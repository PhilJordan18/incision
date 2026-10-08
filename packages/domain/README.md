# @incision/domain — the engine

These are the pure rules of Incision, shared by the server, the bots and the browser. Same input,
same output: nothing here reads a clock, draws at random, schedules, or touches the network, the
disk, the database or the application. The instant and the seed are parameters.

Two things enforce this:

- **`eslint.config.ts`** forbids clocks, randomness, timers, `globalThis` and `global`, aliases of
  `Math` or `Date`, dynamic imports, and imports of Node, the database or the application. Bare
  module names match exactly, so the package's own files may be called `events` or `timers`.
  `src/eslint-guard.test.ts` proves each rule.
- **`tsconfig.json`** has `types: []` and no DOM library, so Node and browser globals do not even
  type-check here.

The server and the interface wire these rules to sockets, the database and the screen, and never
re-implement one. A missing rule is added here, not copied there.

## Conventions

- **Time** (`src/time.ts`, `src/race/elapsed.ts`). The server's clock is the only authority
  (COURSE-06).
  - An `Instant` is a point in time, in integer milliseconds since the epoch, from a monotonic clock
    the server injects. A `Duration` is an elapsed span in integer milliseconds.
  - Client timestamps never reach the engine: a keystroke batch is timed by the server's `now`.
  - Every measure uses `measuredElapsed`. It is 0 before the start, frozen at the entrant's end,
    and otherwise exact, whatever the length of the race.
  - `MAX_DURATION_MS` is the whole range of accepted instants: a bound on what the engine can
    represent, not a race limit. A race's time limit is its configuration (CONF-01, D-17).
  - The validators throw on a non-finite or out-of-range value. That is a programming error, never a
    reply to a client.
- **Identity** (`src/ids.ts`). The server resolves a `RaceId` and an `EntrantId` before calling the
  engine: the entrant comes from the authenticated socket, or is a server-driven bot. A client
  payload never carries an `EntrantId`, so it is never proof of identity. The ranking's last
  tie-break is `compareIds`, in code-unit order.
- **Text** (`src/text/graphemes.ts`). The unit is the NFC grapheme cluster, split by `toGraphemes`.
  Positions, progress and the Appendix A counts all use it; "é" counts once however it was typed.
  An insert carries one grapheme of at most `MAX_GRAPHEME_LENGTH` code units as received
  (`singleGrapheme`); its NFC form may be longer.
- **Refusals** are typed codes, never sentences: the interface translates them (I18N-01).

## Keystroke protocol (`src/race/types.ts`)

There are four counters, never mixed up:

| Counter | Scope | Use |
|---|---|---|
| `raceId` | the race | A batch for another race is refused (`WRONG_RACE`). |
| `seq`, `ackSeq` | one entrant | `seq` starts at 1, and every reply echoes the `seq` it answers. A retry (`seq <= ackSeq`) is a harmless `duplicate`; a gap asks for a resync. |
| `textVersion` | one entrant's text | 0 for the initial text. It changes only when a bonus changes that entrant's text. A batch typed against any other version gets a resync and is never reinterpreted. |
| `revision` | the broadcast | Starts at 0 for each race. Clients keep the highest revision of the current `raceId` and drop stale snapshots. It never refuses keystrokes: another player's progress never invalidates a batch. |

**One batch in flight per entrant, not per tab.** The client sends its next batch only after the
reply to the previous one, gathering keystrokes meanwhile, and splits more than `MAX_BATCH_EVENTS`
pending events into several batches.

- The server guarantees one emitter per entrant; the engine sees no connection. Only the entrant's
  controlling connection submits batches, and another tab of the same member observes.
- After a reconnection, the new connection takes control and the older one's batches are discarded
  before the engine. Two tabs can therefore never both send `seq` 1 with different events.

- A batch is applied whole or not at all, and a refusal never consumes a `seq`.
- A batch is immutable once sent: a retry repeats the same `seq` with the same events, and a `seq`
  carries other events only after a refusal or a resync of it.
- A reply whose `seq` is not the batch in flight is ignored.

| Reply | What the client does next |
|---|---|
| `applied` | Next batch is `ackSeq + 1`. |
| `duplicate` | That very batch was already applied. Next batch is `ackSeq + 1`. |
| `resync`, or `refused` with a snapshot | Drop the unapplied keystrokes, rebuild the typing zone from the snapshot, continue at `snapshot.ackSeq + 1`. |
| `refused` without a snapshot (`WRONG_RACE`, `UNKNOWN_ENTRANT`) | Reload the race. |

**On a disconnection,** the client drops the transport's send buffer, so no queued copy survives.
After the reconnection, the server sends the `RaceReveal` again, then the snapshot.

- The batch that was in flight counts as applied if and only if `snapshot.ackSeq` is at least its
  `seq`.
- Otherwise the client resends it unchanged, as the only copy, and keeps its events shown on top of
  the snapshot.

**Order of the checks:** race and entrant (`reduceRace`), then in `applyKeystrokes`:

1. shape (`INVALID_INPUT`);
2. duplicate;
3. phase and entrant status;
4. gap;
5. text version;
6. size;
7. each input;
8. plausibility of the new total.

**Error modes** (CONF-08, D-09, D-19). Both are offered; mandatory correction is the default.

- **Free mode.** The player advances despite errors: a wrong insert enters the text and counts as
  an error, and a deletion lets them correct it. The entrant finishes on reaching the target length,
  and finishers rank by arrival, as in every mode.
- **Mandatory correction.** A wrong insert counts, is never inserted, and marks the expected
  grapheme (design screen 09) until the right one is typed. Random key-mashing therefore never
  advances; this limits mashing, but it is not a general guarantee against cheating.
- **After the finishing insert,** every later event in the same batch is discarded and not counted.

## Deadlines (`RaceEvent`)

Before and after handling any event, `reduceRace` applies every transition due at its `now`, so a
late timer never decides a result:

1. **The start.** The race starts at `startsAt`.
2. **The time limit** (when there is one). The race ends at `startsAt + timeLimit`, inclusive, and
   whoever is still racing times out at that deadline. It wins a tie with any other deadline (D-06).
3. **Everyone terminal.** A race whose entrants are all terminal ends, never from the countdown.
   When everyone abandons during the countdown, it ends at `startsAt`:
   - every entrant is an abandon;
   - the elapsed time and the measures are zero, and the countdown never counts as typing time;
   - no victory and no record is awarded.

With no time limit there is no hidden cap (CONF-01, D-17). A configured limit is announced before
the start and shown during the race. The runtime schedules one `tick` at the `nextDeadline` that the
reducer returns.

**Interruption** (D-06):

- If the room closes before the race is finalised, the race is `interrupted` and produces no
  official result. The performances in memory are never persisted, and never become victories or
  records.
- A race that already ended keeps its results when the room closes later.
- When closing and finalising compete, one transaction wins under the room lock.
- An ended or interrupted race is final: no later event, including a late timer, changes it.

## Limits and bounds (`src/race/limits.ts`, `src/measures/types.ts`)

The server shares these limits, and the E2E tests stay within them, with no bypass:

- the countdown, the grace period and inactivity (D-17);
- at most 10 batches per second and 1 batch in flight per player;
- at most 64 events per batch;
- `maxPlausibleInserts`: 20 inserts plus 25 per second since the start, counted on the entrant's
  applied inserts. Above it, the batch is refused whole (`IMPLAUSIBLE`).

Three notions are kept apart:

1. **The plausibility limits** accept or refuse keystrokes:
   - `MAX_PLAUSIBLE_INSERTS_PER_SECOND`: 25 per second, 300 WPM sustained;
   - `PLAUSIBILITY_BURST_INSERTS`: a burst margin of 20, for a network flush and the first seconds.

   They are a plausibility threshold chosen for the product, not an absolute guarantee: set far
   above the speeds expected from our students, they aim at scripts and replays. F-04.4 tunes them.
2. **The measures** are Appendix A computed exactly from the counters and the elapsed time
   (`computeMeasures`), unrounded and never capped, over an exact elapsed time. They are the official values, stored with the
   counters and the elapsed time they come from. A high value at the very start, from the burst
   margin, stays exact. For accepted counters it never exceeds `MAX_COMPUTABLE_WPM` (240 000),
   which is derived from the limits: 20 inserts after 1 ms.
3. **A display limit**, if any, belongs to the interface. It is explicitly flagged there and never
   replaces a stored or official value.

Stored values are bounded, so database columns can be sized from these constants:

| Value | Bound |
|---|---|
| Net and raw WPM | ≤ `MAX_COMPUTABLE_WPM` (240 000) for accepted counters: Appendix A exactly, never capped |
| Accuracy | in [0, 100] |
| Insert counters | ≤ `MAX_ENTRANT_INSERTS` (about 1.03 × 10¹¹): 64-bit integer column |
| Position, length | ≤ `MAX_TEXT_GRAPHEMES` (4 000) |
| Elapsed time | ≤ `MAX_DURATION_MS` (the instant range, about 4.1 × 10¹² ms): 64-bit integer column, exact |
| Ranks | exactly 1 to n, each once |

## Contracts and examples

- **Types first.** Functions that are not implemented yet exist only as types, so there is never a
  stub to call: `ComputeMeasures`, `RankEntrants`, `CreateRace`, `ReduceRace`, `ApplyKeystrokes`,
  `ToRaceBroadcast`, `ToRaceReveal` and `ToEntrantSnapshot`.
- **Examples.** `*.examples.ts` hold the worked examples, which are not exported from `index.ts`.
  They are type-checked, and they count as evidence only once the implementing card runs them.
- **Implemented now:**
  - `startRefusal` (COURSE-02);
  - `toGraphemes` and `singleGrapheme`;
  - `measuredElapsed`;
  - the time and id validators, and `compareIds`;
  - `maxPlausibleInserts`.
- **Changes.** A contract changes only through an engine pull request, announced before the
  integration that depends on it.
