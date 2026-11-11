# Integrated final qualification — November 8, 2026

## Scope and immutable references

Philippe authorized cloud-only integrated qualification and delivery documents,
with no push/PR until a new **deliver**, and no merge, card closure, deployment,
Mac/recipe access or use of existing data/backups.

GitHub read-only verification confirmed #199 merged at
`ee89a0457f7a10de517d18956fdf3eb851f959b2`, followed by #198 at
`39fe1249a1ce5b7337976acf4c36614557b305a1`. Remote `dev` matched the latter.
A fresh network clone (not a copy of node_modules, .env or previous build) was
created at `/workspace/incision-final-integrated`. No matching integrated task
branch was found locally or among the relevant remote branches.

Branch: `test/10-integrated-qualification`.
Reviewed documentation/test snapshot: `09ed03ce1338da4c851664232a52e917743bb34a`.
Runtime, dependencies, migrations and corpus are byte-identical to integrated dev.
The full browser suite started on `e3a8cdbaeb211532b50dd41e20b872b77fb37cb3`
(history-link assertion included); the additional localized bot-level assertion
is `68902f38a243b2fdc45fad027ad967bf87249e3a` and has its own three-test run.
A final three-scenario run on `09ed03ce1338da4c851664232a52e917743bb34a`
rechecked both assertions ([final target output](final-target.txt)).
Subsequent proof-only commits do not change the tested application.
The implementation/documentation commits preceding this proof are listed in [commits.txt](commits.txt).
The final delivery SHA is reported in the conversation; a file cannot contain its
own commit SHA without changing it.

## Changes

- Correct README's obsolete “race not implemented” and nonexistent contracts
  package; add versions, test commands and explicitly historical synthetic screenshots.
- Make corpus import explicit in the setup sequence, document the separate
  synthetic history seed and invitation/release-check prerequisites.
- Correct absent-corpus diagnostics to `TEXTS_UNAVAILABLE`, distinct from
  `NO_COMPATIBLE_PASSAGE`; no fallback, error guard or product rule changes.
- Align architecture reference and stale matrix notes with the two merged lots;
  preserve all 90 IDs, official statuses, human testimony and production reservations.
- Strengthen existing bonus-journal E2E coverage: follow the actual private history
  link after reload and compare the same journal; assert the translated bot level.
- Prepare [the short human delta](../../RECETTE-FINALE.md). No human result is inferred.

## Fresh installation and isolation

Node 24.19.0, npm 11.9.0, PostgreSQL 17 in the managed cloud Docker daemon.
The `.env` was newly created from the example in this clone only, with independent
random local keys, no real OAuth credentials and no fixtures on the README server.
The Compose project `incision-integrated-20261108` uses new containers and its own
new volume. A temporary ports override maps db to **55432** and db-test to **55433**;
no existing container was started, stopped, recreated or inspected for its data.

Commands executed from the clone:

```sh
npm ci
# Compose project and port override described above, using the cloud-local socket:
docker compose -p incision-integrated-20261108 -f compose.yaml -f <ports-override> up -d db db-test
npm run db:migrate -w @incision/database
npm run db:seed:demo -w @incision/database
npm run db:import:corpus -w @incision/database -- --version 2026-10-25.4
# Repeat the three commands to check idempotence.
```

[Installation output](install.txt): 21 migrations, two accounts created, 122 passages
imported; 55 FR / 56 EN retained, 6 / 5 spare, 20 / 19 serve default settings.
Repeat: zero migrations, accounts unchanged, corpus unchanged. The earlier load
scenario omission concerned its own newly created database, fixed before this
tranche; it is not reclassified as an installation or product defect. Normal
installation still requires explicit corpus import, now shown directly in the
setup command block. All eight corpus JSON
files remain unchanged ([fingerprints](corpus-sha256.txt)); no recalibration or
production/editorial exception approval is claimed.

