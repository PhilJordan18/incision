# F-07.4 — room/history navigation and home orientation

Application source: `e84a7e3a9efad4299f4aa021913452d5ce1d0884`; final test source: `a650a03ba2d1be66a8f2ab18ab22df5c6b34b9f6`, based independently on dev `e663a2ea93d918163d88e0d82f4f94bdc6441863`. Related #67, HIST-01/02, JOIN-01, PERF-01. Subsequent evidence commits do not change application code; final CI conclusions must name the delivery head.

## Behaviour

The top of the authenticated account page now separates **My rooms** (the one active membership, if any) from **My races** (private completed history). It reuses `findActiveMembership` after `requireAccountSession`; there is no new admission operation, presence write or durable guest history. Links still pass through existing room/history permissions. An unavailable query is distinguished from no membership.

The existing home entry actions remain first. Four concise cards explain rooms, training/Arcade, typing/bonuses and results, with a static original compass mark. Existing tokens, typography and the student logo are preserved. The approved guide extends below the desktop fold: the previous whole-page-no-scroll assertion is replaced by full visibility of both entry controls at the same 1440×800 viewport, keeping horizontal-overflow and axe checks. This is an explicit scope/design adaptation, not a reduced accessibility threshold.

No shared header, global CSS, live race component, main translation dictionary, server mutation, migration or dependency changes. The account's existing navigation link leads directly to the new top-level access cards.

## Executed checks and diagnosed failures

- Initial root no-JS/lint/types, **2,654 unit tests** and production build passed on `4921060`; initial targeted navigation/design suite **16 passed, 1.4 min**.
- The guest navigation case was strengthened to create a real synthetic guest cookie. One direct `npx eslint` invocation from the repository root found no config; the workspace's documented `npm run lint -w @incision/web` passed. No lint rule was disabled. A final shorthand `npm run types` was rejected because the root script is named `typecheck`; it was corrected to the documented command.
- Complete suite on `880e98b9b151bb1d07d01b1d3b096c15aa6c3e20`: **218 passed, 2 failed, 30.6 min**. No retries/skips. Both failures remain in the transcript.
- Admission of 30 accounts: one page stayed at the join heading for the 30-second expectation. Its POST had started a 200 RSC response but the trace did not capture its completed body. Other full browser suites and SQL tests were concurrently running on the same four-CPU cloud executor. On the **same unchanged SHA**, with no other local suite, the exact scenario passed in **25.8 s** (32.6 s including setup). This bounds the evidence; it does not prove the exact cause or justify changing a product timeout/rule. Final complete CI remains required.
- Invitation refusal focus: the same existing defect was independently reproduced in FR here and EN in the bot lot. Reuse of the exact `845f788` two-file correction avoids branch stacking: callback ref focuses the committed alert, four FR/EN mouse/keyboard tests verify it with browser frames paused. No permission/refusal change. See the bot evidence for the deterministic pre-fix failures and intermediate test-fixture corrections.
- Final root gates on `e84a7e3`: no-JS, lint, types, **2,654 unit tests**, production build passed. Final targeted command `npm run test:e2e -w @incision/web -- e2e/account-journey.spec.ts e2e/design.spec.ts e2e/invitation-focus.spec.ts e2e/room-moderation.spec.ts`: **24 passed, 1 failed, 2.0 min**, no skips/retries. All account/home/design/focus cases passed; the existing guest-results moderation setup failed before reaching results (host 100%, guest 0%, guest input disabled with “The race changed: the page is updating.”).
- Diagnostic rerun of only `room-moderation.spec.ts --grep 'guest expulsion in results'` on the same build, with a temporary listener logging only failed acknowledgement error enums: **1 passed, 20.3 s**, no refusal recorded. The listener was removed; the original test is unchanged. This is not a fix or proof of stability. The original trace has no decoded socket acknowledgements, so the precise cause remains unknown. Read-only inspection shows that the message covers several server refusal/resynchronisation paths; it does not establish one specific error. No typing engine, Claude-owned component, timeout, threshold or business rule was changed to hide this failure. Preserve this reservation for complete CI and future investigation if reproduced.

## CI follow-up: acknowledged closure before a fresh account read

