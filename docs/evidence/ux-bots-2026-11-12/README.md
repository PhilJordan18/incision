# F-05.2 — bot controls and maritime insignia

Source verified: `845f7885fd7ddfae6f1fc703ad5e89da9a375fac` (bot implementation `a83043b7f15846302f6914b40b1d8785c6322302`, then the confirmed invitation-focus correction), independent base `e663a2ea93d918163d88e0d82f4f94bdc6441863`. The delivery commit adds evidence only. Card #59; unchanged bot rules, speeds, capacity and server authorisation.

The next bot has its own selector. Existing bots show the persisted name/difficulty separately from an unsaved selection and its save action. Add/save/remove confirmations use a persistent status region; stale revisions and server refusals retain the existing recovery path. Five original SVG marks (sail, anchor, wheel, compass, crown) use current tokens, are hidden from assistive technology, and accompany explicit names/difficulties. No design asset, logo, race component, engine, global style or server change.

## Commands and evidence

- `npm run check:no-js`, `npm run lint`, `npm run typecheck`: passed.
- `npm test`: 2,654 passed across five workspaces (1,106 +157 +1,259 +21 +111), no unit skips.
- `npm run build`: production build passed.
- `E2E_DATABASE_URL=<isolated cloud database> E2E_PORT=3601 npm run test:e2e -w @incision/web -- e2e/room-bots.spec.ts`: 5 passed, 36.5 s. Includes two new FR/EN independence/persistence cases and the existing permission, capacity, keyboard, focus, 44 px targets and axe checks in both themes at 360/390/1024/1440.
- Initial complete E2E on `a83043b`: **217 passed, 1 failed, 30.4 min**. The failure was the inherited invitation-refusal alert focus, not an axe threshold. It was diagnosed and corrected in this branch; complete post-fix results are the separate push/pull_request CI runs on the delivery head, not inferred from targeted tests.

An initial root invocation without the cloud loopback permission stalled in a real-socket unit test; a loopback probe returned `EPERM`. That invocation was stopped, then the unchanged suite completed with the required local cloud socket permission. No test threshold/retry/accessibility setting was changed. Unit/build transcripts and browser proof hashes accompany final verification.

## Sequential reviews on the source SHA

Codex applied the roles in this session; these are not independent reviewers.

- Code reviewer / functional QA: no blocking finding. New component boundaries preserve the existing action/revision gate. Draft state belongs to each bot ID; a confirmed remote level resets a stale draft without remounting the focused select. New-bot state is separate. Tests assert persisted values after reload, not only local text.
- UI/UX: compared screen 06 and actual FR/EN captures at 390/1024/1440 (also tested 360). Typography, tokens, single existing red start action, visible focus, wrapping and light/dark styles retained. Screen 06's older room composition already differs under D-15; this change is confined to the authorised bot panel. SVGs are original static decorations, never the student logo. Automated axe covers WCAG A/AA; actual screen-reader announcements and physical devices remain human checks.
- Architecture/security boundary: no new route, database query, event, schema or input permission. Host restrictions remain server-enforced. No additional security claim about the untouched server follows from an icon/control change.

## Delivery limits

New visual/draft workflow still needs the short human delta acceptance. November 11 journal acceptance is separate and preserved in the qualification branch. No claims of production, Mac recipe, load, PgBouncer or OAuth checks in this UI lot. SQL/integration verification is recorded separately by the qualification branch and by each CI run, with exact skips.

The optional compass cursor is deferred: implementing a global cursor would share styles with Claude. Native cursors and reserved typing/race files remain untouched. Matrix reconciliation is confined to `test/10-ux-qualification`, avoiding cross-PR matrix conflicts; no issue closure. Future redesign, sound, race animations and thermal heatmaps remain outside scope.

## Confirmed focus defect and final checks

The full suite failed in `room-moderation.spec.ts:69` (EN): the invitation refusal was visible but not focused. `InvitationEntry` scheduled a one-shot `requestAnimationFrame` before React guaranteed the alert DOM commit. A stable callback ref now focuses the actual attached alert. Permissions, tokens, refusals and server code are unchanged. This minimal accessibility correction is included here, where the regression was found, avoiding a dependency on the qualification PR.

The first deterministic FR/EN probes both failed on the previous code when browser frames were paused. An intermediate probe of the fix had two test-fixture errors: the paused clock could target the past, and mouse activation incorrectly expected keyboard-only `:focus-visible`. The final fixture anchors time with a future pause, tests mouse and keyboard separately, retains focus assertions for both and visible-outline assertions for keyboard. Those intermediate failures are retained, not counted as successful tests.

On the final source SHA above, all root gates were rerun: no-JS, lint, types, **2,654 unit tests** and production build passed. Final production-browser command:

```sh
E2E_DATABASE_URL=<isolated cloud database> E2E_PORT=3601 npm run test:e2e -w @incision/web -- e2e/room-bots.spec.ts e2e/invitation-focus.spec.ts e2e/room-invitations.spec.ts e2e/room-moderation.spec.ts
```

**17 passed, 2.4 min**, no retries/skips: four new deterministic focus cases, five bot cases, three invitation cases and five moderation cases. Banned reentry stays refused and guest expiry remains unchanged. The existing FR/EN/theme/width/axe controls remain intact. Final code/QA/security review found no blocking issue in the minimal callback change; no new identity or data access path. UI review confirms keyboard focus uses the existing outline, without style changes.

Transcripts below retain failed and successful attempts, with terminal trailing whitespace/CR removed. Raw traces remain in cloud scratch; SHA256 hashes identify them. Representative synthetic captures are copied into this new folder; test-generated historical screenshots were archived in scratch and restored to their committed originals.
