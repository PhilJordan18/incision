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
  - Every measure uses `measuredElapsed`. It is 0 before the start, frozen at the entrant's end, and
    capped at `MAX_DURATION_MS`.
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

**One batch in flight per entrant.** The client sends its next batch only after the reply to the
previous one, gathering keystrokes meanwhile, and splits more than `MAX_BATCH_EVENTS` pending
events into several batches.

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

1. **The plausibility limit** (`MAX_PLAUSIBLE_INSERTS_PER_SECOND`, 25 per second, 300 WPM) is the
   reason to refuse a batch. The fastest typists on record sustain roughly 150 to 220 WPM and reach
   roughly 250 to 300 WPM only on short bursts, while our students type around 30 to 60 WPM.
2. **The burst margin** (`PLAUSIBILITY_BURST_INSERTS`, 20) absorbs a network flush and the first
   seconds. It puts no ceiling on a WPM measured over a near-zero time.
3. **The measure bound** (`MAX_WPM`, 600) is twice the plausible sustained rate. Within the
   plausibility limit a measure is at most 300 + 240 ÷ t (t in seconds):
   - between 300 and 600 it can only come from the burst margin;
   - above 600 it needs t < 0.8 s, an artefact, never a performance.

   `computeMeasures` caps it and sets `capped`, so a capped value is stored and shown with that
   flag, never as an Appendix A speed.

Stored values are bounded, so database columns can be sized from these constants:

| Value | Bound |
|---|---|
| Net and raw WPM | ≤ `MAX_WPM` (600): Appendix A exactly, capped only below 0.8 s, then flagged `capped` |
| Accuracy | in [0, 100] |
| Insert counters | ≤ `MAX_ENTRANT_INSERTS` (15 120 020) |
| Position, length | ≤ `MAX_TEXT_GRAPHEMES` (4 000) |
| Elapsed time | ≤ `MAX_DURATION_MS` (7 days) |
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
