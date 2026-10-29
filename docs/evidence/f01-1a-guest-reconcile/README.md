# F-01.1A — local reconciliation evidence

Date: 28 October 2026 (America/Toronto). Code SHA:
`b731c059138eceb849183bdbe677de2b8476709d`; base dev
`7d9a2ee977107ce848b6ff7337aac8f399ccb978` (human merge of #182).
Branch: `codex/f-01-1a-guest-reconcile`. No push, merge or deployment.

## Provenance and integration

Original bundle verified with SHA-256 and `git bundle verify`, imported into
`codex/review-31-cloud-original` at `db434aadd59d77264e02db808ef3e42b29e4fcc8`.
Original files and commits remain unchanged. Source transplanted onto current dev;
original SQL and metadata excluded. Drizzle generated one new migration,
`0013_guest_identity_foundation`. Existing 0012 SQL/snapshot are byte-identical;
journal appends only. No published migration was renamed or rewritten.

## Checks executed by coordinator

| Check | Result |
| --- | --- |
| `npm run check:no-js`, `npm run lint`, `npm run typecheck` | Passed; lint/typecheck repeated after test corrections. |
| `npm test` | 2,235 passed: web 810, database 146, domain 1,198, load 20, word-lists 61. Runtime code c1dcf1d; b731c05 changes tests only. |
| `npm test --workspace=@incision/web -- src/server/identity` | 40 passed again on b731c05. |
| `npm run build` | Passed on b731c05. |
| `npm run test:db --workspace=@incision/database` | 277 passed, 9 existing PgBouncer tests skipped (no dedicated URLs). |
| Targeted guest SQL suite | 8 passed, including 0012 upgrade with 10/200-word settings, photos, results, WPM and private errors preserved. |
| Playwright guest-session + session specs | 14 passed, production build, local Chromium. |
| `git diff --check`; existing 0012 diff versus dev | Clean; no 0012 SQL/snapshot change. |

Tests use PostgreSQL 17-alpine (already available locally), new tmpfs container
`incision-guest31-reconcile-alpine`, port 5446. SQL harness creates/drops only
random `incision_test_*` databases. Browser server port 3848 and disposable
`incision_e2e_guest31_reconcile`. Recipe 3880, its databases, backups and server
were not changed. Docker was started; no existing container was stopped.

Initial attempts are not passing evidence: sandbox blocked socket tests, so the
suite was interrupted and rerun with local sockets allowed; Docker image download
was interrupted before container creation and replaced by the existing 17-alpine
image. Initial build caught excess-property typing in the new streaming test;
initial SQL suite caught the old fixed pending-migration count. Both corrected
in b731c05; full build and SQL suite then passed. No checks disabled.

## Reviews

Independent security and DBA reviewers examined exact b731c05 read-only. Security
found and verified correction of single-address global-slot starvation. A 24-cycle
limiter reproduction now admits the independent address in every cycle; HTTP
regression also checks stalled bodies time out and release per-address slots.
DBA confirmed additive migration compatibility, post-lock expiry checks,
uniqueness, bounded transactions and preservation assertions. Coordinator read
and consolidated reports; reviewers did not independently rerun application suites.

This is a security-role review, not a formal Codex Security plugin scan. No UI
component changed. Generated guest avatar and guest screens remain future work.

## Remaining limits

- Foundation only: no operational guest admission, presence, racing, avatar,
  result-retention lifecycle or cleanup scheduler. #31 remains open.
- Local two-per-address/eight-global concurrency bounds are not distributed DDoS
  protection; NAT users share budgets.
- Before operational cleanup, review an index serving departed guest memberships.
- Deployment requires separately approved guest signing-key provisioning and
  real HTTPS/proxy checks. No real secret or remote resource changed.
- The npm install audit reported 4 moderate and 1 high advisory; no dependency
  change was made. This run does not certify the pre-existing dependency inventory.
- Full browser suite, PgBouncer, real OAuth and production were not tested here.

Ready for delivery review of this foundation only, not completion of all five slices.
