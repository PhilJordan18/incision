# F-03.1b1 — Waiting-room settings UI

Refs #45. This is a partial configuration delivery, not completion of F-03.1.

## Dependency and ownership

Implementation baseline: A's #161, `e4ae1e6`, dependent on #157. Philippe approved
this UI slice and verified PR publication without a merge. A explicitly released
the waiting-room insertion and the dynamic start note. This branch changes no
runtime, server action, protocol, database, migration, lockfile or shared matrix.

Initial implementation SHA: `3d4e1d0`; review correction: `70f9c27`.
The documentation commit after them changes no code.
Integration order: #157 → #161 → this UI PR. Keep the parent issue open.

## What is implemented

- Host-only waiting-room editor: text language FR/EN, whole seconds 30–120.
- Summary from the authoritative room snapshot, independently of interface locale.
- Read-only actual typing mode; no invented free-mode or unlimited-time control.
- Draft revision is pinned; another tab's save preserves the draft and requires
  explicit reload. Even an untouched open editor uses this conservative conflict
  policy. Presence updates at the same settings revision do not reset input.
- Snapshot-before-ack and ack-before-snapshot are supported. An ack is not used
  to fabricate a saved summary. A newer snapshot is never rolled back by an ack.
- Lost replies retain the draft and offer a read, not an automatic retry. The
  message does not assert that a write failed to commit.
- Missing or unsupported settings are not silently replaced by defaults.
- Cancel/Escape return focus to Edit. The panel unmounts on countdown/results,
  so a late response cannot focus the typing screen. The start command is unchanged;
  its note now reflects saved duration and mode instead of claiming two minutes.

The 120-second initial value remains A's **provisional** default; D-19 still calls
for no limit once the D-17 prerequisite is implemented.

## Checks on the implementation SHA

- `npm run check:no-js`, `npm run lint`, `npm run typecheck`, `npm test`,
  `npm run build`: passed under the shared heavy-work lock.
- Unit totals: web 618, database 131, domain 1056, load 20, word-lists 47.
- `room-settings-state.test.ts`: initially five tests covering revision identity, ack order,
  unsupported/missing settings, bounds and truthful translated start notes.
- Real-corpus browser run: four tests passed, using the production build with
  `RACE_FIXTURE_TEXTS` unset and corpus `2026-10-25.3` imported into an isolated
  local disposable database. A real action changes FR/120 to EN/60; another
  account sees it, a reload retains it, the actual race stores EN/60 and corpus
  provenance, displays 50 words, and the next round retains the settings.
- Two-host-tab conflict, Escape/focus, lost action response without auto-retry,
  and axe in both locales/themes passed in that same browser run.
- Standard fixture-based browser regression run on `3d4e1d0`: **35/35**, settings,
  rooms, races and design. No retry and no skipped test.

### Review correction

The sequential functional review found that a host/phase/membership refusal could
leave Save enabled while its snapshot was late. `70f9c27` requires an explicit
read after these refusals, as for stale/unknown replies. Cancel does not clear
this safety condition. A sixth state test pins all affected codes, and the lost-
response E2E now verifies that Cancel cannot bypass the required read.
Final rerun on `70f9c27`: web lint, typecheck, **619 unit tests**, production build,
**4/4 real-corpus browser tests** and **4/4 normal fixture-based browser tests**
all passed, without retries. The other workspaces are unchanged from `3d4e1d0`.
The final documentation-only commit was read through and checked with `git diff --check`.

No new PostgreSQL-only test was added: this delta adds no query or migration.
The browser tests apply the existing migrations and use the real action/database.
The normal PR CI also runs the full PostgreSQL and integration suites.

### Reproduce locally

Use Node 24, a local PostgreSQL test service, and the shared `heavy.sh` lock. Do not
reuse another session's port or database. The name below is disposable and is
**dropped/recreated** by the existing E2E preparation guard on every run.

```sh
npm ci
npm run build -w @incision/web
cd apps/web
E2E_PORT=3992 E2E_DATABASE_URL=postgresql://incision_test:incision_test_only@localhost:5433/incision_e2e_settings45ui \
  npx playwright test --config playwright.room-settings.config.ts
```

The dedicated config imports the real corpus through the existing local-only
import command, before starting the process. The normal Playwright config also
runs `room-settings.spec.ts`, explicitly using its short test fixtures. Neither
configuration is a production fallback. No production import was performed.

## Sequential manual role reviews

Applied by Codex, not independent agents. No code changes during these reviews.

- **Code:** OK after the correction above. Reviewed the complete UI delta and the frozen action contract.
  No identity/role is submitted; one in-flight guard plus React transition;
  form fields exactly match A's parser; no optimistic snapshot replacement.
- **Functional QA:** OK after the delayed-authority correction and the final
  affected checks above. Real accounts/HTTP action,
  database persistence, live second account, race provenance and next round;
  deterministic state checks cover both ack orders. Pristine drafts deliberately
  require reload on any revision change instead of silently adopting it.
- **Security, targeted:** OK. Read the now-exposed action through its parser,
  per-account budget, session-derived identity and locked host/membership/phase/
  revision checks. Existing action tests run in the web suite. No new server
  authority or input field is introduced. This is not a repository-wide security
  scan or a remote penetration test.
- **UI/UX:** OK for this slice. Screen 06 reference inspected; its summary/Modify
  pattern is adapted to the approved inline editor. Existing room layout is kept;
  the unimplemented orbit/readiness/invitation design is not claimed complete.
  Save is secondary, Start remains the sole red primary when available. Native
  controls, 52px targets, visible focus, non-color-only messages, no animations.
  Screenshots at 1440/1024/390px; no overflow also at 360px; FR/EN, Abysse/Aube and
  reduced motion. Browser screenshots are produced by the third test.

## Matrix handoff to A

Representative screenshots from `3d4e1d0` (the later refusal guard does not change
this normal editing layout): [1440px, FR/Abysse](screenshots/fr-abysse-1440.png),
[1024px, FR/Abysse](screenshots/fr-abysse-1024.png),
[390px, EN/Aube](screenshots/en-aube-390.png).

Do not mark the whole configuration complete:

| ID | Evidence added | Still incomplete |
| --- | --- | --- |
| CONF-01 | Host saves 30–120 s, real start honors it | Unlimited and longer duration / D-17 |
| CONF-02 | Text language distinct from interface, persisted and live | Any broader configuration criteria of #45 |
| CONF-08 | Actual saved mode displayed truthfully | Free-mode selection and end-to-end qualification |
| CONF-12 | Host-only waiting-room controls; revision conflict and live summary | Full configuration surface |

The matrix is A's reserved file. This document and the issue comment hand off the
evidence without overwriting its concurrent work. No merge, deployment or human
acceptance is claimed. Firefox/Safari and production were not tested in this slice.

## Short acceptance check after human integration

1. Open a room as host; join with a second account. Only the host can edit.
2. Keep the interface French; save English and 60 seconds. Both summaries update.
3. In two host tabs, keep a draft open and save elsewhere. The old draft cannot
   overwrite the new revision; Reload and Escape work without losing the room.
4. Start, verify the English text/60-second limit; finish or confirm abandonment,
   then go to the next round. The saved settings remain.
5. Check the form on a narrow screen and with the keyboard, in both themes.
