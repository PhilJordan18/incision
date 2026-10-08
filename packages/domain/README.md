# @incision/domain — the engine

Pure rules of Incision, shared by the server, the bots and the browser. Same input, same output:
nothing here reads a clock, draws at random, schedules, or touches the network, the disk, the
database or the application. The instant and the seed are parameters. `eslint.config.ts` enforces
it, and `src/eslint-guard.test.ts` proves the guard.

Session B owns this package. The server (session A) wires its rules to sockets, the database and the
interface, and never re-implements one. A rule that is missing is asked for, not copied.

## Conventions

- **Time** (`src/time.ts`). The server's clock is the only authority (COURSE-06).
  - An `Instant` is a point in time, in integer milliseconds since the epoch, from the clock the
    server injects. A `Duration` is an elapsed span in integer milliseconds.
  - Client timestamps never reach the engine: a keystroke batch is timed by the server's `now`.
  - Validators throw on a non-finite or out-of-range value. That is a programming error, never a
    reply to a client.
- **Identity** (`src/ids.ts`). The server resolves a `RaceId` and an `EntrantId` before calling the
  engine: the entrant comes from the authenticated socket, or is a server-driven bot. A client
  payload never carries an `EntrantId`, so it is never proof of identity.
- **Text** (`src/text/graphemes.ts`). The unit is the NFC grapheme cluster, split by `toGraphemes`.
  Positions, progress and the Appendix A counts all use it; "é" counts once however it was typed.
- **Refusals** are typed codes, never sentences: the interface translates them (I18N-01).

## Keystroke protocol (`src/race/types.ts`)

There are four counters, never mixed up:

| Counter | Scope | Use |
|---|---|---|
| `raceId` | the race | A batch for another race is refused (`WRONG_RACE`). |
| `seq`, `ackSeq` | one entrant | `seq` starts at 1 and the reply acknowledges it as `ackSeq`. A retry (`seq <= ackSeq`) is a harmless `duplicate`; a gap asks for a resync. |
| `textVersion` | one entrant's text | 0 for the initial text. It changes only when a bonus changes that entrant's text. A batch typed against an older version gets a resync and is never reinterpreted. |
| `revision` | the broadcast | Clients keep the highest one and drop stale snapshots. It never refuses keystrokes: another player's progress never invalidates a batch. |

A batch is applied whole or not at all, and a refusal never consumes a `seq`.

- After any reply other than `applied`, the client rebuilds its typing zone from the snapshot (when
  there is one) and continues at `ackSeq + 1`.
- `WRONG_RACE` and `UNKNOWN_ENTRANT` carry no snapshot: the client reloads the race.
- Checks run in this order: race, entrant, duplicate, phase and status, gap, text version, size,
  each input, then the plausibility of the new total.

**Error modes** (CONF-08, D-09):

- **Free mode.** A wrong insert enters the text and counts as an error, and a deletion lets the
  player correct it. The entrant finishes on reaching the target length.
- **Mandatory correction.** A wrong insert counts, is never inserted, and marks the expected grapheme
  (design screen 09) until the right one is typed.

## Limits (`src/race/limits.ts`)

These limits are shared with the server, and the E2E tests stay within them, with no bypass:

- the countdown, the grace period and inactivity (D-17);
- at most 10 batches per second per player (the transport enforces it);
- at most 64 events per batch;
- `maxPlausibleInserts`: 20 inserts, plus 25 per second since the start, counted on the entrant's
  total. Above it, the batch is refused whole (`IMPLAUSIBLE`).

## Contracts and examples

- **Types first.** Functions that are not implemented yet exist only as types (`CreateRace`,
  `ReduceRace`, `ApplyKeystrokes`, `RankEntrants`, `ToRaceBroadcast`, `ComputeMeasures`). There is
  never a stub to call.
- **Examples.** `*.examples.ts` hold the worked examples, which are not exported from `index.ts`.
  They are type-checked, and they count as evidence only once the implementing card runs them.
- **Implemented now.** `startRefusal` (COURSE-02), `toGraphemes`, the time and id validators, and
  `maxPlausibleInserts`.
- **Changes.** A contract changes only through a pull request from session B, announced to session A.
