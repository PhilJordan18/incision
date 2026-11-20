# F-07.7 / TECH-04 — local corpus, accounts and history seed

This slice completes the local persistence path after #147's pure simulation. It
adds no migration, runtime route, UI, package dependency or shared export. The
branch starts at `dev` `3a1dcff` and includes the unmerged #147 prerequisite.
Human merge order: #147, then this PR; no agent merge.

## Run on your own local demonstration database

Apply the existing migrations to a database you own first, using the documented
migration command. This seed never creates, drops, truncates or migrates databases.
From the repository root (Node 24 and dependencies installed):

```sh
DEMO_HISTORY_DATABASE_URL='<your local database connection>' \
  node --import tsx packages/database/scripts/seed-history.ts --version 2026-10-25.2
```

The connection must be explicitly supplied; the command never loads `.env` or
falls back to the application's URL. Remote targets are refused. Localhost is an
accident-prevention guard, not a guarantee against an operator's localhost tunnel.
Use your own database, never another session's E2E database.

The corpus version is explicit. Optional `--folder` uses the existing corpus
reader's format. Files must pass `checkCorpus`; no corpus data is edited here.
A later accepted version can be used without changing this command's code.
Existing import semantics apply: importing an already known version is a no-op
and never reactivates an older version.

Two intentionally public, fictional local credentials are created, without
privilege (not secrets and never suitable for protecting real data):

| Login | Public demo password |
| --- | --- |
| `demo-history-alice` | `brume-history-alice-4817` |
| `demo-history-bruno` | `brume-history-bruno-2096` |

They are separate from the existing `demo-alice` / `demo-bruno` E2E accounts.
Sign in with either new account and open its history: six races and their private
result pages are available. Their fixed dates start on October 1, 2026, making
reruns reproducible rather than moving them to the top on each invocation.

## What the data means

For each language, the seed chooses the shortest retained passage, breaking ties
by passage ID. It prepares normal completion, voluntary abandonment and timeout
scenarios. The bot engine generates seeded typing events in a temporary virtual
race. Those inputs are replayed as the two **synthetic human accounts' scripts**
through `simulateRace`; all persisted counters, accuracy, WPM, statuses and ranks
come from that final reducer output. No result is invented or rewritten.

This is demonstration data, not measured player performance or playable bot
integration. The current persisted schema has human account identities, so the
seed introduces no bot masquerading as a live account. Both accounts are explicit
synthetic human participants, preserving the two-human interpretation for D-24.
Each race is `finished`; individual outcomes can be `finished`, `abandoned` or
`timed_out`. An abandoned entrant is not an interrupted race. Arcade/bonuses,
WPM series, production validation and the corpus volume target are not qualified.

## Idempotency and failure boundaries

- Stable IDs depend on seed version and corpus checksum, not the wall clock.
- Accounts are reserved by exact ID/login/display name and verified public demo
  password. A conflicting account is refused; no existing account is updated.
- Full race, entrant and result snapshots must match on rerun. A missing or edited
  result is a conflict, not an invitation to repair or overwrite existing data.
- Account/history inserts are one bounded transaction, serialized by a transaction
  advisory lock. A late conflict rolls back all earlier inserts in that batch.
- Corpus import and history insertion are two independent idempotent phases. If
  history fails, the successfully imported corpus remains; a corrected rerun can
  resume. No overall atomicity across those phases is claimed.
- A new corpus checksum produces another set of six histories. Existing versions,
  unrelated accounts and races are never replaced by the history writer.
- If someone changes a demo profile or password, rerun refuses it. Choose a fresh
  database rather than deleting or resetting somebody else's data.

## Verification and review

Targeted local checks on PostgreSQL 17, each suite creates and drops only its own
random `incision_test_*` database:

- `test/demo-history.db.test.ts`: 6 tests: real engine results, private reopening,
  exact replay/concurrent replay, unrelated account preservation, late conflict
  rollback, changed password refusal, reserved-login collision refusal.
- `test/demo-history-cli.db.test.ts`: 2 tests: missing/remote/host-override refusal;
  actual CLI imports texts/accounts/history, then reruns unchanged (2 accounts,
  6 races, 12 results).
- Existing `test/history.db.test.ts`: 6 regression tests.
- Domain simulator and bot-engine tests: 41 tests, including calibration cases.
- Database lint/typecheck, `check:no-js`, `git diff --check`.

Reviews applied sequentially without editing during each role: code-reviewer,
functional QA, security and DBA. Scope: new CLI, fictional identities, immutable
snapshots, reducer mapping, transaction/collision handling and actual PostgreSQL
constraints. No schema change or new network surface. Existing migrations apply
in each disposable test database. No remaining blocking finding.

No new browser run is claimed: this slice changes CLI/data generation only; the
real history/results query adapters are exercised against generated data. Linux
CI is reported separately on the PR. No Azure, Neon, OAuth, secret, integration,
CI configuration, other-session database or production operation was performed.

## Shared matrix handoff

`docs/EXIGENCES.md` remains with the corpus/documentation owner. Suggested TECH-04
integration: reference `packages/database/scripts/seed-history.ts`,
`src/demo-history/{fixture,seed}.ts`, the two PostgreSQL suites and this evidence;
record the local seed as verified, distinguish pending human integration from
production evidence, and preserve existing corpus/demo-account evidence. The
shared matrix has not been silently edited; #70 remains open for integration.
