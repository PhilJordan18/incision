# F-03.2 — Public room explorer (B)

Card #46; requirement JOIN-02; decisions D-18 (Arcade shown, filters by language and complexity) and D-22 (visibility).
Branch `feat/03-2-public-room-explorer`, slice B of the night order of 2 November 2026.

## Dependencies

- **Stacked PR.** This branch starts from slice A (`feat/01-3-room-visibility`, PR #194), merged in by a merge commit (`9647248`). Its PR targets that branch, not `dev`, so the diff shows only this slice. This is an exception to the usual "branch from dev, PR to dev" workflow, approved for this order only.
- **Merge order.** #194 into `dev` first; then retarget this PR to `dev`; then the quickplay PR (slice C) to `dev` after this one.
- **Migration `0019_public_rooms_index`** (additive). It adds a partial index `lobbies_public_open_idx` on `(created_at, id)` where `visibility = 'public' and phase <> 'closed'`. No published migration was changed; `0018_lobby_bans` is the latest on `dev`'s line. `db:generate` reports no drift.

## What changed

- **Read (database).** `listPublicRooms` returns open PUBLIC rooms, oldest first, at most 100. Each row has the code, host's display name, phase, participants (members who race plus bots, never spectators or people who left), capacity, text language, complexity, text kind, word count and the Arcade flag. Nothing about accounts, other members, invitations, CODE or PRIVATE rooms leaves the query.
- **Feed (server).** One in-process `PublicRoomFeed`:
  - room events mark it stale;
  - while someone watches, it reads at most once per second and broadcasts only a list that differs;
  - nobody watching means no read;
  - a 15 s refresh catches changes made by another process;
  - the `/rooms` page reads through the same feed, so visitors cannot force reads.
- **Socket channel.** `publicRooms:watch` is open to anonymous visitors and rate-limited per address. Its ack and broadcasts carry only public entries (no ids, creation times or members); both are validated by Zod schemas on each side.
- **Page `/rooms`** (screen 04):
  - live table, filters as chips (language, complexity) that also work without JavaScript through a GET form;
  - status messages: live, offline, unavailable, "X of N shown";
  - Arcade rows marked;
  - "Join" goes through `/rooms/CODE` and its usual admission. A room in a race, or full, stays listed without a link.
  - The header's "Play / Jouer" link leads here, with `aria-current` on the page.

## Checks

On `e226a25` unless stated. Node 24 and a disposable local PostgreSQL 16.

| Check | Result |
|---|---|
| `check:no-js`, `lint`, `typecheck`, `build`, `db:generate` | Pass; no schema drift |
| Unit tests | web 1099, domain 1259, database 146: pass |
| Database tests | 416 pass, 9 skipped (the PgBouncer suite, which needs a pooled URL, as on `dev`). The run also reported 2 unhandled `57P01` errors when `membership.db.test.ts` dropped its database at teardown. That file is unchanged from `dev`. It passes 3 of 3 runs on its own. The cause is a teardown race in a pre-existing test, under load. This is not a failure of this slice. |
| Integration (two production processes) | 11/11 on `9647248` (no explorer flow in this suite) |
| Playwright, full suite | 198/200 on `9647248`. The 2 failures exposed a real feed bug, fixed in `e226a25` (below). |
| Playwright, explorer and visibility specs | 30/30 on `e226a25` (`public-rooms` and `room-visibility`, `--repeat-each=2`). The full suite runs again on slice C's head, which contains this branch. |

**Bug found by the full suite.** A new watcher could be given a list that differs from the last broadcast. If the rooms then changed back to that broadcast list, the next read compared equal and was never sent, so the new watcher kept a room that had become private. The feed now records the divergence and sends the next read to everyone. A unit test reproduces it; it fails on the previous code.

**Captures.** This folder holds the explorer at 1440, 1024, 390 and 360 px, light and dark, FR and EN. Each was taken after axe and the horizontal-scroll check passed in the same test.

## Reviews

| Round | Review | Verdict | Fixes |
|---|---|---|---|
| 1, `414bd70` | Code reviewer | Changes needed. Blocking: a new watcher's read swallowed a pending broadcast; the client rejected the watch ack. Major: host name length counted in UTF-16 units. | `a0bfb5a`: last *published* list kept apart; ack schema; length in code points |
| 1, `414bd70` | Security | OK. The page read the database directly (now through the feed); `current()` could bypass the throttle; Join links prefetched room pages. | `a0bfb5a` |
| 1, `414bd70` | DBA | OK. Non-finite limit, `reset enable_seqscan` in `finally`. `CREATE INDEX` without `CONCURRENTLY` accepted, as in earlier migrations. | `a0bfb5a` |
| 1, `414bd70` | UI/UX | Major: no visible ✓ on chips, filtered count not announced, no `aria-current`. Minor: alignment, colours, 360 px wrapping. | `a0bfb5a` |
| 1, `414bd70` | Functional QA | Changes needed: the same swallowed-broadcast bug, reproduced in browsers. Everything else OK, including the full suite (198 passed). | `a0bfb5a`, then `e226a25` |
| 2, `e226a25` | Functional QA, targeted (delta `414bd70..e226a25`, own build) | OK. The old watcher now converges in every replayed scenario: concurrent joins, a new visitor, a change back to the private list. Flood: 8 joins → 3 broadcasts, one per second. Chips ✓, "X of N", `aria-current` and 360 px checked in FR and EN. | Two optional minors, accepted below |

Accepted, not changed here:
- **100-room cap.** Above 100 open public rooms, the newest ones are not listed; filters and the count apply to those 100. A school-scale site stays far below. To decide later: ordering or paging.
- **Another process.** Changes made by another server process appear within the 15 s refresh, not within a second.
- **Read throttle, two edge cases (optional, QA round 2).**
  - A page or watch request that arrives just before a planned broadcast can cause a second read a few milliseconds later. Broadcasts stay at one per second.
  - While the list has never loaded (database down since boot), page loads that come one after another each try a read. Socket watches stay rate-limited.
  - Both stay bounded; neither is changed here.
- **The count query** repeats the participant count of `capacity.ts` and `settings.ts`; factoring it would touch files outside this slice.
- **For a product decision (Philippe):**
  - a "Watch" link on a room in a race (D-22, the design's "Regarder");
  - should an anonymous visitor's "Join" offer guest entry rather than sign-in?
  - should a banned account still see the room in the list? Admission refuses it, as for an unknown code.
- **Header at 360 px** wraps onto three lines (optional, ui-ux).

## Human acceptance

1. Open `/rooms` in two browsers, one signed in. Create a PUBLIC room in one: it appears in the other within about a second, without a reload.
2. Switch the room to "by code", then back to public: it leaves the list, then comes back.
3. Filter by language and complexity, with the mouse, then the keyboard. Repeat with JavaScript turned off and the "Apply filters" button.
4. Start a race: the row stays, marked in a race, without a Join link.
5. Check FR/EN, light/dark and a phone.
