# F-01.1D — anonymous guest opponents in account results

Date: 29 October 2026 (America/Toronto). Refs #31; AUTH-03, RES-03/05,
HIST-02, D-08/D-24. Preparatory persistence only, not a playable guest release.

- Base dev: `4092967f838423270d468152d959c14ca515cb0c`.
- Branch: `codex/f-01-1d-anonymous-guest-results`.
- Runtime/schema implementation: `ded10c9e4cdc946c31e900667eb7bd628b3ec824`.
- Final reviewed/test reference: `2b06d19b9e2cf3e988f8d466d28f6c2acb88cd71`
  (only a migration test fixture changed after the implementation).
- Subsequent documentation commit records evidence only.

## Independence and storage contract

Created directly from fetched dev after #183/#184, not from #185. The merge base
with the #185 branch is exactly the base above. No #185 admission module or commit
is included. Guest SQL fixtures use the already-published 0013 schema.

The existing account-host start transaction now projects guest participants to
anonymous durable entrants when at least one account participates. The in-memory
start return still carries the live member/name for later runtime integration;
the inserted row has `kind = guest`, null account/member/bot-level and the label
`#<ordinal>`. The ordinal is local to a race; entrant UUIDs are drawn afresh each
race. There is no guest-session/cookie column, guest nickname or avatar in this
row, and no new link to a guest identity. The SQL CHECK forbids attaching an
account/member/name/bot level to a guest entrant.

Finalization reads the entrant kind from SQL and omits guest-private key errors
before validating/inserting aggregates. Caller-supplied result data cannot change
that classification. Official results and collective WPM series remain atomic
with the race/room phase change. Account-private key errors and historical
measurements remain unchanged. The results reader projects anonymous opponents
as human with `anonymous: true`, the neutral ordinal label and no self marker;
account-only history authorization remains unchanged. Anonymous guests count as
human opponents for an account victory (D-24), not as accounts with a profile.

Guest-only participants (including an account hosting as spectator) require the
separate temporary-results path. This preparatory durable start path returns
`GUEST_RESULTS_REQUIRE_ACCOUNT` without creating a race. It is not a new public
product restriction: no public guest admission is enabled, and the temporary
path must be implemented before that activation. No guest runtime, UI, renewal,
retention scheduler, #36C2 or account transition is implemented here.

Anonymity here means removal of guest identity links and names from durable
entrants, not a claim that race timing or measurements cannot be correlated by
someone who observed the live room. Normal ephemeral room membership still
exists until the later approved presence/retention work.

## Migration 0014

Reserved with the coordinator: `0014_anonymous_guest_results`, generated with
`npm run db:generate --workspace=@incision/database -- --name=anonymous_guest_results`.
The remote dev journal was read again before delivery and still ended at 0013.

SQL replaces the identity CHECK with its extended version; no data rewrite,
column removal, index removal or purge. All published SQL/snapshots were compared
byte-for-byte to the base; journal prefix is unchanged; 0014 snapshot parent
matches 0013. The migrator applies pending statements in one transaction under
its existing advisory lock and bounded DDL timeouts. CHECK replacement requires
a table lock and validation scan: production-size lock duration was not measured.

Rollback keeps this schema expansion and the older account-only behaviour while
guests remain disabled. Do not remove/rewrite a published migration or restore
the narrower CHECK once guest rows exist. Guest-private aggregate exclusion is
enforced by the application writer; there is no new cross-table SQL trigger.
Direct administrative SQL remains outside the application's authorization boundary.

## Executed checks

| Check | Actual outcome / reference |
| --- | --- |
| Root no-JS, lint, typecheck | Passed on ded10c9 |
| Root `npm test` | 2,236 passed on ded10c9: web 810, DB unit 146, domain 1,198, load 20, word-lists 62 |
| Root production build | Passed on ded10c9; runtime unchanged in 2b06d19 |
| Final DB lint/typecheck | Passed on 2b06d19 |
| `npm run test:db --workspace=@incision/database` | 287 passed, 9 pre-existing PgBouncer skips on 2b06d19; 27 files passed, 1 skipped |
| `npm run test:integration --workspace=@incision/web -- integration/wpm-series.integration.test.ts` | 1 passed on 2b06d19 |
| `npm run test:e2e --workspace=@incision/web -- e2e/race.spec.ts e2e/history.spec.ts e2e/race-charts-live.spec.ts` | 13 Chromium cases passed on 2b06d19 with the identical runtime built at ded10c9 |
| Diff whitespace and published migration lineage | Passed |

Eight new SQL cases verify anonymous rows at start, SQL rejection of identity/name
links, collective series/account-only private errors, account victory and result
preservation after room/session deletion, concurrent idempotent finalization,
fresh per-race entrant IDs, atomic rollback of invalid series, owner/interruption
refusal and the unsupported guest-only durable path.

