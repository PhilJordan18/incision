# F-04.3B — Host-selected free typing (#51)

## Scope and provenance

Local verification, October 28, 2026. Requirements CONF-08, COURSE-04 and
CONF-12; decisions D-09, D-12 and D-19. This exposes the existing free-mode engine
through the host's ordinary settings form. No new scoring rule, accuracy threshold,
bonus, bot, schema migration or identity change is introduced.

The tranche depends on #45's duration work (PR #174). Initial local application
commit `2c65bb8`; browser acceptance extended in `81afc67`. These initially followed
local copies of #45's `dada1e2` and `0249fcf`. Final integration provenance and
revalidation are recorded below before publication. No merge or production claim.

The live human recipe on port 3880 was not restarted, migrated or seeded. All
tests used generated disposable databases or the dedicated local databases
`incision_e2e_free51` and `incision_e2e_free51_integration` on PostgreSQL port 5433.
Browser port 3996 and integration ports 3997/3998 are distinct from the recipe.
The Docker database container was not stopped. Existing recipe evidence remains
unchanged; automated accounts and screenshots here contain only test identities.

## Acceptance evidence

| Criterion | Evidence | Result |
|---|---|---|
| Host chooses mandatory/free; all members see the saved mode | `room-settings.spec.ts`, two independent accounts, reload and next round | Passed FR/EN, fixture and corpus |
| No optimistic or stale settings overwrite | Existing conflicting-tab/lost-response browser cases; state tests; SQL revision checks | Passed |
| Invalid or forged form cannot select another host or invent a mode | Parser rejects absent/duplicate/file/unknown mode; action uses session identity; SQL rejects non-host | Passed |
| Mode frozen with the race, using the actual duration | `race-service.test.ts` accepts free with null/30,000/600,000 ms and checks engine, reveal and stored config | Passed |
| Free error advances, remains visible and counted | Server runtime test inserts wrong then correct, deletes both and reinserts; cumulative counters retain the mistake | Passed |
| Reload does not lose accepted free-mode input | Browser types one wrong plus two correct characters, observes server progress from another account, reloads and finishes | Passed |
| Results retain the error and reach the target | Browser queries the saved finish: position/length, total/correct inputs and exact accuracy | Passed |
| Switching back restores blocking; records remain separate | Same browser session switches to mandatory, observes boxed blocking, corrects and finishes; each mode shows its first reference | Passed |
| Paste/drop/replacement remain refused in free mode | `typing-clarity.spec.ts`, ordinary host-selected free race, cancellation and subsequent server-confirmed keyboard progress | Passed |
| Keyboard, translations, responsive layout and accessibility | Settings and typing specs: FR/EN × Aube/Abysse, axe, reduced motion, keyboard focus, no horizontal overflow | Passed |

Typing checks exercise physical-keyboard layouts at 768/1024 px. At 390/360 px the
existing physical-keyboard message replaces the typing field, as designed. Synthetic
paste/drop/composition/replacement events are not a certification of real-device OS
autocorrection. Human acceptance and production remain untested for this tranche.

## Commands and observed results

Runtime: Node 24.13.0, isolated worktree `codex/f-04-3b-free-typing`.
Heavy commands serialize through the shared local `heavy.sh` lock.

- `npm run check:no-js`, `npm run lint`, `npm run typecheck`, `npm test`,
  `npm run build`: passed on application commit `2c65bb8`.
- Unit totals: web 717, database 131, domain 1,181, load 20, word-lists 47;
  **2,096 passed**. Application code is unchanged by `81afc67`.
- `TEST_DATABASE_URL=<local test server> npm run test:db -w @incision/database`:
  **250 passed**, 9 pre-existing PgBouncer tests skipped because no PgBouncer
  test endpoints are configured. No tests were newly disabled.
- `npm run test:e2e -w @incision/web -- room-settings.spec.ts typing-clarity.spec.ts`:
  **18 passed** on `81afc67`, production build (2.7 min).
