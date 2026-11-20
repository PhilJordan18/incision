# F-07.5C — Private profile statistics

Implementation: `7382d5d`, following integration of PR #149 (`b14e5d0`). No migration, dependency, corpus or race-runtime change. This is local evidence, not a production or human acceptance claim.

## Contract and limits

- Only the authenticated account's results from races whose state is `finished` contribute. Timeouts and abandons contribute to the count and arithmetic per-race averages; interrupted races do not.
- The approved #68C record convention requires the personal outcome `finished`. A victory additionally requires rank 1 and another human entrant. Current persistence stores authenticated human accounts only; bot/guest persistence must add an explicit participant kind and adapt this query before using these statistics.
- Counts are zero for empty history, measurements are absent, and real zero remains distinguishable. Storage failure renders an unavailable state rather than fabricated zeroes.
- One parameterized SQL statement returns at most 180 sufficient-statistic groups and 30 chronological points in one MVCC snapshot. Lifetime history stays in PostgreSQL, not application memory. Microsecond timestamps and race IDs provide deterministic ordering.
- The graph shows final net WPM across the latest 30 races, not an intra-race time series. Its HTML table works without JavaScript. Only the current configuration is integrated; future mode separation, public profiles, heatmaps and production are outside this tranche.

## Verification

Full verification on `ac95755` passed no-JS, lint, types, unit tests (593 web, 130 database, 1,061 domain, 20 load-tool, 47 word-tool), PostgreSQL (190 passed; 9 PgBouncer tests skipped without that configuration), migration drift and production build.

The initial targeted E2E run was 4/9. Four failures exposed insufficient contrast in the new gold record label; the fifth exposed an ambiguous test selector matching both summary and caption. These were real findings, not classified as machine flakes. `7382d5d` keeps the gold border but uses the existing readable label style, and targets the actual summary. Initial traces and log are retained locally under `.codex-worktrees/_tools/f075c-first-failure/`.

The affected verification on the tree committed as `7382d5d` passed lint, types, build and all nine profile-name/photo/statistics browser scenarios (9/9). The SQL and aggregation code are unchanged from the full gate. Browser checks cover signed-out rejection, forged account query isolation, private/no-store responses, exact aggregates, excluded interruption, reload, empty history, keyboard disclosure and no-JavaScript operation. FR/EN, both themes, widths 1440/1024/390/360, horizontal overflow and axe are included.

## Sequential reviews

Codex applied repository roles sequentially, not independent reviewers:

- Code: pure aggregation, thin SQL and server-rendered presentation; no duplicated race calculation, client cache or new dependency.
- Security: identity comes from the checked session, SQL is parameterized, query arguments cannot select another account, unavailable state exposes no SQL errors. No remote security tests.
- DBA: existing unique entrant/result constraints avoid duplicated results; existing account/race indexes serve the joins. One read-only statement, no transaction/session setting or schema change. Lifetime database scan cost is not claimed constant.
- Functional QA: independent aggregate fixtures, 35-result ordering/bounding fixture, empty-versus-zero and single-point rendering, real browser privacy and profile regression checks.
- UI/UX: tokens and typography from screens 11/12, existing profile controls preserved, one acting red, static graph and keyboard-readable table. Small SVG axis labels on narrow screens remain a minor readability limitation; full values are available in the adjacent table. No Safari/Firefox or production claim.

## Acceptance remaining

Philippe's short acceptance on `/account`: check name/photo preservation; the five figures against a known completed course; chronological table; FR/EN and both themes; another account's empty/private state. No new full race recipe is required for this tranche. Keep #68 open until its complete scope is accepted.
