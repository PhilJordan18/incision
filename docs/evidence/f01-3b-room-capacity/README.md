# F-01.3B — waiting-room capacity

Partial delivery of #33, SALLE-05 and CONF-11. Refs #33; do not close the parent card.

## Target and scope

Code/test target: `582c69d2260ff84a04f96835563d9b04e36353db`, branch `feat/01-3-visibility-capacity`, based on dev `1a0ed972c3456c5141872d5611b5af8cda0ae738`.

The host can change capacity to an integer from 2 through 30 while waiting. Active human participants and bots count; spectators do not. The lobby row lock serializes changes with admission and bot changes. A stale revision, non-host, invalid guest proof, expired guest or non-waiting phase cannot change capacity. Guest activity renews only on success. Text settings are not modified. No migration, dependency or recipe data change.

Creation still defaults to 30. Visibility controls, invitation admission, moderation and public discovery are NOT delivered here. The visibility domain helpers are preliminary policy tests, not activated UI. Existing role-change paths are not claimed as newly implemented or tested.

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
4. Keep #33 open: creation controls, visibility/invitation integration, public listing dependency #46 and human acceptance remain outstanding. #34 and #35 are separate approved upcoming work, not included in this PR.