On delivery head `98919f4e77d6bb8aec56b7f0149f6363f739dc28`, pull_request run [43155608185](https://github.com/PhilJordan18/incision/actions/runs/43155608185) finished **223 E2E passed / 1 failed (14.6 min)**. The new FR account case loaded `/account` immediately after clicking the close confirmation, without waiting for the asynchronous close action. It still found one room link. Lint/types/units/schema/SQL/build/packaging/integration passed. The failure excerpt is retained; this run is never relabelled green.

The database implementation closes the room and marks its memberships left in one transaction; the account page performs an authenticated membership read when loaded. A click is not a commit acknowledgement, and that account page is not a live room subscription. Test commit `a650a03ba2d1be66a8f2ab18ab22df5c6b34b9f6` now holds the actual close POST, asserts the account still has the room while the request is pending, releases it, waits for the owner's **Room closed** heading, and only then loads the account and asserts no room link. This deterministically checks both sides of the timing boundary in FR and EN, without fixed sleeps, retries, longer timeouts or product changes.

Validation after the test-only correction: root `npm run lint` and `npm run typecheck` passed. `npm run test:e2e -w @incision/web -- e2e/account-journey.spec.ts e2e/invitation-focus.spec.ts` on the unchanged production build, isolated database `incision_e2e_ux_close_ack_20261112`, port3602: **8 passed (56.0 s)**, no skips/retries, including both themes and 390/1024/1440 axe checks. Complete E2E runs are required again on the new pushed head; no local complete rerun is claimed.

Remote trace access limit: the connector successfully exposed artifact13916149286 (ZIP SHA256 `2c0c2140f5601573face48862ab2d9279bb60c233a2ab0dfea6a5eb688aa1a62`), but CLI artifact listing and downloading its signed file URL into the cloud both returned403. Its trace was **not read**. The diagnosis above uses the CI error, source inspection and controlled local reproduction, not an invented trace timeline. The older guest-input reservation remains distinct.

## Lighthouse

PERF-01 requires **≥90 in every category on the home page**. First measurement on the production build during concurrent local suites: **74 performance, 100 accessibility, 100 best practices, 100 SEO**, TBT 1,530 ms. It is retained as a loaded-executor observation, not silently discarded. The isolated final-build measurement (`e84a7e3`, fetch time `2026-11-12T04:21:01.065Z`) gives **91 performance, 100 accessibility, 100 best practices, 100 SEO**, TBT **380 ms**. Lighthouse **13.6.0**, Chromium **153**, default simulated mobile **412×823**, CPU slowdown ×4, RTT150 ms/throughput1638 Kbps; no preset changes. Command: `npx lighthouse http://localhost:3605 --chrome-path=<cloud Chromium executable> --chrome-flags="--headless --no-sandbox" --output=json --output-path=<scratch>/lighthouse-isolated.json` (reproduction command; the report records the exact URL and audit settings, console output retained in logs).

This is local cloud Chromium against a production build, not Azure or real-user/device evidence. No threshold, throttling preset or category is lowered to pass.

## Sequential reviews on final source

Roles applied by the same Codex session, not independent reviewers.

- Code/QA: no new business rule. Separate no-room/unavailable states, stable server-authenticated account ID, private room code shown only to its member. New E2E checks other-account isolation, real guest refusal, live room return, closed-room absence and history navigation. Entry controls remain on the initial desktop viewport; no whole-page visual redesign.
- Security: `AccountJourney` is reached only after account authentication. The existing parameterised membership service is scoped by account ID and `left_at is null`; room links perform their own normal admission checks. No guest/account identity conversion, invite token, extra client secret or public room-history listing.
- DBA: one existing membership lookup per account render, using the active-account membership invariant/index; no N+1, schema, write transaction or migration. Query failure logs only `describeDatabaseError`. Existing PostgreSQL checks are recorded separately by qualification and by CI; no production data access.
- UI/UX: compared screens01/12 against actual account/home captures at390/1024/1440, both themes and FR/EN; existing design tests cover360. No hard-coded colours, new red action, motion or logo edit. Keyboard route and focus checks plus axe are retained. Physical devices/screen readers/new UX acceptance remain human.

## Coordination, scope and remaining human checks

Claude's PR #203 appeared during work at `9f721973df777a9bed468270ccabe95b0e4e77d0`. Its 38 changed paths were inspected; none intersects this branch or the other UX functional/matrix changes. No Claude branch edit or combined-runtime claim. The only shared files between our bot and navigation PRs are the **identical** invitation focus component/test patch. Recommend merging the bot PR first, then this one; neither branch is based on the other. Re-check after any new remote commits.

The matrix/previous human testimony is reconciled only by PR #202. November 11 journal acceptance is not re-requested; the new account/home/bot/layout UI still needs the short delta in RECETTE-FINALE. All parent cards remain open. Projects GraphQL returned Forbidden; issue evidence updates do not imply a Projects-column change.

Optional compass-cursor proposal, not implemented: a dedicated navigation-only CSS module applied to header links, with an original small SVG and native pointer fallback; do not target inputs, editable/text regions or the race sheet. Coordinate any shared header/style edit first. Native cursors remain unchanged. Global pirate redesign, sounds, new track/animations and continuous thermal heatmaps stay outside this delivery.

No Mac, recipe, real backup, Azure, Neon, OAuth, secrets or production access. No merge, deployment or card closure. Independent PR CI results and remaining delivery steps are recorded in the PR and final conversation report.

## Evidence files

Normalized console logs and selected actual screenshots are committed below. `SHA256SUMS` also hashes the retained raw Lighthouse reports and failure traces in the cloud scratch directory; those raw traces contain synthetic session data and are not published. Screenshots show synthetic accounts only. Complete post-fix E2E verification is delegated to both normal push/pull_request CI runs on the delivery head, not claimed as a local all-green suite.
