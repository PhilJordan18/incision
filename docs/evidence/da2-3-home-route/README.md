# DA2-3 and DA2-4 — Home: first frame, route map, quay

Evidence for the long home page of the second art direction, C1 « Cap ». Branch `feat/da2-3-home-route`, started from `feat/da2-0-nautical-primitives`. Application code measured at `e7d865a`; the commits after it only add this folder.

Official requirements concerned: DES-04, JOIN-01, I18N-01, DES-05, DES-06, A11Y-01, A11Y-02 (choice D-15). The cards `DA2-n` are working labels and add no requirement. `docs/EXIGENCES.md` is not edited here.

Every capture below comes from the running application: production build, custom server, isolated local PostgreSQL (`incision_e2e*` databases on `localhost:5433`), Chromium through Playwright. No remote resource was used.

## Captures and the reference each one compares to

The references are the approved mock-ups archived by DA2-1 in `docs/da/v2/captures/` (pull request #208). They are not copied here.

| Capture from the app | Reference | Viewport, theme, language |
|---|---|---|
| `accueil-1440.jpg` | `docs/da/v2/captures/accueil-1440.jpg` | 1440 px, Abysse, FR, full page |
| `accueil-1024.jpg` | `docs/da/v2/captures/accueil-1024.jpg` | 1024 px, Abysse, FR, full page |
| `accueil-390.jpg` | `docs/da/v2/captures/accueil-390.jpg` | 390 px, Abysse, FR, full page |
| `accueil-1440-aube.jpg` | `docs/da/v2/captures/accueil-1440-aube.jpg` | 1440 px, Aube, FR, full page |
| `accueil-1024-aube.jpg`, `accueil-390-aube.jpg` | no mock-up | Aube at 1024 and 390 px |
| `accueil-1440-en.jpg`, `accueil-1440-aube-en.jpg`, `accueil-390-en.jpg` | no mock-up | English |
| `accueil-360.jpg` | no mock-up | 360 px |
| `premiere-vue-1440x800.jpg`, `premiere-vue-1366x700.jpg` | acceptance criterion | first frame, no scrolling |
| `premiere-vue-1280x640.jpg`, `premiere-vue-1280x640-aube.jpg` | low screen | first frame, no scrolling |
| `zoom-200-1440x800.jpg` | no mock-up | 200 % zoom of 1440 × 800 (720 × 400 CSS px at device scale 2) |
| `couleurs-forcees-sombre.jpg`, `couleurs-forcees-clair.jpg` | no mock-up | forced colours emulated, dark and light system palette |
| `quai-erreur.jpg`, `quai-erreur-aube.jpg` | no mock-up | refused code on the quay's own field |
| `focus-code-aube.jpg` | no mock-up | focus ring on the code field over the Aube sea |

## What was run, and the results

| Check | Result |
|---|---|
| `npm run check:no-js`, `lint`, `typecheck`, `build` at `e7d865a` | pass |
| `npm test` at `e7d865a` | pass: 2,687 unit tests (1,139 + 157 + 1,259 + 21 + 111), no skip |
| `e2e/design.spec.ts` and `e2e/account-journey.spec.ts` (unchanged) | all 28 pass inside the full suite below; `account-journey.spec.ts` is byte-identical to `dev` |
| Full `npm run test:e2e -w @incision/web` at `e7d865a` | 261 passed, 0 failed, 0 skipped, no retry (16.6 min). The run rewrites older screenshots under `docs/evidence/`; they were restored and are not part of this branch |
| Horizontal scroll, FR and EN, Abysse and Aube, at 1440 × 800, 1366 × 700, 1280 × 640, 1024 × 768, 390, 360, 320, 1920, 2560 px and 200 % zoom (40 combinations) | none; no clipped text |
| Entry actions in the first frame | bottom of « Rejoindre la salle » at 660 px (1440 × 800), 580 px (1366 × 700), 558 px (1280 × 640), 616 px (1024 × 768) |
| Keyboard only, both themes | 13 tab stops in DOM order (7 in the header, 3 in the first frame, 3 on the quay); a 3 px ring on each; smallest target 44 × 44 px |
| Accessibility tree | `h1`, `h2` « Les repères de ta traversée », four `h3`, `h2` « Prêt à lever l'ancre ? »; text boxes named « Code de salle » and « Code de salle — au quai de départ »; the guide region holds four list items |
| axe, WCAG 2.1 A and AA, Abysse and Aube, at 360, 390, 1024 and 1440 px | no violation (`design.spec.ts`, `account-journey.spec.ts`) |
| Lighthouse 12.8.2 on the local production build | desktop 100 / 100 / 100 / 100; mobile profile: accessibility, best practices and SEO 100, performance 87, 96, 93 and 96 over four runs |
| Weight of the page | 200 kB of HTML, 27 kB compressed; 40 kB of it is inline SVG; 833 DOM elements |

Contrast in Aube, computed from the tokens: body text 11.8:1; `brume` labels 5.8:1 on `mer` and 6.4:1 on `abysse`; the finish word on the coast 4.95:1; the coast's edge 4.78:1 against the sea and 4.09:1 against the land; my route and the dotted spine 4.17:1 on `mer`; `brume` sails 5.8:1; field border 3.54:1 on `mer`; focus ring 4.17:1 on `mer`, 4.57:1 on `abysse`. In Abysse the lowest pair is the coast's edge against the land, 4.09:1. Two pairs are below 3:1 on purpose and carry no information: the `houle` wave marks behind the bands (1.3:1) and the land's fill against the sea (1.2:1), which the 4 px `ligne` edge delimits.

## Reviews

Two read-only reviews ran on `fef09be`, before the last fixes: code and UI/UX. Fixed since: the Arcade drawing no longer ties a bonus to a milestone (the rules draw it at random), the route map keeps the mock-up's medium sizes between 1024 and 1279 px, scene labels no longer cross a drawing, the chart grid and wave marks leave the scenes in forced colours. Kept and listed below: the copy of the join form, the `:has()` rule on the shell.

## Differences from the mock-ups

- **Quay button.** The mock-up repeats « Rejoindre la salle ». The app's button reads « Embarquer avec ce code »: eleven existing specs look for the one « Rejoindre la salle » button, and the card asks for the quay's own label. This French string is new and not yet approved.
- **Escale 01.** The three accesses are a description list (name, then meaning) with the numbers 01 to 03 in the text. An ordered list would add three list items to the guide, and `account-journey.spec.ts`, which must pass unchanged, counts exactly four.
- **Escale 02.** The mock-up writes « Jalon 75 % » under Brouillard, « 50 % » under Rallonge and « 25 % » under Raccourci. The rules draw the bonus at random at each milestone, so the app names the three bonuses without a milestone.
- **Escale 04.** The mock-up's three names are replaced by plain lines beside the three pennant shapes: the home has no runner to show.
- **Phone.** The first frame's join form does not stretch to the full width as drawn: that form belongs to another lot.
- **1024 px.** Side margins stay at 48 px, aligned with the app's header, where the mock-up draws 32 px.
- **768 to 1023 px.** Not drawn: the sea sits above the title, as on the phone.
- **Small ships.** Every ship carries the flag of the shared primitive; the mock-up omits it on the six farthest ones.

## Limits and what was not checked

- No real screen reader was used: names, roles and order were read from the browser's accessibility tree.
- Forced colours were emulated in Chromium, not seen on a real high-contrast system. In the dark emulation the shared ships' sails resolve to the system text colour and are hard to see; that rule lives in `components/nautical`, outside this lot.
- Lighthouse ran on this machine, not on the production site where PERF-01 is measured. `dev` was not measured the same way for comparison.
- Firefox and Safari were not run. The full-width bands rely on `:has()`; without it the page keeps the site's usual margins.
- The home shows no live data, so realtime, rooms and bots are not concerned.
- The mock-ups' English was never drawn for the home: the strings below are proposals.

## Proposed English, to approve

| French | English proposed |
|---|---|
| Carte de route | Route chart |
| Escale 01 … Escale 04 | Port of call 01 … Port of call 04 (shorter alternative: Stop 01) |
| Départ | Departure |
| Prêt à lever l'ancre ? | Ready to cast off? |
| Embarquer avec ce code (new) | Board with this code |
| au quai de départ (new, read by screen readers after « Code de salle ») | at the departure quay |
| Cap (scene) | Heading |
| Bonus aux jalons (scene) | Bonuses at milestones |
| Journal de bord (scene) | Logbook |
| Record (scene) | Record |
| Courbe (scene) | Chart |
| « La mer était calme ce matin-là, et pourtant l'équipage savait que la traversée serait longue. » (scene) | "The sea was calm that morning, and yet the crew knew the crossing would be long." |

Reused without change: the guide's titles and bodies (`i18n/journey.ts`), the three visibilities, « Code de salle », « Créer une salle », « Arrivée », the bonus names, « Entraînement », « Arcade », « Sans bonus », « Texte à taper », « MPM net », « Précision ».

## Changes needed in files this lot does not own

- `components/site-shell.tsx`: a full-width variant of the main region. Until then `_home/home.module.css` lifts the width limit with `main:has(> .route)`, and a test checks the bands reach both edges.
- `components/rooms/join-code-form.tsx`: an id prefix, a label suffix, a button label and a button style, plus the full-width stacking on a phone. `_home/quay-join-form.tsx` could then be deleted; today it mirrors that form by hand.
- `i18n/dictionaries/fr.ts` and `en.ts`: `home.visibilityHeading` is no longer read by any page.
- `docs/EXIGENCES.md`: the D-15 text and the matrix line of `docs/da/v2/adaptations-d15.md` for DA2-3 and DA2-4, in the reconciliation lot.
