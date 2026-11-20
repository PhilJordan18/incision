# F-05.2B — Server-driven bot races

Product code reviewed: `7522e19`; runtime implementation: `a842098`.
Date: 28 October 2026. Local automated evidence only, not human or production acceptance.
Depends on room controls #176 and private aggregates #177. No merge or remote migration performed.

## Delivered behavior

Human-plus-bot rooms can start a race. The server freezes each entrant's kind and bot
level, creates fresh entrant IDs each round, and drives the existing pure bot engine
through the same authoritative reducer used for humans. A late timer applies deadlines
first and never injects retroactive batches. Lease suspension/loss, room closure and
shutdown prevent further bot progress. Bots require no account, membership or socket.

Real engine counters, rankings, WPM series and error aggregates persist atomically through
the existing result path. The track's square bot marker is preserved; results and podium
add a translated bot/level label. Removing a roster bot does not change earlier results.
Bot entrants cannot access private history or satisfy the other-human victory condition.

## Commands and results

The initial complete gate ran on `a842098` under the shared heavy-work lock:

| Command | Result |
| --- | --- |
| `npm run check:no-js` | Pass |
| `npm run typecheck` | All workspaces pass |
| `npm run lint` | All workspaces pass |
| `npm test` | 2,149 pass: web 755, database 146, domain 1,181, load 20, word-lists 47 |
| `npm run test:db -w @incision/database -- test/bot-races.db.test.ts test/races.db.test.ts test/room-bots.db.test.ts test/demo-history.db.test.ts` | 69 pass in four files |
| `npm run build` | Pass |
| `npm run test:e2e -w @incision/web -- e2e/bot-races.spec.ts` | 2 pass: mandatory FR and free EN, real server bots |

The SQL invocation also listed a nonexistent `test/key-errors.db.test.ts`; it matched
no file and is not counted as evidence. The actual aggregate persistence tests live in
`test/wpm-series.db.test.ts`, verified explicitly below after integrating #177's final tests.

Final targeted verification for `7522e19`:

- `npm run test -w @incision/web -- src/server/races/race-bots.test.ts`: 16 pass.
- `npm run test:db -w @incision/database -- test/bot-races.db.test.ts test/profile-statistics.db.test.ts test/wpm-series.db.test.ts`: 16 pass.
- `npm run test:integration -w @incision/web -- integration/wpm-series.integration.test.ts`: 1 pass.
- `npm run typecheck` and `npm run lint`: all workspaces pass.
- The two browser scenarios were rerun with 360 px added to 1440/1024/390 px,
  axe in both themes, and Tab/Enter navigation from results to the persisted race page:
  2/2 pass in 51.3 s. Sixteen final captures are stored beside this report.

SQL tests create and drop their own randomized temporary databases. Browser tests use
only port 3893 and `incision_e2e_bots59b_20261028`. They use fixture passage text and an
authenticated test account, but no seeded race results: the actual server engine types,
finishes and persists the bot. This does not qualify corpus selection or bot calibration.

### CI follow-up

The first two CI runs on `c497eca` failed the catalogue comparison: PostgreSQL prints
the new text default as `'human'::text`, while Drizzle's snapshot stores `'human'`.
The SQL schema and constraints matched. The comparison now renders literal text casts
as PostgreSQL does, retaining the exact literal and leaving SQL expressions unchanged;
a focused regression test covers distinct values, escaped quotes and existing casts.
No migration, workflow or application behavior changed. Catalogue/schema/migration/bot
SQL checks: 49/49 pass in four files. CI must be checked again on the correction commit.

## Acceptance checks and sequential reviews

- Code: one timer for all bots; actual-time reduction; deadline-first ordering; no direct
  progress/score writes. Five levels in mandatory/free mode finish in runtime tests.
  Delayed server work produces one insert, not a catch-up burst. No blocker found.
- Security: seed/plans are private; client payload cannot select the bot entrant;
  access remains tied to the authenticated human account. Tests cover attempted selection
  and private aggregate isolation. Lease fences and shutdown behavior remain intact.
- DBA: generated migration 0011 follows coordinated 0009/0010. Existing rows default to
  human; CHECK rejects bots with accounts/members or missing levels and humans without
  accounts. Idempotent save and historical identity after roster removal verified.
  ADR 0006 records mixed-version rollback limits. No remote migration was tested.
- Functional QA: SQL refuses a bot-only roster even with a spectator host. Browser tests
  start with one human plus one bot, observe autonomous progress, abandon the human,
  inspect real saved bot counters, reload results, start the next round and confirm
  last-human departure interrupts the second race with no published results.
- UI/UX: screen 10 reference and D-15 compared with FR/EN Abysse/Aube captures at
  1440/1024/390 px. Existing layout, tokens, logo, table scrolling and controls preserved;
  explicit bot text and square marker do not depend on color. Axe and document overflow
  checks accompany captures. No new animation or interactive control was introduced.

## Boundaries

Issue #59 stays open pending the remaining acceptance work. This delivers playable bots
in ordinary races; it does not qualify Arcade with bonuses enabled, autonomous bonus
activation, production operation or the historical load scenario with bots enabled.
The matrix is coordinated with the other Codex session to avoid concurrent edits to
`docs/EXIGENCES.md`. Unit/SQL fixtures are not presented as product evidence beyond their
specific invariants; screenshots come from the actual browser/server race described above.
