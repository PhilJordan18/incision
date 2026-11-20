# F-04.3D — « Ta frappe » under the panels, logbook and sea chart, persistent routes (#51)

## Scope and provenance

Local verification, November 12, 2026, in an isolated cloud worktree. Card F-04.3
(#51), requirements COURSE-04, COURSE-05, CONF-08 and DES-04; related F-04.5 track
(#53), F-06.2 Enter bonus (#62), D-06 (reconnection), D-16 (Enter), D-17 (activity
reminder) and D-20 (under 768 px). Mandate: Philippe's two Go Ahead of November 12 in
the conversation, for the layout and aesthetic correction of #51 (comment 6815805562)
and the persistent coloured routes (comment 6815818959), on the same PR #203.

Presentation only. The typing engine, the server rules, the bonus rules, D-17's
timings, the results and the database are unchanged: no migration, no new dependency,
no telemetry. The site name, the logo and `apps/design/` are untouched; no raster
image, no sound, no new animation; the native caret is kept.

- Base: F-04.3C at `9f72197` (PR #203 before this round).
- Commits: `7fef79e` (routes), `b838b48` (layout), `c256bf5` (tests: first verified
  SHA), the review fixes `e68887e`, `6b8ef13`, `c326e91`, the D-15 record `feb4d43`
  (full suite), then the re-review fixes `b8fe99c` and `7d5e2ff`, and Philippe's
  width correction (see below).
- **Tested SHAs: `7d5e2ff`, then the width correction.** This README, the matrix rows
  and the screenshots come in documentation-only commits.

All tests ran on a local PostgreSQL 16 with synthetic data only (`incision_e2e`,
`incision_test`). No production, Azure, Neon, recipe or Docker resource was used.

## What changed

| Area | F-04.3C (before) | F-04.3D (after) |
|---|---|---|
| Typing | An invisible input inside the text | One real, labelled, compact field « Ta frappe » / “Your typing” (48 px, `moi` caret and focus ring) under the panels' row, as wide as the text above it: the label over the field, the help under it (Philippe's sketch-approved correction of November 12). The text above only shows the progress. A press on the text or on the pad, or Escape from the text or a panel, gives the keys back to the field. Enter keeps its bonus behaviour (D-16); paste and drop stay refused |
| Order (≥ 1024 px) | Text, row, then secondary actions; « Quitter la salle » above the race for a non-host | Compact indicators; the text across the full width; one row: standings left, track centre, bonuses right (standings beside a wider track without bonuses); « Ta frappe »; then the secondary actions, leaving the room included, for everyone |
| Heights | Text 16 rem; row unbounded | The text and the row share the viewport height (`clamp`), so text, track and field are on screen together at 1440 × 900, 1280 × 720 and 1024 × 768 |
| Side panels | Dashed inner frame | A ship's logbook: ruled `houle` lines, four corner marks, a double rule under the heading |
| Standings | Four lines per runner | Two compact lines (rank, route swatch, name; progress · WPM · status) and a thin bar. Your own line stays in view (sticky) in a long list. The note « En direct, selon la progression… » is shown, except on desktop screens ≤ 820 px high where it is only read by screen readers |
| Bonuses | Name and milestone | A nautical mark, name, milestone, effect, availability (« prochain · prêt · Entrée », « en attente », « en réserve ») and the activation reminder, which stays above the scrolling log. "Ready" only when Enter can act (controlling, not blocked, synchronised, racing) |
| Track | Lanes and markers | A sea chart: graticule, chequered `ligne` finish band with a pennant, and a persistent route per runner from the start to its real progress, in a stable colour and dash shared by its marker and its swatch in the labels and the standings. Named markers carry their standings rank (also before the label's name) instead of initials |

### Design deviations (flagged; recorded in D-15)

- **Route colours (rule 5).** Each runner keeps one colour for the round: `moi` for
  you, otherwise `juste`, `arcade`, `embrun` or `brume`, crossed with a solid, dashed
  or dotted line. Rule 5 reserves green and violet for your neighbours and draws the
  others in Brume. Philippe's request (a stable colour per player, bots included)
  cannot be met with neighbour colours that change with the ranking. The leader keeps
  its `or` ring. **Philippe's confirmation is pending.**
- **Labels.** The track names the first two, you and your two neighbours (at most
  five), instead of the top three.
- **Field height.** 48 px instead of screen 08's 64 px, so that the text, the track
  and the field fit together at 1280 × 720.

Never colour alone (rule 8): every route also has its dash, every named marker its
rank, every name its swatch, bots their □ mark, you « (toi) ». In forced colours,
routes and markers use system colours, yours `Highlight`.

## Acceptance evidence

| Check | Evidence | Result |
|---|---|---|
| Order and simultaneous use at 1440 × 900, 1280 × 720, 1024 × 768 (FR/Aube, EN/Abysse) | `race-layout.spec.ts`: text above the row above the field; the three panels top-aligned; text, track and field wholly in the viewport; text ≥ 18 px, sheet ≥ 150 px, field ≥ 44 px, track 12 rem to 45 % of the height; no horizontal scroll | Passed |
| The same without bonuses | `race-layout.spec.ts` « without bonuses » at the three sizes | Passed |
| Exactly one input; focus kept, no remount during refreshes | `race-layout.spec.ts`: one enabled input; 26 keys typed while the track and standings refresh every 120 ms and the bonus inventory every 360 ms; the same element stays connected and focused; every key lands | Passed |
| Return to the pad | `typing-clarity.spec.ts`: click on the text (no selection), click on the hint, click on the field, Escape from the text and from the standings; `race-layout.spec.ts`: Escape from the bonus log | Passed |
| Mandatory and free correction, Backspace, IME, paste and drop | `typing-clarity.spec.ts` (2 locales × 2 themes × 2 modes): composition, Backspace, a Backspace inside a composition leaves the race alone, free mode marks a wrong character and goes on, paste/drop/replacement refused; `race.spec.ts` mandatory block | Passed |
| Enter with and without a bonus | `bonus-ui.spec.ts` (FIFO, guards, three effects); `typing-clarity.spec.ts` and `race.spec.ts` (Enter types nothing); `race-bonuses.test.ts` (ready only when usable, a suspended tab is not) | Passed |
| Spectator, terminal state, reconnection, D-17 | `race-track.spec.ts` (spectator: no field); `race.spec.ts` (abandon, time up, second tab, D-17 dialog returns to the pad); `race-layout.spec.ts`: a lost connection shows the 30 s notice under the field, nothing above moves, the notice goes when the connection is back | Passed |
| 200 % zoom and 390 px (D-20) | `race-layout.spec.ts` at 720 × 450 and 512 × 384 (keyboard message and track, no field) and 768 × 432 (the field types); `typing-clarity`, `race-track`, `mobile-keyboard` at 390/360 | Passed |
| Routes: progress, finish, new round, reload, stable colours, close and many runners | `track-layout.test.ts`: start at the start line, never past the progress, marker at its end; a finished route ends on the finish line; a refresh, a reorder and a reload keep colour, dash and path; a new round starts at the start line; 50 runners at the same progress keep 50 lanes; no repeated colour × dash among 12 neighbours. `race-track.spec.ts` (30 and 50 runners, FR/EN × themes): one route per runner, route stroke = marker colour, one `moi`; the same strokes and dashes after a reload; the field keeps its box and focus while the markers move | Passed |
| FR/EN, both themes, reduced motion, forced colours, axe | All specs above; `race-track.spec.ts` (transitions off under reduced motion; forced colours) | Passed |

## Commands and observed results

Runtime: Node 24, Chromium (Playwright), production build.

- `npm run check:no-js`, `npm run lint`, `npm run typecheck`, `npm test` on
  `feb4d43`: passed; web unit tests, lint and typecheck again on `b8fe99c`: passed. Unit totals: web 1,115; then 157, 1,259, 21 and 111 in the
  other packages.
- `npm run test:db -w @incision/database` (local disposable server): 433 passed,
  9 pre-existing PgBouncer tests skipped.
- Targeted Playwright (race-layout, race-track, typing-clarity, bonus-ui, race):
  29 passed on `c256bf5`; 36 on the fixes (35 + the reconnection test after its
  fixture fix).
- Full Playwright suite on `feb4d43`: **229 passed** (16.6 min).
- The re-review fixes change a test fixture, one key handler line and the standings
  note. The affected specs (race-layout, race-track, typing-clarity, bonus-ui, race,
  host-succession, bot-races, mobile-keyboard, guest-race-commands): **54 passed** on
  `b8fe99c`, and **54 passed** again on `7d5e2ff`.
- Width correction (the pad's markup only): web unit tests (1,115), lint, typecheck
  and the production build passed; the same 54 specs: **54 passed**.

## Reviews

| Role | SHA | Verdict and outcome |
|---|---|---|
| ui-ux | `c256bf5` | Changes needed, no blockers. Fixed: the leader's name on the finish band, identical « MA » initials on every named marker (now ranks), standings too tall for a short row (compact, own line sticky), « Quitter la salle » above the race, the bonus reminder cut in the scrolling log, « + 25 autres coureurs » over markers. Kept and flagged: the route palette and the labelled set (D-15). Not changed: the sheet's last visible line can be cut mid-line (it scrolls); the track heading outside its frame (chart vs logbook) |
| functional-qa | `c256bf5` | Changes needed, no blockers. Fixed: Backspace during an IME composition deleted a race character (pre-existing); tests added for the reconnection notice, the layout without bonuses, free correction, Escape from the bonus log, clicks back on the pad and the field, the finished route. A press anywhere on the pad now refocuses the field |
| code-reviewer | `c256bf5` | Changes needed, no blockers. Fixed: "ready · Enter" shown to a suspended tab; the focus test could not see a remount (now an element-identity check, with bonus refreshes); colour stability overstated in a comment; a brittle class assertion. Kept: the 200 ms marker transition behind its route's end (the interpolation of COURSE-05); `RouteSwatch` imported from the track; `Tile`'s classes |
| code-reviewer (fixes) | `feb4d43` | No product regression. One major test finding fixed in `b8fe99c`: the reconnection test refused the handshake, which the page reads as a signed-out session, so it passed without a reconnection; the outage is now a network refusal, and the test checks that the race is live again and types. Also fixed: Backspace skipped on `keyCode 229` outside a composition; the standings note hidden on desktop while the markers show live ranks (`7d5e2ff` hides it only on short screens). Kept: the bonus panel says « Synchronisation des bonus… » for a suspended tab, as for the SUSPENDED refusal |

## Screenshots

`before/` is `9f72197` (F-04.3C); `after/` is `7d5e2ff`, with the layout, no-bonus,
zoom and reconnecting captures retaken after the width correction. Same fixture: 30 runners
(a quarter of them bots), an Arcade inventory, the player at 20 %.

- `before|after/layout-{fr-CA-aube,en-US-abysse}-{1440x900,1280x720,1024x768}.png`.
- `after/layout-no-bonus-{1440x900,1280x720,1024x768}.png`: any race but Arcade.
- `after/zoom-{720x450,512x384,768x432}.png`: 200 % zoom (full page).
- `after/reconnecting-fr-aube-1440.png`: the D-06 notice under the field.
- `after/track-fr-{abysse-1440,aube-800,aube-390,aube-forced-colors}.png`: the
  track spec's full pages (30 runners in the capture), forced colours.
- `after/bonus-fr-aube-390.png`: Arcade on a phone (D-20 message, track, bonuses).

## Limits and not verified

- Real OS input methods, dead keys and autocorrect: Chromium with synthetic events
  only. Firefox and Safari not run. Screen readers checked through roles, names and
  axe only.
- The route colours depart from design rule 5; Philippe's confirmation is pending
  (D-15).
- The marker moves over 200 ms to its new place while its route's end is drawn at
  once: for that moment the route runs slightly ahead of its marker.
- Two players can see the same runner in different colours (yours is always `moi`).
- At 1280 × 720 the standings row shows about two runners plus your own (sticky)
  line; the rest scrolls in the panel. The sheet's last visible line can be cut
  through its glyphs (the text scrolls). With the help now under the full-width
  field, at 1280 × 720 the help line starts at the bottom edge of the screen (the field
  itself is wholly visible); it scrolls into view.
- No merge, deployment or production claim; human acceptance pending.
