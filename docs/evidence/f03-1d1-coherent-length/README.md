# F-03.1d1 — coherent text length

Status: scoped implementation verified locally; Philippe authorized delivery on October 28, 2026. Merging remains a human action.

## Scope and isolation

- Card #45, CONF-04 and CONF-12: integer word count 10–200, default 50; coherent text only.
- Base `5ee148e`, implementation `6e2b444`, branch `feat/f-03-1d1-coherent-length`.
- Migration 0012 adds `lobby_settings.word_count` with a default and SQL range check. It does not rewrite historical race snapshots.
- Runtime draw uses the room revision and count. Missing compatible content refuses the start; no fallback length or fixture in real-corpus mode.
- Recipe port 3880, its database and backups were not modified. Tests use dedicated PostgreSQL 17 on 5445 and browser server 3845, with disposable `incision_e2e_f031d1` only.

## Executed checks

Commands run in this worktree with Node 24.13.0. Build and browser tests use the shared `heavy.sh` lock.

| Check | Observed result |
|---|---|
| `npm run typecheck` | Passed across all workspaces |
| `npm run lint` | Passed across all workspaces |
| `npm test` | 2,164 tests passed: web 770, database 146, domain 1,181, load 20, word-lists 47 |
| `npm run build` | Production build passed |
| Targeted DB: room-settings, races, migrations | 83 tests passed on dedicated local PostgreSQL |
| Updated migrations + succession DB tests | 24 passed; populated settings, accounts, photo bytes and historical race unchanged |
| `git diff --check` | Passed |
| Final implementation typecheck | Passed on `6e2b444` |
| `npm run test:integration -w @incision/web -- integration/race.integration.test.ts` | 8 passed on dedicated ports 3846/3847 and database `incision_e2e_f031d1_integration` |
| Final responsive/axe rerun | 1 passed; captures under `apps/web/test-results-f031d1-ui/` (local generated artifacts) |
| Real-corpus browser suite | Initial run: 10 passed, 2 locator failures; corrected exact-name selector, then `--grep 'word count'`: 2 passed on `6e2b444`. Both starts use actual EN corpus text with exact 10/200 word counts; FR exact lengths are covered by unit tests. |

The production build and full unit run precede a server-log wording adjustment in `6e2b444`; the custom server runs that source directly, outside the Next bundle. Browser tests cover 1440, 1024, 390, 360 and 320 pixels, both interface languages and themes, with no horizontal overflow and no axe violations. Main-session visual inspection: FR Abysse 1440, FR Aube 1024, EN Aube 390; labels, wrapping, controls and duration-field focus remain legible. This is not a claim of a complete accessibility certification.

## Reviews on implementation 6e2b444

- Independent session B: complete diff review, no blocking/major finding; verified host/revision/phase, snapshot, draw retry, generated migration delta and fixture limitations. No files changed by the reviewer.
- Main-session code/functional review: validation uses domain bounds at form/snapshot/engine boundaries; no new identity authority, no fallback length, no production fixture enabled.
- Database review: generated additive SQL, not-null default50 and CHECK10–200; empty/populated/repeat migration tests and rejected SQL bounds. Historical results/series/key-error rows were not populated by the new migration test, so their restoration is not claimed.
- UI review: existing tokens/styles and translated labels; responsive/axe browser checks and inspected screenshots as above. Human acceptance remains pending.

## Visual evidence

- [FR Abysse, 1440 px](screenshots/settings-fr-CA-abysse-1440.png)
- [FR Aube, 1024 px](screenshots/settings-fr-CA-aube-1024.png)
- [EN Aube, 390 px](screenshots/settings-en-US-aube-390.png)

Selected screenshots are preserved here; the full generated browser artifact directory was archived outside the checkout before delivery.

## Remaining

- Remote CI and human acceptance before Philippe decides whether to merge.
- Human recipe integration is a later controlled step with a fresh preserved backup, not a reset of the current recipe.

## Parallel card #42A

Session B reports local commit `7ff1267` on `codex/f-02-4a-candidate-export`: deterministic candidate export only, 61 tool tests passed, repeated actual FR/EN exports byte-identical. The main session read the complete exporter and test diff and independently reran all61 tool tests successfully; no blocking issue identified within the documented private-parent/cooperative-lock scope. No real word lists were committed or made playable. Editorial exclusions, redistribution credits, runtime integration and calibration #43 remain unfinished; #42 stays partial.