`DEMO_HISTORY_DATABASE_URL` explicitly targeted the new 55432 database when running
`node --import tsx packages/database/scripts/seed-history.ts --version 2026-10-25.4`:
[6 races created, then 6 unchanged](history-seed.txt). The README server
`npm run dev -w @incision/web` ran on 3400 with the real imported corpus.
A [Chromium check](fresh-browser.txt) signed in with the public synthetic history
account, followed its history link, saw six races, and verified unavailable legacy
bonus collection after reload, with no false zero. The [probe source](fresh-browser.mjs.txt)
is preserved as text, not product JavaScript.

A new `pg_dump -Fc` of **this synthetic database only** was restored into the new
`incision_restore_20261108` database. All rows in 19 tables, including 21 migration
records, matched by sorted row digests ([sanitized counts](restore-check.json),
[comparison source](restore-check.mjs.txt)). Neither dump nor account hashes are
committed. This proves a local synthetic restore, not Neon recovery or its retention window.

A second complete browser flow used the **production build**, the actual imported
`2026-10-25.4` corpus and its natural bonus selection (no fixture text or forced seed):
local demo-account login, room creation, Arcade setting, impossible bot, real
checkpoint awards, Enter activation, confirmed human abandonment and bot finish.
The final journal contained **one used and two unused grants**. Reload and the real
private-history link returned identical journals, confirmed against SQL and the
persisted corpus version ([result](corpus-race.json), [probe source](corpus-race.mjs.txt),
[open journal screenshot](corpus-race-journal.png), [visible-state check](corpus-capture.txt)). This is a completed two-participant race, not a load test
or a claim that the human finished the text. A separate new dump/restore then
included these bonus rows: [all 19 table digests matched](restore-bonus-check.json),
[comparison source](restore-bonus-check.mjs.txt). The first dump/restore was preserved.

Versioned command outputs normalize trailing whitespace only; raw outputs remain
in the cloud scratch directory. Empty lint output accompanies exit code 0.

## Executed automated checks

| Check | Result | Evidence / distinction |
|---|---|---|
| `check:no-js`, root lint, root typecheck | PASS | Initial command chain completed; [captured checks output](checks.txt). |
| `npm test` | 2654 passed | 1106 web + 157 database-unit + 1259 domain + 21 load + 111 word-list. |
| `npm run build` | PASS | Fresh production build, unchanged runtime source. |
| `db:generate` | No schema changes | [Output](migration-consistency.txt); migration directory unchanged. |
| `test:db` with TEST_DATABASE_URL on 55433 | 433 passed, **9 skipped** | [SQL output](sql.txt); PgBouncer not configured, not passed. |
| `test:integration`, ports 3501/3502 and its own `incision_e2e_final_integration_20261108` | 11 passed | [Output](integration.txt); actual server processes and Socket.IO. Includes no-corpus refusal then import and race; Arcade received/used/unused bonuses, duplicate receipt, final SQL journal, bot activation. |
| Full `test:e2e`, port 3500 and its own `incision_e2e_final_20261108` | 214 passed (19.9m); no skips | [Complete output](e2e.txt). Chromium production build; local accounts, simulated OAuth, short text fixtures where specified. |
| Additional `bonus-journal.spec.ts`, port 3503 and separate local probe database | 3 passed | [Output](locale-probe.txt); final translated bot-level assertion plus reload/history, FR/EN × both themes, keyboard, 360/390/1024/1440, axe at 360, anonymous ordinal, unavailable/empty distinction, no-JS and outsider refusal. |
| Web lint/typecheck after history assertion; final E2E-file lint and no-JS | PASS | [Web lint](web-lint.txt), [types](web-typecheck.txt), [final lint](final-test-lint.txt), [no-JS](final-no-js.txt). No product code changed. |
| `db:check-corpus-leak` | PASS | [Build](corpus-leak-retry.txt): 260 fingerprints. |
| Release script and archive corpus check | PASS | [Packaging](package-release-retry.txt), [archive check](archive-corpus-leak.txt): 18,971 entries, no corpus/test fixtures; required runtime files present, no local tool workspaces. Archive marked `7d19d256a7167f84a1dbcb3cb791972f3509be25`, runtime identical to final source. Assembly only, never deployed. |

