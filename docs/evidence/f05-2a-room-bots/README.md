# F-05.2A — Host-managed room bots

Implementation reviewed: `1caa48c`, based on `dev` `fbf7196`.
Migration-only coordination commit: `ca956eb` (`0009_room_bots`).
Date: 28 October 2026. Local evidence only; no production or Neon check.

## Delivered slice

- Host adds, removes and changes bots among all five existing domain levels in the waiting room.
- Bots have independent roster identities, no accounts or membership/hosting privileges.
- Human and bot admission share capacity and the same room lock; spectator quota is independent.
- Authoritative revision prevents stale/repeated mutations; room changes propagate to other members.
- Public snapshot includes only bot ID and level, in the same SQL snapshot as room revision.
- FR/EN controls, square bot marker, explicit errors, keyboard focus recovery after removal.

## Commands actually run

| Command | Result |
| --- | --- |
| `npm run check:no-js` | Pass |
| `npm run typecheck` | All workspaces pass |
| `npm run lint` | All workspaces pass |
| `npm test` | Web 739, database 131, load 20, word-lists 47 pass. Domain 1180 pass; one existing generated-text test exceeded its 5 s deadline (5739 ms). |
| `npm run test -w @incision/domain -- src/text/generate.test.ts` | Isolated rerun: 65/65 pass, no timeout or test change |
| `npm run test:db -w @incision/database -- test/room-bots.db.test.ts test/membership.db.test.ts test/succession.db.test.ts` | 37/37 pass; migration replayed in fresh randomized temporary databases |
| `npm run build` | Pass |
| `npm run test:e2e -w @incision/web -- e2e/room-bots.spec.ts` | 3/3 pass (29.1 s), port 3891, dedicated database `incision_e2e_bots59a_20261028` |

The first restricted-shell unit attempt could not open local test sockets and was stopped.
The complete verification above ran with local sockets enabled, using the shared heavy-work lock.
The first browser pass used incorrect theme identifiers (`dark`/`light`); visual review caught
that Aube had not been activated. Those images were excluded. The corrected run asserts the
actual `abysse`/`aube` attributes and captures both languages at 1440, 1024, 390 and 360 px.

## Acceptance evidence

- `room-bots.db.test.ts`: all levels, edit/delete, no fabricated account; full room; independent
  spectators; concurrent human/bot last-place race; stale duplicate add; outsider/non-host and
  cross-room target refusal; all mutations refused in countdown/racing/results; last human
  departure closes the room instead of promoting a bot; SQL level constraint and cascade.
- `bot-form.test.ts`: 17 boundary cases including duplicate/missing/file inputs, invalid
  revisions, levels and IDs. `bot-actions.test.ts`: 5 authentication/budget/notification cases.
- `room-bots.spec.ts`: real authenticated actions, two browser contexts, persisted reload,
  full-room refusal/recovery, read-only member view, keyboard focus and axe at every viewport.

## Sequential reviews on `1caa48c`

- Code reviewer: OK for slice A. Domain engine unchanged; one transaction per mutation;
  snapshot and wire changes bounded. No direct writes to scores or race progress.
- Security: OK. Session identity only; host and membership reread under lock; code binds action
  to the displayed room; target scoped by room; schema validation and existing settings budget.
  No bot authentication, private history permission or random state exposed.
- DBA: OK locally. Additive generated migration, FK cascade, bounded five-level CHECK,
  indexed roster reads. Concurrent admissions and human-only succession covered by SQL tests.
  Mixed-version/rollback limitations are documented in ADR 0006; remote migration untested.
- Functional QA: OK for the delivered roster slice, with named proofs above. Race driving,
  human-plus-bot start, race results and subsequent rounds remain slice B.
- UI/UX: OK for the current waiting-room layout and D-15 adaptations. Compared screen 06
  against captured 1440/1024/390 px views, plus 360 px: tokens, unchanged logo, square marker,
  secondary controls, >=44 px targets, native labelled selects, explicit errors, no horizontal
  scroll, reduced motion, FR/EN and both themes. No redesign of the existing crew layout.

## Still incomplete

Issue #59 remains open. This slice does not schedule bots, lower the race-start threshold,
include them in race results, or qualify Arcade/bonus interactions. These require #59B and
the existing bonus cards. The pure bot engine already delivered by #58 remains intact.
No merge, deployment, CI/integration configuration change or shared recipe reset occurred.
