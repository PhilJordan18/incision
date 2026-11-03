# F-01.3C — room visibility (slice A of the 2 November night order)

Card #33 (F-01.3). Requirements SALLE-03, SALLE-05 and CONF-11; decisions D-15, D-19 and D-22. Branch `feat/01-3-room-visibility`, created from `dev` `972e025` (#193, L3 moderation, already merged by Philippe). Refs #33. Do not close the card: human acceptance is still to do.

## What changed

- **Host's choice (SALLE-03, CONF-11).** The creation form offers the three access cards of screen 05: PUBLIC, CODE (checked by default, D-19) and PRIVATE. It works without JavaScript. In the waiting room every member sees the visibility; only the host (account or guest host) can change it.
- **Server rules.** `changeRoomVisibility` (`packages/database/src/rooms/visibility.ts`):
  - runs under the room row lock (`FOR UPDATE`), through a helper shared with capacity changes (`hosted-room.ts`, moved without changing it);
  - accepts only the waiting phase and the room revision the page shows (`STALE_REVISION` otherwise);
  - rechecks the host from the database, never from the form;
  - bumps the room revision, and `notifyRoomChanged` syncs every member live.
  Actions validate a single field with Zod, use the settings rate limit and answer with explicit FR/EN refusals.
- **Access by visibility.** PUBLIC and CODE admit with the code. PRIVATE answers the code alone exactly like an unknown code. Invitations work in every visibility. Bans, capacity (2–30, bots counted) and the separate quota of 20 spectators are unchanged and still enforced under the same lock.
- **Concurrency.** A code join that waits on the lock while the host switches to PRIVATE is refused after the wait. PostgreSQL rechecks the `visibility <> 'private'` condition after the lock (READ COMMITTED). The test waits for a real lock waiter in `pg_stat_activity`, not a delay.
- **No migration.** The `visibility` column and its constraint already existed. No published migration was touched.
- **Listing.** PUBLIC is not yet listed here: the explorer is slice B (#46). The PUBLIC description says the room will be listed with the public rooms; slice B changes it to the present tense.

## Checks on `f2ea41f` (code) and the final commit (test timing and evidence only)

Node 24, disposable PostgreSQL 16 on localhost (CI runs 17), synthetic data only. The local recipe, its databases and Docker were not used.

| Check | Result |
|---|---|
| `check:no-js`, `lint`, `typecheck`, `build` | Pass |
| Unit tests | Pass: web 1080, domain 1259, database 146 |
| PostgreSQL (`test:db`) | 410 passed, 9 skipped. The 9 are the PgBouncer suite, which runs only with a pooled URL, as on `dev`. `room-visibility.db.test.ts`: 15 tests (each visibility stored at creation; access by visibility; invitations in every visibility; kept bans; present members kept on a private switch; the lock race, both orders; stale revision, unknown value, non-host and outsider; guest successor and forged proof; refusal in countdown, racing and results). A first full run showed three `57P01` connection terminations on a temporary database while other suites were running beside it; the rerun alone was clean. It is reported, not counted. |
| Schema drift (`db:generate`) | No changes |
| Integration (two production processes) | 11/11 |
| Playwright, targeted | `room-visibility`, `room-invitations`, `room-capacity`: 13/13 |
| Playwright, full suite | 190 passed, 1 failed, none skipped (24.8 min). The failure: `room-capacity` "host capacity persists…" (en-CA) hit the 30 s timeout during its sixteen axe audits; the fr-CA case passed in 28.8 s. The waiting room now also shows the visibility panel, so the test is marked `test.slow()` like the visibility test (next commit). That spec then passed 12/12 (`--repeat-each=3`). No assertion or audit was removed. |

An earlier full Playwright run on `09a6821` is **not** evidence: `.next` was rebuilt while it ran, which broke its server.

## Reviews

All on `09a6821` (the code under review); the fixes followed in `bff0cc5` and `f2ea41f`.

| Review | Model | Verdict | Fixed |
|---|---|---|---|
| Security | — | OK, no finding blocks | — |
| DBA | — | OK. Minor: the race test slept instead of waiting for the lock | `bff0cc5` |
| Code reviewer | — | Changes needed. Major: PUBLIC promised a listing that did not exist yet. Minor: apostrophes, a nested ternary, saving an unchanged choice, panel duplication with capacity, commit hygiene, matrix | Copy, apostrophes, ternary, unchanged save in `f2ea41f`; matrix here |
| UI/UX | — | Major: the creation intro said every room opens with the code; the long test needed more time. Minor: focus after a refused save, apostrophes | `f2ea41f` |
| Functional QA | Fable 5.1 | OK. Each rule checked in a browser, 19 regression specs passed | — |

The delta of `f2ea41f` (copy, disabled unchanged save, focus, `test.slow`) was not reviewed again by Fable. The targeted Playwright run and the full suite above cover it.

Accepted, not changed here:
- The visibility and capacity panels share a structure but stay separate components. A shared settings card would widen the slice.
- Commits `4f576cb` and `09a6821` carry small changes beyond their titles (a shared helper move, an invitation test now going through the form). They are published history, so they are not rewritten.
- For a ui-ux decision, not delivery conditions:
  - the legend and the `moi` accent of the access cards (record in D-15 if kept);
  - the "visibility saved" status stays until the next change;
  - disabled cards for non-hosts look like read-only text.
- Outside this slice, seen by ui-ux: the English "Maximum participants :" label with a French space; the code card of a private room.

## Human acceptance

1. Create a room: CODE is checked. Create PRIVATE, then try its code in another browser: "Code not found".
2. As host, switch to CODE: the other browser now joins with the code. Switch to PUBLIC, then PRIVATE: members see each change without reloading and stay in the room.
3. Send an invitation in a PRIVATE room: it still works. A banned account stays refused in every visibility.
4. Check FR/EN, both themes, keyboard (arrows in the cards, Enter on Save) and a phone width.
