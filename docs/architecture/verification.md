# Delivery and evidence — checkpoint 1, then final

Updated on **October 3, 2026**, following Philippe's clarifications: checkpoint submission on **Wednesday, October 7**, time not specified; internal target kept at **Monday, October 5**. Tuesday and Wednesday serve as a verification margin, not for adding features. Final submission: **November 13, 2026**. No server provided by the cégep; budget **$0 out of pocket**.

## What actually exists

Next.js skeleton, TypeScript/Tailwind, npm workspaces, local PostgreSQL through Compose, contribution rules and design. **Since October 5**: CI on every push and PR (lint, type check, unit tests, PostgreSQL tests, build), the custom Next.js + Socket.IO server and its Azure pipeline (CP-02), the Drizzle schema and serialised migrator (CP-03). **October 6 (CP-04, in review)**: GitHub, Discord and local sign-in with sessions revoked on sign-out over HTTP and Socket.IO, demo-account seed, FR/EN dictionaries for the existing pages, Playwright E2E in CI. **Not yet**: a production deployment of these cards, real GitHub/Discord sign-ins, rooms and realtime presence. The added documents do not replace this evidence.

| Line graded at the checkpoint | Observed situation | Closing condition |
|---|---|---|
| Specification — 20 | Submitted by Philippe; copy kept. | Do not redo the already submitted document; apply the new rules to the code. |
| Creative process / art direction — 20 | Complete art direction V3, 24 pages read; name Incision confirmed, five references, palette, typefaces and mockups present. | DEMARCHE-CREATIVE.md, evidence of human sketches, exportable logo and application in the app; adapt the rule examples that have become outdated. |
| Architecture — 20 | ARCHITECTURE.md, model, states, ADR and bots approach aligned. | Re-read against the first migration and the real prototype, readable diagrams. |
| Production — 20 | Not demonstrated. | HTTPS server, GitHub AND Discord working, real PostgreSQL and migrations. |
| Room by code / realtime — 10 | Not implemented. | Creation, admission and presence synchronised in two browsers. |
| CI, language, theme, quality, requirements matrix — 10 | Initial requirements matrix of the 90 IDs created; other elements missing/incomplete. | Workflow executed, real tests, working selectors, honest statuses. |

## Immediate critical path

These batches are verifiable units of work, not promises of duration. They can be done within the same available day; do not wait for a date to start the next one.

### CP-01 — Demonstrate execution and delivery

- Hosting decided on October 5 (D-13, [ADR-0002](../adr/0002-hosting.md)): Azure App Service + Neon, accepted by the teacher. No secret in a card, no paid conversion.
- Align Node 24, Node types, npm and the root lint/typecheck/test/build scripts.
- Install Zod/Vitest, create a few tests of real rules (code, capacity, authorisation), GitHub Actions on every push/PR.
- Run Next + Socket.IO in dev **and production**, behind HTTPS; persistent PostgreSQL. Keep a smoke test, check restarts.
- Automatic deployment from main after checks; application rollback without wiping the database. Do not provision a paid service without an approved budget.

**Output:** HTTPS URL and green CI; transport and database reachable. A published page alone does not complete the checkpoint.

### CP-02 — Identity and first migrations

- Authentication library prototype: GitHub, Discord, hashed local account; session recognised on the realtime side. Do not spend a day on home-made authentication.
- Drizzle migrations: accounts/identities, rooms/members and uniqueness constraints. Seed of isolated test accounts, no student data.
- Refusal of visitors/guests on creation and reserved actions; protection of callbacks and origins.
- Plan the two OAuth applications and their callback URLs, localhost then HTTPS.

**Output:** both OAuth sign-ins work on the public site; local credentials usable for tests. TECH-04 stays partial if the corpus/history of the final seed are not possible yet.

### CP-03 — End-to-end room slice

- An account creates a code-based room and chooses participant/spectator; six-character code.
- A second browser joins, members synchronised, departure visible. Server-side schemas and authorisation.
- One-room-per-identity constraint, double tab without duplicate, bounded capacity and invalid code refused.
- Playwright test with two contexts and local accounts; SQL concurrency test. Guest version if included, test of the signed cookie.
- A code-based prototype uses the CODE visibility, never a PRIVATE room accepting a code by mistake.

**Output:** reproducible two-browser demo in production; refusal paths verified.

### CP-04 — Visual identity, language, theme and submission

To be done progressively with CP-02/03, not only at the last hour:

- Apply the logo provided by Philippe, favicon, validated palette and typefaces; do not generate the name or the logo.
- All existing screens in FR/EN, browser default, persistent choice; two themes, system default, without flash; check at 360 px and with the keyboard.
- Add DEMARCHE-CREATIVE.md with the real evidence from the complete dossier.
- Complete the files/tests/statuses of the requirements matrix; adjust the diagram to the executed schema.
- Re-read the cleanly cloned repository, the public URL and the teacher's read access. Provide the submission file containing the GitHub and site links, as instructed by the teacher.

