# F-03.1e — complete text configuration (C2)

Card #45; requirements CONF-02 to CONF-07 and CONF-12 (CONF-01 and CONF-08 kept as they are);
decisions D-10, D-18, D-19. Branch `feat/03-1-text-configuration` from `dev` `1a0ed97`. This is
slice C2 of the work order of 29 October 2026. Philippe gave the Go Ahead in the cloud conversation
of 30 October 2026.

## Blocked integration step: the migration sequence

The text settings need eight `lobby_settings` columns. Migration `0015_lobby_text_settings` is
additive and keeps D-19's defaults, so existing rooms run the same texts. It was developed and tested
on an isolated local database only. The local coordinator assigns migration numbers. The proposal on
#45 (comment of 30 October, 03:10 UTC) is still waiting for an answer, so this branch is **not
published as a PR**. Everything else is independent and verified. When a number is assigned, the
migration is regenerated under that number; no other change is needed.

## What changed

- **Database.** Text kind, complexity, four options and random-only characters.
  - PostgreSQL refuses characters in coherent mode and more than 100 of them.
  - The upsert under the room lock writes them with the revision.
  - Snapshots and the start read them.
- **Server.**
  - The configure action reads every field exactly once and refuses characters in coherent mode.
  - It then runs the engine's checks before the rate budget and the database:
    - the data-free refusals shared with the browser;
    - in random mode, the engine's proofs on the approved lists.
  - Random mode is refused while only the hand-written fixtures ship (`WORDS_UNAVAILABLE`), so there is
    no fixture fallback.
  - A start draws with the room's settings. A coherent start draws a passage with its complexity and
    options; a random start draws words from the approved lists. The race's configuration records the
    settings and the data version.
  - A start that nothing can serve is refused before any write.
- **Interface.**
  - The settings panel shows every member the text kind, complexity, options and characters.
  - The host gets two selects, four toggle buttons (`aria-pressed`, with a mark and not only colour)
    and two character fields. The fields are disabled in coherent mode, and a hint says why (D-10).
  - The engine's refusal is translated and shown before any request, and the save button stays
    disabled.
  - FR/EN copy covers all ten refusals.
- **Not touched.** `room-view.tsx`, `server.ts`, the root dictionaries, and room access, invitations
  and moderation.

## Merge order

This branch is independent of PR #188 (C1). After C1 merges, random mode is served from the reviewed
lists without any code change. A local trial merge of C1 into this branch passed:
- 959 web tests;
- the build;
- the three text-settings E2E tests, with saves, reloads and summaries;
- integration, with a real random race drawn from the reviewed French lists.

Two tests compare a criteria version string. Merging `dev` after C1 resolves them automatically
(checked in the trial merge).

## Checks on this branch

Run in this container with Node 24.22.2 and a disposable PostgreSQL 16.15. CI uses PostgreSQL 17.

| Check | Result |
|---|---|
| `npm run lint`, `npm run typecheck`, `npm run build` | Pass |
| `npm test -w @incision/web` | Pass |
| `npm run test:db -w @incision/database` | Pass, including the 0015 upgrade, constraints, the random save read by every member, and the switch back |
| `npm run test:integration -w @incision/web` | 10/10. Random mode is refused with no race written while fixtures ship. |
| Playwright `text-settings.spec.ts`, `room-settings.spec.ts` | 15/15. Covers sync, reload, keyboard, the countdown lock, refusals in FR and EN, and axe in both themes at 1440, 1024, 390, 360 and 320 px. |

No-JS: the settings panel needs JavaScript, as before (a client form with a draft). Without JavaScript,
members still see the saved settings.

## Reviews on a413cb5, then fixes

| Review | Verdict | Fixed |
|---|---|---|
| Code reviewer | Changes needed: two major findings (one data version recorded instead of three; coherent start refusal unclear) | Three versions recorded (`wordsVersions`). The start message is a shared-dictionary change, so it is left for a decision (below). Hints by text kind. Shared character helper `characterEntries` (domain). |
| Security | Changes needed: one major latent finding (the word-list proofs ran before the rate budget) | Data-free checks before the budget, word-list proofs after it; a test proves the order |
| DBA | OK. Major: `docs/architecture/data-model.md` is out of date | Text proposed below, since the coordinator consolidates architecture docs. The migration test counts from the predecessor's journal index, so renumbering needs no other edit. |
| UI/UX | Changes needed: one major finding (French agreement in the options summary) | The summary lists the options that are on ("ponctuation, chiffres, accents" / "aucune"). Character fields in error get `aria-invalid` and the linked message. Disabled fields follow the design (no border, `sillage`, `voile`). Shorter hint; ’ apostrophes. |
| Functional QA, Fable (model named in its report) | OK (minor: the local fixture source ignored random settings) | `fixedRaceTexts` refuses random settings as production does |

Documented departures from the design, for Philippe:
- The pressed option buttons have no tinted background. A `moi` tint drops Aube below AA, so a 2 px `moi` border and ✓ mark the state instead.
- The database bounds the number of characters but not each element. The server validates every character before any write.

Decision needed: when coherent settings fit no passage, the start is refused with the shared message "No text is available for this race right now… try again later". A message specific to the settings needs the shared dictionary or `room-view.tsx`, which this slice does not edit. The settings panel's hint now says the start is refused when no passage fits.

Proposed text for `docs/architecture/data-model.md` (migration list and the `lobby_settings` row), for the coordinator:
- `0015_lobby_text_settings` (number to be assigned): enums `text_kind` and `text_complexity`. The columns are `text_kind`, `complexity`, `punctuation`, `numbers`, `capitals`, `accents`, `include_characters text[]` and `exclude_characters text[]`. Their defaults are D-19's: coherent, medium, true/false/true/true, empty arrays.
- CHECK `lobby_settings_characters_random_only`: characters are allowed only when `text_kind = 'random'`.
- CHECK `lobby_settings_characters_bounded`: at most 100 characters in each array.
- Rows written before 0015 read as D-19.
- Rollback (tested by the DBA review): drop both constraints, the eight columns and the two types, then delete the journal row. The text choices hosts saved are lost.

## Proposed requirement rows (for the coordinator)

- **CONF-03:** fait once C1 is merged. Coherent from the corpus; random from the reviewed lists, wired.
- **CONF-04 to CONF-07:** partiel → fait after merge and human acceptance. Every control has its E2E
  test, and the server shares the engine's validation.
- **CONF-12:** every text setting is synchronised, revised and locked from the countdown.

## Human acceptance

1. Assign the migration number (or let the coordinator do it).
2. In a room, change each setting as host, see it in a second browser, reload, and start.
3. Once C1 is merged, try random mode with characters to include and exclude.
