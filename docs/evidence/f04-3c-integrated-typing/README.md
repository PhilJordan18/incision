# F-04.3C — Integrated typing, race panels and the presence dialog (#51)

## Scope and provenance

Local verification, November 12, 2026, in an isolated cloud worktree. Card F-04.3
(#51), requirements COURSE-04 and CONF-08; related F-04.5 track (#53), F-06.2 Enter
bonus (#62) and decision D-17 (activity reminder). Mandate « saisie intégrée et
écran de course » from Philippe (Go Ahead and « deliver » in the conversation).

The change is presentation only. The typing engine, its native handlers (beforeinput,
composition, Backspace, paste/drop refusal, Enter → bonus), the scoring rules, the
server validation, D-17's timings and the results are unchanged. No migration, no
server rule, no new dependency. The site name and logo, and `apps/design/`, are
untouched.

- Base: `dev` at `e663a2e`.
- Application commits: `adb524b`, `8e2a195`, `de53f13`, `d842946` (first verified
  SHA), then review fixes `759cc29`, `4294e6c`, `0a647d5`, `639f052`.
- **Tested SHA: `639f052`.** This README and the screenshots come in a later
  documentation-only commit.

All tests ran on a local PostgreSQL 16 with synthetic data only
(`incision_e2e*`, `incision_test`). No production, Azure, Neon, recipe or Docker
resource was used.

## What changed

| Area | Before | After |
|---|---|---|
| Typing | A separate "Ta frappe" field under the text | The real `<input id="race-typing">` sits invisibly inside the text region, at the cursor (so input-method candidates open there). A primary press anywhere on the sheet, or Tab, focuses it. The sheet shows the focus (`moi` border and 3 px halo); away from it, the cursor is dashed and the line under the text says « Clique dans le texte ou appuie sur Tab pour taper. » |
| Layout | Text on the left; the track, the runner list and the bonuses stacked in a right column | Text across the full width; then standings (left), track (centre) and bonuses (right) at ≥ 1280 px. From 640 to 1279 px the track runs full width, with standings and bonuses below it. On a phone the order is track, bonuses, standings. Without bonuses (any race that is not Arcade): standings beside a wider track, no empty column |
| Runner list | A `<details>` « Voir tous les coureurs » under the track | A « Classement » panel: rank, name, progress, WPM, a token-coloured bar and status, keyboard-scrollable. It is not a live region |
| D-17 | A card with « Je suis là » | A labelled non-modal `<dialog>` under the text, announced by `role="alert"`. Focus stays in the text if it was there (a keystroke answers, as the server rule says). Otherwise focus goes to the dialog's heading, never to the button. Escape returns to the text without answering. The question is also shown in the line under the text, so it is seen even when the dialog is below the fold |
| Decoration | — | "Sea chart" panels: a dashed inner frame (`sillage`) inside the card. Tokens only, no image, no motion |

### Design deviations (approved by the mandate, flagged)

Screen 08 has a separate « TA FRAPPE » field and the track on the right. Philippe's
mandate replaces them with typing straight into the text and the three-panel row
above. Everything else keeps the design rules: one acting red, nothing moves near the
text (the sheet keeps its box; asserted), errors never shown by colour alone (boxed
character, ⚠ message, thicker error border), targets ≥ 44 px, visible focus,
forced colours (system-coloured cursor and focus outline).

## Acceptance evidence

| Mandate check | Evidence | Result |
|---|---|---|
| Free typing and mandatory correction | `typing-clarity.spec.ts` (FR/EN × Abysse/Aube × both modes); QA probe B (a 20-grapheme burst arrives exactly) | Passed |
| Accents, Unicode, IME, Backspace | QA probe on a real runtime: « Élève à Noël: ça coûte 3 € — 日本語 👍🏽 »; CDP IME composition counts nothing until commit; the spec's composition and Backspace steps | Passed |
| Paste refused | Real clipboard Ctrl+V (probe) plus synthetic paste/drop/replacement (spec) | Passed |
| No key lost, doubled or wrongly accepted | Probe totals: 44 inputs = 42 + 1 error + 1 retype, accuracy 97.7 %; `race_results` rows 46/46 | Passed |
| Click, Tab, focus loss and return | Spec: blur → hint; keys elsewhere ignored; click on the text → focused, no selection; Shift+Tab / Tab | Passed |
| No global key capture | Probe: focus on the standings, then on nothing → typing, Enter and Backspace do nothing | Passed |
| Enter with a bonus, without one, without a valid target | `bonus-ui.spec.ts` + QA probe C (0 commands without a bonus; « Aucune cible valide maintenant » keeps the bonus) | Passed |
| Reminder, confirmation and return | `race.spec.ts` D-17: dialog by role and name; heading focused away from the text; a/Space/Enter do not answer; Escape → text; Tab → « I'm here » → field; a keystroke answers for the typist; the question is in view under the text | Passed |
| An open tab is not activity | Probe D: clicks and wheel on the sheet for a minute → the dialog still opens | Passed |
| Account, guest, spectator, reconnection, race end | `guest-journey`, `guest-race-commands`, `race-track` (spectators), `race.spec` (second tab, reload, abandon); probe E (offline 30 s notice, reconnect, reload, results consistent) | Passed |
| FR/EN, themes, reduced motion, forced colours | typing-clarity under `reducedMotion: reduce`; race-track forced-colours captures | Passed |
| 390, 1024 and 1440 px, no horizontal scroll | Assertions at 1440/1024/390/360 in three specs; QA measured overflow 0 from 390 to 1440 px, also with the dialog open | Passed |

## Commands and observed results

Runtime: Node 24, Chromium (Playwright), production build.

- `npm run check:no-js`, `npm run lint`, `npm run typecheck`, `npm test` on
  `639f052`: passed. Unit totals: web 1,109; then 157, 1,259, 21 and 111 in the
  other packages.
- `npm run test:db -w @incision/database` (local disposable server): 433 passed,
  9 pre-existing PgBouncer tests skipped (no PgBouncer endpoint configured).
- Full Playwright suite: **216 passed** on `d842946` (19.4 min). Affected specs on
  `0a647d5` (typing-clarity, race, bonus-ui, race-track, guest-journey,
  mobile-keyboard, guest-race-commands): **36 passed**. The full suite on the tested
  SHA `639f052`: **216 passed** (17.9 min).

## Reviews

| Role | SHA | Verdict and outcome |
|---|---|---|
| functional-qa (Fable 5.2) | `d842946` | OK. Three minor findings, all fixed in `4294e6c`/`0a647d5`: empty bonus column, the bonus hint naming a hidden field, the Escape line shown where it does nothing |
| ui-ux | `d842946` | Changes needed, no blockers. Four major findings fixed in `4294e6c`: empty column without bonuses, no cursor in forced colours, browser-green progress bars, dialog below the fold. Minor findings: radius token (fixed); the bonuses panel keeps its own Arcade card (kept: its border-arcade colour identifies Arcade); the always-focusable standings list (kept) |
| code-reviewer | `d842946`, then the fixes | One major finding: the text region had no keyboard stop while the field was disabled. Fixed in `759cc29`, with unit and E2E assertions. Minor findings: hint chosen by string comparison, field placement on resize, primary button only, spectator text cursor, the live line re-announcing on blur, dead string and hooks, two weak test checks. All fixed in `759cc29`. A re-review of the fixes (`0a647d5`) found no blocking or major finding; its minor findings were fixed in `639f052` (focus never on an empty status line, field re-placed once the web font is ready, layout comment). One was accepted: a spectator's panel row gains the bonus column with the first Arcade announcement, below the text |

## Screenshots

`before/` shows `dev` at `e663a2e`; `after/` shows `0a647d5` (`639f052` changes no pixel in these captures: focus fallback, font timing and a comment). All are 1440 px wide
unless the name gives another width.

- `after/typing-fr-CA-abysse-mandatory-{1440,1024,390}.png` and
  `after/typing-en-US-aube-free-1440.png`: typing in the text (390 px shows the
  existing physical-keyboard notice).
- `after/bonus-fr-aube-{1440,1024,390}.png` and `after/bonus-en-abysse-1440.png`:
  Arcade, three panels.
- `after/track-aube-{1440,1024,390}.png`: an ordinary race, standings beside the
  wider track. `after/track-aube-forced-colors.png`: forced colours.
- `after/presence-dialog-{fr-aube,en-abysse}.png`: D-17 at 1280 × 720. The typist
  sees the question under the text; the dialog sits below it.

## Limits and not verified

- Real OS input methods, dead keys and autocorrect: only Chromium with CDP and
  synthetic events. Firefox and Safari were not run (`:has()` focus styling and
  `<progress>` pseudo-elements). Screen readers were checked through roles, names
  and axe only.
- The D-17 dialog was only captured at 1280 × 720.
- Not changed, outside this card's files: `room-view.tsx`. Its top row
  (« [.EN DIRECT] » and « Quitter la salle ») leaves a gap above the race at desktop
  widths.
- The requirements matrix (`docs/EXIGENCES.md`) is not edited here. The delta to
  report: COURSE-04 and CONF-08 integrated typing and D-17 dialog verified locally on
  `639f052`; human acceptance pending.
- No merge, deployment or production claim.
