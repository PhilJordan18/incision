# F-01.1B — transactional guest admission foundation

Date: 28 October 2026 (America/Toronto).
Base dev: `4092967f838423270d468152d959c14ca515cb0c` (after #183 and #184).
Branch: `codex/f-01-1b-guest-admission`.
Reviewed/tested code: `1b52040fc0e9e07461ea7163abc8cc9ab8a9eb16`.
Implementation: `c7c647495b57cea8d96cda27d91f79937a98d5ba`; fixture correction: `1b52040`.
The subsequent documentation commit records this evidence only.

Refs #31. AUTH-02/03, SALLE-05/06/09 remain partial. This is a preparatory
sub-step of approved deliverable 1 (admission/avatar/multiple tabs), not that
complete user-facing deliverable. No public action, page or socket admits guests.

## Implemented contracts

- `joinRoomByCodeAsGuest`: an internal database operation taking a proof derived
  by the server from a verified signed cookie, a parsed code, nickname and role.
  It is not a cookie verifier or public input boundary. Future callers must retain
  account precedence, Zod input limits, Origin and code-attempt limits.
- Room lock then guest-session lock, READ COMMITTED and existing bounded server
  timeouts. The session lock serializes the same guest across rooms; published
  partial unique indexes remain the final database invariant. Future retention
  and departure writers must respect this lock order.
- Rechecks proof/digest and database-clock expiry after waiting for the lock and
  again before insertion. Does not create, renew, replace or merge identities.
- NFKC/whitespace/Unicode validation through the existing domain parser, 3–20
  code points. A guest collision returns `NICKNAME_TAKEN`; no automatic suffix.
  Existing account naming behaviour is preserved.
- Same active membership returns the original member, nickname, role and
  seniority without another revision. Another room returns a typed refusal.
- Uses the existing domain phase/capacity/spectator rules. Bots count toward
  participant capacity. Unknown and private codes have the same refusal.
- `findActiveHumanMembership` uses a discriminated account/guest subject. Existing
  account callers retain `findActiveMembership`. Room snapshots include guest
  rows with a null account ID; they expose no guest-session ID or proof.

## Actual verification

| Command / evidence | Result |
| --- | --- |
| `npm run check:no-js` | Passed |
| `npm run lint` | Passed, all workspaces |
| `npm run typecheck` | Passed, all workspaces |
| `npm test` | 2,236 passed: web 810, database unit 146, domain 1,198, load 20, word-lists 62 |
| `npm run build` | Passed on final code SHA |
| `npm run test:db --workspace=@incision/database` | 292 passed, 9 pre-existing PgBouncer skips; 27 files passed, 1 skipped |
| `npm run test:e2e --workspace=@incision/web -- e2e/guest-session.spec.ts e2e/session.spec.ts e2e/rooms.spec.ts` | 24 Chromium cases passed against the unchanged runtime built at c7c6474; final code differs only in a SQL test fixture |
| `git diff 4092967..HEAD --check` | Passed |
| Schema/migration/dependency/central matrix diff | Empty |

The 15 new PostgreSQL cases cover normalized names, invisible/short/long names,
account/guest canonical collisions, same-identity concurrent tabs in two rooms,
competing guests with the same name, identical UUIDs in the two identity
namespaces, account-versus-guest last-slot contention, bots and 20 spectator
places, forged/missing/expired proofs, lock-delayed expiry, phase restrictions,
existing-member retry during a race and phase revalidation after a room lock.

The full SQL run also reruns the existing migration/data-preservation suites
from #183, including account photos, results and 10–200 settings. This change
adds no migration and alters no stored data shape. It does not claim that new
retention or anonymous race persistence has been implemented or tested.

All SQL/E2E data is synthetic on a newly created PostgreSQL 17 container
`incision-guest31b-tests`, localhost port 55432, tmpfs, no existing volume.
No recipe 3880, backup, personal data, remote database or real secret was used.
The container is removed after checks.

Initial failed runs are not counted as success: a new SQL fixture used an enum
parameter as text in the same statement; the fixture now uses a separate boolean
parameter. An initial sandboxed unit run could not complete a local socket case;
the successful full run used local-network permission. No test was disabled.

## Sequential reviews on 1b52040

Roles applied manually in this session per repository workflow; these are not
independent reviewers or a formal security-plugin scan.

- Code reviewer — OK for internal B: account wrapper remains compatible; no new
  runtime dependency; shared domain admission/name rules reused. Complete diff read.
- Security — OK for internal B: new writer has no public caller; proof revalidated
  in SQL; namespace isolation; no credential in snapshots or new logs. Existing
  guest-denial/account-precedence browser tests pass. Public boundary security
  and browser bootstrap remain prerequisites to later activation.
- DBA — OK locally: bounded READ COMMITTED transaction, room/session locking,
  existing FK and uniqueness constraints, no migration or schema change. Races
  on expiry, capacity and identity tested. PgBouncer/Neon not tested here.
- Functional QA — OK for internal B: 15 new SQL cases plus existing account room
  and denial flows. No claim of an end-user guest joining, generated avatar,
  guest sockets/race, reconnection, personal result display or operational purge.

## Coordinator handoff: done / to do

Done: database admission and snapshots, explicit occupied-name refusal, concurrent
membership protection, checks and evidence. Reserved/changed files are limited to
`database/src/rooms/{guest-admission,membership}.ts`, database package exports,
`database/test/guest-admission.db.test.ts`, and this report. No migration numbers
reserved. Published 0012 and 0013 SQL/snapshots/journal remain untouched.

To do within the three approved deliverables:
1. Session-aware HTTP/socket adapters, generated avatar and browser flow, including
   first-cookie multi-tab coordination. Keep public admission disabled until the
   downstream guest race/results/retention paths are ready.
2. Guest runtime identity, input control and race reconnection, without starting
   #36C2 host network succession or changing text/random/Arcade configuration.
3. Anonymous persisted entrants/series for account history, guest-private results
   in memory, final presence retirement and bounded retention with account data
   preservation. Any new migration must be generated from then-current dev.

Decisions still requiring coordinator clarification before dependent work:
- Which accepted user activity renews the guest session? Proposed distinction:
  real actions/typing renew, passive heartbeat/polling does not. Define the bounded
  renewal cadence and HTTP cookie refresh; a socket cannot set an HttpOnly cookie.
- When exactly does a disconnected spectator or waiting-room guest finish their
  presence? Do not extend D-06's race grace into a new general retention policy.
- First-ever cookie bootstrap coordination and unsupported-browser behaviour;
  SQL uniqueness cannot identify a person who has no shared cookie yet.
- Explicit guest-to-account transition and live socket retirement; no automatic
  history transfer or identity merge is allowed (already approved).
- Persistence duration for races containing only guests/bots, beyond the D-08
  requirement to retain anonymous opponent series in a participating account's
  history. No new indefinite retention policy has been assumed.

No change to lists/calibration/random/Arcade, #184 work, central EXIGENCES/IA or
board. Coordinator owns consolidation. No merge/deployment authorised. Subsequent
work must not silently treat this unmerged PR as dev or create stacked branches.
