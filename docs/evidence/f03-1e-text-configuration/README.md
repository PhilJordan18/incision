# F-03.1e — complete text configuration (C2)

Card #45; requirements CONF-02 to CONF-07 and CONF-12 (CONF-01 and CONF-08 kept as they are);
decisions D-10, D-18, D-19. Branch `feat/03-1-text-configuration` from `dev` `1a0ed97`. This is
slice C2 of the work order of 29 October 2026. Philippe gave the Go Ahead in the cloud conversation
of 30 October 2026.

## Migration number and dependencies

- **Number.** The coordinator assigned `0016` to this slice, after Codex's `0015` (invitations, L2). The technical order is L2 → C2 → C3 → L3.
- **Regenerated.** The migration is `0016_lobby_text_settings`. It was regenerated with `drizzle-kit generate` after L2's published `0015_room_invitations` (`115817d`, merged into `dev` by PR #190). The local `0015` was deleted first (`549bd5b`) and the merge came next (`d90526c`). The regeneration is `f3db6dc`; its SQL is byte-identical to the earlier local migration. No file was renamed, and no published migration was touched.
- **Upgrade test.** It counts the applied migrations from its predecessor's journal index; its predecessor is `0015_room_invitations`.
- **Base of the PR.** `dev`. L2 (#190) and C1 (#188) were merged by Philippe and are brought in by merging `dev`.
- **Development.** The migration was developed and tested on an isolated local database only.

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

- **Base.** `dev`, which carries C1 (#188) and L2 (#190).
- **Random mode.** It is now served from C1's reviewed lists, with no code change.
- **C3.** C3 (Arcade, migration `0017`) follows this branch.

## Checks on this branch

Final run on `783d7e7`, with Node 24.22.2 and a disposable PostgreSQL 16.15 (CI uses PostgreSQL 17).

| Check | Result |
|---|---|
| `check:no-js`, `lint`, `typecheck`, `build` | Pass |
| Unit tests | Pass: web 962, database 146, domain 1198, load 20, word-lists 62 |
| Database tests | 360 pass, 9 skipped. The 9 are the PgBouncer suite, which runs only with a pooled URL (`describe.skipIf`), as on `dev`. They include the upgrade, the constraints, the random save read by every member, and the switch back. |
| Schema drift (`db:generate`) | No changes |
| Integration (`test:integration`, two production processes) | 10/10. With no corpus imported, the start is refused as `TEXTS_UNAVAILABLE`. Random mode on fixture data is refused the same way, with no race written. |
| Playwright `text-settings.spec.ts`, `room-settings.spec.ts` | 15/15. Covers sync, reload, keyboard, the countdown lock, refusals in FR and EN, and axe in both themes at 1440, 1024, 390, 360 and 320 px. |

The start-refusal wording was also checked in a browser by the Fable QA on C3 (`332c248`, which includes these commits): `TEXTS_UNAVAILABLE` in FR and EN, start button still usable, room still waiting, no race written. `NO_COMPATIBLE_PASSAGE` needs an imported corpus; it is covered by the unit tests and the dictionaries.

No-JS: the settings panel needs JavaScript, as before (a client form with a draft). Without JavaScript, members still see the saved settings.

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

**Start refusal (resolved after Philippe's directive of 30 October).** A start is now refused in three distinct ways:
- `NO_COMPATIBLE_PASSAGE`: texts exist, but none fits the room's settings. The message says so and says the room stays open; the host can change the length, complexity or options.
- `TEXTS_UNAVAILABLE` (new): the server has no active corpus or no approved word lists. The room stays open; try again later.
- `UNAVAILABLE`: a technical failure, unchanged.

The code is in `d718344`. The FR/EN messages live in the shared root dictionaries: they are isolated in `783d7e7` and submitted to the coordinator as a patch on #45. `start-race-button.tsx` already renders `t.startErrors[error]`, so `room-view.tsx` and `packages/database/src/index.ts` are unchanged.

Accepted (Fable QA, minor): a random draw the engine refuses also maps to `NO_COMPATIBLE_PASSAGE`, whose wording says "passage". That only happens when the data change between the save and the start (the save already ran the same proofs).

Proposed text for `docs/architecture/data-model.md` (migration list and the `lobby_settings` row), for the coordinator:
- `0016_lobby_text_settings`: enums `text_kind` and `text_complexity`. The columns are `text_kind`, `complexity`, `punctuation`, `numbers`, `capitals`, `accents`, `include_characters text[]` and `exclude_characters text[]`. Their defaults are D-19's: coherent, medium, true/false/true/true, empty arrays.
- CHECK `lobby_settings_characters_random_only`: characters are allowed only when `text_kind = 'random'`.
- CHECK `lobby_settings_characters_bounded`: at most 100 characters in each array.
- Rows written before this migration read as D-19.
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
