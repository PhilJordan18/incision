# F-06.2 — Arcade end to end (C3)

Cards #61, #62, #129 (remaining integration); requirements CONF-09 and BONUS-01 to BONUS-04;
decisions D-11, D-16, D-18. Branch `feat/06-2-arcade-integration`, built **on C2**
(`feat/03-1-text-configuration`): C3 needs C2's settings columns and panel. This is slice C3 of the
work order of 29 October 2026. Philippe gave the Go Ahead in the cloud conversation of 30 October 2026.

## Dependencies and the blocked step

- **C2 must merge first.** This branch must not become a stacked PR without Philippe's agreement.
- **Migration `0016_lobby_bonuses`.** It adds one column, `bonuses_enabled boolean NOT NULL DEFAULT
  false`, so existing rooms stay in training (D-19). It is local only, like C2's 0015. The coordinator
  assigns both numbers (proposal on #45).
- **Real extension words need C1 (PR #188).** On `dev`'s fixture data, extendLeader is refused with
  `CONTENT_UNAVAILABLE`, and the grant stays. Fog and shortening do not need words.

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
- **Already delivered and reused, not rewritten.**
  - Grants, effects, the coordinator, the socket protocol, the browser controller and announcements
    (#61/#62 slices).
  - Enter handling, translated announcements, and no motion near the text (bonus-ui E2E).

## Checks

Run on this branch after the review fixes, with Node 24.22.2 and a disposable PostgreSQL 16.15.

| Check | Result |
|---|---|
| `check:no-js`, `lint`, `typecheck`, `build`, schema drift (`db:generate`) | Pass; no schema drift. |
| Unit tests | Pass: web 977, database 146, domain 1198, load 20, word-lists 62. Web covers bot activation (delay bounds, order, the same delay from the same seed, training, a refused grant kept and retried, a fresh delay after a pause), the service wiring and private seeds, extension content, and the Arcade parser and state. The two socket channel tests pass 8 runs out of 8. |
| Database tests | 361 pass, 9 skipped (as on `dev`). They include the 0016 upgrade: existing rooms stay in training, their text settings and historical races are untouched, and `bonuses_enabled` is NOT NULL. The 0015 test now expects 0016's default. The review commit `e830a4e` had not run them, and that test failed there. |
| Integration (production build, two processes) | 11/11, four runs in a row. The Arcade race has two people and bots. Its configuration freezes `bonuses: true`. Grants go to the trailing runners. A player's Enter goes through the socket; a refusal keeps the grant. A bot's own activation is announced to followers with no private state. |
| E2E `arcade-settings`, `bonus-ui`, `text-settings`, `room-settings` | 18/18. Arcade is synced, survives reload, passes axe and is frozen at the start. The three effects, FIFO, Enter guards, the observer and reload pass on the real runtime. |
| Bounded cost (in process, fake timers) | 1 person and 9 bots on 120 graphemes: about 3.9 s in Arcade against 3.2 s in training. A first try with 30 entrants and 400 graphemes took about 190 s in training against 400 s in Arcade in simulated time. The cost per event grows with the roster in both modes; that is an observation for the load card, not a production measure. |

The 0016 upgrade test names its predecessor `0015_lobby_text_settings`. If the coordinator renumbers C2's migration, that name changes with it.

## Reviews at e830a4e, then fixes

| Review | First verdict | Fixed |
|---|---|---|
| Code reviewer + security | Changes needed. Blocking: `bonus-client-channel.test.ts` relied on the removed `[1,2,3,4]` constant and failed 3 runs in 4. Major: the Arcade integration test could time out when the bot's first grant was extendLeader; the evidence's unit count was wrong. Minor: the retry test checked too little, no service-level wiring test, a bot could act at once after a pause, a redundant scheduling call, a broadcast per refused bot retry, required `bonusesEnabled` for pages opened before a deploy. No security flaw. | Both socket tests inject a fixed award seed. New service test: Arcade drives `config.bonuses` and the award state, two seeds are drawn, and neither reaches the configuration, the logs or the tabs. The retry test now proves the same grant is asked again after a delay within the bounds and applies once content exists. A lease suspension clears the bots' due times, so after a pause a bot draws a fresh delay (new test, which fails without the fix). The redundant call is removed. |
| Functional QA, Fable 5.1 | Changes needed. Major: the announcements list scrolled (`max-h-48`) without being keyboard-focusable once it overflowed (axe `scrollable-region-focusable`); `bonus-channel.test.ts` had the same random seed. Minor: no game-mode column in the history list; the bonus section sits below the fold at 1280×1000; with fixture words a first extendLeader grant blocks a runner for the race. | The list is never a scrolling box (it already shows at most six). `bonus-channel.test.ts` injects the seed. The integration test runs six bots on fixture data and waits for any bot's activation, and accepts the guest's state-dependent refusals (another runner may already have fogged the same target, seen once in a re-run). |

Accepted, not changed here:
- **Refused bot retries.** Each one moves the bot's cursor, so followers get one progress broadcast every 1.5 to 6 s per blocked bot. That is bounded; on fixture data it is constant noise. Noted for the load card.
- **Settings pages opened before a deploy.** `bonusesEnabled` is required, so such a page gets `INVALID_SETTINGS` until it reloads, as with C2's text fields.
- **Integration without approved words.** With six bots, the chance that every bot's first grant is extendLeader is (1/3)^6, about 0.14 %. With C1's lists the test uses one bot and is deterministic.
- **For a ui-ux decision:**
  - a game-mode column in the history list;
  - the bonus section's place relative to the runner list;
  - a 6-announcement axe pass in `bonus-ui.spec.ts`.
- **Not verified by a flow:** a target disconnecting mid-effect. The coordinator's unit tests cover it.

## Acceptance (work order C3)

1. **Arcade on, training off, default off, no Evaluation mode.** Covered by the parser, state and E2E
   tests and the D-19 default.
2. **Approved words, private seed, versioned settings, no fixture fallback, no secret logged, nothing
   downloaded at activation.** Done; real words arrive after C1.
3. **Same rules for people and bots.**
   - Milestones and grants to the trailing runners come from the coordinator.
   - Activation and validation go through the same transition.
   - Bot delays are seeded, and unused grants are lost at the finish.
4. **Effects and edge cases.**
   - The three effects, and duplicate, replayed and stale commands: existing `race-bonus.test.ts`
     and `coordinator.test.ts`.
   - Unavailable extension data: new tests and integration.
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
- **BONUS-01 to BONUS-04:** wired in real rooms. Real extension words arrive after C1.

## Human acceptance

1. Assign the migration numbers and merge C1, then C2, then this branch.
2. In an Arcade room with a bot, fall behind and check the following:
   - you receive bonuses at 25, 50 and 75 %;
   - Enter activates them;
   - the bot uses its own;
   - the announcements read well in both languages.
