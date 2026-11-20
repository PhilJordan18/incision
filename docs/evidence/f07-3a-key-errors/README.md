# F-07.3A — Private cumulative key-error persistence

Card #66, RES-03 / RES-05. Verified locally on 2026-10-28. Product code at
`036bdd0`; the following evidence commit only extends tests and documentation.
The preparatory bot schema `ca956eb` is an explicit dependency (migration 0009);
this tranche adds migration 0010. No recipe or remote database was modified.

## Acceptance evidence

| Criterion | Evidence | Result |
|---|---|---|
| Cumulative expected graphemes, including corrected mistakes | `key-errors.test.ts` (15 cases), runtime `race-wpm-series.test.ts` (11 cases) | Pass |
| Unicode NFC, case, accents, space; no raw sequence | Decoder checks single expected graphemes, uniqueness, positive exact counts and sum against official counters; tests include long valid clusters | Pass |
| Results, series and aggregate commit atomically | `wpm-series.db.test.ts`: invalid aggregate rolls back every table and room phase | Pass |
| Retry / concurrent finalization / stale owner | Same PostgreSQL suite: one aggregate per entrant, no overwrite, no rows after interruption | Pass |
| Only the authenticated player can read their aggregate | SQL join is account-gated; two accounts, spectator and stranger tested; corrupting Bob's aggregate cannot affect Alice's read | Pass |
| Missing legacy data is not zero | Historical producer omission stays absent; real error-free runtime writes an empty array | Pass |
| Complete engine → runtime → SQL → authorized read | `integration/wpm-series.integration.test.ts`: Alice makes and corrects an error; Bob is error-free; each reads only their counts | Pass |
| Additive schema and unchanged generation | `db:generate` reports no schema changes; full database suite migrates temporary databases | Pass |

## Commands

- `npm run check:no-js`, `npm run lint`, `npm run typecheck`: pass.
- `npm test`: 2,112 passed (web 718, database 146, domain 1,181, load 20, wordlists 47).
- `TEST_DATABASE_URL=<local Docker test server> npm run test:db -w @incision/database`: 253 passed; 9 existing PgBouncer tests skipped because a PgBouncer target was not configured. This is not a PgBouncer validation.
- `npm run build`: production build passed.
- `npm run db:generate -w @incision/database`: no changes.
- Targeted PostgreSQL suite: 10 passed.
- Runtime/SQL integration suite: 1 passed, using only `incision_e2e_66a_integration`.
- `git diff --check`: pass.

Heavy checks used the shared `heavy.sh` lock. Local recipe port 3880, its database,
Docker and unrelated services were preserved. Browser rendering belongs to #66B;
there is no UI change in #66A.

## Sequential role reviews

These are reviews by the same Codex session, not independent reviewers.

- Code reviewer: OK. The domain remains authoritative; the adapter freezes its
  existing `missedKeys`, with no new scoring or keyboard rules. Tests cover failures.
- Functional QA: OK for persistence. Real engine/runtime/SQL integration proves a
  corrected error remains counted; legacy and zero are distinguished. No human UI claim.
- Security: OK for this surface. No new endpoint or client input; the aggregate
  leaves SQL only for the matching authenticated account. Public entrant projections
  contain no private aggregate. Validation errors do not include payloads.
- DBA: OK locally. Composite result FK with cascade, additive versioned JSON,
  existing owner-fenced transaction, unchanged result query count. SQL checks the
  container/version; application validation checks detailed counts and graphemes.

## Limits and rollback

No backfill: old races retain missing data. No personal advice or exercises.
The number of nonzero graphemes is bounded by authoritative insertion/error
counters, not an arbitrary 4,000-key cap; future operational limits must preserve
the accepted unlimited-race contract. No new dependencies.

Deploy migration 0010 after 0009 and before the new reader/writer. For a code
rollback retain the additive table and data; the previous release ignores them.
No destructive rollback or production action was executed. #66 remains in progress
until #66B is separately verified. Philippe alone merges.
