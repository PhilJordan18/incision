# Bonus server adapter — F-06.2A

This slice wires the atomic domain coordinator into the server. It does **not**
enable bonuses in ordinary rooms or add the Enter key and visual effects. Room
creation freezes `bonuses: false`; the dormant seed is never drawn. Enabling rooms
requires the configuration slice, a private seed and approved deterministic
extension content. There is no environment switch or fixture fallback for this.

## Authority and transport

- Every runtime transition uses one private `BonusRaceState`. Typing, timers and
  activation are synchronous and serialized on that envelope; no SQL per bonus.
- `race:bonus:activate` accepts exactly `{ raceId, seq, milestone }`. Current
  session, followed room, entrant, controlling connection and lease are checked.
  Identity, time, target, effect kind and words never come from the client.
- Five attempts per sliding second per authenticated account, across tabs and
  reconnects. Storage holds at most 10,000 accounts with five times each; a full
  table rejects new accounts instead of evicting another account's active limit.
- Activation sequences are separate from typing. The same sequence/milestone
  replays its receipt; refusals and deadlines retain the domain's semantics.
- `race:bonus:self` privately sends usable grants, acknowledged sequence and
  current fog expiry to the owner's tabs. It never exposes the seed or envelope.
  Reconnection sends current state, not historical announcements.
- `race:bonus:announcement` broadcasts stable activation/expiry facts, including
  actor and target, never private text or other unconsumed grants. A retry does not
  produce another announcement. Rendering and client deduplication are later work.
- Target changes send reliable `race:self` snapshots. Old typing versions resync
  using the existing contract. The outer revision and deadline include bonus
  changes and fog expiry; the nested race revision is not sufficient.

## Performance without weaker validation

The coordinator validates each distinct shared grapheme array once **per call**.
Every element is still checked. No identity cache survives a call; a subsequently
mutated target or typed array must be refused. State change detection skips
unchanged entrant references and compares replaced leaves by JSON value, retaining
private changes even when the race's public revision did not change.

Local evidence against `4076cd8`: 12,000 full output comparisons across seeded
event streams, both error modes, enabled/disabled bonuses, retries, presence,
deadlines and JSON-round-tripped states were identical. The permanent tests pin
the full-envelope JSON revision oracle, input immutability and revalidation after
mutation. Removing validation, envelope comparison or using only the nested
revision makes tests fail.

The same in-process benchmark (30 entrants, 3,999 graphemes, 300 one-insert
batches) went from ~4,416 ms to ~260 ms in the runtime; direct coordinator ~4,089
ms to ~166 ms. These are local microbenchmarks, not network/Azure capacity or an
approved latency SLA. Real transport load is a separate check.

## Evidence boundaries and handoff

- `race-bonus.test.ts`: real coordinator, all three effects, private recovery,
  replay, observer/spectator refusal, stale text, deadlines and lease loss.
- `bonus-channel.test.ts`: actual Socket.IO channel, service and coordinator,
  two accounts, observing tab, spectator and lost-ack retry. Authentication,
  admission and persistence are explicit test doubles; not database evidence.
- `race-channel.test.ts`: expired-session and room-boundary refusals.
- `race-service.test.ts` / `bonus-limiter.test.ts`: frozen disabled configuration,
  strict input, account limits, sliding boundary and capacity exhaustion.
- Existing production-build/database integration and the load harness exercise
  normal rooms with bonuses **disabled**. They cannot prove enabled production
  content, rendered announcements or bots.

BONUS-01/02/04 stay partial. BONUS-03 and CONF-09 are not complete: the visible
announcement, room setting, approved word provider, Enter interaction and bot
activation still need their slices. No new schema, persistent bonus history,
dependency or production operation is introduced. Claude's UI branch and shared
requirements matrix are untouched; these status details are the integration
handoff for updating its BONUS rows without overwriting that concurrent work.
