# F-01.6B — host-successor selection contract

This is the pure-domain slice explicitly split out in issue #36 (SALLE-08, D-03).
It does not implement succession in a running room.

## Input and output

`selectHostSuccessor({ outgoingHostId, members })` in
`packages/domain/src/rooms/host-succession.ts` returns a member ID or `undefined`.
The returned ID is a selection, not an authorization credential or a database write.

The server supplies a single room snapshot under its existing lock. Each candidate
has a stable member ID, `kind` (`account`, `guest`, `bot`), `active`, `connected`,
and `joinedAtMicros`, an exact non-negative safe integer of epoch microseconds.
Preserve PostgreSQL microseconds when reading `joined_at`: a JavaScript Date loses
precision and may reverse two close arrivals. This module does not read timestamps
or sockets itself.

A candidate must be active, have at least one current connection, be human (account
or guest), and differ from the outgoing host. Spectators are eligible just like
participants; no role field or preferred successor exists. The smallest join time
wins. For strictly equal join times only, existing domain `compareIds` supplies a
stable, locale-independent technical tie-break. This tie-break is an implementation
choice between equally old people, not an additional product requirement.

The input order cannot affect selection; no input is sorted or modified. Invalid
IDs, duplicate membership IDs, invalid times or flags throw before returning. Such
errors must not be treated as absence of a successor and must not close a room.
The selection is O(n) time with O(n) validation memory.

## Integration owned by A

- Resolve identity and presence on the server. Never accept candidate eligibility
  or the outgoing host from an untrusted client payload.
- Explicit departure and disconnection are different triggers. The caller applies
  D-06's 30-second grace after loss of the last socket; reconnection at the inclusive
  deadline and multiple sockets must be handled before invoking this selection.
- Read/recheck room phase, current host and memberships under the room lock; make
  the transfer or closure atomically. A stale timer must not replace a newer host.
- `undefined` means no eligible successor in that snapshot. It does not close the
  room or decide race finalization/interruption. Apply SALLE-08/D-06 transactionally.
- Tests of concurrency, grace scheduling, disconnect/reconnect, guest persistence,
  sockets and UI remain part of A's integration, not evidence from these pure tests.

The shared `packages/domain/src/index.ts` is reserved by B for room configuration.
Its additional export was requested on #40 (comment 6428618143) and is deliberately
not changed before coordination. The function and type are exported by their new
module; package-root exposure must be added by the agreed owner before server use.
Do not work around this by duplicating the selector in a server adapter.

## Verification scope

Nineteen focused cases cover exact microsecond ordering, guest eligibility without
participant preference, bot/disconnected/departed exclusions, outgoing-host exclusion,
empty selection, every permutation of tied candidates, frozen input, repeated calls,
invalid IDs/timestamps and duplicate/ineligible corrupt candidates.

No browser, database or production claim follows from these tests. SALLE-08 and #36
remain incomplete until the adapter, grace, atomic transfer/closure and UI are verified.

## Local verification — October 26, 2026

Executable SHA `a1afc4e`, based on `dev` `b14e5d0`:

- Focused host-succession test: 19/19 passed.
- Root `check:no-js`, `lint`, `typecheck`, `test`, `build`: passed under heavy.sh.
- 1,863 unit tests: web591, database130, domain1075, load20, wordlists47.
- No local PostgreSQL/E2E rerun: no adapter, query, UI or runtime changed.

Code-reviewer, functional-QA and security roles were applied sequentially on that
SHA. No blocking or major finding in the pure selection scope. No new request
surface is added: inputs remain trusted server snapshot data, and the output does
not itself grant authority. Real authorization/concurrency checks belong to the
future adapter. The package-root export remains a coordinated integration prerequisite.

Reservation and contract: #36 comment6428617443; shared-export request to B:
#40 comment6428618143. No existing shared source file is changed. A owns the final
SALLE-08 matrix update; this tranche is domain evidence only, not room completion.
