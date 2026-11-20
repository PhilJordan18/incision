# Implementation plan: C1 before the final submission

Technical guidance, in English. Revision 4, 17 November 2026, scoped on `dev` at `e899596`.

**Status.** "Go Ahead" was given on 17 November 2026 for every screen of mock-up version 15 (list in the [README](README.md)), plus two complements without mock-ups: the race settings edit form (DA2-8) and Aube for every approved page. Implementation runs in cloud sessions only. Delivery is authorised after verification: push of the work branches and pull requests to `dev`. Never a direct push to `dev`, a merge, a deployment or a card closing.

**Deadline.** Final submission on 20 November 2026, 23:59. This plan is an order of work, not a delivery guarantee.

`DA2-n` are working labels attached to official requirement IDs; visual improvements do not become course requirements.

## Decisions (17 November)

| Topic | Decision |
|---|---|
| `apps/design/` | Byte-identical. The complement lives in `docs/da/v2/`. |
| Red | One dominant red action per screen. The quay's button is secondary. |
| Home figures | Escale 04 shows no figure. Nothing invented on the home. |
| Strings | New FR/EN strings in new keys or files. `i18n/journey.ts` is read, not edited. |
| Waiting room order | Start plaque, settings, visibility / capacity / invitations, crew and bots, moderation. |
| « Fermer la salle » | Under « Lancer la course », secondary, with its confirmation. No D-15 change. |
| Bots | Separate add block; compact full-width list; edit on demand; explicit save and cancel. |
| Crew | Participants and spectators grouped; a separate spectator counter (n / 20). |
| Results | The red coast replaces the red mist. |
| « Rejoindre » | Approved with « Créer une salle » and « Salles publiques ». |
| Full room | Unchanged behaviour: the add button stays, the refusal shows after the attempt. |
| Header | The app's header is kept. The 22 px FR/EN targets of the mock-ups are not reproduced. |
| Acceptance A–G | Not reset. Each delivery adds a targeted qualification of what it changes. |
| Matrix | General reconciliation of `docs/EXIGENCES.md` is done in its own lot. Lots supply evidence and the lines concerned ([adaptations-d15.md](adaptations-d15.md)); they do not edit the matrix. |

## Invariants (every card)

- Race layout: text on top; standings left, track centre, bonus right; « Ta frappe » below. The field is never replaced by typing inside the text.
- The app's layout heights govern, not the mock-up's. `race-layout.spec.ts` keeps passing.
- A named runner's sail, route and standings pennant share one colour and one dash. A runner not named on the chart is drawn as a grey dot with a faint grey dotted route, and keeps its own colour and dash on its standings pennant (amended 19 November 2026, my decision after comparing both renderings). Position comes from the broadcast only.
- Focus, explicit errors, shortcuts, bonuses and the current activity reminder are unchanged. No new modal. No decorative motion near the text.
- No change to rules, speeds, scores, bonuses, persistence, defaults or corpus constraints. No schema change, no migration.
- Name and logo untouched; no generated image; colours from tokens only (Tailwind classes, `color-mix()` of two tokens where the mock-up does it).
- Targets ≥ 44 px, visible focus, errors never by colour alone, both themes, FR and EN.
- Visual tests are adapted to approved changes without removing functional assertions or lowering thresholds.
- Tests run on isolated local databases only. No remote resource is touched.

## Cards

### DA2-1 — Record the second art direction (documentation only)

IDs: DES-03, DES-04 · Choice: D-15 · Branch `docs/da2-1-references`

- [x] `docs/da/v2/README.md` separates what Philippe supplied from what the agent proposed.
- [x] 31 approved mock-ups as HTML (`maquettes/`) and JPEG (`captures/`).
- [x] Proposed D-15 text and matrix lines in `adaptations-d15.md` (the matrix itself is not edited here).
- [x] `AGENTS.md` says `docs/da/v2/` complements `apps/design/` for the screens it lists.
- [x] `git diff --stat origin/dev -- apps/design` is empty.

### DA2-0 — Nautical primitives

IDs: DES-04, BOT-04, A11Y-01 · Branch `feat/da2-0-nautical-primitives` · First code PR; every other code branch starts from it.

