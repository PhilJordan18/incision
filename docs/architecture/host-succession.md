# F-01.6 — host succession

The pure-domain selector (#36B) and voluntary-departure adapter (#36C1) implement
SALLE-08/D-03 for existing account memberships. Disconnection grace (#36C2) and
guest persistence remain outside this implementation.

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

## Original B integration contract (historical)

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

At the time of B delivery, the shared `packages/domain/src/index.ts` was reserved by B for room configuration.
Its additional export was requested on #40 (comment 6428618143) and is deliberately
not changed before coordination. The function and type are exported by their new
module; package-root exposure must be added by the agreed owner before server use.
Do not work around this by duplicating the selector in a server adapter.

## B verification scope

Nineteen focused cases cover exact microsecond ordering, guest eligibility without
participant preference, bot/disconnected/departed exclusions, outgoing-host exclusion,
empty selection, every permutation of tied candidates, frozen input, repeated calls,
invalid IDs/timestamps and duplicate/ineligible corrupt candidates.

No browser, database or production claim follows from these tests. SALLE-08 and #36
remain incomplete until the adapter, grace, atomic transfer/closure and UI are verified.

## B local verification — October 26, 2026

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


## C1 voluntary departure

`leaveCurrentRoom` keeps one bounded READ COMMITTED transaction. It identifies the
room, locks its row, re-reads the departing membership, then reads active SQL members.
`transferHostToConnectedMember` extracts epoch microseconds directly in SQL, validates
the safe integer, and invokes the required synchronous `online(lobbyId)` callback.
There is no default callback or pre-lock presence snapshot.

The decision linearizes at this synchronous presence read. Eligible members are the
intersection of active SQL memberships and current sockets, excluding the departing
host. Spectators are eligible. The current SQL schema stores accounts only; the pure
selector's guest support is not evidence of persisted guest integration.

The transaction writes the new host, marks the leaver with `statement_timestamp()`,
and increases the room revision. Its existing `closed: false` notification abandons
only the departing entrant, if still racing. The race and its results continue;
host controls derive from the committed host ID. No event shape or race runtime is
changed. Explicit **Close room** remains a distinct action.

Without a successor, the existing interruption/closure path runs under the same
lock as finalization: interruption first prevents official results; finalization
first preserves them. Database/presence failures roll back and the action returns
`UNAVAILABLE`, without announcing a departure or treating the failure as emptiness.

Next server-action bundles and the custom Socket.IO server share the process-wide
`roomPresence()` accessor, following the existing room-events pattern. The domain
package-root export is now included with B's coordinated release.

### Known limits

- A page reload is offline at the instant its last socket is absent; it cannot inherit.
  With no other connected candidate, the room closes (D-03's active network presence).
- A successor disconnecting after selection is a disconnected host. C2 must apply
  the D-06 grace period; C1 does not undo the committed succession or install timers.
- Presence is process-local (ADR-0001). Overlapping server processes do not share
  sockets; this is not a qualification of multi-instance rollout or production.
- The matrix stays owned by A. SALLE-08 remains partial pending C2 and the remaining
  integrations; this tranche does not close the parent issue #36.
