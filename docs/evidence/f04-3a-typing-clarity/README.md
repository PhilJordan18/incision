# F-04.3A — active typing mode and static guidance

Local verification on October 26, 2026. Base `dev`: `b14e5d0`.
Product implementation: `31814b7`; import placement for compatibility with #152:
`f72f9d8`. Final browser-test synchronization: `b3bedeb` (no product change).

## Delivered scope

`TypingLegend` renders the actual validated `reveal.errorMode` in the interface
locale, independently of the text language. Without a reveal it renders nothing.
Mandatory mode explains the boxed blocking error; free mode explains retained
errors and accuracy. Underline, box/wave and vertical-bar samples supplement the
words. This static section is below the field: no animation, live announcement,
focus target or keystroke-dependent height. It disappears with the typing field
below 768 px, preserving D-20.

Only five presentation/import/locale lines were added to `race-view.tsx`.
Handlers, scoring, the track, shared dictionaries, room configuration and runtime
are unchanged. The new namespace does not reserve FR/EN shared dictionary files.

The screen 08/09 marks use existing token utilities. Decorative examples deliberately
do not use `.course-*` selectors, which identify actual typed graphemes in existing
browser tests. Their colours, underline thickness/offset and box reuse the design.
The supplied design, name and logos are unchanged.

## Evidence and provenance

- `31814b7`: root `check:no-js`, `lint`, `typecheck`, `test`, `build` passed.
  1,849 unit tests: web 596, database 130, domain 1,056, load 20, word lists 47.
- `f72f9d8`: build passed after the import-only move; both existing
  `bonus-ui.spec.ts` scenarios passed. They cover Enter/IME guards, observing-tab
  control, reload, real view/runtime effects and narrow-screen restoration using
  explicit bonus fixtures (not normal-room Arcade delivery).
- `b3bedeb`: `typing-clarity.spec.ts` passed 4/4 (FR/EN × Abysse/Aube).
  Ordinary authenticated two-player room creation/join/start, with existing marked
  test text fixtures. Synthetic paste/drop/insertFromPaste/insertFromDrop/
  insertReplacementText events are cancelled, the field stays empty, and subsequent
  real keyboard keys produce exact server progress observed in another browser.
  Composition, Backspace and non-typing Enter are also exercised.
- The four scenarios verify actual typing at 768/1024 px, unchanged field geometry
  across keystrokes, axe and no horizontal overflow at 768/1024/1440/390/360 px,
  reduced motion, keyboard focus, no guide before reveal and D-20 below 768 px.
- `b3bedeb`: two existing `race.spec.ts` regressions passed: confirmed abandonment
  and host leave confirmation (no unintended typing, stable text/field, clock running).
- Five focused render tests cover missing reveal and both modes in both locales,
  with no live region or controls. Free-mode render data is explicitly component
  evidence, not free-mode end-to-end acceptance.

`b3bedeb` final targeted gate also passed: root check:no-js, web typecheck,
five component tests and ESLint on the new component/namespace/test/spec. The
following evidence-only commit changes no executable source.

All heavy commands used `.claude/worktrees/_tools/heavy.sh` serially. Browser runs
used only port 3991 and local `incision_e2e_typing51a` on PostgreSQL port 5433.
Docker Desktop and the existing test container were started; no other database
was rebuilt and no container was stopped. No remote-resource action occurred.

### First attempt and correction

The first four new browser scenarios failed a geometry assertion measured immediately
after viewport resizing. The design retains 150 ms responsive transitions even with
reduced motion; the observed field width moved from 672/675.625 to 704 px. The test
now waits for fonts, layout frames and finite animations before recording geometry.
The strict before/after-keystroke equality is retained. No product behavior changed,
no assertion was removed, and the two already-green bonus tests were not rerun.

## Visual review

Unedited local production-build captures:

- [FR / Abysse / 1440 px](fr-abysse-1440.png)
- [FR / Aube / 1024 px](fr-aube-1024.png)
- [EN / Aube / 390 px](en-aube-390.png)

Compared with design screens 08/09 and responsive references 13/14 under D-15/D-20.
The guide wraps below the field, uses existing tokens/fonts, keeps visible focus,
adds no acting red or motion, and uses words/shapes as well as colours. The mobile
message and current track remain. This branch does not include #152's signature track.

## Reviews, coordination and remaining work

Code-reviewer, functional-QA and UI/UX roles are applied sequentially by Codex,
not independent agents. No blocking or major finding remains. Review checks locale versus text language, undefined reveal,
no handler/lifecycle changes, selector isolation, focus and scoped evidence.

A released the TypingZone insertion through Philippe; coordination trace:
https://github.com/PhilJordan18/incision/issues/51#issuecomment-6428116274.
A retains #45 configuration/runtime and `docs/EXIGENCES.md`. The latter is not edited
concurrently: matrix handoff is COURSE-04 **partial**, adding this component/spec
and the evidence above; remove the blanket absence of viewport evidence, retaining
physical-device qualification as unproven. CONF-08 is not upgraded by this display.

`git merge-tree --write-tree b3bedeb 11686c9` is clean against #152 (simulation only;
no merge or cherry-pick). The earlier simulation found adjacent import insertions;
relocating this branch's import resolved it without touching Track.

#51 remains open: host mode selection and ordinary free-mode end-to-end acceptance
still depend on #45. Synthetic browser events are not certification of every OS
keyboard/autocorrect implementation. No real tablet, Safari/Firefox, production,
Azure or Neon qualification is claimed. No complete browser suite was rerun locally.
