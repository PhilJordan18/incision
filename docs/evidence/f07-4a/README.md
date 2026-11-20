# F-07.4A — Private race history (#67)

Implementation reviewed at `188b981`, based on `dev` `f4600af`. This is local evidence, not a production validation. No dependency, migration, corpus, race runtime or other session's UI file changed. Philippe authorized the single additive history export; A was notified on #40.

## Behaviour

`/account` links to `/history`. The session alone selects the account. One SQL projection returns at most 21 records, of which 20 are displayed. Only finished races with this account's saved result qualify; the entrant may have finished, timed out or abandoned. Spectators and interrupted races do not qualify. UTC dates use the interface locale. The cursor keeps PostgreSQL microseconds and the UUID tie-breaker. Older/newer links and result links work without JavaScript. Invalid positions and unavailable storage have different translated states; neither silently means an empty history.

The screen implements only the approved history-table adaptation of design screen 11, not the statistics dashboard, profile preferences or future result charts. On a narrow screen the table has its own keyboard-accessible horizontal scroll region and a translated hint. Existing fonts, colours, focus and controls are reused. The name, logo and design sources are unchanged.

## Checks

- Root no-JS guard, lint, typecheck, unit tests and production build.
- Unit suites: web 552, database 130, domain 1,040, load 20, word-list tool 47.
- PostgreSQL: original full run 180 passed, 9 PgBouncer tests skipped because no pooled test URL is configured. The added plan check then passed with all 6 history database cases. See the delivery report for the final full-run count.
- Cursor tests: 11, including repeated parameters, invalid dates, year zero, precision and size.
- Page tests: session identity, invalid position before the history query, outage distinct from empty data, no failure details in HTML.
- PostgreSQL cases: equal and microsecond-different timestamps, bidirectional pages, exact 20-row boundary, new arrivals, all final outcomes, interrupted/active exclusion, account isolation, room deletion, one query and rejected cursor without query.
- Browser: 3 tests on the production build, dedicated local database `incision_e2e_history67`, port 3987. Unauthenticated redirect; 21 persisted races; no-JS pagination and results; browser Back; another account denied; empty history; invalid repeated cursor; private/no-store response; FR/EN, both themes, keyboard access and axe at 360px. Screenshots at 1440, 1024 and 390px are produced by the test.

The first browser fixture used an ambiguously typed SQL parameter; PostgreSQL refused it before the page was exercised. An explicit integer cast fixed the fixture. A later assertion selected Next's route announcer as well as the page alert; scoping it to `main` fixed the test. Those failing runs are not counted as passing evidence. Initial PostgreSQL setup attempts also encountered sandbox network denial and an absent default database; the suite now connects through the existing local `postgres` administration database and creates/drops only its own random test database.

## Query-plan evidence and limits

The actual Drizzle query is captured by a test logger and passed, with bound parameters, to `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)` in the disposable database. A 1,047-race fixture checks that `race_entrants_account_race_unique` is used and that the top limit returns 21 rows. No timing threshold is imposed: machine load is not a correctness property. No index or schema modification was needed for this fixture.

The response bound is not a bound on all database work: joining and sorting can grow with an account's history, and PostgreSQL can choose a different plan for different data distributions. This is not a Neon or production-scale measurement. A future index change requires a separate migration coordinated with A.

## Sequential reviews

Applied manually by Codex, not independent subagents, on the code diff at `188b981`:

- **Code:** no blocking finding. Input validation, bounded projection, ordering and both pagination directions checked; no new client state or copied engine rules.
- **DBA:** no blocking finding. Parameterized timestamp/UUID comparisons, account predicate, result join, room-purge behaviour and existing index checked. No writes or schema changes in the reader. Query-plan limitations are stated above.
- **Security:** no blocking finding. Session authorization precedes the reader; URL account parameters are ignored; cursor is a position, not authority; result authorization remains unchanged. No cross-user caching, private metadata, text snapshot or result payload is logged. No remote testing performed.
- **UI/UX:** no blocking finding. Screen 11 table adaptation and screen 12 account-link scope checked; screenshots inspected at 1440/1024/390, with FR/EN and both themes covered by browser checks. No page-wide horizontal overflow, keyboard-reachable results, 44px-or-larger controls and axe checks. No actual mobile-device or non-Chromium test.
- **Functional QA:** no blocking finding. The checks above cover the approved history slice; full result charts and human acceptance remain explicitly outside these proofs.

## Human acceptance (short)

1. Sign in, open **My account → Race history**.
2. With more than 20 saved races, use **Older races**, **Newer races**, and browser Back.
3. Open a result; repeat after its room is closed/deleted. Another account must not open it.
4. Check an account without races and switch FR/EN and both themes.
5. On a narrow screen, scroll the table or tab to a result link.

HIST-01 is implemented and locally verified in this branch. HIST-02 remains partial because the full results features are not all implemented. #67 stays open; no merge or production action is authorized here.