The UI journal fixture explicitly seeds stored grants; it is a rendering/access
proof, not a real bonus draw. The real Arcade integration separately follows
server facts through final persistence. Guest E2E/SQL/runtime checks cover ephemeral
results and privacy; human guest acceptance is still pending. Screenshots here
come from synthetic test data: [FR/light](journal-fr-aube-390.png),
[FR/dark](journal-fr-abysse-390.png), [EN/light](journal-en-aube-390.png),
[EN/dark](journal-en-abysse-390.png).

## Diagnostics and limits

- The additional local production server initially refused missing environment
  variables: production deliberately does not auto-load the development `.env`.
  It was restarted with Node’s explicit `--env-file` pointing only at this clone’s
  new configuration; no guard was removed. The first browser attempt consequently
  received connection refused; the complete retry then passed.
- Default command sandbox blocked proxy access and tsx local IPC. The authorized
  cloud commands were retried with the required execution permissions; TLS and
  network policy were not disabled. The initial corpus-leak command's EPERM was
  an environment error, not a passing check.
- Release assembly initially failed because rsync was absent. The package helper
  and sudo were unavailable; the apt download index could not locate it. Official
  Debian rsync 3.5.0 and libpopt packages were downloaded over HTTPS and extracted
  under scratch for this command only. No repository dependency/system configuration
  was changed. The complete archive command then passed.
- Visual review raised a possible untranslated bot-level label. The focused
  assertion and new captures confirmed the correct English label without a product
  change; the suspicion was not promoted to a confirmed defect.
- Existing bot E2E writes screenshots into historical tracked evidence paths.
  This run's generated copies are preserved under scratch; historical tracked
  screenshots are restored byte-for-byte from HEAD before delivery.
- No new load or Lighthouse run in this integration slice. Their November 6 proofs
  remain historical, not measurements on this SHA. 30 racing participants +20
  spectators are 50 members; a browser observing the same spectator adds a socket,
  not a 31st runner. Transport, rendered track and human-perceived smoothness remain
  distinct. PERF-03 has no numeric RTT/FPS acceptance threshold; PERF-01 requires
  Lighthouse ≥90 per category. Physical devices and current production are untested.
- Real OAuth, Azure, Neon, pooler, shared recipe, local Mac data/backups, production
  activation, remote restoration and external CI for this unpushed branch are untested.
- npm reported deprecation notices for the pinned ESLint/esbuild-kit packages;
  no dependency upgrade was introduced.

## Reviews and handoff

Sequential review roles by the same Codex agent, no independent review claimed:
architecture/documentation, code/functional QA, privacy/security and deployment/DBA.
Review scope is this diff and its evidence, not a new repository-wide audit.
Verdict: **ready to deliver**, no blocking finding in the approved diff.

| Review | Result |
|---|---|
| Architecture / documentation | OK: brief priorities, fresh-install order, integrated references and honest partial statuses; creative/personal evidence unchanged. |
| Code / functional QA | OK: tests follow real history navigation and locale; 214 full E2E plus focused checks pass, no runtime change or weakened assertion. |
| Privacy / security | OK within this diff: only synthetic/public demonstration data in proofs, no keys/cookies/dumps committed; guest/outsider refusals retained. Not an exhaustive security audit. |
| DBA / deployment | OK locally: empty-database migration, idempotent seeds/import, matching synthetic restores, immutable migrations, archive and corpus checks; remote operations excluded. |

No runtime/schema/configuration-default change; published migrations, corpus versions,
creative documents/assets, human testimony and product rules remain intact.

The four mandatory documents were read: architecture and requirements updated where
contradicted by code, creative evidence preserved, IA log preserved. IA.md still
requires Philippe's own reflection and final selection/layout for the brief's 1–2
pages; this task does not invent those personal statements.

Remaining: finish human delta with the coordinator; retain CONF-03/production
reservations; obtain **deliver** before push/PR. No merge, issue closure, board write
or deployment is part of this tranche. Future delivery must recheck remote dev,
follow the branch's CI to completion, and report the exact pushed SHA.
