# F-09.5 / #82 — explicit character reference layouts

Application commit: `3ab81fd32336fc28d165ce0ff61f979fa846c7e0`. Verified source/test SHA: `a693a350f20cfcdb84713cbf08146ad91c179722`. Independent base: `e663a2ea93d918163d88e0d82f4f94bdc6441863`. The subsequent delivery commit adds this evidence only; CI conclusions must name that final head.

Four explicit choices: France classic AZERTY, US QWERTY, Canadian French and Canadian multilingual standard. Printable base-character sets use xkeyboard-config's `fr/basic`, `us/basic`, `ca/fr`, `ca/multix` as factual references; no third-party visual asset is copied. Dead keys are not expected characters. Shifted, composed, uppercase and other characters outside the selected set remain visible with exact counts. This is a reference grouping, not physical-key telemetry or a claim that a zero was practised.

The choice is local to this view, with the locale's default after reload. No cookie/profile preference or typing engine setting is written. #82's broader preference and QWERTZ scope remain incomplete. Original three colour bands and totals remain unchanged. The extracted client component receives only the already-authorised personal aggregate; speed curves, server access checks, temporary guest results and stored history are unchanged. No live race layout/typing/activity file reserved to Claude is changed.

## Executed verification

- `npm run check:no-js`, `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`: passed on application commit. 2,659 unit tests (1,111 web +157 database unit +1,259 domain +21 load +111 words), no unit skips.
- Five new data invariant tests cover variant distinctions, unique characters and count conservation. Existing legacy/no-data assertions were updated to the new reference name, retaining the absence-versus-zero check.
- First targeted browser run: 4 passed, 1 failed. EN grouped 24 layout/theme/width audits in one 90 s test and timed out inside axe. The FR case completed; no reported axe violation was hidden. The trace is retained in cloud scratch and its hash recorded.
- Correction: split cases per layout, preserving all audits, counts, themes, widths and thresholds. `npm run lint -w @incision/web` passed after the test change.
- `E2E_DATABASE_URL=<isolated cloud database> E2E_PORT=3603 npm run test:e2e -w @incision/web -- e2e/race-charts.spec.ts`: **11 passed, 2.5 min**, no retries/skips. FR/EN × four layouts × Aube/Abysse ×390/1024/1440; existing charts/no-JavaScript/privacy/320 px cases also pass. Each expected character appears exactly once with the same count; table and total stay equal; keyboard selection/focus and reload defaults verified.
- Complete non-regression runs on the delivery SHA are the two GitHub CI events, recorded separately in the PR/final report. The targeted local suite is not described as the complete suite.

## Sequential reviews

These roles were applied by the same Codex session, not independent reviewers, on `a693a350f20cfcdb84713cbf08146ad91c179722`.

- Code reviewer: OK. Finite typed layout list, no conversion of graphemes/case, no mutation of stored aggregates, separate translations, no dependency or schema change. Server rendering retains the original data and complete accessible table when JavaScript is off.
- UI/UX: OK for automated/visual checks. Compared the results/statistics reference (screens 11/12) and captures at390/1024/1440 in both themes/languages. Tokens and typography retained, visible native select focus, no page overflow. Small-width reference scrolls horizontally as before; full counts also remain in the table. Actual screen-reader/device acceptance remains human.
- Security/data: OK within diff. Only the authorised personal aggregate crosses the client boundary; no raw entrants, cookies, seed, inventory, other participant's personal errors or new API is introduced. Existing private-reader/no-JavaScript browser checks pass. This is not a database guest-purge claim.

## Limits and coordination

No production, Mac, real recipe or OAuth access. New layout choices still require the short UX human delta; November 11 acceptance covers the previous personal heatmap, not these controls. Matrix reconciliation is owned solely by `test/10-ux-qualification`, avoiding shared matrix edits. The known inherited invitation-error focus defect discovered during another lot's full suite is corrected there; this heatmap PR does not modify invitations. No issue is closed; future continuous thermal heatmap/exercises remain excluded.
