# F-07.6 — locale formatting evidence

Implementation: `d224c71`; browser test correction: `796e2b4`. Final documentation/screenshot commit does not change application code. Base: `dev` `2b99993`.

Shared pure Intl number/date formatters are usable on server and browser. Date callers explicitly choose a time zone. Current room counts, countdown/time-limit labels, results and result-page metadata use the chosen language; race rounding remains unchanged. Calendar dates do not yet appear in the implemented product: the date helper is tested, without inventing a history/profile screen. Codes/identifiers, decorative 01/02/03 and m:ss clocks retain their intended syntax.

## Executed checks

- Root `check:no-js`, `lint`, `typecheck`: passed.
- `npm run test --workspaces --if-present -- --maxWorkers=2`: 1,669 passed (web 515, database 70, domain 1,018, load 20, word lists 46).
- Focused format suite: 7 passed.
- `npm run build`: **failed twice** after successful compilation/static generation with Next 16.4.0 `SecurityFatalError` advisory. The one unchanged retry also failed. No dependency, security setting or CI change; remediation is owned by #135. Do not describe this gate as green.
- Targeted Chromium `e2e/locale-format.spec.ts`: **1/1 passed**, 20.3 s total (14.8 s scenario), using the compiled output above. Database `incision_e2e_locale69` and port 3869 were dedicated to this card; heavy work used the shared lock.
- The first browser run failed because the test's direct API request omitted `Accept-Language` and correctly got default French. Fixed the test header; application code unchanged. The original trace is retained locally at `/tmp/incision-69-missing-accept-language-trace.zip`.
- Browser verifies a two-player race, grouped round 1234 in server HTML and page title, decimal/percent formats after hydration, keyboard focus to the scrollable table, reduced motion, both themes/languages, no page overflow at 1440/1024/390/360, axe at 360 and no page errors.

## Reviews

Code reviewer: no blocking/major finding in the locale change. Formatting changes presentation only; values, persistence and game rules are unchanged.

UI reviewer: reference screens 06/07/08/10 and HTML inspected. Twelve result captures included (FR/EN, Abysse/Aube, 1440/1024/390). FR Abysse and EN Aube reviewed at all three widths: large grouped round label remains legible; original typography, single mist, focus ring and table scrolling remain intact. No new full-screen design or final-track/mobile-feature qualification claimed. Room/race markup and styling are unchanged; the targeted race flow exercises their numeric call sites.

Coordination: #135's owner explicitly released room-view.tsx/race-view.tsx for these call sites. Published #133 delta is preserved; temporary `git merge-tree` compositions with #133 `67edcfb` and #136 `07865c8` are conflict-free. No merge, dictionary/corpus/database/dependency change, or production validation.

## Delivery limit

Implementation and targeted acceptance are complete, but the PR remains draft until the inherited build security blocker is resolved through #135 and the gate is verified. The card stays open; no Done claim.
