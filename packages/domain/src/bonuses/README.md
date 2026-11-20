# Bonus awards — F-06.1 slice A

Implements BONUS-01's **pure award calculation**, with the four conventions approved by Philippe
on October 20, 2026. It does not wire bonuses into a live race. BONUS-02 effects, BONUS-03
announcements and BONUS-04 text/measure changes are not delivered by this slice.

## API and ownership

`createBonusAwards({ raceId, enabled, participants, random })` freezes the race configuration
and roster (2–30 entrants, at least one human; no spectators). It copies and sorts the roster and
copies the injected random state. `awardBonuses(state, snapshot)` returns either a typed refusal,
or `{ ok: true, state, grants }`, where `grants` contains **new** awards only.

Both functions are pure: no ambient clock, randomness, timers, I/O or mutation. The stored
`BONUS_AWARDS_VERSION` covers selection/order semantics. State is JSON-serializable.
Each grant is identified by `(raceId, milestone, entrantId)`. The state retains award history,
not a consumption queue. Refusals change nothing, including the random stream.

The integration must:

1. Initialize once, at race creation, using the frozen bonus setting and roster. Draw a separate,
   private seed on the server, not from the text/bot stream or a client's payload.
2. Resolve identities and progress from authoritative race state. Pass every frozen entrant,
   including terminals. Position is validated grapheme count and length is effective text length.
3. Apply the race event and its due expiry/finish rules first, then evaluate awards after
   **every authoritative transition**. A periodic 4 Hz broadcast is not a sufficient event source.
4. Use a strictly increasing authoritative revision for each changed input; gaps are permitted.
   Same revision is a no-op (the first valid payload wins); older revision is refused.
5. Retain the returned state and publish only the appropriate private grants. Never send the
   seed or another runner's inventory in a public progress broadcast.

The module validates malformed state/snapshots but does not authenticate them. It is not an
endpoint and must never accept client-supplied award state as authority.

## Rules

- Only `racing` phase can grant awards. Disabled configuration and countdown/ended/interrupted
  snapshots issue nothing and consume no random draw. A terminal phase cannot be reopened.
- Leader progress is the maximum among racing and finished entrants. Finished runners stay a
  reference, but can never receive a grant. Abandoned/timed-out runners are excluded.
- Among racing recipients, all tied for last qualify, as do those **strictly more than 25
  percentage points** behind. Everyone must actually be behind the leader; all tied means none.
  An inactive or disconnected runner still marked `racing` is not implicitly abandoned here:
  inactivity/expiry belongs to the existing race reducer.
- First crossings of 25/50/75% are consumed globally once, even without a recipient. A leader
  change, deletion or future text extension never re-arms them.
- A single batch crossing multiple milestones processes them in ascending order using its
  post-transition snapshot. No intermediate typing positions or timestamps are invented.
- Within a milestone, recipients are sorted by the existing `compareIds`, independent of input
  order. Each grant makes one unbiased three-way draw through the existing PRNG: `shortenSelf`,
  `extendLeader`, `fogLeader`, in that stable order. No grant means no draw.
- One grant per entrant/milestone implies at most three lifetime grants per entrant. Stored state
  validates the same uniqueness/order invariant; the bounded roster allows at most 90 entries.
- Fractions are compared by exact BigInt cross-products, including unequal target lengths and
  numbers near the JS safe-integer limit. Rounded public percentages are never used.

For example, at 50%, 25%, 0%, only the last runner receives the newly crossed 25 and 50 grants:
the middle runner is exactly 25 points behind, not strictly more. At 50%, 24%, 0%, both trailing
runners receive each grant. At 50%, 50%, 50%, both milestones are consumed with no grant.

An ended race awards nothing even if its final event crossed a milestone. A racing snapshot with
one finished leader and one remaining active runner can still award to that active runner.
The integration must preserve this ordering instead of evaluating after an already-terminal result.

## Refusals and future integration

Initialization rejects malformed configuration, duplicate/invalid/oversized rosters, missing human,
fewer than two entrants, and an invalid PRNG state. Evaluation rejects invalid saved state,
wrong race, stale revision, malformed/missing/duplicate entrants, invalid positions/lengths/status,
and phase regression. All refusal codes are data, not user-facing strings. Validate transport
payloads separately; a runtime cannot make this API safe by merely trusting branded TypeScript IDs.

This slice does not choose the target of an activation: D-11 requires revalidation when the player
uses the grant. It does not alter typed characters, counters, target text, textVersion or ranking.
Expiration of unused inventory, fog timing/refresh, added-word sourcing, activation idempotency,
finished-target refusal and updated WPM/progress belong to the effects/integration scope.

## Verification

`awards.test.ts` exercises initialization, exact thresholds, fractional progress, ties, terminal
filters, multi-milestone jumps, empty milestones, phase guards, replay, serialization, input order,
deep-frozen inputs, capacity and corrupt saved state. A separate small-fraction oracle covers 729
combinations; seeded histories cover 1,000 transitions with regressions and no repeated grants.

The module is not imported by the application yet. Unit proof of awards must not be represented as
a working browser bonus, server authorization, or production validation.