- [ ] `apps/web/src/components/nautical/`: ship (triangle sail for a human, square for a bot), pennant (same shapes, with the solid / dashed / dotted variants the routes use), coast (vertical and horizontal), wave marks, glass compass. Decorative, `aria-hidden`, static, tokens only.
- [ ] The Aube coast uses the 20 % `ligne` in `nuit` mix; forced colours give every shape a system colour.
- [ ] One shared panel title style, added where the app keeps its shared styles.
- [ ] Unit tests for the shape-by-kind rule. No page changes in this PR.

### DA2-2 — Ships, pennants and the red coast on the race

IDs: DES-04, COURSE-05, BOT-04, PERF-03, A11Y-01, DES-05, DES-06 · Branch `feat/da2-2-race-ships`

- [ ] Named markers render a ship in the runner's colour; unnamed runners stay dots; my ship keeps its two rings, the leader its `or` ring.
- [ ] Route, ship and standings pennant of one named runner share one colour and one dash, in both themes (three-way assertion in `race-track.spec.ts`). Unnamed runners: grey dot and grey dotted route on the chart, desktop and tablet; their pennant in the standings keeps their colour and dash (amended 19 November 2026).
- [ ] A bot differs from a human by the sail's shape, without colour.
- [ ] The finish is the coast; the finish word stays. The compass sits on the track, away from the text.
- [ ] Markers follow the broadcast with the existing transition; nothing moves on its own; reduced motion unchanged.
- [ ] Vertical and horizontal tracks both work; under 768 px the keyboard advice still replaces text and typing.
- [ ] 1280 × 720, 1024 × 768 and 200 % zoom: text, track and « Ta frappe » still fit.
- [ ] 30 and 50 simulated runners: no label overlap, no horizontal scroll.
- [ ] `typing-clarity`, `race-layout`, `mobile-keyboard`, `bonus-ui`, `guest-race-commands` pass unchanged.

Out of scope: the text sheet, « Ta frappe », the engine, the broadcast, bonus logic, the activity reminder, the layout heights.

### DA2-3 and DA2-4 — Home: first frame, route map, quay

IDs: DES-04, JOIN-01, I18N-01, DES-05, DES-06, A11Y-01, A11Y-02 · Branch `feat/da2-3-home-route`

- [ ] The C1 scene replaces `SeaRoutes`, decorative and static.
- [ ] « Rejoindre la salle » and « Créer une salle » fully visible at 1440 × 800 and 1366 × 700.
- [ ] Four escales with the titles and bodies of `i18n/journey.ts`; the three visibilities as a numbered list in escale 01; the three cards leave the home in the same PR.
- [ ] New strings in `i18n/home-route.ts`, FR and EN.
- [ ] The quay repeats the code field with a secondary button, its own id and label. Exactly one red action in `main`.
- [ ] Escale 04 shows no figure.
- [ ] Headings in order; drawings `aria-hidden`; one column at 390 px (number, text, drawing); no horizontal scroll at 360 px.
- [ ] `account-journey.spec.ts` passes unchanged.

### DA2-5 — Waiting room, second layout

IDs: DES-04, SALLE-05, CONF-10, CONF-11, BOT-04, COURSE-11, I18N-01, DES-06, A11Y-02, A11Y-04 · Choices: D-15, D-22 · Branches `feat/da2-5a-waiting-room-layout`, then `feat/da2-5b-bot-rows`

**5a. Order and restyle (no behaviour change)**
- [ ] DOM and visual order at every width: start plaque (code, « Lancer la course », « Fermer la salle » under it), settings, visibility / capacity / invitations, crew and bots, moderation.
- [ ] « Ajouter un bot » is a compact dashed block above « Bots dans la salle — N ».
- [ ] Crew grouped as participants and spectators; spectator counter `n / 20`; the top counter stays `participants + bots / capacity`.
- [ ] The quay shows at most eight hulls then a count, is `aria-hidden`, and is removed on a low screen.
- [ ] A non-host sees no host control. The only red action is « Lancer la course ».

**5b. One line per bot, editor on demand**
- [ ] A closed line shows insignia, « Bot n », the saved level, « Modifier », « Retirer ».
- [ ] « Modifier » opens the level select and « Changer le niveau », moves focus to the select; `aria-expanded` reflects the state.
- [ ] Nothing is saved without « Changer le niveau ». « Annuler » discards and returns focus to « Modifier ».
- [ ] A line with an unsaved draft never closes by itself: opening another bot leaves it open; a room update keeps the draft; several lines may be open.
- [ ] The unsaved state shows the ⚠, the tag and the app's sentence, and is announced in the line's live region.
- [ ] A server refusal shows on the line it concerns and keeps the draft.
- [ ] « Retirer », error codes, rate limit and stale-revision handling untouched. No grouped delete, pagination, virtualisation or capacity change.

