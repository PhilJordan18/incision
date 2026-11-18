# DA2-2 — ships, pennants and the red coast on the race

Captures of the running app (production build, isolated local database, `e2e/track-fixture.ts`
for the broadcast), written by `apps/web/e2e/da2-race.spec.ts` with `DA2_EVIDENCE_DIR` set.
Names, speeds and ranks are the fixture's.

File names: `course-<width>x<height>-<theme>-<language>-<runners>[-forced-colours|-zoom-200].jpg`.
`before-dev-*.jpg` are the same race on `dev` at `e899596`, before this card (from
`e2e/race-track.spec.ts`, cropped).

| App capture | Reference (`docs/da/v2/captures/`, PR #208) | Before |
|---|---|---|
| `course-1440x900-abysse-fr-30.jpg`, `course-1440x900-abysse-en-50.jpg` | `course-1440.jpg` | `before-dev-1440-abysse-fr-30.jpg`, `before-dev-1440-abysse-en-50.jpg` |
| `course-1440x900-aube-fr-30.jpg`, `course-1440x900-aube-en-50.jpg` | `course-1440-aube.jpg` | `before-dev-1440-aube-fr-30.jpg`, `before-dev-1440-aube-en-50.jpg` |
| `course-1024x768-abysse-fr-30.jpg`, `course-1024x768-aube-en-50.jpg` | `course-1024.jpg` | `before-dev-1024-abysse-fr-30.jpg`, `before-dev-1024-aube-fr-30.jpg` |
| `course-390x844-abysse-fr-30.jpg`, `course-390x844-aube-fr-50.jpg`, `course-360x740-abysse-en-50.jpg` | `course-390.jpg` | `before-dev-390-abysse-fr-30.jpg`, `before-dev-390-aube-fr-30.jpg` |
| `course-800x1000-abysse-fr-30.jpg`, `course-800x1000-aube-en-50.jpg` (horizontal tablet chart) | none: never drawn, adapted from the vertical chart | `before-dev-800-abysse-fr-30.jpg`, `before-dev-800-aube-fr-30.jpg` |
| `course-1280x640-abysse-fr-30.jpg`, `course-1280x640-aube-fr-50.jpg` (low screen) | none | — |
| `course-1440x900-abysse-fr-30-forced-colours.jpg`, `course-800x1000-aube-fr-30-forced-colours.jpg` | none | — |
| `course-768x480-abysse-fr-30-zoom-200.jpg`, `course-768x480-aube-en-50-zoom-200.jpg` (200 % zoom) | none | — |
| `vocabulaire-pavillons.jpg` is the reference for the shapes | `vocabulaire-pavillons.jpg` | — |

## Where the app differs from the mock-up, on purpose

- **Layout heights and the names' column** are the app's: names stay in their own column with a
  connector to the ship, so that 30 and 50 runners never overlap; the mock-up writes them beside
  each ship.
- **Pennant of a dashed runner**: the mock-up cuts it as a swallowtail. Here the cloth keeps the
  kind's shape (triangle: human, square: bot) and the dash is a sample of the route under it.
- **Compass**: bottom-left of the chart instead of bottom-right, where the names' column is.
- **A bot's name on the chart** no longer starts with « □ »: its square sail and square pennant say
  it, as in the mock-up. The standings keep « · □ Bot » in words.
- **Tablet chart**: only the two runners it names (me and the leader) sail a ship; the three
  other named runners are dots there, as its « + N autres coureurs » counts them.
- **Ships** are drawn at 85 % of the mock-up's size, so that they fit the shortest chart (12 rem).

## Contrast measured on the app (`race ships contrast`, 1440 × 900, 30 runners)

| Mark, against what is behind it | Abysse | Aube |
|---|---|---|
| Pennants on the standings panel (`embrun`, `juste`, `arcade`, `brume`, `moi`) | 12.17, 11.38, 7.13, 6.52, 10.96 | 12.87, 5.53, 6.65, 7.00, 5.00 |
| Routes and sails on the sea (same five) | 11.53, 10.78, 6.75, 6.17, 10.38 | 10.75, 4.62, 5.55, 5.84, 4.17 |
| Hull and compass line on the sea | 15.51 | 15.82 |
| Coast edge on the sea | 4.35 | 4.78 |
| Finish word on the land | 7.26 | 4.95 |
| « + N autres coureurs » on the land | 10.85 | 9.20 |
| A name on the sea | 15.51 | 15.82 |

Thresholds: 3:1 for marks, 4.5:1 for words. In Aube the land is the 20 % mix of `ligne` in
`nuit`, measured as rgb(244, 210, 211) on a sea of rgb(230, 235, 242).
