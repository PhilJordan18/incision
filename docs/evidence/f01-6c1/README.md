# F-01.6C1 — voluntary host succession

Verified code and browser regression: `4b578fb`, based on `dev` `1cfe076`.
The results-refresh hunk was explicitly released by A through Philippe on October27.
No merge. The parent #36 stays open for C2 and guest integration.

## Delivered scope

SALLE-08/D-03, voluntary departure for persisted accounts. Under the room lock,
active SQL membership is intersected with current authenticated socket presence.
The oldest connected human inherits, including spectators; exact SQL microseconds
and stable identifiers determine ordering. Without a successor, existing closure
and interruption semantics apply. Storage/presence failures roll back.

The result panel refresh compares `memberId` derived identically from the live
snapshot and server `initial` (both absent values are undefined). The effect runs
only in results and retains the race-ID condition. Both host IDs are dependencies;
unchanged-host snapshots do not retrigger it. Existing initial synchronization
accepts only a strictly newer revision and was not modified.

A's scope release is recorded in [#36](https://github.com/PhilJordan18/incision/issues/36#issuecomment-6449012868).
No room-channel/events, race-service/runtime, schema/migration, page.tsx or shared
matrix edits. The original released leave block and final results effect are the
only room-view changes. D-17/#64B hunks remain disjoint.

## Local evidence

- Root no-JS, lint, typecheck and build passed during implementation. Lint/types/build
  passed again for the final application correction `38847fe`; `4b578fb` changes only
  browser observation of the room socket. At `4b578fb`, root no-JS/lint/typecheck
  and the10 dedicated PostgreSQL tests were rerun successfully.
- Root `npm test`: **1,996 passed** (web661, database131, domain1137, load20, wordlists47)
  before the final results-effect correction. No claim that these unit tests cover
  the React effect: the targeted browser test below does.
- PostgreSQL affected existing files: **105 passed** (membership, display-name,
  pooled-transactions, races, room-settings, spectator-quota).
- `succession.db.test.ts`: **10 passed** at `9a12991`: microseconds, ties,
  spectator eligibility, offline/departed exclusions, presence after lock, rollback,
  concurrent/idempotent departures, new-host authorization and race/phase preservation.
- Browser: **11 distinct targeted cases passed** across the runs: rooms transfer,
  countdown/racing departure (2), FR/EN × Abysse/Aube confirmation (4), one-room
  navigation, existing race confirmation retaining design-rule7 checks,
  last-human interruption and the on-results regression described below.
- Confirmation checks: axe WCAG2/2.1 A/AA, overflow at1440/1024/390/360, reduced motion,
  Escape/focus. The16 screenshots alongside this file document the preserved layout.

### Former blocker, now passing

`host-succession.spec.ts` — **host departure on results preserves the saved race
and transfers next-round controls live**, passed at `4b578fb` (13.9s).

Two successive transfers update server-rendered host controls live. RSC GETs are
counted: one per host change (two total for the final successor). Responses are
artificially delayed350ms. A later member arrival is observed on the room socket
and does not add a refresh. Official result rows remain unchanged; the final
successor starts the next round. This verifies the observed browser behavior,
not all possible network reorderings or production behavior.

The first run of the expanded test incorrectly looked for a newly joined visitor
in the finished race ranking; that test observation was corrected to the room
socket. No product change was made for that fixture assertion. The original real
stale-controls defect was reproduced before correction and is now covered.

## Sequential reviews at 4b578fb

- Code-reviewer: OK. Existing domain selection reused; shared-line scope preserved;
  result refresh compares identical fields/types, has stable primitive dependencies,
  and changes neither initial synchronization nor host-control rendering.
- Functional QA: OK for C1. The previously failing acceptance path now passes;
  targeted coverage includes transfer, no successor, concurrent departure, rollback,
  retained race/results and newly authorized host actions.
- Security: OK. Session identity/rate limits unchanged. No client-chosen successor;
  SQL and authenticated presence decide. Existing host commands authorize server-side;
  departing/non-host identities are refused in dedicated DB coverage.
- DBA: OK. Bounded READ COMMITTED and room lock, active re-read, integer timestamps,
  atomic transfer/departure/revision, rollback on unavailable presence. No migration.
- UI/UX: OK for the adapted confirmation and live handover. Earlier screenshot,
  accessibility and race-position checks remain applicable: the final correction
  changes refresh behavior only. No design assets, logo or tokens changed.

## Limits and handoff

Local test fixtures only, not production, corpus, bonus or bot qualification.
DB tests create/drop only their own random incision_test_* databases on port5433;
browser runs use incision_e2e_succession36c1 and port3991.
C2 disconnect/grace, guests and distributed presence remain outside C1. Presence
linearizes when read under the lock; a later disconnect belongs to C2.
A owns SALLE-08/D-15 matrix reconciliation and the reserved data-model119 wording;
PR/SHA/test names will be handed over for that update. Explicit Close room is unchanged.

## Final acceptance follow-up

The four confirmation variants were rerun with360px included:4 passed (26.3s),
axe/overflow/focus checks retained and four additional360px screenshots saved.
No application code changed after4b578fb; this follow-up only expands the browser
viewport list and evidence.

## CI fixture isolation follow-up — 7b2d5d3

Both initial CI runs at c292031 passed121/122 browser scenarios but the existing
explicit-close case failed at admission. The retained RSC response returned
RATE_LIMITED: the expanded C1 test reused demo accounts and consumed their shared
room-change budgets. Only the already released C1 test now uses fresh fixture
accounts; production limits and the explicit-close scenario are untouched.

At7b2d5d3, ESLint of rooms.spec.ts and web typecheck passed. The entire targeted
rooms.spec.ts file passed10/10 (33.1s), including succession and explicit closure,
on the isolated C1 database/port after A released heavy.sh. The final diff was
reviewed sequentially: test-only identity isolation, no product/auth-policy change.
The two failed CI runs remain historical evidence, not claimed green.
