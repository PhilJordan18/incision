# F-07.2B — Exact errors and personal records

Local verification, October 25, 2026. Refs #65; depends on #154 (F-07.2A).
Built/visually verified product SHA: `2f5b6e3a6947b010d7a2d81074da1ab2a87018c0`.
Later changes add documentation/screenshots and move the new pure helper's export
within the same barrel to avoid an insertion conflict with the pending #151.
No implementation, UI, test or dependency behavior changes after this build.
No human acceptance, merge, production verification or deployment is claimed here.

## Delivered behavior

- Errors are the persisted integer `totalInputs - correctInputs`, not reconstructed
  from rounded accuracy. Corrected mistakes still count.
- Only the authenticated reader's own completed result gets a personal record note.
  The existing entrant-only historical access and room-member/spectator access remain.
- The note compares unrounded net WPM with strictly earlier eligible races in the same
  bonuses on/off and mandatory/free category. Philippe approved this temporal rule in
  the active conversation. A tie is distinguished from a first reference; a later
  better result does not erase an older record on reload.
- Missing legacy configuration yields an unavailable comparison, never an invented
  default. No record for a time-out, abandonment or interrupted race.
- PostgreSQL performs the temporal comparison at its own timestamp precision.
  Equal end times do not impose an arbitrary UUID order. This is a read projection
  over retained results, not a newly persisted badge: a retroactive historical
  correction/backfill can revise the evidence.
- Podium, raw WPM, status/reason, room actions and the no-JavaScript result page from
  #154 remain. Bonus history, charts, heatmaps and runtime changes are out of scope.

## Commands and exact provenance

| SHA | Command | Observed result |
|---|---|---|
| `e88f93e` | `npm run check:no-js`, `npm run lint`, `npm run typecheck` | pass |
| `e88f93e` | `npm test` | 1,853 tests: web 597, database 130, domain 1,059, load 20, word tool 47 |
| `e88f93e` | `npm run test:db -w @incision/database -- test/races.db.test.ts test/history.db.test.ts test/results-details.db.test.ts` | 63 pass |
| `e88f93e` | `npm run build` | pass |
| `2f5b6e3` | `npm run check:no-js`, `npm run lint`, `npm run typecheck` | pass |
| `2f5b6e3` | `npm run test -w @incision/domain -- src/profile/result-record.test.ts` | 3 pass |
| `2f5b6e3` | `npm run test -w @incision/web -- src/components/races/results-podium.test.ts src/components/races/results-details.test.ts` | 6 pass |
| `2f5b6e3` | `npm run test:db -w @incision/database -- test/results-details.db.test.ts` | 9 pass |
| `2f5b6e3` | `npm run build` | pass |
| `2f5b6e3` | `npm run test:e2e -w @incision/web -- e2e/results-podium.spec.ts` | 3/3 pass |

The final product delta after `e88f93e` is a test locator correction and the record
note's opaque theme surface plus its regression assertion. The domain and database
implementation did not change. The full root unit suite is not claimed to have been
rerun on the final SHA; the affected tests, checks and real build/browser flow were.
After the documentation/export-position commit, guards, lint, typecheck and the
same 3 domain + 6 render + 9 PostgreSQL tests are rerun as the delivery check.

Local logs: `.codex-worktrees/_tools/f072b-gate.log` and `f072b-final.log`.
Heavy commands used the shared `heavy.sh` lock. SQL tests create/drop their own local
temporary databases; browser tests use `incision_e2e_results65b`, port 3992.
No migration, dependency, lockfile, corpus or race-runtime edit.

## Failures retained and corrected

1. The first database attempt could not connect to local PostgreSQL before tests
   ran. The existing stopped test container was started without recreating it or
   stopping Docker/other projects; the isolated tests then ran successfully.
2. At `e88f93e`, all three browser cases failed on an exact text locator which did
   not include the decorative star. The visible record was present. `b3131d1`
   selects the named semantic note and asserts its text instead.
3. At `b3131d1`, the no-JavaScript case passed, but axe correctly rejected the
   gold-on-tinted-gold record note in Aube in both languages. `2f5b6e3` uses the
   existing opaque `bg-nuit` token and keeps the contrast checks. Final result: 3/3.

The two browser failures and traces are kept locally under
`.codex-worktrees/_tools/f072b-first-failure/` and `f072b-contrast-failure/`.
Neither is described as a flake. No test was disabled or weakened.

## Sequential review roles

Applied by the same Codex on `2f5b6e3`, not independent subagent approvals.

| Role | Verdict and evidence |
|---|---|
| Code | OK: pure comparison separated from SQL and presentation; no copied runtime rules; unchanged #154 behavior; focused tests |
| Functional QA | OK: exact integer boundaries, zero/no prior, ties, all four categories, later better result, terminal outcomes and legacy settings |
| DBA | OK: real PostgreSQL tests including microseconds, left-join absence and at most three queries; one aggregate row, no per-entrant history query; no schema/write changes |
| Security | OK: existing authorization kept, account-scoped history, frozen config/seeds not returned, no peer record projection; non-member and spectator tests |
| UI/UX | OK after the contrast correction: screen 10 comparison, FR/EN, Abysse/Aube, reduced-motion preference, keyboard-scrollable table, axe at 360 px, no page overflow at 1440/1024/390/360 |

No blocking finding remains. Limits: no Firefox/Safari or human acceptance here;
the current storage represents authenticated accounts only, so future persisted
guest/bot entrant kinds must keep the eligibility filter explicit. No Neon test.
The history aggregate is bounded in returned rows/query count, not constant-cost
in accumulated history; no new index or performance claim is made in this slice.

## Screenshots and short acceptance

All 12 FR/EN × Abysse/Aube × 1440/1024/390 screenshots were captured. Representative
captures below are synthetic test accounts, not real student data.

- [French, Abysse, 1440 px](results-fr-abysse-1440.png)
- [English, Abysse, 1024 px](results-en-abysse-1024.png)
- [French, Aube, 390 px](results-fr-aube-390.png)

After integration, use a local test account and finish a short race:
1. Check that an incorrect insertion still counts after correction in **Errors**.
2. Check the personal note and its mode; first eligible race is a first reference.
3. Make a better later result and reopen the earlier result: its original note stays.
4. At narrow width, keyboard-scroll the table; switch FR/EN and themes.

RES-02 remains partial (bonus history missing). RES-04 is locally verified only.
Issue #65 stays open; this increment does not complete all its acceptance criteria.
