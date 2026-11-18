# DA2-7 — results, race page, history, account

Captures of the running app (production build, isolated local PostgreSQL), written by
`apps/web/e2e/da2-results-captures.spec.ts` with `DA2_CAPTURES` set. The room results come from a
real room run by the real server (a host, a second account, one bot); the race page, the history
and the account read races seeded by `apps/web/e2e/da2-results-fixture.ts`. Names, speeds and
ranks are the fixture's.

- `after/`: this branch.
- `before/`: the same screens on `dev` at `e899596`, before this card, with the same spec.

File names: `<screen>[-<state>]-<language>-<theme>-<width or 1280x640>.jpg`;
`-forced-colors-light` and `-zoom-200-<theme>` are named apart.

| App capture (`after/`) | Reference (`docs/da/v2/captures/`, PR #208) | Before (`before/`) |
|---|---|---|
| `room-results-host-fr-abysse-1440.jpg`, `-1024`, `-1280x640`, `room-results-host-en-abysse-1440.jpg` | `resultats-1440.jpg` | `room-results-host-fr-abysse-1440.jpg` |
| `room-results-host-fr-abysse-390.jpg`, `-360` | `resultats-390.jpg` | `room-results-host-fr-abysse-390.jpg` |
| `room-results-host-fr-aube-1440.jpg`, `-390`, `-1280x640`, `room-results-host-en-aube-1440.jpg` | none: Aube was not drawn for this page | `room-results-host-fr-aube-1440.jpg` |
| `room-results-non-host-fr-abysse-1440.jpg`, `-390`, `-fr-aube-1440`, `-en-abysse-1440` | `resultats-1440.jpg` (drawn as the host only) | `room-results-non-host-fr-abysse-1440.jpg` |
| `race-page-fr-abysse-1440.jpg`, `-1024`, `-390`, `-360`, `-1280x640`, `race-page-en-abysse-1440.jpg` | `fiche-course-1440.jpg`, with `resultats-1440.jpg` above it | `race-page-fr-abysse-1440.jpg` |
| `race-page-fr-aube-1440.jpg`, `-390`, `-1280x640`, `race-page-en-aube-1440.jpg` | none | `race-page-fr-aube-1440.jpg` |
| `race-page-forced-colors-light.jpg`, `account-forced-colors-light.jpg` | none | — |
| `race-page-zoom-200-abysse.jpg`, `race-page-zoom-200-aube.jpg` (720 CSS px at twice the density) | none | — |
| `history-fr-abysse-1440.jpg`, `-1024`, `-390`, `-360`, `-1280x640`, `history-en-abysse-1440.jpg` | `historique-1440.jpg` | `history-fr-abysse-1440.jpg` |
| `history-fr-aube-1440.jpg`, `-390`, `-1280x640`, `history-en-aube-1440.jpg` | none | `history-fr-aube-1440.jpg` |
| `history-empty-*`, `history-invalid-*`, `history-unavailable-*` (Abysse and Aube) | `historique-1440.jpg` (the empty card only) | — |
| `account-fr-abysse-1440.jpg`, `-1024`, `-1280x640`, `account-en-abysse-1440.jpg` | `compte-1440.jpg` | `account-fr-abysse-1440.jpg` |
| `account-fr-abysse-390.jpg`, `-360` | `compte-390.jpg` | `account-fr-abysse-390.jpg` |
| `account-fr-aube-1440.jpg`, `-390`, `-1280x640`, `account-en-aube-1440.jpg` | none | `account-fr-aube-1440.jpg` |
| `account-empty-*`, `account-name-invalid-*`, `account-statistics-unavailable-*` (Abysse and Aube) | none | — |

## Where the app differs from the mock-up, on purpose

- **Other runners' colours.** The track gives each runner its colour and dash from its race
  entrant id (`routeStyles`). The stored results expose a runner's ordinal, not that id, so here
  only the reader's own pennant has its track colour (`moi`, as on the track); the others keep
  their sail's shape and take no runner colour (`ecume`). The pennants take the track's colours
  as soon as the result views carry the entrant id; the two files are listed in the pull request.
- **Pennant of a dashed runner.** As in DA2-2: the cloth keeps the kind's shape (triangle for a
  human, square for a bot) and the dash is a sample of the route under it, not a swallowtail.
- **Rank.** The app's typography is kept (« sur 5 » in the display face); the mock-up writes it in
  the serif.
- **Curves.** Unchanged, as the card asks: the reader in `moi`, the first place in `or`, the
  others in `embrun`. The mock-up draws them in the runners' colours.
- **Arrival scene.** At most five ships, in rank order, the reader's own always among them.
- **Account.** « Progression entre les courses » takes the shared panel title like every other
  panel; the mock-up writes it smaller. The file field stays the browser's own.
- **Forced colours.** Captured with the light system palette only: headless Chromium does not
  paint a dark forced palette faithfully.
