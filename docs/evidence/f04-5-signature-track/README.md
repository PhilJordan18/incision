# F-04.5 — signature track (COURSE-05, DES-04)

This UI slice replaces the simple progress list with the track from design screens
08 and 14, using public race broadcasts. The server/runtime, protocol, database,
main dictionaries, dependencies and other sessions' work are unchanged.

## Behavior and design choices

- Vertical track on desktop (1280px+) and phones; compact horizontal track at
  640–1279px. The existing physical-keyboard phone restriction still applies.
- Actual position/length determines progress. No extrapolation and no new race
  ranking: the engine remains the sole source of official results. A progress tie
  awards no gold marker. Abandoned runners remain at their actual last position.
- Local participant: two rings plus their name and “you”; bots: rounded square
  plus an explicit Bot label in the full list. Initials are generated from the
  public display name, never from another account's private photo.
- Leading progress, local player and immediate progress neighbours have named
  labels. Vertical labels occupy a separate non-overlapping column, with lines to
  their actual points. Tablet labels name the local player and unique leader;
  counts reflect the labels actually visible in that orientation.
- A complete semantic list preserves names, progress bars, WPM, states and
  inactivity for every runner. It is open initially for up to six runners and
  otherwise opens with a keyboard-operable disclosure. Its scroll region is
  focusable. Progress is not repeatedly announced through an aria-live region.
- Transitions use the existing `duration-court` (200ms) and `ease-incision`
  tokens, fitting inside the runtime's 250ms broadcast interval. Reduced motion
  explicitly disables movement. No motion occurs in the typing text.
- Only design tokens are used. Race layout changes from two columns to tablet
  stacking at 1280px, preserving component identity and typing focus.

The brief and D-15 prevail over the reference's illustrative rank and runner
counts. The track displays progression rather than a new live rank. Private
photos and playable bot admission/scheduling are not added by this slice (#59).
The normal capacity stays 30; a 50-runner rendering fixture checks design headroom.

## Evidence boundaries

`track-layout.test.ts` covers 2/6/30/50 runners, bounded positions, deterministic
ordering, tied progress, retained abandonment/inactivity, spectators and label
spacing. `race-track.test.ts` covers semantic text/statuses, escaped names,
translated bot/local identification and no spectator input/private images.

`race-track.spec.ts` renders the real production page and assets. It replaces
Socket.IO with `track-fixture.ts`, a local server that emits schema-validated
synthetic snapshots. It exercises 30 and 50 runners, browser interpolation at
4Hz, stable input position/focus, keyboard disclosure, all runner entries, reduced
motion, spectator mode, axe and 1440/1024/390/360 widths. This is **rendering
 evidence**, not a claim of 50 real admitted players or production load capacity.

The existing ordinary two-player race test separately checks real runtime input,
progress, stored results and reopening. Four existing mobile-keyboard scenarios
check both languages/themes and progress preservation with real room behavior.
No systematic whole-browser-suite rerun is required for this UI slice.

## Review notes

Initial targeted browser run found `scrollable-region-focusable` on the complete
runner list. The list now has a keyboard focus target and visible focus outline;
the browser test tabs into it. The initial failure traces are retained locally.
Existing semantic progress bars were preserved to keep ordinary-race/mobile
behavior and tests intact. No assertion was weakened.

Shared matrix handoff: update COURSE-05 / DES-04 with the component, layout tests
and browser evidence after integration; retain separate limits for bots/photos
and the PERF-03 real-load/production qualification. Do not turn the fixture's
frame observations into Azure or end-to-end 30-client runtime evidence.