Four upgrade scenarios cover predecessors 0012 and 0013 with 10 and 200 words.
Raw accounts, races, entrants, results, WPM series, private errors, memberships,
settings and photo bytes are compared before/after, then historical readers and
statistics are checked after cleanup/room deletion. The expected new nullable
membership column in the 0012→0013 upgrade is accounted for explicitly. Empty
schema migration and journal checks also run in the full SQL suite.

Tests use synthetic data only on a fresh PostgreSQL 17 container
`incision-guest31d-tests`, localhost 55434, tmpfs and no existing volume. E2E and
integration use separate disposable databases. Container removed after all checks.
No recipe 3880, backup, personal data, Neon/Azure/OAuth resource or real secret.

Initial failures corrected before delivery: the new fixture used `correct` where
the real error-mode enum is `mandatory`; the expanded preservation assertion
initially did not account for 0013's added nullable guest column when starting
from 0012. No test was skipped or weakened to hide either failure.

## Reviews at 2b06d19

Sequential roles applied manually in this session; not independent reviewers or
a formal security-plugin scan.

- Code reviewer: OK for this storage unit. All runtime/test/schema diff read;
  account and bot semantics preserved; no #185 dependency or public caller added.
- Security: OK for this boundary. Guest identity/name never inserted in entrants;
  SQL enforces anonymous shape; key-error filtering uses stored identity; account
  authorization and private reader join preserved. No new network entry point.
- DBA: OK locally. Generated migration and lineage checked; transactional
  constraint replacement, finalization CAS, atomicity/idempotence, empty/upgrade
  tests and preservation verified. No destructive operation or retention task.
- Functional QA: OK for SQL anonymization and account regressions. No claim of
  live guest racing, guest chart UI, first-cookie coordination or retention.

No unresolved blocker for this preparatory scope. Production lock duration,
Neon/PgBouncer, real OAuth and the full browser suite remain unverified.

## Clarification of the delayed failure from #185

The reported exec-b8ac9591 exit 1 / 396625 ms corresponds to the earlier
asynchronous sandboxed command (tool session 63666), not a new verification after
the successful rerun. Its `/tmp/guest31b-unit.log` starts the web tests at 03:46:43
UTC and ends with word-list tests at 03:52:30 UTC on 29 October. It records 60 web
failures (including `listen EPERM`, timeout and cleanup failures), then one CLI
assertion failure in `tools/word-lists/test/candidate.test.ts`: empty stderr where
usage text was expected. The log does not prove that CLI failure's root cause;
no attribution or unrelated list change is made.

The distinct rerun with local-network permission (tool session 22050) completed
with exit 0; `/tmp/guest31b-unit-final.log` records 810 + 146 + 1198 + 20 + 62 =
2236 successes, ending its last workspace after a 03:48:14 UTC start. The old run
continued in parallel and finished later, explaining the delayed failure event.
The failed run is not counted as successful evidence. #185 remains at b6b27de;
this clarification does not change its head or claim a new CI result for it.

Local log SHA-256:
- Failed old run: `8e79983679939553897603bfc945e5c3896a2475445d65329604681a453f1611`.
- Successful rerun: `6d9cdb64ae8173cadecfa333cd5eb48442fd577f6691d113bbf0070932b1ecdc`.

## Approved rules for subsequent integration — not newly implemented

Philippe approved through the coordinator on 29 October:
- Only accepted actions, including typing and “Je suis là”, renew the guest
  session; passive open tabs, GET, polling and heartbeats do not.
- Explicit leave ends presence. Switching to an account requires leaving guest
  presence first; no automatic identity merge or transfer of results.
- Races without an account retain no durable results after their room display.
- Race reconnection keeps its 30-second grace. Disconnections outside a race are
  scoped separately; this does not authorize #36C2.
- Session renewal is distinct from D-17 race inactivity; no Escape-key activity.

Future tests must cover a bounded renewal cadence, trusted server expiry and
permissions, HttpOnly cookie refresh without exposing credentials, multi-tab
races, accepted/rejected activity, heartbeat/GET non-renewal, explicit departure,
account transition without transfer, and disposal of guest-only temporary results.
These are planned tests, not executed evidence in this PR. Browser bootstrap
coordination still needs technical design; no unsupported fallback is assumed.

Done: independent anonymous storage and preservation unit. To do: combine reviewed
foundations on actual updated dev, then approved HTTP/socket/runtime and UI work,
temporary results and safe retention. No implicit stacked branch. No board,
EXIGENCES/IA, lists/calibration/random/Arcade changes. Coordinator consolidates.