- `npm run test:e2e -w @incision/web -- --config playwright.room-settings.config.ts`:
  **10 passed** on `81afc67`, active corpus `2026-10-25.3` (2.4 min).
- Web lint and typecheck passed again on `81afc67` after the browser-only additions.
- `npm run test:integration -w @incision/web`: **9 passed** in two files on
  `81afc67` (124.23 s), including real server processes and the production build.
- After rebasing the unpublished tranche onto #174's final `9abc1d6`, the equivalent
  application/test commits are `e776c2d`/`d11a625`; verification head `aba100d`.
  Root no-JS, lint, typecheck, **2,096 unit tests**, build and the **entire 136-test
  browser suite passed** (10.4 min). No browser retries or skipped cases.
  This includes #174's corrected explicit-duration clock scenario, profile-photo
  refusals and real-time inactivity cleared by the button or typing, not Escape.
  #174's push and PR CI both passed on `9abc1d6`; neither PR was merged.

The first unit attempt found old host-action fixtures missing the newly required
mode field; fixtures were made explicit, not defaulted by production code. The first
server counter test incorrectly inspected the controlling tab's push messages
(which intentionally exclude its own acknowledged input); it now checks the second
tab of that same account. Socket-bound tests were rerun with permission to bind
local ports after a sandbox-restricted attempt. No assertion was suppressed.

## Sequential review checkpoint at 81afc67

- Code review: product diff is limited to the host form, draft/form serialization,
  FR/EN copy and strict parser/start eligibility. Existing domain engine, input
  handlers and results computation are reused. No blocking finding.
- Security: bounded explicit mode enum; identity is still session-derived; the
  existing locked transaction checks host, membership, waiting phase and revision.
  Start freezes settings under revision protection. No new public write path,
  secret or remote-resource access. No remote security test claimed.
- DBA compatibility: no schema/query/migration change, existing settings not
  rewritten. SQL persistence, authority and stale-revision tests passed. The existing
  four-category record test passed in the full SQL suite.
- Functional QA: acceptance and integration above passed. Final integration-head
  gates passed as recorded above. No human verdict is inferred from local tests.
- UI/UX: native labelled selector with separate description, existing focus/token
  styles, two-column desktop and stacked mobile layout. FR dark at 390/1024 and EN
  light at 1440 inspected visually; race free-mode FR dark at 1440/1024/390 inspected. Other
  widths/themes covered by browser assertions and captures. No design asset, name
  or logo changed. No independent peer review is claimed: roles applied sequentially.

## Consolidated review at aba100d

Code/security/DBA/UI/functional roles were reapplied sequentially after integration.
The product diff relative to `9abc1d6` is unchanged; the upstream correction changes
only a duration-dependent test and its evidence. No blocking or major finding is
open. Historical screenshots regenerated by the full suite were restored to their
committed originals; no previous evidence is replaced. Final documentation-only
commit receives no-JS, diff and focused unit checks before publication.

Verdict: ready to deliver this tranche. Remaining: its own remote CI, human free-mode
acceptance, real-device OS autocorrection checks and human merge decisions. The
latest explicit permission to push this completed tranche is used; no merge or
production deployment is authorised or performed.

## Captures and human follow-up

The `screenshots/` directory retains settings FR Abysse and EN Aube at
1440/1024/390 px, and free typing FR Abysse at those same widths. Captures come
from the `81afc67` browser run (application `2c65bb8`), not the human recipe.

Once the human chooses to update the recipe to the verified branch, check:

1. Two accounts join; host selects free mode; both see it, including after reload.
2. Type a wrong character, then the next one: advance with a visible wavy error.
3. Correct a mistake with Backspace: its historical error still affects precision.
4. Finish and reopen results; confirm the free-mode record category.
5. Next round, select mandatory mode: a mistake blocks until corrected.

No recipe update, merge or deployment is included in these verification steps.
