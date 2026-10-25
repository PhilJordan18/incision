# F-08.2 — wordmark visibility with forced colours

Refs #73; A11Y-01/03, DES-05. This is a focused correction, not the final all-screen accessibility sweep.

## Defect and correction

The existing saved Abysse theme selected the white external wordmark even when forced colours used a light system canvas. The white letters disappeared. External image colours are not replaced like CSS text colours.

`components/brand/logo.module.css` now selects Philippe's unchanged black wordmark on a light forced-colour canvas and white on a dark one. Outside forced colours the explicit application theme still selects the variant. The server component, link label, dimensions and decorative empty alternatives are preserved. CSS reacts immediately to system preference changes, including with JavaScript disabled. No SVG, brand identity, global stylesheet, dependency or runtime change.

## Verification

Production code: `8c7c336`. Browser selector correction: `3b1d8b2`; production build unchanged.

- Root `npm run check:no-js`, `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`: passed. Unit tests: 591 web + 130 database + 1056 domain + 20 load + 47 word-list = **1844**.
- Focused Playwright `e2e/brand-colors.spec.ts`: **8/8 passed in 30.8 s at `3b1d8b2`**; FR/EN × Aube/Abysse × JavaScript enabled/disabled; home and sign-in, light/dark forced colours, live preference changes and return to authored colours. Tests assert the visible/hidden asset pair, unchanged saved theme, labelled keyboard-focusable link and 44 px target. Layouts: 1440, 1024, 390, 360 px. Authored colours also run axe.
- Browser server: local production build, port 3993; dedicated disposable database `incision_e2e_brand73`. No other session's database or process is touched. Commands serialized with the shared `heavy.sh` lock.
- Both wordmark files compare byte-for-byte with the originals in `apps/design/logo/` using `cmp`.

The initial browser run failed on the test's assumption that sign-in contains one logo: its responsive layout renders two, only one visible. The selector now follows the visible link across breakpoints; no product behavior was changed to accommodate the test. Initial traces are preserved locally under `.codex-worktrees/_tools/failures/brand73-first/`.

Axe is run on authored themes; forced colours are verified through browser rendering/visibility assertions and captures, not an unsupported axe colour-contrast claim (see [axe-core issue 3978](https://github.com/dequelabs/axe-core/issues/3978)). This is Chromium emulation, not a native Windows high-contrast or production qualification.

## Coordination and matrix handoff

Other Codex explicitly released brand/header files and retains #65 results. Claude's corpus/runtime/shared matrix files are untouched. A11Y-01/03 remain partial: their owner can add this evidence and `e2e/brand-colors.spec.ts` to the central matrix without claiming all pages/states complete. The card stays open for that broader sweep.

Code-reviewer and UI/UX roles are applied sequentially on the immutable implementation/test diff. No input boundary, account access or persistence behavior is changed.

## Review result

Code review at `3b1d8b2`: OK; variant visibility is mutually exclusive, authored-theme rules cannot override forced-colour rules, no hydration or JavaScript dependency is introduced. UI/UX review: OK for this correction; reference screens 01/02 and captured header/panel layouts compared at 1440/1024/390 px. Logo visibility and existing keyboard focus are preserved; no new text, motion or acting colour. Broader screen completion is outside this increment.

Representative captures: [light system, home](home-light-1440.png), [dark system, sign-in tablet](sign-in-dark-1024.png), [light system, sign-in mobile](sign-in-light-390.png), [authored Abysse, mobile](home-authored-390.png).
