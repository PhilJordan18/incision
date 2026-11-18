# Coverage: what was drawn, what was checked, what was not

Technical guidance, in English. Mock-ups read against `dev` at `e899596`, 17 November 2026.

**The checks below were run on the static mock-ups, not on the app.** They show the design can meet a rule. Every screen is verified again on the integrated app ([plan](plan.md), "Verification on the integrated app").

## Views

| Page | Views drawn | What C1 adds | What stays as in the app |
|---|---|---|---|
| Home `/` | 1440, 1024, 390; Aube 1440 | First frame, four escales, red land band, quay | Title, join form, « Créer une salle », one red action |
| Race | 1440, 1024, 390; Aube 1440 | Ships, pennants, red coast, glass compass | Layout order, the app's heights, legend, bonuses, activity reminder, abandon, phone advice |
| Create a room | 1440, 390 | Chart of the three accesses beside the form | Form, three visibilities, checkbox, capacity, red « Ouvrir la salle » |
| Public rooms | 1440, 390 | Decorative fleet scene, hidden under 640 px | Matchmaking card and its red action, filters, live list, states |
| Join by code | 1440 | Small chart beside the form | Code, checkbox, red « Rejoindre la salle » |
| Waiting room, host | no bot, two bots, ten bots (1440, 1024, 390, English, Aube), full capacity | New order; add bar; one line per bot; grouped crew; bounded quay | Limits, levels, insignias, host rights, confirmations, existing strings |
| Waiting room, non-host | ten bots, 1440 | Same layout without host controls | No add, edit, remove, start, invitations or moderation |
| Results and bonus journal | 1440, 390 (host) | Pennants; coast beside the rank | Rank, record note, tiles, host actions, podium, table, footnotes, journal texts |
| Race page | 1440 | Pennants in the chart legend | Curves, tables, key grid, layout select, privacy note |
| History | 1440 | Wave marks behind the title | Table, pagination, empty and error cards |
| Account and statistics | 1440, 390 | Wave marks; one panel title style | Rooms, races, photo, name with its red save, sign-out, tiles, chart |
| Room states and refusals | 1440, 390 (eleven panels) | Wave marks in the corner | Tone border, sign, texts, actions |
| Race settings edit form | not drawn | Described in the plan (DA2-8) | Every field, hint, rule and right |
| Sign-in, auth error, guest entry, invitation, countdown, confirmations | not drawn | Nothing | Everything |

## Checks run on the mock-ups

Scripted Chromium on the static files.

| Check | Waiting room | Results | Race page | History | Account | Room states |
|---|---|---|---|---|---|---|
| No horizontal scroll at 1440, 1024, 390, 360 | pass | pass (the table scrolls in its own region) | pass | pass | pass | pass |
| Low screen 1280 × 640 | pass: code and red action end at 345 px and 281 px | no claim | — | — | — | — |
| Targets ≥ 44 px (header FR / EN links excepted, see the README) | pass | pass | pass | pass | pass | pass |
| Every tab stop shows a focus ring, DOM order | pass (48 stops as host, 8 as non-host) | pass | pass | pass | pass | pass |
| Text contrast, Abysse | min 4.59:1 | min 5.22:1 | min 6.28:1 | min 6.52:1 | min 5.22:1 | min 5.22:1 |
| Text contrast, Aube | min 5.72:1 | min 5.72:1 | min 6.41:1 | min 6.41:1 | min 5.72:1 | min 5.72:1 |
| Forced colours | viewed: states keep a border, a sign or a word | captured, not reviewed | captured, not reviewed | captured, not reviewed | captured, not reviewed | captured, not reviewed |

The home, the race and the three room-entry pages were checked by eye on their captures at the widths drawn; the script above was not run on them.

## Not verified at mock-up level

To be checked on the app:

- English on every page except the waiting room (drawn once in English).
- Aube on the pages that have no Aube mock-up; contrast of non-text marks (pennants, routes, insignias, coast edge, key borders).
- Forced colours beyond the waiting room.
- Zoom at 200 %, screen-reader output, live regions, focus after « Modifier » and « Annuler ».
- The track with 30 and 50 runners; the horizontal tablet track, which was never drawn.
- The settings edit form in every state.
