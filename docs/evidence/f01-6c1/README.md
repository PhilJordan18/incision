# F-01.6C1 — voluntary host succession, work in progress

Code checkpoint: `5bcf823`, based on `dev` `1cfe076`. No PR published at this
checkpoint: the results-screen handover below is a delivery blocker. No merge.

## Scope and coordination

SALLE-08/D-03, voluntary departure only. Human spectators are eligible. SQL
membership and current sockets are intersected under the room lock; ordering uses
SQL epoch microseconds. Existing race notification preserves the race on transfer
and interrupts only on closure without a successor. See
[the adapter contract](../../architecture/host-succession.md).

A's release is recorded in issue #36, implementation reservation
[6446503700](https://github.com/PhilJordan18/incision/issues/36#issuecomment-6446503700).
C1 avoids room-channel, room-events, race-service/runtime, races lifecycle/interruption,
schema/migrations and the central matrix. #64B's runtime/persistence and export lines
are coordinated separately. The main checkout and other worktrees are unchanged.

## Checks actually obtained locally

- `npm run check:no-js`, `npm run lint`, `npm run typecheck`, `npm run build`: passed
  during development. The last two new browser scenarios were added after that
  first static gate. Root lint and typecheck were rerun successfully at code
  checkpoint `5bcf823`, including all new tests.
- `npm test`: 1,996 passed (web 661, database 131, domain 1,137, load 20, wordlists 47).
  The first sandboxed run failed local socket tests and was stopped; the run with
  local listening permitted passed. No code/test disabling was used.
- Affected existing PostgreSQL files: membership, display-name, pooled-transactions,
  races, room-settings and spectator-quota: **105 passed**.
- New `succession.db.test.ts`: **10 passed** at server commit `9a12991`, including
  microsecond ordering, exact ties, spectator eligibility, stale/offline exclusions,
  presence sampled after lock, rollback on unavailable presence, concurrent/repeated
  departures, new-host authorization, and preserved countdown/racing/results state.
  The original new fixture omitted required randomIndex; it was corrected before
  these passing results. No application correction was inferred from that fixture error.
- Browser `rooms.spec.ts` transfer case: **1 passed**, spectator inherits, reload
  preserves ownership, former host has no controls, last host closes the room.
- Browser `host-succession.spec.ts` countdown/racing cases: **2 passed** after fixing
  their result selector (the current UI uses a table, not a heading). Only the
  leaver abandons; successor finishes, results persist, and next-round controls work.
- Browser confirmation FR/EN × Abysse/Aube: **4 passed**. Axe WCAG2/2.1 A/AA,
  no horizontal overflow at 1440/1024/390, reduced-motion environment, Escape/focus.
  The 12 screenshots alongside this file were captured from this UI implementation.
- Browser departure **on already displayed results**: **1 failed**, real UI defect
  described below; retained as a regression test, not skipped or weakened.

PostgreSQL tests create/drop only their random `incision_test_*` databases on the
local test server (port5433). Browser runs use only `incision_e2e_succession36c1`
and port3991, with marked short fixture texts. No production/corpus, Azure/Neon,
OAuth, guest-persistence, bot or bonus qualification follows from these runs.

## Blocking result-screen handover

The SQL transfer succeeds and the live room recognizes the successor. However,
`results.panel` was rendered by the server before the transfer, so its host controls
remain absent until a refresh. Existing room-view refresh depends only on a new
race ID, and this handover keeps the same race ID.

Reproduction: `host-succession.spec.ts`, "host departure on results preserves the
saved race and transfers next-round controls live". Local failure trace/context:
`.codex-worktrees/_tools/failures/f01-6c1-results/` (not committed).

The proposed minimal correction is to refresh results when the live host ID differs
from the host ID in the server's `initial` snapshot, with both as dependencies. This
is **not implemented or verified** at this checkpoint: room-view's results effect
lies outside A's released leave block. Release request and reproduction:
[6446912750](https://github.com/PhilJordan18/incision/issues/36#issuecomment-6446912750),
[6446940634](https://github.com/PhilJordan18/incision/issues/36#issuecomment-6446940634).

Also awaiting the requested narrow release: hostGoToRoom FR/EN wording, old departure
assertions in existing browser tests, ActiveMembership.isHost comment and two
remaining data-model statements. Explicit Close room behavior is unchanged.

## Reviews at code checkpoint 5bcf823

Roles applied sequentially, read-only on the code diff, without subagents:

- Code-reviewer: **changes needed** — result panel refresh is blocking; stale copy
  and assertions are pending coordination. No unrelated runtime/schema/CI edits.
- Functional QA: **blocked** — seven targeted browser cases pass, one real
  acceptance path fails. C1 must not be called ready until it passes.
- Security: no additional identity input; session identity and rate limiting retained.
  New host is chosen from server SQL/presence only. Old/non-host settings/close
  attempts refused by existing server authorization in dedicated DB coverage.
  No new secret, external request surface or production test.
- DBA: bounded READ COMMITTED, one lobby lock, active-members re-read, exact integer
  timestamps, atomic transfer/departure/revision, rollback rather than false closure.
  No migration; local concurrency and existing closure/finalization tests passed.
- UI/UX: confirmation screenshots reviewed against screen06 and its documented
  adaptations at1440/1024/390. Existing tokens/layout/confirmation are retained,
  wording reflects conditional transfer/closure, no logo/design asset change.
  Race/results behavior still has the blocking scenario above; no whole-screen
  completion claim. Screens08/10 were consulted for placement and controls.

## Remaining scope

#36 stays In progress and partial. C2 host disconnect/grace, guests and distributed
presence remain outside C1. A owns SALLE-08/D-15 matrix reconciliation. No heavy work
from14:30 Toronto on October27; the human acceptance environment is untouched.
