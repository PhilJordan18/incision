# Bonus browser controller — F-06.2B1

This is an isolated controller, not a rendered feature. Ordinary rooms still have
bonuses disabled. It adds no configuration, corpus provider, UI or bot integration.
It does not modify Claude's race view, room view, dictionaries, existing E2E or
the concurrently owned requirements matrix.

## Adapter contract for the later UI slice

1. Create `BonusClient` with the existing race client's `serverNow` and a cancellable
   scheduler. Subscribe with the same external-store pattern as `RaceClient`.
2. Call `begin` for a new race or account. It erases private state, pending intents,
   announcement history and old asynchronous answers. Pass null for spectators.
3. Before following/re-following a room, call `connect` and install listeners for
   `race:bonus:self` and `race:bonus:announcement`. Forward them to `self`/`announce`.
   The transport sends `race:bonus:activate` with a bounded socket acknowledgement
   timeout. The controller also has a three-second UI timeout; it cannot abort a
   server-side effect. Remove old socket listeners on disconnect/account change.
4. Forward authoritative race phase and controlling-tab state through `context`.
   After control loss, request fresh bonus state by re-following when control is
   regained; a `race:self` control message alone is not a bonus inventory snapshot.
5. Enter belongs only to the focused typing field. Pass its composition/repeat
   flags and explicit dialog/control/phase context to `isBonusKeyIntent`. The
   result authorizes a UI intent only; the server still authorizes the command.
   Never forward Enter to typing or presence. No global keyboard listener is added.
6. Invoke `activate` on an intentional Enter/retry. One request is displayed as
   sending. Inventory is never removed optimistically. There is no automatic retry
   loop: timeout, invalid response, offline and transport refusals retain the exact
   sequence/milestone for an explicit retry, not the next grant.
7. Call `disconnect` on socket loss and `dispose` on unmount. Reconnection requires
   a fresh private snapshot. Equal acknowledged sequence can replay the retained
   receipt; a greater cursor supersedes the intent (another tab may have acted).

## State and validation

All socket values are unknown until validated. Input schemas reject extra fields,
invalid sequence ranges, non-ordered/duplicate grants, invalid fog intervals and
unknown refusal codes. A successful receipt must match the pending sequence,
milestone, owner and race; it must be backed by an acknowledged cursor. Private
snapshots cannot roll back the stored revision or cursor. Public announcements
have their own high-water revision: never compare them with the legacy race
revision. Different facts at the same revision are allowed and deduplicated by ID.

History is bounded to 180 facts (30 entrants, three grants, activation plus at most
one expiry each). Reconnection does not clear deduplication or synthesize historical
announcements from inventory. A new race does. Display code must render identifiers
and translated descriptions as text, never HTML from a socket payload.

Fog visibility derives from server expiry, with cancellable timers and a
`clockChanged` hook after clock-offset updates. It does not edit text, predict a
bonus effect or invent an expiry announcement. Terminal phase hides fog and drops
pending activation. The later view must reconcile authoritative text snapshots
using the existing typing client, not this controller.

## Evidence boundaries and matrix handoff

- `bonus-client.test.ts`: controlled clocks, FIFO, loss/retry, sequence refusal,
  stale/invalid messages, phase/control loss, races, fog and bounded facts.
- `bonus-key-intent.test.ts`: focus, dialog, IME, repeat and observer guards.
- `bonus-client-channel.test.ts`: actual sockets/service/coordinator, lost ack,
  reconnect/replay once, stale text-version resync then successful typing. Auth,
  admission, persistence and enabling bonuses are explicitly test fixtures.

BONUS-03/CONF-09 remain incomplete. No visual accessibility, physical keyboard,
approved content, enabled Arcade load or production result is claimed. #62 stays
open for UI, room configuration and bot activation. Shared EXIGENCES.md will be
updated with its owner when the corresponding visible slice is integrated.
