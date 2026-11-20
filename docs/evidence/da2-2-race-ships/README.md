# DA2-2 — ships, pennants and the red coast on the race

Captures of the running app (production build, isolated local database, `e2e/track-fixture.ts`
for the broadcast), written by `apps/web/e2e/da2-race.spec.ts` with `DA2_EVIDENCE_DIR` set.
Names, speeds and ranks are the fixture's.

File names: `course-<width>x<height>-<theme>-<language>-<runners>[-forced-colours|-zoom-200].jpg`.
`*-by-the-coast.jpg`: every runner at the fixture's last position, 95 %, still racing.
`before-dev-*.jpg` are the same race on `dev` at `e899596`, before this card (from
`e2e/race-track.spec.ts`, cropped).

**Simulated runners.** The 30 and 50 runners of these captures come from one browser and a
rendering fixture that sends the broadcast; they are not 30 or 50 connected players. No real race
with that many clients was run for this card. The fixture never sends 100 % or « finished ».

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
| `course-1024x768-abysse-fr-30-by-the-coast.jpg`, `course-1280x640-aube-fr-50-by-the-coast.jpg`, `course-800x1000-abysse-fr-30-by-the-coast.jpg` | none | — |
| `vocabulaire-pavillons.jpg` is the reference for the shapes | `vocabulaire-pavillons.jpg` | — |

## Pennant: mock-up and app, side by side

`fanions-comparaison.jpg` puts the mock-up's pennants beside the app's, for a human and a bot
with a solid, dashed and dotted route, in Abysse and Aube, enlarged and at real size. It is built
from the app's own components and from the mock-up's drawings copied as they are; cases the
mock-up never drew are marked « non dessiné ». The difference is **under study, not decided**
(`docs/da/v2/README.md`). What the board shows against the app's solution: at real size the dashed
and dotted lines under the cloth are hard to tell apart.

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
- **Unnamed runners** (my request of 18 November): on the chart they are grey dots on one faint
  dotted route, as the mock-up draws them; their colour and dash stay on their standings pennant
  and show on the chart as soon as they are named. `before-dev-*` shows them coloured.
- **A ship that would sail under mine** is, nearly always, drawn beside its marker, on the side of its own lane,
  at most 10 % of the chart's width away, with a short tether in its colour (mine never moves);
  the marker, the route and the connector keep the real position, and only the sideways drawing
  shifts, never the progress. Two other ships may still touch one another, and a ship held by
  the 10 % reach or the chart's edge can still touch mine (measured by simulation: under 0.5 % of
  neighbours mid-race, about 3.6 % when everyone is exactly level, as on the start line).
- **« (toi) »** is never cut, and on a chart narrower than 400 px (the 1024 px row, a phone) the
  label drops its pennant and takes a wider column so that a short name is whole; the standings
  keep every pennant.
- **The two words on the land** (« ARRIVÉE », « + N autres coureurs ») sit on a plate of the land's
  colour, above the other ships; my own ship alone passes in front.
- **On a narrow vertical chart (600 px or less: the Arcade row from 1024 to 1440 px, the low
  screen, the phone) the lanes start right of « ARRIVÉE »** (my choice of 20 November, option C of
  the comparison): they are drawn between 30 and 55 % of the chart's width instead of 16 to 55 %,
  and the ships are a little smaller there (38 px, mine 48 px). No ship reaches the word any more;
  the e2e checks it on every vertical capture. Wider charts and the tablet's are unchanged.
  The cost: a narrower band, so more ships drawn beside their marker. Measured on crews bunched on
  purpose (`track-layout.test.ts`): a neighbour held short of the full clearance from mine in up to
  10.5 % of cases with 50 runners, its hull touching mine in up to 8.3 %; with a whole crew exactly
  level, as in the by-the-coast captures, mine is then drawn above it.
- **Tablet chart**: a runner it does not name is grey there too, dot and route.
- **Ships** are drawn at 85 % of the mock-up's size, so that they fit the shortest chart (12 rem).

## Contrast measured on the app (`race ships contrast`, 1440 × 900, 30 runners)

| Mark, against what is behind it | Abysse | Aube |
|---|---|---|
| Pennants on the standings panel (`embrun`, `juste`, `arcade`, `brume`, `moi`) | 12.17, 11.38, 7.13, 6.52, 10.96 | 12.87, 5.53, 6.65, 7.00, 5.00 |
| A named runner's route and sail on the sea (same five) | 11.53, 10.78, 6.75, 6.17, 10.38 | 10.75, 4.62, 5.55, 5.84, 4.17 |
| Hull and compass line on the sea | 15.51 | 15.82 |
| Unnamed dot (grey, 75 %) on the sea | 3.99 | 3.43 |
| Unnamed route (grey, 45 %, dotted): a faint ornament, measured, not held to 3:1 | 2.27 | 1.96 |
| Coast edge on the sea | 4.35 | 4.78 |
| Finish word on the land | 7.26 | 4.95 |
| « + N autres coureurs » on the land | 10.85 | 9.20 |
| A name on the sea | 15.51 | 15.82 |

Thresholds: 3:1 for marks, 4.5:1 for words. In Aube the land is the 20 % mix of `ligne` in
`nuit`, measured as rgb(244, 210, 211) on a sea of rgb(230, 235, 242).