**Cases to test in the app:** 0, 2 and 10 bots; full capacity (30 / 30); host and non-host; participants and spectators; edits on several bots at once; cancel; a server refusal; a concurrent update from a second browser.

### DA2-8 — Race settings edit form (complement of 17 November, no mock-up)

IDs: CONF-01 to CONF-09, CONF-12, I18N-01, A11Y-03, A11Y-04 · Choices: D-10, D-19, D-21 · Branch `feat/da2-8-settings-form`, after 5a

**Observable goal:** the host finds the settings before the bot list, edits them in four clear groups, always sees what is saved and what is pending, and never loses a draft to a realtime update.

- [ ] The panel stays second in the page, after the start plaque. The saved summary is always visible, also while the form is open.
- [ ] The form has four groups, each a `fieldset` with a visible legend: **text** (language, text type, complexity, word count, text options, characters to include and exclude), **duration** (no limit or seconds), **typing mode**, **game mode**. Every existing field, hint and label is kept.
- [ ] A field whose draft differs from the saved value is marked by a tag and the saved value in words (« Non enregistré », « Enregistré : … »), not by colour alone. The form states how many changes are pending in its live region.
- [ ] « Enregistrer les réglages » and « Annuler » stay explicit. No auto-save. « Annuler » restores the saved values and returns focus to « Modifier les réglages ».
- [ ] Errors sit next to the field they concern, linked with `aria-describedby` and `aria-invalid`: word count, duration, characters, text options. A refusal that concerns no single field stays in the form's alert. Focus moves to the first field in error after a refused save.
- [ ] A realtime update never overwrites a draft. When the saved settings change while the form is open, the summary updates, the existing conflict message shows, the draft stays, and « Recharger les réglages » is the only way to replace it.
- [ ] Host and non-host rights and the lock by room state are unchanged: a non-host sees the summary only; outside the waiting state the settings are locked; a disconnected host cannot edit.
- [ ] No default, product rule or corpus constraint changes. `room-settings-state.ts` rules are kept; its tests are extended, none removed.
- [ ] New strings limited to the group legends and the saved / pending marks, FR and EN, in new keys.
- [ ] Captures with the delivery: closed, open and clean, open with pending changes, field error, server refusal, conflict after a concurrent update, disconnected, non-host; Abysse and Aube; 1440 and 390 px; FR and EN.
- [ ] `room-settings`, `arcade-settings`, `text-settings` specs pass; selectors change only where markup moved.

### DA2-6 — Create, join, public rooms, room states

IDs: DES-04, SALLE-01, SALLE-03, JOIN-01, JOIN-02, JOIN-03, I18N-01 · Branch `feat/da2-6-room-entry`

- [ ] `/rooms/new` keeps its form; the chart of the three accesses sits beside it from 1024 px and under it below.
- [ ] `/rooms`: the matchmaking card keeps the only red action; the two empty grid columns hold a decorative scene, hidden under 640 px.
- [ ] Join by code: the small chart beside the form.
- [ ] The eleven room state panels gain the wave marks; tone border, sign, texts and actions unchanged.
- [ ] `rooms`, `public-rooms`, `quickplay`, `code-limit`, `room-invitations`, `invitation-focus`, `guest-journey` pass.

### DA2-7 — Results, race page, history, account

IDs: DES-04, RES-01, RES-02, RES-03, HIST-01, HIST-02, AUTH-05, AUTH-06, COURSE-11 · Branch `feat/da2-7-results-pages`

- [ ] A pennant per runner in the podium, the results table, the bonus journal and the chart legend; shape equal to the track's for the same entrant; colour equal to the track's for the reader, neutral for the other runners until the result views carry the entrant id (limit accepted on 19 November 2026).
- [ ] The coast beside the rank replaces the red mist.
- [ ] Wave marks behind the titles of `/history` and `/account`; the shared panel title style.
- [ ] No text, column, action or state changes. The red action stays « Prochaine manche » (host) and « Enregistrer le nom » (account).
- [ ] Results, history, profile and chart specs pass.

