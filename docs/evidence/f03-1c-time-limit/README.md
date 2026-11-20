# #45 — no limit or 30–600 seconds

Application and test commit: `dada1e2`, based on integrated dev `2672e43`.
This is a local, verified tranche of #45, not completion of all room settings.
No push, PR, merge, deployment, recipe reset or remote-resource operation.

## Behavior and compatibility

The host can explicitly select **No limit**, or enter a whole number of seconds
from 30 to 600 inclusive. The server accepts the exact `none` form value as null;
missing/duplicate fields, files, malformed numbers and out-of-range durations are
refused. The runtime receives null unchanged, with no substituted ceiling. Free
mode, bots, bonuses and other text controls remain outside this tranche.

A newly created room uses no limit (D-19). Existing saved settings are not updated.
Rooms created by a legacy process without a settings row retain their former 120 s
fallback until the host changes it. No schema/migration/default rewrite is needed.
The host action, authoritative revisions, room lock and save/start ordering remain
in place. A race freezes the saved settings at start, never the host's draft.

The interface extends the existing screen 06 adaptation with a labeled native
checkbox, keyboard control and a disabled duration input while unlimited is selected.
Text remains in the dedicated FR/EN copy module. Existing tokens and layout are
retained; no design asset or logo changed. The numeric input begins at 30 s when the
host explicitly switches off No limit; nothing is saved until Save settings.

## Verification

- Root no-JS guard and lint passed. Root type checks passed after replacing a test's
  import of the removed provisional 120 s constant with the domain 600 s constant.
- Unit suites: web 711, database 131, domain 1181, load 20, word-lists 47 passed across
  the verification runs (2,090 total). The first web run failed because an old
  host-action test still expected 121 s/none to be refused. That expectation was
  replaced with invalid 601 s/null cases and explicit accepted-duration tests; all 711
  web tests then passed. No failing assertion was skipped or suppressed.
- PostgreSQL: 66 tests passed in `room-settings.db.test.ts` and `races.db.test.ts`.
  These cover new defaults, unchanged legacy/stored settings, SQL constraints,
  host-only authorization, stale revisions, phase lock, two-host-tab saves,
  save/start races and departure ordering. Random isolated test databases only.
- Build: passed on `dada1e2`.
- Browser: 8 targeted `room-settings.spec.ts` tests passed on `dada1e2` (39.4s).
  Real UI starts at 60 s, 600 s and no limit, two accounts see saved settings, reload,
  frozen race configuration, confirmed abandon and next-round settings; conflicting
  host tabs and a lost response; FR/EN 30/600/none persistence, 29/601 refusal and
  keyboard Space toggles. Axe in both languages/themes at 360 px, no horizontal
  overflow at 1440/1024/390/360 px. Twelve reference-width captures are alongside.
- Integration: all 8 `race.integration.test.ts` tests passed on `dada1e2` (121.83s),
  using real server processes: unlimited starts, keystrokes, persisted results,
  restart/recovery and corpus-backed configuration/provenance checks.

The runtime test `keeps an active unlimited race running beyond ten minutes, then
ends on voluntary abandons` advances a fake clock through 700 s of activity, confirms
both runners still race and no results have been saved, then confirms one final
save after both abandon. Existing inactivity, completion, disconnection and
`race-inactivity-pause.test.ts` coverage passed in the web suite. This is automated
clock evidence, not a 700 s human session or an induced database outage.

Browser port 3992/database `incision_e2e_time45`; integration ports 3993–3995/database
`incision_e2e_time45_integration`, all local 5433. Heavy work is serialized with
`heavy.sh`. Human recipe 3880 and its database/data were never modified or restarted.

## Sequential reviews at dada1e2

- Code: OK. Full diff inspected; no unrelated feature or dependency/configuration
  change. Domain bounds shared, null preserved through the server, existing
  revision/ack/conflict behavior retained. No blocking finding.
- Security: OK for this surface. Session identity precedes parsing; current host,
  membership, phase and revision checked in the existing locked transaction.
  Client identities cannot select a different host. Strict bounded Zod fields;
  unsupported modes stay unavailable. No remote security test claimed.
- DBA: OK. No migration or stored-row rewrite. Reads preserve existing settings and
  the old missing-row fallback. Save/start still serialize on the room lock; 66
  targeted SQL tests passed on isolated databases.
- Functional QA: OK. Automated criteria covered as listed above, including all
  8 integration tests. No human or production acceptance claim.
- UI/UX: OK for this tranche. FR Abysse 1440/1024/390 and EN Aube 390 captures visually
  compared with screen 06 and its existing documented adaptation. Labeled checkbox,
  clickable 44 px label row, visible focus, keyboard, translated hints and no overflow.
  Axe passed both themes/locales. No claim of implementing the whole screen 06 design.

Roles were applied sequentially in this session; no independent peer review is claimed.

## Matrix handoff and remaining scope

A retains the shared matrix/documentation: handoff only, no overwrite of its files.
CONF-01 can cite this tranche's code and proofs after actual integration; COURSE-09
can remove the provisional restriction then. Until merge, dev retains the earlier
behavior. D-17 lease-pause code is unchanged; its regression suite is green.
D-19 is advanced only for the no-limit default in new rooms; quick play and other
missing settings are not implied. CONF-08 free mode and CONF-04–07 controls remain
separate. Keep parent #45 open. Publishing awaits Philippe's `deliver`; no CI result
is available for this unpushed branch.

## Post-publication CI correction

Philippe explicitly authorized delivery, and PR #174 was opened toward dev at
`0249fcf`. Both initial CI runs passed all stages before the browser suite, then
failed on the same existing departure-confirmation scenario: it expected a running
countdown clock in a newly created room, which now correctly defaults to no limit
and displays an em dash. All 129 other browser tests passed in both runs, including
the eight settings scenarios.

After explicit release of this test by the free-mode session, its setup now saves
120 seconds through the real host settings UI before starting. The clock-progression
assertion is preserved and now also requires a numeric clock. Product code, default
settings, CI configuration and all other assertions are unchanged.

The exact targeted scenario passed locally (7.8s; complete run13.2s) against the
existing production build, dedicated port3992/databaseincision_e2e_time45. No full
local browser rerun. New CI results are tracked on PR #174. No merge or recipe change.
