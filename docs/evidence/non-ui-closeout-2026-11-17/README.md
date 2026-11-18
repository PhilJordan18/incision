# Non-UI closeout — evidence register

## Scope and acceptance

Approved by Philippe in the active conversation after #209 merged. This is the
evidence consolidation portion of the non-UI closeout, traced to #76 (matrix),
#35 (SALLE-07), #47 (JOIN-03), #65 (RES-04), COURSE-03/09 and PERF-02/03.
Acceptance: reconcile exact evidence, distinguish existing coverage from missing
checks, preserve A–G, identify closure candidates and the next executable work.
No product change, card closure, push, merge, deployment, recipe access or data
mutation is included. Claude's C1 implementation is a separate delta.

Branch: `codex/closeout-non-ui-evidence`.
Tested application base: `b98314ac6257c358ab93865d57f00e12f70b5fb9`.
The working copy is isolated under `/private/tmp`; the original repository,
recipe and Aegis/HackSorel stacks were not changed.

## Exact integrated evidence

#209 is merged at the base above. Its head is
`75b01fac394a3681611ccaa0e8d3b4d71cc8948e`; `git diff` between head and merge is
empty. Both runs were read, not triggered by this closeout:

- [Push CI](https://github.com/PhilJordan18/incision/actions/runs/44217113315): completed, success.
- [PR CI](https://github.com/PhilJordan18/incision/actions/runs/44217118785): completed, success.

The PR job log records 2,669 unit tests (1,121 web + 157 database + 1,259 domain
+ 21 load + 111 wordlists), 433 SQL tests, 11 integration tests and 251 E2E.
Nine PgBouncer tests are skipped. This is historical CI evidence on the identical
application tree, not a new local SQL/E2E execution or a production validation.

## Reservation disposition

| Reservation | Evidence actually inspected | Disposition |
|---|---|---|
| Reentry after expulsion, SALLE-07 | `apps/web/e2e/room-moderation.spec.ts`: FR/EN account eviction across tabs, reload/code refusal and refusal with a fresh invitation; three guest phases (waiting/racing/results), unchanged cookie deadline and refused reentry. All five scenarios pass in the PR log. SQL suite covers identity-only ban, invitation revocation and concurrent reentry. | Automated coverage exists; do not ask Philippe to repeat A–G. This is not new human testimony or a whole-security audit. |
| Empty quickplay, JOIN-03 | `apps/web/e2e/quickplay.spec.ts`: FR/EN account empty state, no implicit creation, explicit public creation with defaults; guest empty state and no creation; account flow without JS. Nine quickplay scenarios pass in the PR log. SQL tests cover ordering, ties, capacity, bans and next-candidate retry. | The claim that the empty state is untested is obsolete. Retain distinction between the November 5 human fullest-room testimony and automated empty-state proof. |
| Profile aggregates | `packages/database/test/profile-statistics.db.test.ts`: empty data, exact averages/counts, timed-out/abandoned inclusion, interrupted/other-account exclusion, latest 30 ordered by microseconds/ID, lifetime totals, one parameterized query. Three SQL cases pass; three profile E2E pass. | Arithmetic/private projection is covered automatically; no invented human numerical comparison. |
| Personal records, RES-04 | Existing `../f07-2b/README.md`: four categories, exact comparison, ties, first reference, historical record preservation and non-finisher exclusion. | Preserve existing proof; no fresh record-specific execution or new human acceptance claimed in this tranche. |
| PUBLIC → CODE | Visibility E2E covers PRIVATE → CODE → PUBLIC → PRIVATE, not the exact PUBLIC → CODE transition. | Keep a targeted check open: disappearance from public list/quickplay, code admission still allowed, current members retained. Do not infer it from the other transitions. |
| Synchronized countdown/reveal, COURSE-03 | Clock-sync and runtime suites rerun below; existing integration prevents early text disclosure. | Technical coverage retained. Screenshots C alone do not measure cross-client reveal skew; explicit targeted evidence still outstanding. |
| Active unlimited race beyond ten minutes, COURSE-09 | Runtime test advances a fake clock to 700 seconds with both participants active, then finalizes once after voluntary abandons. | Passes as simulation, not wall-clock endurance. A real isolated run remains. |
| Current load / SQL budgets / rendering, PERF-02/03 | Existing deterministic guest batching and historical November 6 load are distinct from current browser load. | Current guests + Arcade load remains; C1 track rendering must be measured after C1, not before. |
| PgBouncer / Neon | Nine skips in current CI, older local pooler campaign retained separately. | Configure an isolated pooler for a current rerun; Neon needs explicit resource authorization. No old success relabels a current skip. |
| Corpus / production / final submission | Existing import, synthetic restore and human A–G proofs remain valid within their scope. | Editorial acceptance, current deployed version/HTTPS/OAuth, final Lighthouse/costs and personal submission documents remain separate gates. |

## Checks performed in this tranche

Node 24.13.0, from the isolated repository:

```sh
npm run test --workspace @incision/web -- \
  src/server/races/race-runtime.test.ts \
  src/races/clock-sync.test.ts \
  src/races/clock-sync.socket.test.ts \
  src/server/rooms/moderation-actions.test.ts \
  src/server/rooms/quickplay-actions.test.ts \
  src/server/rooms/visibility-actions.test.ts \
  src/server/realtime/guest-command-gate.test.ts
```

Result: **7 files, 111 tests passed** in 2.90 seconds.
The first restricted attempt passed 110 but failed the real Socket.IO test with
`listen EPERM 127.0.0.1`. Repeating the same suite with permission to bind the
ephemeral local server passed all 111; no assertion or code was changed.

Read-only Docker availability check: daemon unavailable. No Docker restart,
database connection, SQL run, browser run, load run or stack mutation followed.
The absent daemon prevents fresh local database-backed qualification here; it
does not invalidate the already recorded CI SQL/integration/E2E results.

## Closure and next work

- #209 delivery is integrated; its two CI runs are green. No agent merge.
- #35 and #47 have evidence packages suitable for a closure review; no closure
  is performed, and this register does not claim every historical checklist
  item was manually reaccepted. The exact remaining UI delta belongs to C1.
- #65 remains open for its complete scope, including the record acceptance
  distinction; parent cards are not closed by one passing child scenario.
- Matrix totals remain **34 complete / 56 partial / 0 not done**, 90 unique IDs.
  No claim of 100% and no attempt to rename 56 partial requirements as 15 tests.

Next independent technical batch: isolated PostgreSQL/PgBouncer, exact
PUBLIC → CODE regression, real >10-minute active race, and current guest/Arcade
load with SQL counters. Use synthetic data and dedicated ports/databases; never
reuse the human recipe or Aegis/HackSorel. C1 then needs only affected UI flows,
FR/EN, both themes, keyboard/contrast, responsive layouts and track performance.
Production actions require separate explicit approval. No need to redo A–G.

## Review

Architect review applied sequentially: documentation-only diff, official IDs
retained, immutable CI references, existing and new checks distinguished,
historical human validations preserved, outstanding work explicit. No blocking
documentation finding. Full application rebuild is not required for this
documentation-only change under CONTRIBUTING. Delivery awaits a new `deliver`.