## Aube (every card)

Aube is a real variant, not inverted backgrounds. Each card delivers Aube for its pages, including empty states, errors, disabled controls and unsaved changes, with authorised tokens only. Checked on the app, by measure and by capture:

- text ≥ 4.5:1 (3:1 for large text); pennants, named runners' routes, insignias, the coast's edge and field borders ≥ 3:1 against what is behind them (the faint grey route of an unnamed runner is decorative and not held to 3:1, amended 19 November 2026);
- two runners' routes remain distinguishable by dash, not only by colour;
- the red coast reads as land (the 20 % mix), the finish word keeps ≥ 4.5:1;
- the focus ring is visible on every surface used (`abysse`, `nuit`, `mer`, the coast);
- no flash at load (DES-05), in both the system and the chosen theme.

## Verification on the integrated app

Mock-up checks do not validate the app. Each lot checks, on its final SHA:

- FR and EN on every page it touches;
- Abysse and Aube, forced colours, 200 % zoom, keyboard only, a targeted screen-reader check (names, states and live regions of what changed);
- 1440, 1024, 390 and 360 px, and a low 1280 × 640 screen;
- for rooms: 0, 2 and 10 bots, full capacity, host and non-host, participants and spectators, edits on several bots, cancel, server refusal, concurrent updates;
- regressions: typing focus, runner colours and routes, synchronised settings.

What could not be run is reported under "Not checked", never implied.

## Work lots and file ownership

Five cloud sessions. A file has one owner; nobody else edits it.

| Lot | Cards | Owns |
|---|---|---|
| Race | DA2-0, DA2-2 | `components/nautical/**`, shared style additions, `components/races/race-track*`, `race-standings.tsx`, `track-layout.ts`, `rooms/[code]/race-view.tsx`, `e2e/race-track.spec.ts` |
| Home | DA2-3, DA2-4 | `app/(site)/page.tsx`, `app/(site)/_home/**`, `i18n/home-route.ts`, `e2e/design.spec.ts` |
| Waiting room | DA2-5a, DA2-5b, DA2-8 | `rooms/[code]/room-view.tsx`, `components/rooms/room-*-panel.tsx`, `add-room-bot.tsx`, `room-bot-row.tsx`, `room-settings-state.ts`, `i18n/room-bots.ts`, `i18n/room-settings.ts`, the room e2e specs |
| Room entry | DA2-6 | `rooms/new/**`, `rooms/page.tsx`, `join-code-form.tsx`, `join-room-form.tsx`, `public-room-explorer.tsx`, `quickplay-card.tsx`, state panels outside `room-view.tsx` |
| Results | DA2-7 | `race-results.tsx`, `results-podium.tsx`, `results-bonus-journal.tsx`, `race-charts.tsx`, `races/[id]/page.tsx`, `history/page.tsx`, `account/**` |

Shared files: a lot that needs a change in a file it does not own names the change in its report instead of making it. New cross-cutting checks go in a new spec file per lot (`e2e/da2-<lot>.spec.ts`). Nobody edits `docs/EXIGENCES.md`, `docs/da/v2/` or `apps/design/`. Evidence captures go in `docs/evidence/da2-<card>-<slug>/`.

## Integration order

Pull requests all target `dev`. Merging is Philippe's.

1. `docs/da2-1-references`
2. `feat/da2-0-nautical-primitives`
3. `feat/da2-2-race-ships`
4. `feat/da2-3-home-route`
5. `feat/da2-6-room-entry`
6. `feat/da2-5a-waiting-room-layout`
7. `feat/da2-5b-bot-rows`
8. `feat/da2-8-settings-form`
9. `feat/da2-7-results-pages`

Branches 3 to 9 start from branch 2. Until it is merged, their pull requests also show its commits; 6, 7 and 8 are stacked in that order. After the merges, the combined `dev` is checked once more: a green CI per branch does not replace it.

**Cut rule.** A card not ready to deliver by the evening of 19 November is not delivered for the submission; the current screen stays, which is already accepted. 5b and 8 touch realtime state and carry the highest risk.

**Each delivery reports:** exact SHA, files touched, tests actually run, skips, before / after captures (1440, 1024, 390 px and a low screen, Abysse and Aube), limits, and the push and pull-request CI results on the final SHA.
