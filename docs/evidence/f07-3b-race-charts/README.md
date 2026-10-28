# F-07.3B — Stored race curves and private keyboard heatmap

Card #66, RES-03. Local verification on 2026-10-28 at `46c9dd0`,
then integration of #178's evidence-only commit as `8f3d8e2` (same product code).
Delivery is rebuilt on the actual #178 head (`c497eca`) as
`codex/f-07-3b-race-charts-delivery`: the app/packages/tools trees are identical to
the verified `59b243d` tree. This preserves #176's evidence and avoids a documentary
conflict caused by parallel cherry-pick ancestry. No published history was rewritten.
Depends on #66A / PR #177 and the bot identity schema / labels from #59B.
No merge, production change or recipe3880 change was performed.

Infrastructure incident during resumed verification: the existing local PostgreSQL
container was found stopped (exit 255), and its data directory is tmpfs. Restarting
that container revealed only the `postgres` database: the current human recipe
database had not survived the stop. No recipe reset, restore or deletion was run
by this verification. The available older backup is dated October 27, 23:12;
recovery of newer recipe data is not claimed. The user and the other session were
informed. Tests continue exclusively against disposable databases on port 3892.

## Behaviour and evidence

| Criterion | Evidence | Result |
|---|---|---|
| Everyone's net WPM curves use stored observations | `race-charts.test.ts`: exact SVG coordinates, all 30 entrants; E2E uses real persisted series for two humans and a bot | Pass |
| Individual values remain readable when curves overlap | One individual curve and time/net/raw table per entrant, in a native disclosure | Pass |
| Own cumulative missed characters only | SQL privacy in #66A; E2E Alice sees her `é` errors but not Bob's `Ж`; spectator SSR test omits heatmap | Pass |
| Zero versus unavailable history | SSR tests explicitly distinguish empty collected aggregates, missing aggregates and missing curves | Pass |
| Expected graphemes, not physical keys | Case, accent and space SSR checks; extra-character cells/table; explanatory FR/EN copy | Pass |
| Bots visibly identified | Frozen kind/level badge in legend and individual view; square endpoint; E2E bot with no account | Pass |
| No JavaScript required | Production-browser test opens native disclosures, reads actual tables, reloads and checks persisted counts with JS disabled | Pass |
| Mobile / keyboard / themes / languages | FR/EN, Abysse/Aube, 1440/1024/390/320; no page overflow; chart/table scroll via arrow keys; cell focus via Tab; computed visible outline; axe | Pass |
| Existing podium/detail behaviour | All three `results-podium.spec.ts` cases remain green | Pass |

## Checks

- `check:no-js`, full `lint`, full `typecheck`, production `build`: pass.
- Full `npm test`: 2,158 passed (764 web, 146 database, 1,181 domain, 20 load, 47 word lists). Includes eight chart rendering tests.
- Production Playwright: `race-charts.spec.ts`, `race-charts-live.spec.ts`, `results-podium.spec.ts`, `bot-races.spec.ts`: 9/9 passed. The live test finishes a real human/bot race, deliberately makes and corrects one error, then reads both stored curves and the personal count after reload. Results are not seeded in that test.
- SQL regression: bot races, profile statistics and WPM-series persistence/privacy: 16/16 passed on disposable PostgreSQL databases.
- After the CI catalog-comparison correction, full SQL verification on `f73bebf`:
  266 passed, 9 existing PgBouncer checks skipped because no pooled test target
  was configured. Database lint and types also passed. No product code changed.
- Disposable local server 3892 and database `incision_e2e_66b_charts`, through the shared heavy lock. Not the human recipe.
- The first integrated type check correctly caught the missing demo seed fields after taking only the bot schema commit. The coordinated complete bot contract (`9d5e6eb`) supplied these fields; full gates were rerun successfully. No check was disabled.

## Visual review

Compared with supplied screens 10 (results) and 11 (statistics), with their HTML
references. The existing result summary is preserved; charts are appended to the
persisted detail page. Design tokens, card surfaces, display headings and mono
data typography are reused. No new acting red, halo, animation, name or logo.

The initial mobile captures exposed tiny scaled SVG labels; they were replaced
with a readable horizontally scrollable graph, expressly explained in both
languages. Tables and heatmap stay keyboard-accessible. No page overflow. See
the [screenshots](screenshots/) at 1440, 1024, 390 and 320 px. Those screenshots
contain synthetic test data, not human recipe results.

Adaptations are recorded in [ADR-0007](../../adr/0007-private-race-charts.md):
per-race expected-character counts, no fabricated percentages or physical-layout
claim, and no advice/exercises. Count labels provide an alternative to heat colour.
Coincident curves can overlap on the collective graph; each remains available in
the individually labelled view and numeric table.

## Sequential reviews at 8f3d8e2

Same Codex session, not independent reviewers:

- Code reviewer: OK. Pure server rendering; no chart dependency, state/effect or
  new endpoint; stored observations are not resampled or extrapolated.
- UI/UX: OK locally after mobile label correction. Both themes, translated copy,
  readable internal scroll regions, visible focus, counts independent of colour,
  reduced motion and no-JS use verified. No claim of a full assistive-technology audit.
- Security: OK for the UI surface. Private projection is gated in SQL (#66A);
  spectator rendering hides even an erroneously supplied aggregate. React escapes
  names and character values; tests include markup-like names.
- Functional QA: OK for the component and persisted detail route, including the
  actual scheduled bot runtime in both typing modes and the combined human/bot
  finish with a corrected error. Interrupted races do not fabricate charts.
- DBA: no new schema beyond reviewed #177/#178 migrations. The integrated SQL
  regression passes; another entrant's error aggregate is filtered in the join.

## Still to verify

- CI on the delivered head.
- Human review: finish a race with a bot; open its race page; compare the final
  graph/table value with the result; make and correct a deliberate error and check
  the personal heatmap; check an old race's missing-data message.
- Safari/manual layout review and production are not claimed. Advice, exercises,
  profile-wide key aggregation and keyboard-layout preferences are out of scope.
