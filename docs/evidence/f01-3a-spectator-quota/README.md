# F-01.3A — twenty-spectator admission quota

Refs #33, SALLE-05 and D-22. Branch `codex/f-01-3a-spectator-quota` starts from dev `b14e5d0`.

## Delivered scope

The existing admission transaction now counts active memberships of the requested role while holding the lobby row lock. The domain rejects a new spectator when twenty spectator memberships already exist. A spectating host counts; participants use their separate capacity. A departed membership (`left_at` set) no longer counts.

Existing membership is returned before quota checks, preserving reloads, duplicate tabs and idempotent admission. Changing the requested role on a repeat admission does not change that membership's role. New admissions still respect room phases and one-active-room constraints. A private code still answers exactly like an unknown code before occupancy is inspected.

The new `SPECTATORS_FULL` refusal passes through the existing action and form alert, using `home.codeErrors.SPECTATORS_FULL` in FR/EN. It does not spend the failed-code budget, but repeated attempts retain the existing account mutation limit. Account identity still comes from the session, never form data. No UI component, schema, migration, shared export, dependency, configuration, runtime or code-budget implementation changes.

## Ownership

- A explicitly released only `admit`, `JoinRoomResult`, refusal mapping, `JoinError` and the new dictionary key: [agreement](https://github.com/PhilJordan18/incision/issues/45#issuecomment-6400327173).
- B released the quota inputs/refusal and tests in `room-admission.ts`: [agreement](https://github.com/PhilJordan18/incision/issues/33#issuecomment-6400540461).
- A retains settings/snapshots, migration 0006, configuration and race runtime. B retains the other domain files. The other Codex retains results. None of those reservations is changed here.
- The correct translation path is `home.codeErrors`, correcting an earlier `rooms.errors` scoping typo.

## Verification scope

- Domain: boundary 19/20/21, waiting/results admission, phase precedence and independent participant capacity.
- Actions: translated refusal key propagation; session identity; no notification on refusal; own-room bypass; unchanged failed-code and account-mutation accounting.
- PostgreSQL: twentieth admission, twenty-first refusal with unchanged revision; two simultaneous contenders for the last place; repeated admission at capacity with unchanged snapshot; departure freeing a slot; spectating host counted; participant independence; phase/private-code refusals. Existing membership regression tests run alongside these cases.
- Browser: FR/EN × Aube/Abysse; actual server refusal, keyboard submission, visible translated alert at 1440/1024/390/360 px, axe at 360 px, successful retry after one place is freed, reload without a duplicate membership. Initial occupancy is a direct SQL fixture; this is not twenty simultaneously connected browsers or a load qualification.

Database tests create and drop their own random `incision_test_*` database. Browser tests use only local `incision_e2e_spectators33a`, port 3991. Heavy commands run through the shared lock. The previously stopped `incision-db-test-1` container was started; no other container was stopped or recreated.

## Baseline and corrected test fixtures

Before implementation, a focused SQL case reproduced the defect: dev admitted spectator 21. The initial attempt before PostgreSQL was started was an environment failure, not product evidence.

The first new phase-refusal fixture omitted an associated race and then a closure timestamp required by existing constraints. Both were added; a PostgreSQL enum/text parameter inference conflict was corrected by binding the closure timestamp separately. No database constraint or test assertion was removed. These fixes change only the new test fixture; product code remains `510c6f2`. The verification target is `5507783`.

## Reviews and remaining work

Code review: one domain rule, server-owned counts, unchanged phase/participant rules, no new API or rendering component.

DBA review: admission and departure share the lobby row lock; READ COMMITTED sees the prior admission after acquiring the lock. One bounded count query replaces the participant-only count, not a query per member. No schema or migration is needed.

Security review: private/unknown indistinguishability, session identity, membership bypass, input validation and budgets are preserved. The quota cannot be supplied by the browser. Local tests only; no remote testing.

#33 remains open for visibility/invitation behavior and configurable capacity. Guests, playable bots, host succession and the broader configuration panel are not delivered here. Future admission paths must apply the same quota. Existing over-quota rooms are not evicted; new spectators are refused until occupancy falls below twenty. No production or Neon qualification.

The shared matrix is owned by A. Add this evidence and its tests to SALLE-05/D-22 during coordinated consolidation, without marking the other #33 criteria complete. No edit to that shared file is claimed.

## Final verification record

At `5507783`: root `npm run check:no-js`, `npm run lint`, `npm run typecheck`, `npm test`, `npm run build` all passed. Unit counts: 594 web +130 database +1059 domain +20 load +47 word lists = **1850**. `npm run test:db -w @incision/database -- test/spectator-quota.db.test.ts test/membership.db.test.ts` passed **23/23**, using an explicit local TEST_DATABASE_URL.

The first browser run encountered the framework route announcer as a second alert. Test-only `b17e872` scopes the selector to the main content, preserving the actual message assertion. No product change or new build was needed. Initial traces are preserved locally under `.codex-worktrees/_tools/failures/quota33a-first-browser/`.

At `b17e872`, `npm exec -w @incision/web -- playwright test e2e/spectator-quota.spec.ts` passed **4/4 in 18.2 s**, with E2E_PORT=3991 and the dedicated local database. No full browser suite was run locally. Domain and action focused checks also passed (9 domain cases, 10 action/budget cases including existing tests).

Code, functional, DBA and security reviews applied sequentially: **no blocking finding**. UI review of the unchanged form plus new message: visible focus, warning symbol and readable text in both themes, no clipped message or horizontal overflow, existing design tokens and dimensions preserved. Reference screen06 and documented D-15 adaptations remain unchanged; this does not complete the room's future visual/configuration features.

Captures: [FR Abysse1440](quota-fr-abysse-1440.png), [FR Aube1024](quota-fr-aube-1024.png), [EN Aube390](quota-en-aube-390.png).

## Short acceptance walkthrough

1. In a local test room with twenty spectator memberships, open its code as another signed-in account and uncheck “I race”.
2. Submit: the translated quota message appears; no membership or room revision is added.
3. Have a non-host spectator leave. Retry: admission succeeds; reload keeps the same membership and twenty spectators total.
4. Repeat with the host spectating and with participant places still available. The spectator quota never consumes a participant place.

No strict dependency on pending result/profile/corpus PRs. Future settings changes must retain the admission lock and active-spectator count; A/B's separate reservations remain explicit.
