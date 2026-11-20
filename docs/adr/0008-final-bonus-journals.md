# ADR-0008 — Final bonus journals

Status: implemented within the approved #65/#67 scope; not merged.
Date: 2026-11-06.

## Context

RES-02/HIST-02 require received bonuses in results and historical reopening. Final
progress cannot reconstruct grants or successful activations. The private server
coordinator already holds `awards.grants` and successful receipts in `consumed`.
D-08 forbids a durable guest identity or guest-owned history.

## Decision

Persist a bounded versioned JSON journal in the nullable `race_results.bonus_journal`
column, generated migration `0020_lowly_veda`. This replaces the conceptual
`race_bonus_events` table for this slice: no event replay or per-activation SQL.

- At the authoritative end only, project each actual grant's kind and milestone.
  Match successful consumed receipts by entrant and milestone. An activation stores
  its target's frozen race-local ordinal and `atMs`, the server receipt instant minus
  the common start. The time includes pauses and is not the result's active typing
  duration. No inferred grant, inferred activation, seed, receipt identifier,
  nickname, account, session or membership identifier enters the journal.
- Deep-freeze this projection with results before the first persistence attempt.
  The existing room lock, owner generation and state transition fence the transaction.
  Validate version, strict keys, maximum three grants, known types/milestones, ascending
  unique milestones, finite exact nonnegative times and targets in the frozen roster.
  Persist with the result and the move to RESULTS; rollback together on failure.
  A retry after a committed write returns `alreadyDone` without overwriting facts.
- SQL accepts NULL or a version-1 object with an array of at most three grants;
  application validation enforces the complete nested contract on write and read.
  There is no new index or query per grant. Journals share result lifetime and deletion.
- NULL/absent means uncollected older data; `{version:1, grants:[]}` means collected
  with no bonus. Migration supplies no default and performs no backfill. The demo
  history remains uncollected; it never simulates fictitious grants.
- Reuse existing authorized result readers. Account-race guests remain anonymous
  race-local participants, including target labels. Guest-only races persist no result
  rows or journals: the existing temporary room cache retains their view until its
  normal eviction. No personal guest history or identity linkage is introduced.
- Use one server-renderable component in results and historical detail, with native
  disclosures, localized labels and exact millisecond-derived seconds. No new client
  dependency, endpoint, activation rule or track UI.

## Deployment compatibility and limits

Apply the additive migration before starting the new code. Older code can keep writing
results with NULL journals during overlap. New code requires the new column; it must
not be started against the old schema. Roll back application code while retaining the
column and collected facts; do not drop it or rewrite published migrations. PostgreSQL
ALTER TABLE takes a table lock; actual production lock duration is unmeasured.
Only disposable cloud PostgreSQL databases were used here. No deployment is authorized.

An interrupted race has no fabricated final journal. Uncollected old races remain
unavailable. The journal proves grants and successful activations, not every refused
attempt, every effect expiry or the participant's input sequence. Those are not required
for this slice. Production access and physical screen-reader verification remain outside
these automated proofs.
