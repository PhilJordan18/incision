# Atomic bonus coordinator — F-06.1 slice C

`createBonusRace` creates a race and its private bonus envelope together. Do not attach bonuses
halfway through an existing race: a current position cannot reconstruct erased typing history.
`reduceBonusRace` handles every race event or `activate` against that same authoritative envelope.
`availableBonusGrants` exposes only the requested owner's usable FIFO inventory, never other owners.
The server must authenticate that owner; an entrant ID is not an authorization capability.

## Approved conventions

- Activate the oldest available milestone grant. The command identifies its milestone explicitly;
  a retry cannot silently consume the next grant. An unusable grant is not automatically skipped.
- Activation has its own positive per-entrant sequence, independent of typing. One request in flight.
  Same sequence and milestone replays the last acknowledgement. A different milestone at the same
  sequence conflicts; a gap or an older command requests resynchronization without taking action.
  An in-order refusal advances the activation cursor but keeps the grant. Deliberately retry using
  the next sequence. Retain the original intent across connection loss.
- Deadlines precede activation, via the existing reducer. A refused effect never rolls back a valid
  timeout, abandon, clock change or end result. Activation itself is a tick, not typing activity.
- Successful effect, consumption, receipt and announcement form one immutable return value.
  The adapter serializes calls and replaces the entire envelope. Two independent stale copies are
  **not** protected by this pure function; this is neither a database transaction nor a lease.

## State, output and ownership

The version-1 envelope is private JSON data: race, awards/seed, high-water marks, per-owner last
activation acknowledgement, at most three consumed receipts per entrant, and at most one fog per
target. Retained history is bounded by the frozen roster (maximum 30). No unbounded request log.
Do not send this envelope to browsers or accept it from them. Structural checks reject corrupted
typed saved state; they do not turn it into a public deserializer or an authenticated snapshot.

`state.revision` is the complete envelope revision. It increases once per changed envelope, including
private cursor/time changes. It is distinct from `state.race.revision`, the legacy public-view counter.
Future adapters must use the envelope revision for the complete bonus projection, not mix counters.
`raceOutput` carries legacy replies and the exactly-once end result. Its `changed` flag still describes
the underlying reducer, **not** whether a bonus changed the text. Use the envelope revision instead.
Use the outer `nextDeadline`: it combines reducer deadlines and fog expiry. No ambient timer exists.

`typingProgress` is a private observation returned only for a fully applied batch. The existing fold
records its furthest intermediate insertion before backspaces; failed/duplicate/resync batches do
not advance it. The coordinator retains the maximum across batches and suffix edits. Public typing
acknowledgements and snapshots do not acquire this field. No typing algorithm is duplicated.

Awards are evaluated against the final effective progress after each changed envelope. Milestones
are never rearmed. On termination, inventory becomes unavailable and fog is cleared; bounded grant
history and receipts remain so a late retry cannot repeat an effect. Already finished results are
left to the existing reducer, unchanged.

## Approved extension content

The optional provider is a pure, trusted server function. It is invoked only after ownership, FIFO,
phase and target checks, never for a cached retry. It receives the current target and owned grant.
It must deterministically select three approved tokens and verify language, options, exclusions and
the boundary with the target suffix. Use the grant identity for deterministic selection. Do not draw
from a shared mutable stream or perform I/O. Return undefined if unavailable; provider exceptions
produce `CONTENT_UNAVAILABLE`, preserving due deadlines. Token syntax is rechecked by the effect.
The real provider remains integration work; tests use explicit fixtures, not published corpus data.

## Public events and remaining integration

Activation announcements contain an ID, grant owner/kind/milestone, target and server time: no typed
text, seed, private inventory or measurements. A replay emits no new activation announcement.
Fog expiry has a stable event ID and uses its deadline, or an earlier interruption/end instant.
These are event data, not a rendered notification, socket schema or persistent result history.

#62 still owns authenticated controlling-connection checks, Enter, transport limits/serialization,
public/private projection wiring and visual announcements. Fog rendering and equivalent bot delays
are not implemented here. No SQL is performed per keystroke. BONUS-01/02/04 remain partial and
BONUS-03 remains unimplemented until the actual application is wired and verified.
