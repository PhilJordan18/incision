# F-07.5A — Account display name (#68)

Local verification, October 25, 2026. Branch `feat/f-07-5a-display-name`, based on `dev` at `f4600af`. Philippe approved the four scoped conventions in the active conversation. No push, merge or production action is included.

## Delivered slice

- AUTH-05 only: an authenticated local or OAuth account edits its name from `/account`.
- Reuses D-14's `parseDisplayName`: NFKC, collapsed whitespace, 1–40 code points, existing invisible-character refusals. A separate raw-input bound is 1,024 UTF-16 code units.
- Identity comes from the checked session, not the form or previous action state. One primary-key-scoped UPDATE changes the name and Drizzle's audit timestamp only. No migration or dependency.
- No global uniqueness requirement. Same-name saves succeed. The last committed update wins.
- Existing room-member and race-entrant names remain snapshots. The next room admission uses the new account name. Credentials, OAuth identities and session versions do not change.
- FR/EN feedback for invalid input, unavailable storage/account and successful save. No submitted personal data or SQL error is logged. Submission works without JavaScript.

Photo, aggregates, graphs, deletion, account linking and the rest of screen 12 are not implemented by this slice. #68 stays open.

## Verification ledger

Runtime implementation: `b9fcb18`. Test-only confirmation delta: `a6e3051` (precise error selector and next-admission assertion). Subsequent evidence/matrix changes do not modify runtime code.

| Command / evidence | Result |
| --- | --- |
| `npm run check:no-js`, `npm run lint`, `npm run typecheck` at `b9fcb18` | Passed |
| `npm run test --workspaces --if-present -- --maxWorkers=2` | 562 web + 119 database + 1,040 domain + 20 load + 47 word-list tests passed (1,788) |
| Local PostgreSQL suite, after restarting the stopped test container | 178 passed; 9 PgBouncer tests skipped without their dedicated configuration |
| `npm run build` at `b9fcb18` | Passed, Next 16.4.3 production build |
| Web/database lint and typecheck at `a6e3051` | Passed |
| Boundary/action tests at `a6e3051` | 12 passed |
| `test/display-name.db.test.ts` at `a6e3051` | 4 passed, including next admission and unchanged old entrant |
| `profile-name.spec.ts` at `a6e3051` against unchanged runtime build | 3 passed: save/reload/invalid/keyboard/identity; no-JS; both languages and themes, axe, widths |
| Merge-tree simulation with #141, head `8bed260` | No conflict; form and history link both retained. This is not a merge or an integrated runtime verification. |

The gate holds the shared heavy-build lock. Browser port `3988`, disposable local database `incision_e2e_profile68`. PostgreSQL tests use their isolated temporary databases. No other session's database is reset.

### Failures kept, not hidden

1. The first PostgreSQL run failed with `ECONNREFUSED` on port 5433. `docker ps -a` showed `incision-db-test-1` stopped (exit 255). Only that existing container was restarted, without resetting data or touching Aegis containers. PostgreSQL then passed.
2. The initial browser run passed 2/3. The first scenario's generic `getByRole("alert")` matched both our error and Next's route announcer. The trace identifies both elements. The correction targets `#display-name-error` and still asserts its alert role and text; no product assertion was removed. The final 3/3 is a new, separately recorded run.

Local logs: `.codex-worktrees/_tools/f07-5a-{gate,remaining,targeted}.log`. Initial browser trace: `_tools/failures/profile68-initial/` under `.codex-worktrees`. These local scratch paths are not release artifacts.

## Sequential reviews (one Codex session, not independent agents)

Code, DBA and security reviewed `b9fcb18`, followed by the test-only `a6e3051` delta. Functional and UI confirmation used `a6e3051` and the unchanged runtime build. No blocking or major finding remains.

- **Code:** thin authenticated action, existing parser, dedicated translated labels, no root/shared corpus edits. Invalid/missing/repeated/file/oversized values do not reach the update. Previous state is untrusted and ignored.
- **DBA:** one parameterized UPDATE by the existing primary key, affected-row result checked. No new transaction, migration or index needed. PostgreSQL proves account isolation, missing/no-op saves, OAuth re-login preservation, room/race snapshots and next admission. Existing Drizzle audit timestamp behaviour is retained.
- **Security:** authentication is required inside the action, not only on the page; a forged account ID cannot select another account. Existing Next origin/body protections are unchanged. React escapes the displayed name. No provider token, password or database error is returned. Tests cover auth rejection and non-disclosure; no remote OAuth or infrastructure tests were performed.
- **Functional QA:** normalized persisted value, reload, invalid-input retention, no false success on missing account/database failure, unchanged login/session and no-JS submission. Server failure feedback is verified by unit injection, not by stopping a shared database during browser tests.
- **UI/UX:** screen 12's field/button/card tokens reused in the existing scoped account layout, not a claim that the full profile design is implemented. D-14's 1–40 overrides the illustrative 3–20. One red primary action, visible keyboard navigation, associated error text/icon, 44px+ controls. Axe passed in FR/EN and Abysse/Aube at 360px, normal and error states. Reference comparisons at 1440/1024/390px, reduced motion enabled; no horizontal overflow. No logo/design-source changes.

Representative screenshots: [1440px Aube EN](profile-en-aube-1440.png), [1024px Abysse FR](profile-fr-abysse-1024.png), [390px Abysse FR](profile-fr-abysse-390.png). All show the invalid-input state deliberately; the saved state is covered by the first browser scenario.

## Integration and remaining limits

- #141 was still open when this branch started. Preserve its history link when integrating; the simulated combination is clean.
- No full-site E2E rerun: the three changed-flow scenarios were selected proportionately. No Safari/Firefox, production, live OAuth-provider round trip or PgBouncer verification is claimed.
- No cross-tab push of profile changes, no renaming of active room members, no photo or profile statistics. Reopening the account page reads the current database value.
- AUTH-05 is locally verified; #68 remains open and production validation is unchanged. Human `deliver` is still required before push/PR.

## Short acceptance check

1. Sign in and open `/account`; edit the name and save. Confirm the normalized name after reload.
2. Try 41 characters: read the translated error, retain the attempted input and the previous saved name.
3. Rename while already in a room: the old room name remains; leave and join again to see the new name. Old results retain their original name.
