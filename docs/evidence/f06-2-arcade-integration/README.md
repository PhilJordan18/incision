# F-06.2 — Arcade end to end (C3)

Cards #61, #62, #129 (remaining integration); requirements CONF-09 and BONUS-01 to BONUS-04;
decisions D-11, D-16, D-18. Branch `feat/06-2-arcade-integration`, built **on C2**
(`feat/03-1-text-configuration`, PR #191): C3 needs C2's settings columns and panel. This is slice C3 of the
work order of 29 October 2026. Philippe gave the Go Ahead in the cloud conversation of 30 Octobe## Dependencies and migration

- **Order.** L2 (#190, merged) → C2 (#191) → this branch → L3 (moderation, `0018`). C1 (#188, merged) brings the reviewed word lists that extensions draw from.
- **Not yet a PR.** This branch is ready locally on top of C2. Philippe has not approved a PR stacked on #191, so it is published against `dev` once C2 has merged, or stacked if he approves it.
- **Migration `0017_lobby_bonuses`** (assigned). It adds one column, `bonuses_enabled boolean NOT NULL DEFAULT false`, so existing rooms stay in training (D-19).
  - It was regenerated with `drizzle-kit generate` after C2's `0016_lobby_text_settings`: the local version was deleted (`a53cb1c`), C2 merged in (`3c62ea1`), then the regeneration (`22b6127`).
  - Its SQL is byte-identical to the earlier local migration. No file was renamed and no published migration was touched.
- **Shared file.** The one additive hunk in `apps/web/server.ts` (`0dd4694`) passes the test seed below. The coordinator accepted it on #45; the invitation checks in `server.ts` are unchanged.

 words.

## What changed

- **Host's choice (CONF-09, D-18).** The settings panel has a "Mode de jeu / Game mode" select:
  Arcade means bonuses on, training means off, and there is no Evaluation mode.
  - The server reads it once as `true` or `false`.
  - Snapshots share it, defaulting to training for an older server.
  - Every member sees it in the summary and the start note.
  - It is frozen in the race (`config.bonuses`), which keeps the records' categories separate (D-12).
- **Private seeds.** Each start draws two crypto seeds: one for grant selection and one for extension
  words.
  - They stay in the race runtime's memory, never stored, sent or logged.
  - A race lost with its process is interrupted, as before.
  - No fixture fallback. The `[1,2,3,4]` constant of the dormant stream is gone.
- **Extension words.** `race-extension.ts` draws three words through the engine
  (`drawExtensionWords`) with the race's language, complexity and options, plus a random race's
  excluded characters.
  - The draw is memoised per grant and target text version.
  - Without approved lists it returns undefined (`CONTENT_UNAVAILABLE`), and the grant is not consumed.
  - Logs carry reasons only, never a word.
- **Bots use their bonuses (D-16).** A racing bot holding a grant activates the first one 1.5 to 6 s
  later. The delay comes from the bot's own private stream (`BOT_BONUS_DELAY_MS`).
  - The activation goes through the same coordinator transition as a player's Enter: same FIFO,
    targets, effects and refusals.
  - A refusal keeps the grant and draws a new delay.
  - Unused grants are lost at the finish.
- **A fixed seed for local test builds only.** `RACE_TEST_BONUS_SEED` (four integers) replaces both private seeds of every race, so integration tests know which bonuses they hand out.
  - `config.ts` refuses it unless `RACE_FIXTURE_TEXTS=allowed`. A deployed site refuses that switch, since its `APP_URL` is not on localhost. `config.test.ts` tests both refusals, and malformed or all-zero values.
  - Without it, each race draws its two seeds from crypto, as before. The integration servers set it; the corpus server in the same suite clears it.
  - It is not a secret: it is a test constant in the source.
- **Already delivered and reused, not rewritten.**
  - Grants, effects, the coordinator, the socket protocol, the browser controller and announcements
    (#61/#62 slices).
  - Enter handling, translated announcements, and no motion near the text (bonus-ui E2E).

## Checks

Final run on `ce834f5`. Base: C2 at `2c14380`, on `dev` `b0912cb` with C1 and L2. The later merge of C2's head `48edbcf` only changes C2's evidence file. Node 24.22.2 and a disposable PostgreSQL 16.15 (CI uses PostgreSQL 17).

| Check | Result |
|---|---|
| `check:no-js`, `lint`, `typecheck`, `build` | Pass |
| Unit tests | Pass: web 1010, database 146, domain 1220, load 20, word-lists 111. Web covers: bot activation (delay bounds, order, the same delay from the same seed, training); a refused grant kept, retried after a new delay within the bounds, then applied once; the first activation after a pause, within a fresh delay drawn at the resume; the service wiring, where neither seed reaches the configuration, the logs or the tabs; the test-seed guard; extension content; the Arcade parser and state. |
| Database tests | 376 pass, 9 skipped. The 9 are the PgBouncer suite, which runs only with a pooled URL (`describe.skipIf`), as on `dev`. Includes the 0017 upgrade from `0016_lobby_text_settings`: existing rooms stay in training, their text settings and historical races are untouched, and `bonuses_enabled` is NOT NULL. |
| Schema drift (`db:generate`) | No changes |
| Integration (two production processes) | 11/11, one run, as the proof. Repeated runs are not the evidence. The Arcade race is deterministic: see below. |
| Playwright, full suite | 176 passed, none skipped or flaky. Includes `arcade-settings` (sync, reload, axe, frozen at the start) and `bonus-ui` (the three effects, FIFO, Enter guards, the observer, reload). |
| Bounded cost (in process, fake timers) | 1 person and 9 bots on 120 graphemes: about 3.9 s in Arcade against 3.2 s in training. A first try with 30 entrants and 400 graphemes took about 190 s in training against 400 s in Arcade in simulated time. The cost per event grows with the roster in both modes; that is an observation for the load card, not a production measure. |

**The Arcade integration race.** The servers run with the seed `2026,1493922,10,30`, whose first nine bonus kinds are all extendLeader. Every grant is therefore an extension, whoever receives it at each milestone. The test requires each of these, with no widened assertion:
- the guest's first grant is `{ milestone: 25, kind: "extendLeader" }`;
- the guest's Enter is applied to the host;
- the bot's own activation is announced, with the host as target;
- the host's text keeps its original prefix and gains exactly six words, three per extension;
- every added word is in C1's reviewed French list and not in its exclusions (only an extension's first word may take a capital, after a sentence end);
- the stored configuration has `bonuses: true` and does not contain the seed;
- the announcement carries no seed, cursor or word field.

**Correction.** Earlier evidence at `e830a4e` claimed the checks without the database tests. They had not run, and a 0016 test failed at that SHA. The table above lists only what actually ran on `ce834f5`.

## Reviews

| Round | Review | Model | Verdict | Fixes |
|---|---|---|---|---|
| 1, `e830a4e` | Code reviewer + security | — | Changes needed. Blocking: two socket tests relied on the removed `[1,2,3,4]` seed and failed about one run in three. Major: the Arcade integration test depended on the bot's first grant kind; the evidence's counts were wrong. No security flaw. | Socket tests inject a fixed seed. A service-level seed and wiring test. A fresh bot delay after a pause. The retry test made stronger. A redundant scheduling call removed. |
| 1, `e830a4e` | Functional QA | Fable 5.1 | Changes needed. Major: the announcements list scrolled without keyboard access (axe `scrollable-region-focusable`). | The list is never a scrolling box; it already shows at most six. |
| 2, `332c248` | Code reviewer + security, targeted | — | OK. Major: this evidence was out of date. Minor: a defensive branch no test reached; two weak assertions; the integration test credited the guest with whichever extension came first; no start-up log for the test seed; an older observer live-region issue. | Evidence rewritten. The defensive branch removed. The pause test pins the activation window [min, max] and a single activation; the retry test pins one activation of the kept grant. The integration test checks both extensions, in either order. |
| 2, `332c248` | Functional QA, targeted | Fable 5.1 | OK. Six or more announcements visible in a real race: axe clean on host and member pages, both themes, at 1280, 1024 and 390 px; no scrolling region, no clipping, no horizontal scroll; `aria-live` additions present. A refused Enter (`FOG_ALREADY_ACTIVE`) keeps the grant, and a later Enter applies it. Seeds absent from the stored configuration, the server logs and every captured client message. | — |
| 3, `f3db6dc` / `22b6127` | DBA, regenerated chain | — | OK. L2's `0015` is byte-identical to its published branch. Journal and snapshots run 0000 to 0017 with no gaps. The chain applies from empty and then reruns as a no-op. A row created at 0015 gets D-19's defaults and `bonuses_enabled = false`. Minor: test comments and this evidence named the old numbers. | Fixed in `ce834f5` and here |

Accepted, not changed here:
- **Refused bot retries.** Each one moves the bot's cursor, so followers get one progress broadcast every 1.5 to 6 s per blocked bot. Bounded; noted for the load card.
- **Pages opened before a deploy.** `bonusesEnabled` is required, so such a page gets `INVALID_SETTINGS` until it reloads, as with C2's text fields.
- **Test-seed start-up line.** No log line announces the test seed, unlike `RACE_FIXTURE_TEXTS`. Adding one would widen the shared `server.ts` hunk, and the variable is refused outside local test builds anyway.
- **For a ui-ux decision.** These are suggestions, not delivery conditions:
  - a game-mode column in the history list;
  - the bonus section's place relative to the runner list;
  - an observer's live region that mounts with the first announcement.
- **Not verified by a flow:** a target disconnecting mid-effect, and a real lease suspension. The coordinator's and runtime's unit tests cover them.
- **Contrast and announcements, departures from the design, with their evidence:**
  - The announcements list no longer has a maximum height; it shows six items at most. Evidence: the round 2 QA axe runs and screenshots.
  - Pressed toggles have no tint (C2's evidence).

## Acceptance (work order C3)

1. **Arcade on, training off, default off, no Evaluation mode.** Covered by the parser, state and E2E
   tests and the D-19 default.
2. **Approved words, private seed, versioned settings, no fixture fallback, no secret logged, nothing
   downloaded at activation.** Done, with C1's reviewed lists. The integration test checks the words.
3. **Same rules for people and bots.**
   - Milestones and grants to the trailing runners come from the coordinator.
   - Activation and validation go through the same transition.
   - Bot delays are seeded, and unused grants are lost at the finish.
4. **Effects and edge cases.**
   - The three effects, and duplicate, replayed and stale commands: existing `race-bonus.test.ts`
     and `coordinator.test.ts`.
   - Unavailable extension data: runtime tests, where the grant is kept and then retried.
   - Reconnection: bonus-ui E2E.
   - Simultaneous activations and a target finishing or disconnecting: the coordinator's existing
     tests, not repeated here.
5. **Announcements.** Existing translated, accessible announcements, with reduced motion. Record
   categories stay separated by `config.bonuses`.
6. **Integrated scenario.** Done (integration above), with the bounded check above. This is not a
   production load proof.

## Proposed documentation and matrix rows (for the coordinator)

- `docs/architecture/bonus-server.md`: replace "Room creation freezes `bonuses: false`; the dormant
  seed is never drawn" with the host's choice and the two private seeds per race. Then add the bots'
  activation and the extension provider.
- **CONF-09:** fait after merge and human acceptance.
- **BONUS-01 to BONUS-04:** wired in real rooms, with real extension words; fait after human acceptance.
- `docs/DEPLOYMENT.md`, at the "Textes de test" paragraph: `RACE_TEST_BONUS_SEED` (four integers) fixes the bonus seeds of local test builds; it is refused without `RACE_FIXTURE_TEXTS=allowed` and never set on App Service.

## Human acceptance

1. Merge C2 (#191), then this branch.
2. In an Arcade room with a bot, fall behind and check the following:
   - you receive bonuses at 25, 50 and 75 %;
   - Enter activates them;
   - the bot uses its own;
   - the announcements read well in both languages.
