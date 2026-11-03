# F-03.3 — Quickplay (C)

Card #47; requirement JOIN-03; decisions D-05 (order, no automatic room) and D-19 (default settings).
Branch `feat/03-3-quickplay`, slice C of the night order of 2 November 2026.

## Dependencies

- **Stacked PR.** This branch starts from slice B (`feat/03-2-public-room-explorer`, PR #195), which itself starts from slice A (`feat/01-3-room-visibility`, PR #194). Both are merged in by merge commits, and this PR targets B's branch, so its diff shows only quickplay. This is an exception to the usual "branch from dev, PR to dev" workflow, approved for this order only.
- **Merge order.**
  1. #194 into `dev`.
  2. Retarget #195 to `dev` and merge it.
  3. Retarget this PR to `dev` and merge it.
- **No migration.** `db:generate` reports no schema change. The candidate read uses B's partial index `lobbies_open_public_idx`.

## What changed

- **Candidates (database).** `quickplayCandidates` keeps PUBLIC rooms that:
  - are in phase waiting or results;
  - have a host;
  - have a free participant place, counting bots and not counting spectators or people who left;
  - have not banned this account or guest session.

  It orders them by fewest free places, then the oldest, then the id, and keeps 10 at most.
- **Admission.**
  - Each candidate is tried in its own READ COMMITTED transaction. It takes `SELECT … FOR UPDATE` on the room, still filtered on PUBLIC and hosted, then calls the existing `admitAccountToLockedRoom` / `admitGuestToLockedRoom`. These check the ban, membership, phase, capacity with bots, the guest session and the nickname again.
  - The next room is tried when the room went away or became non-public, is full, stopped admitting, or the nickname is taken. It is also tried when the room stayed locked past `lock_timeout`.
  - If every candidate stayed locked, the answer is "unavailable, try again", never "no room".
  - The role is always participant.
- **Account (`/rooms`, screen 04 card).**
  - "Find a room" is the screen's one red action.
  - Success opens the room.
  - Without a room, the account gets an empty state and a secondary "Create a public room" action, which goes through the usual creation with the D-19 defaults (30 places, 50 words, medium, interface language, no bonus, no time limit). Nothing is created until it is pressed.
  - A member of another room is told so and linked back to that room.
- **Guest (`/guest?quickplay=1`).** A visitor without an account is sent here. The page asks for the nickname only: no code, no role. With no room, it shows the empty state, with links to the public rooms and to code entry; a guest never creates a room.
- **Without JavaScript.** Both quickplay and the offered creation are plain forms.

## Checks

On `8c47aa3` (code head; this evidence commit changes only docs), with Node 24 and a disposable local PostgreSQL 16.

| Check | Result |
|---|---|
| `check:no-js`, `lint`, `typecheck`, `build`, `db:generate` | Pass, exit 0. `db:generate`: no schema change. |
| Unit tests | Pass: web 1106, database 146, domain 1259, plus 20 and 111 in the other packages. |
| Database tests | Pass, twice in a row: 431 passed, 9 skipped, exit 0. The 9 skips are the PgBouncer tests, which need a pooler this container does not run. |
| Integration (two production processes) | Pass: 11/11. |
| Playwright, full suite (includes slices A and B) | Pass: 209/209 in 19.1 min, no failed or flaky test. |

**Database tests.** Quickplay alone has 15 tests. They cover:
- the order, with a tie broken on the id;
- spectators and members who left not counted;
- bans, per subject;
- hostless rooms;
- no room created;
- a member sent back to their room;
- 6 concurrent requests for the last place;
- a room closed, made private, filled by a bot or banning the seeker while the request waited for its lock;
- a lock held past `lock_timeout`;
- guests: admitted, nickname taken, invalid or expired session, invalid nickname, already in a room.

**Captures.** This folder holds the card, the account empty state and the guest empty state at 1440, 1024 and 390 px, light and dark, FR and EN (36 images, from the full run on `8c47aa3`). Each was taken after axe and the horizontal-scroll check passed in the same test. The test also checks 360 px; those images are not kept, to limit the repository's size.

**Test harness.** The database suite failed under load because of unhandled `57P01` errors at teardown. Every test passed, but the run exited with code 1. The cause was the forced drop of a test database while pg was still closing that database's connections. `test/test-database.ts` now waits, for 5 s at most, for those connections to end before the forced drop. No test was changed or skipped.

## Reviews

| Round | Review | Verdict | Fixes |
|---|---|---|---|
| 1, `42a5677` | Code reviewer | OK, minors only | Hostless rooms skipped; attempt given back for a member of another room; rate-limited creation message |
| 1, `42a5677` | Security | OK, 2 minors | A call that does not send a form is refused; the guest per-IP limit is accepted (see below) |
| 1, `42a5677` | DBA | OK. Major: a lock timeout ended the whole quickplay | `lock_timeout` → next room, with a test that fails without the fix |
| 1, `42a5677` | UI/UX | Changes needed. Major: the `[.MATCHMAKING]` tag at about 4.2:1 in Abysse | Halo moved off the tag; focus on the message itself, one ring; guest empty-state copy and code link; EN "30 spots" |
| 1, `42a5677` | Functional QA | RESULT_QA | — |
| 2, `236ca3b` | Code reviewer, targeted | Changes needed: the guest form kept the quickplay empty state when the link led to code entry on the same route | The form is keyed on the mode; E2E follows the link and checks a fresh code field |
| 2, `7227a9c` | UI/UX, targeted | Changes needed: the halo still lowered the tag to 4.45:1 at 1024 and 360 px | Halo at `85% 100%` (`8c47aa3`); measured in a browser at 4.59:1 (Abysse) and 5.72:1 (Aube) at every width, initial and empty states. Not re-reviewed by the sub-agent after this fix |

Fable is not available as a tool in this session. Functional QA and UI/UX ran as sub-agents with Playwright and Chromium.

Accepted, not changed here:
- **10 candidates.** If 10 rooms in a row are lost to other requests, the answer is "no room" or "nickname taken", although more rooms may exist. Nothing is created automatically, so D-05 holds.
- **Copied rule.** The participant count and the admitting phases are written in the query, as in the public list. Factoring them would touch files outside this slice.
- **Guest quickplay** is limited per guest session (10 a minute), not per address. The work per request is bounded, and quickplay enumerates no secret.
- **A banned guest** can reset the cookie and come back in a new session. This predates the card, comes from the AUTH-02 design, and applies to every way of joining.

**For a product decision (Philippe):**
- **French copy.** The card's body begins "Rejoint la salle…", following the design's wording; the guest intro says "Rejoins…". Should both use "Rejoins"?
- **Screen 04 cards.** The design has two more cards on `/rooms`, "Entrer un code" and "Créer ma salle". The quickplay card sits alone on its row. Are the other two planned in another card?
- **The halo.** It moved to the bottom right (`85% 100%`) so the tag reaches AA: 4.59:1 in Abysse and 5.72:1 in Aube, measured at 1440, 1024, 390 and 360 px. Is that position approved?
- **Token comment.** `apps/design/tokens.css` says `--color-ligne` is 5.0:1 on Abysse; the measured contrast of this small tag over the card is 4.59:1. The design file is not changed by agents.

## Human acceptance

1. Two accounts and three PUBLIC rooms with different free places, plus one CODE room. "Find a room" must pick the fullest public room, never the CODE room.
2. Ban the seeker from that room: the next room must be picked.
3. Delete or fill every room. "Find a room" must show the empty state, and nothing must be created. Then press "Create a public room": the room must be public, with 30 places, 50 words and medium complexity.
4. Sign out. "Find a room" must lead to the nickname-only guest form. With no room, check the empty state; with a room, the guest must be admitted as a participant.
5. While already in a room, "Find a room" must say so and link back to that room.
6. Repeat with the keyboard, without JavaScript, in FR/EN, light/dark and on a phone.
