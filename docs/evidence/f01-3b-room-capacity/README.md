# F-01.3B — waiting-room capacity

Partial delivery of #33, SALLE-05 and CONF-11. Refs #33; do not close the parent card.

## Target and scope

Code/test target: `582c69d2260ff84a04f96835563d9b04e36353db`, branch `feat/01-3-visibility-capacity`, based on dev `1a0ed972c3456c5141872d5611b5af8cda0ae738`.

The host can change capacity to an integer from 2 through 30 while waiting. Active human participants and bots count; spectators do not. The lobby row lock serializes changes with admission and bot changes. A stale revision, non-host, invalid guest proof, expired guest or non-waiting phase cannot change capacity. Guest activity renews only on success. Text settings are not modified. No migration, dependency or recipe data change.

Creation defaults to 30 and now accepts a validated choice from 2 through 30 (creation follow-up below). Visibility controls, invitation admission, moderation and public discovery are NOT delivered here. The visibility domain helpers are preliminary policy tests, not activated UI. Existing role-change paths are not claimed as newly implemented or tested.

## Verification

- Final root rerun on `582c69d`: no-JS, lint, typecheck, all unit tests and production build passed. Counts: 955 web + 146 database + 1211 domain + 20 load + 62 word-list = **2394 unit tests**.
- Web lint, types and production build passed after the focus fix (`3970a68`). The subsequent commit adds only one SQL test.
- PostgreSQL: `npm run test:db -w @incision/database -- test/room-capacity.db.test.ts test/guest-host-actions.db.test.ts test/membership.db.test.ts test/room-bots.db.test.ts` → **48 passed**, no skips (same code/test tree as `582c69d`). Includes competing participant admission and bot addition versus capacity reduction.
- Browser: `npm run test:e2e -w @incision/web -- room-capacity.spec.ts` → **2 passed in 23.3 seconds**, FR/EN, two independent account contexts, non-host controls absent, live synchronization, persistence, rejected bounds, keyboard entry/save/focus return, axe and no horizontal overflow at 1440/1024/390/360 in both themes. Runtime identical to `582c69d`.
- Browser screenshots are generated under `apps/web/test-results/room-capacity-*/`. Reviewed summary layouts include FR 1440/1024/390 and EN 390; automated captures cover every listed width/theme/locale. Screenshots are transient local artifacts, not claimed as permanently published attachments.
- SQL runs use isolated PostgreSQL 17 at port 55439; browser server 3893 and disposable database `incision_e2e_l1_capacity`. Recipe3880, its databases, backups and server were not used or reset.

An initial expired-session fixture violated the exact 24-hour lifetime constraint. It was corrected in `0ea5b7b`; no constraint was weakened. One sandboxed SQL attempt failed with local-socket EPERM before executing tests; the authorized isolated rerun passed. Neither failure is counted as successful evidence.

## Sequential reviews

Codex applied these repository roles sequentially, not as independent reviewers. Target: `582c69d`.

- Code: domain rule, validated single-value fields, typed FR/EN errors and separate access panel; no text-settings edits or dependencies. No blocking finding in this capacity slice.
- Security: identity comes from the account session or verified guest proof; authority and membership are checked again under lock; malformed fields and stale requests are refused; errors do not return database details. SQL tests cover forged/expired guest proof and non-host denial. No remote attack or production security claim.
- DBA: bounded transaction with lobby lock, membership recheck and participant/bot counts; no per-member query loop or schema change. Real PostgreSQL tests verify concurrent invariants and unchanged text settings.
- Functional QA: two-context synchronization, persistence and bounds pass; guest-host authorization is SQL/action tested, not guest-browser tested in this slice. Full existing browser suite was not rerun.
- UI: existing design tokens and card/button styles, translated errors with text, keyboard focus checked and axe responsive matrix passed. No design source/logo modification. Human visual acceptance remains pending; no Fable review is claimed for this local slice.

## Human acceptance / remaining work