**Output:** checklist below satisfied; no final feature added at the expense of a checkpoint criterion.

## Acceptance before submitting

- [ ] The teacher opens the HTTPS URL outside our local session.
- [ ] GitHub and Discord actually sign in; cancellation/errors are handled.
- [ ] A migration rebuilds the database; data persists after a restart.
- [ ] A creates, B joins by code, both see the same members without refreshing.
- [ ] Double tab, invalid code and unauthenticated creation do not alter the room.
- [ ] The last push ran lint, tsc --noEmit, tests; the published deployment matches the expected commit.
- [ ] Language and theme work on all existing pages; final logo visible and favicon replaced.
- [ ] DEMARCHE-CREATIVE complete, ARCHITECTURE with diagrams/ADR/bots, EXIGENCES with 90 IDs and honest evidence.
- [ ] No committed secret; demo, teacher access and launch procedure verified.

## Trajectory to November 13

| Target window | Testable result | Scope |
|---|---|---|
| Now → Monday, October 5 | Usable public foundations | CP-01 to CP-04. Server/OAuth availability is the main risk. |
| October 6–7 | Verification and submission on Wednesday | Buffer, production tests, submission links; no additional priority feature. |
| October 8–11 | Complete rooms and texts | Three visibilities, IP/session invitations, kicks/succession, explorer/quickplay, corpus/dictionaries and configuration. |
| October 12–18 | First real end-to-end race | States, 3 s, typing/correction, server authority, 30 s abandonment/resumption, end/ranking. |
| October 19–25 | Durable results and bots | MPM series, heatmap, profile/history, five deterministic bots and tests. |
| October 26–November 1 | Bonuses and functional polish | Three bonuses, thresholds/idempotence, variable targets, remaining settings, bots ADR. |
| November 2–8 | Hardening | Load of 30, Lighthouse, accessibility, mobile, security, E2E, errors and operations. |
| November 9–12 | Freeze and submission rehearsal | Clean repository, complete seed, README/screenshots, verified requirements matrix, IA.md with three real cases, demo/URL and backup. |
| November 13 | Submission | Buffer reserved for incidents, no ambitious feature planned that day. |

The dates are a **work plan**, not new teacher deadlines. Move batches forward as soon as they pass their criteria; keep some margin given Philippe's classes and work.

## Lightweight process

One short card per slice: goal, official IDs, data/permissions, observable criteria, refusal cases and evidence. Branch from dev; review/test, then merge into dev; release to main when stable. Architecture, security, data and UX reviews happen according to risk, without seven mandatory agents in series.

Keep the portfolio vision in the quality of the engine, the reproducible tests and the distinctive track. Defer social network, teacher's class, MFA, distributed infrastructure and other extensions until the graded scope is covered.

## Hosting without spending

**Superseded on October 5** by D-13 and [ADR-0002](../adr/0002-hosting.md): Azure App Service (student credit) + Neon Free, accepted by the teacher. The research below is kept as the record of the options considered.

Research of October 3; no sign-up and no remote resource created.

1. **Priority option: Azure for Students.** Offer of 100 USD of credit usable over 12 months, without a card, for eligible students aged 18 and over, full-time, at an eligible institution. The school email must be verified. It is not an unlimited free server: estimate VM, disk, IP and traffic until after grading. Keep the student subscription and its limit: credit exhausted = service disabled; do not convert to Pay-As-You-Go. Technical proposal: Linux VM, containerised application, PostgreSQL on a volume and HTTPS reverse proxy. Precise configuration only after verifying the available offer. [Microsoft offer and terms](https://azure.microsoft.com/en-us/pricing/offers/ms-azr-0170p).
2. **Fallback: Render Free for Next/Socket.IO + Neon Free for PostgreSQL.** WebSocket-compatible application server, but not an administered VPS: the teacher's agreement is needed for TECH-05. Render sleeps after 15 minutes without traffic, restarts in about one minute, has an ephemeral disk and quotas; no performance evidence at 30 players before testing. No persistent images on its disk. Without a payment method, the overages described in the documentation lead to suspensions rather than a billed extension. Do not choose Render Postgres Free for the final: it expires after 30 days. Neon Free avoids this 30-day database trial, but its quotas must be monitored. [Render Free](https://render.com/docs/free), [WebSocket](https://render.com/docs/websocket), [Neon Free](https://neon.com/blog/neon-free-plan-1-gb-per-project).
3. **Oracle Always Free is not the priority option.** Card required with a possible temporary hold, VM availability not guaranteed: a bad bet if no advance payment is possible and delivery is on Monday. [Oracle FAQ](https://www.oracle.com/cloud/free/faq/).

Do not buy a domain: look for a provided DNS name or a free DNS solution compatible with HTTPS and the OAuth callbacks. No artificial keep-alive to work around a plan's sleep mode. As long as access, a covered budget and deployment are not verified, TECH-05/08 remain not done.
