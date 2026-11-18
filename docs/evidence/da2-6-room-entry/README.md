# DA2-6 — Create, join, public rooms, room states (C1 « Cap »)

Card DA2-6 of `docs/da/v2/plan.md`; requirements DES-04, SALLE-01, SALLE-03, JOIN-01, JOIN-02, JOIN-03, I18N-01; choice D-15.
Branch `feat/da2-6-room-entry`, started from `feat/da2-0-nautical-primitives`. Captures taken on 18 November 2026 from the production build of commit `c7c0891`, served locally on a disposable database (`db-test`, PostgreSQL 17). Later commits on the branch add only this folder.

## How the captures were made

- `app/` is written by `apps/web/e2e/da2-room-entry.spec.ts` itself, while it runs its assertions:

  ```sh
  DA2_EVIDENCE_DIR=<folder> npx playwright test e2e/da2-room-entry.spec.ts --trace off
  ```

  File names read `<screen>-<language>-<theme>-<width>.png`. `1280x640` is the low screen (viewport only), `zoom200` a 720 × 450 viewport (a 1440 px window at 200 %), `forced-colours` a viewport capture with forced colours emulated.
- `before/` is the same pages on `dev` at `e899596`, French, both themes, 1440 / 1024 / 390 px and 1280 × 640.
- The 360 px width is asserted by the spec (no horizontal scroll, placement, axe) and not stored. English is stored at 1440 px in Abysse and 390 px in Aube; the other English widths are asserted and not stored.

## Reference and app, side by side

The references are the approved mock-ups of `docs/da/v2/captures/` (archived by the pull request of `docs/da2-1-references`; they are not copied here).

| Screen | Reference | App (Abysse, French) | Same screen in Aube | Before |
|---|---|---|---|---|
| Create a room, 1440 | [creer-salle-1440](../../da/v2/captures/creer-salle-1440.jpg) | [app](app/create-fr-abysse-1440.png) | [app](app/create-fr-aube-1440.png) | [before](before/create-fr-abysse-1440.png) |
| Create a room, 390 | [creer-salle-390](../../da/v2/captures/creer-salle-390.jpg) | [app](app/create-fr-abysse-390.png) | [app](app/create-fr-aube-390.png) | [before](before/create-fr-abysse-390.png) |
| Public rooms, 1440 | [salles-publiques-1440](../../da/v2/captures/salles-publiques-1440.jpg) | [listed](app/public-rooms-listed-fr-abysse-1440.png), [empty](app/public-rooms-empty-fr-abysse-1440.png) | [listed](app/public-rooms-listed-fr-aube-1440.png), [empty](app/public-rooms-empty-fr-aube-1440.png) | [listed](before/public-rooms-listed-fr-abysse-1440.png), [empty](before/public-rooms-empty-fr-abysse-1440.png) |
| Public rooms, 390 | [salles-publiques-390](../../da/v2/captures/salles-publiques-390.jpg) | [listed](app/public-rooms-listed-fr-abysse-390.png) | [listed](app/public-rooms-listed-fr-aube-390.png) | [listed](before/public-rooms-listed-fr-abysse-390.png) |
| Join by code, 1440 | [rejoindre-1440](../../da/v2/captures/rejoindre-1440.jpg) | [app](app/join-fr-abysse-1440.png) | [app](app/join-fr-aube-1440.png) | [before](before/join-fr-abysse-1440.png) |
| Room states, 1440 | [etats-salle-1440](../../da/v2/captures/etats-salle-1440.jpg) | [unknown code](app/state-unknown-fr-abysse-1440.png), [too many tries](app/state-throttled-fr-abysse-1440.png), [closed](app/state-closed-fr-abysse-1440.png), [race running](app/state-racing-fr-abysse-1440.png), [already in a room](app/state-in-another-room-fr-abysse-1440.png), [404](app/state-not-found-fr-abysse-1440.png) | [unknown code](app/state-unknown-fr-aube-1440.png), [too many tries](app/state-throttled-fr-aube-1440.png), [closed](app/state-closed-fr-aube-1440.png), [race running](app/state-racing-fr-aube-1440.png), [already in a room](app/state-already-in-room-fr-aube-1440.png), [404](app/state-not-found-fr-aube-1440.png) | [unknown code](before/state-unknown-fr-abysse-1440.png), [closed](before/state-closed-fr-abysse-1440.png) |
| Room states, 390 | [etats-salle-390](../../da/v2/captures/etats-salle-390.jpg) | [unknown code](app/state-unknown-fr-abysse-390.png), [closed](app/state-closed-fr-abysse-390.png) | [unknown code](app/state-unknown-fr-aube-390.png), [404](app/state-not-found-fr-aube-390.png) | [unknown code](before/state-unknown-fr-abysse-390.png) |

Other views in `app/`:

- 1024 px for the three pages in both themes (`*-1024.png`) and the low screen in Abysse (`*-1280x640.png`; `before/` has it in both themes); the public rooms page at 768 px, where the fleet goes under the card.
- 200 % zoom (`*-zoom200.png`).
- Forced colours with each theme (`*-forced-colours-abysse-1440.png`, `*-forced-colours-aube-1440.png`).
- Aube with an error, a busy control and the card's second action: `create-error-*-aube-1440.png` (capacity refused), `create-pending-*-aube-1440.png` (« Ouverture… »), `public-rooms-no-room-*-aube-1440.png` (no room has a place).
- English: `*-en-abysse-1440.png` and `*-en-aube-390.png`.

## What differs from the mock-ups, on purpose

- **No example code.** The mock-up of « Créer une salle » writes `B7K4PQ` on the fort's sign. No room exists on that page, so the app draws six blank dots. The join chart writes the room's real code.
- **The visibility cards have no « 01 02 03 » numerals.** They are drawn by `components/rooms/visibility-choices.tsx`, a form component outside this lot, and the card says the form does not change.
- **The fleet is never cropped.** The mock-up fills its box by cropping the drawing; at 1024 px that cut the lighthouse and the first ship. The app fits the whole drawing and lets the waves fill the rest.
- **1024 px split.** The mock-up's fixed 640 px form column leaves a 240 px chart at 1024 px. From 1024 to 1279 px the app shares the row 3 : 2; from 1280 px it uses the mock-up's 640 px column.
- **Fewer wave marks in the corner.** The mock-up draws six strokes; the panels use the shared `WaveMarks` primitive of `components/nautical`, which draws two on a 220 × 90 box. One drawing for every lot was preferred to a second lattice.
- **Wave marks on a phone.** Under 640 px the label of a state panel can reach the corner, so a smaller box is drawn and it starts under the label's line. The marks may pass behind the title, never behind text to read.
- **Seven of the eleven panels.** The marks are on the room-entry panels, the error boundary and the 404 (the auth error page and the race page keep their panels as they were). « Expulsion », « Tu as quitté la salle », « Reconnecte-toi » and the « Reconnexion » card are rendered by `rooms/[code]/room-view.tsx`, which belongs to the waiting-room lot. « Avarie » uses the same panel and has the marks, but no capture: the test database cannot be made to fail on demand.

## Not checked

- A real screen reader. The spec reads the accessibility tree (the drawings are absent from it, the fields keep their names, the room code is read twice and not a third time from the sign).
- A real Windows contrast theme and real browser zoom: both are emulated in headless Chromium.
- Browsers other than Chromium.
- The « Avarie » panel in the running app (see above): its marks come from the same `waves` option as the six captured panels.