1. As host, set capacity to 2 and then 30; verify another member receives the value and a reload retains it.
2. Add participants/bots and try reducing below occupancy; confirm refusal without expulsion. Spectators remain independent.
3. Check guest-host editing, keyboard navigation, both themes and translations in the human recipe once this branch is integrated there with separate authorization.
4. Keep #33 open: visibility/invitation integration, public listing dependency #46 and human acceptance remain outstanding. #34 and #35 are separate approved upcoming work, not included in this PR.

## Creation follow-up — `aea45de`

Creation now has an accessible FR/EN numeric capacity input, retaining 30 as the default. The server validates a single value before spending its room-change budget. Missing fields on older forms keep 30; empty, duplicate, fractional and out-of-range supplied values refuse. The database creation transaction already validates capacity and remains unchanged.

- Root no-JS/lint/types/**2398 unit tests**/build: passed on `aea45de` (959 web, other workspace counts unchanged).
- Browser: **4 passed in 34.8 seconds**, adding FR/EN creation without JavaScript and chosen-capacity persistence. Both creation and waiting pages have axe/overflow checks and screenshots at all four widths in both themes. Creation screenshots at 1440 and 390 were inspected; existing page structure is retained rather than introducing the unfinished design controls.
- SQL remains unchanged from the 48-test verified tree. No new schema or admission logic.
- Sequential follow-up reviews: code/security verify validated input before database access and budget consumption, authenticated host still derived from session; UI/QA verify native form submission without JavaScript, translated labels, bounds, focus and persistence. No blocking finding in this added slice. Full browser suite and human acceptance are still pending.

## PR #189 CI repair and integration with #188/#190 — 2026-10-30

Runtime/test target: `5a12719880bb558d70786ad8ccd18875a2822523`, incorporating human-merged dev `b0912cb` without rebasing or rewriting published history.

- Original PR CI `41001792308`: 172 browser tests passed, one capacity FR contrast audit failed at the first dark-theme audit after all four light-theme captures. Push CI `41001787591` passed. Neither result was treated as two green checks.
- `3471d2b` makes the capacity test await the actual `data-theme` set by the asynchronous system-preference listener and completion of finite browser animations before axe. It retains system-theme switching, all contrast rules, all responsive widths and both languages. It does not retry an unsuccessful axe result, disable animation styles or modify product colours. The four capacity cases passed three consecutive times before integration (12 executions).
- `5a12719` resolves dev conflicts additively: keep both capacity and invitation panels, the invitation panel's distinct React key, both domain exports and both evidence records. New assertions ensure exactly one invitation panel remains before and after capacity save/reload. Invitation admission, IP checks, server wiring and migration 0015 remain identical to merged dev.
- Integrated root no-JS/lint/typecheck/build passed. Unit tests: **2501 passed** (991 web, 146 database, 1233 domain, 20 load, 111 word-list).
- Integrated PostgreSQL: capacity, invitations, guest-host actions, membership and bots suites — **63 passed**, no skips. Disposable databases only on the isolated localhost:55439 test server.
- Integrated Chromium: `room-capacity.spec.ts room-invitations.spec.ts --repeat-each=3` — **21 passed in 3.0 minutes**, no skips or retries. Covers seven scenarios repeated three times, including the real invitation admission/revocation/IP restrictions and the capacity panel coexistence assertion. Server 3893 and disposable `incision_e2e_l1_capacity` only. FR waiting-page captures were inspected at dark 1440 and light 1024/390; no duplicated panel or horizontal overflow. The existing staged room layout remains, not a claim that the full screen-06 orbit design is implemented.
- Sequential code/UI/QA review: no fixed sleep, no skipped assertion or relaxed axe rule; both controls retained with existing tokens. Security/DBA integration review: invitation authorization/admission/migrations unchanged from dev; capacity and invitation admission still share the lobby lock. No additional permission or schema change.

The full browser suite, full SQL suite, Safari/Firefox and human acceptance are not claimed as rerun for this repair. Recipe3880, its databases, backups and server remain untouched. #33 remains partial; this repair does not add visibility controls.
