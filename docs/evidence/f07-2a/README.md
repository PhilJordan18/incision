# F-07.2A — Persisted podium and raw WPM

Implementation SHA: `305bc3d`, based on `dev` `b14e5d0`. Card #65, RES-01 and partial RES-02. This is a local verification report, not evidence of production deployment.

## Scope

The room and historical result page reuse `RaceResults`. A new static podium projects stored ranks 1–3, without re-ranking by WPM or inventing missing places. Names are historical snapshots; current-user highlighting and outcome/abandonment reasons are retained. A rank-one non-finisher is not styled as a winning finisher; the existing no-victory notice remains. Raw WPM is now included in every result row using the existing localized formatter.

No database, runtime, protocol, corpus, track, schema, dependency or design-source change. The screen10 visual reference supplies typography, surface/border tokens and rank emphasis; COURSE-10 and RES-01 override its old WPM ordering and missing podium. No new visual identity, logo or motion was introduced.

## Evidence

- Four rendering tests: no result/one/two/three/four entrants; persisted order despite higher WPM in lower places; non-mutating projection; translated timeout/abandonment; spectator/no-victory preservation and the seventh table column.
- Root no-JavaScript check, lint, typecheck and unit suites: 595 web, 130 database, 1,056 domain, 20 load-tool and 47 word-tool tests passed on the implementation SHA.
- Production build passed. The first targeted Chromium run on `305bc3d` passed all nine existing race scenarios and the no-JavaScript result scenario (10/12 total). Two new keyboard tests failed because their region selector matched both the outer results section and inner table region. `178e2c7` fixes only that selector and adds an assertion of the actual rounded raw-WPM cell. Initial traces and log are retained locally in `.codex-worktrees/_tools/f072a-first-failure/`. This was a test defect, not classified as a flake; the product code and build are unchanged.
- The new browser fixture uses two synthetic participants, whose WPM order intentionally disagrees with rank. It checks the protected historical page without JavaScript, reload, signed-out redirect, table columns, translations, keyboard access, axe and overflow in both themes at360px, plus screenshots at1440/1024/390px.
- Confirmation on `178e2c7`: four rendering tests and all three dedicated Chromium scenarios passed (3/3 in25s), including the actual raw-WPM cell value. The nine existing race E2E remain the successful first-run evidence on identical product code; no rerun of the minute-long inactivity scenario is claimed. Screenshots include Abysse at1024/1440px and Aube at390px; all twelve locale/theme/reference-width captures were produced locally.

## Sequential reviews

Codex applies code, functional-QA and UI/UX roles sequentially on the same implementation SHA; these are not independent-agent approvals.

- Code: type-only database import; pure component; no runtime branching or extra request; sorting only by already assigned rank; input not mutated; existing actions and summary retained.
- QA: zero/short podiums and no-finisher races covered directly; raw-WPM field already persisted/exposed; no guessed errors from rounded accuracy and no fabricated bonus totals. Room integration is covered by existing race E2E alongside the dedicated result-page cases.
- UI/UX: readable text uses existing neutral tokens, first finisher border uses gold; self highlight retains blue. No new acting red, halo or animation. The wide table remains a named keyboard-focusable scroll region; ordinal and status text do not rely on colour.

## Still incomplete

RES-02 still needs errors and received bonus history; RES-04 needs segmented historical record comparison. No guesses or placeholder zeroes were added for unavailable data. #65 remains open. No new PostgreSQL suite is necessary for this UI-only change; migrations and query implementation are untouched. Firefox/Safari, production and Philippe's human acceptance are not claimed.

Human acceptance: open a completed race from history, inspect the two/three existing podium places and statuses, compare raw WPM with the persisted values, then check a room's result actions remain usable. Repeat in the other language/theme and at a narrow width.
