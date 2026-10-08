# Delivery and evidence — checkpoint 1 delivered, then the final submission

Updated on **October 7, 2026, evening**: checkpoint 1 is submitted on Léa and production runs the submitted commit. Final submission: **Friday, November 13, 2026**. My own internal targets: **the first complete race by Saturday, October 10**, and **81 of the 90 requirements complete by Monday, October 19**. That is three weeks before the official deadline, to fix errors, make the product reliable and go beyond the brief. No server provided by the cégep; budget **$0 out of pocket**.

## Checkpoint 1 — delivered

| Line graded at the checkpoint | Evidence |
|---|---|
| Specification — 20 | Submitted on September 28; copy kept, never rewritten. |
| Creative process / art direction — 20 | [DEMARCHE-CREATIVE.md](../DEMARCHE-CREATIVE.md): names considered, sketches and logo, five references, palette, typefaces; 27-page art direction. |
| Architecture — 20 | [ARCHITECTURE.md](../ARCHITECTURE.md): data model, race state machine (COURSE-01), realtime ADR, bots approach; ADR-0002 (hosting) and ADR-0003 (authentication). |
| Production — 20 | HTTPS on Azure App Service with HTTP/2, Neon with versioned migrations; GitHub, Discord and local sign-in proven in production on October 7. |
| Room by code / realtime — 10 | Create a room, join it by code from the home page, live presence in two browsers (CP-06). |
| CI, language, theme, quality, requirements matrix — 10 | GitHub Actions on every push (lint, `tsc --noEmit`, unit and PostgreSQL tests, Playwright E2E, build); FR/EN and both themes on every page; Lighthouse 94–99 in performance and 100 elsewhere; [matrix](../EXIGENCES.md): 17 complete, 19 partial, 54 not done. |

Cards CP-01 to CP-07 (issues #2 to #9) are closed; the pull requests that delivered them are #10 to #24.

### Acceptance before submitting

- [x] The teacher opens the HTTPS URL outside our local session.
- [x] GitHub and Discord actually sign in; cancellation/errors are handled.
- [x] A migration rebuilds the database; data persists after a restart.
- [x] A creates, B joins by code, both see the same members without refreshing.
- [x] Double tab, invalid code and unauthenticated creation do not alter the room.
- [x] The last push ran lint, tsc --noEmit, tests; the published deployment matches the expected commit.
- [x] Language and theme work on all existing pages; final logo visible and favicon replaced.
- [x] DEMARCHE-CREATIVE complete, ARCHITECTURE with diagrams/ADR/bots, EXIGENCES with 90 IDs and honest evidence.
- [x] No committed secret; demo, teacher access and launch procedure verified.

## Final submission plan

Each remaining requirement belongs to exactly one lot. Two Claude Code sessions work in parallel, each in its own worktrees:

- **Track A** covers the server, realtime, database and interface (`apps/web`, `packages/database`).
- **Track B** covers the pure engine in `packages/domain`: no network, no database, injected clock and seed, unit tests. It also covers the load harness in `tools/load`.

Any decision computable from data lives in the engine. On a card shared by both tracks, B delivers the rule and A integrates it, validates the whole and updates the matrix row. Codex reviews the riskiest pull requests independently. Decisions D-16 to D-24 of the [requirements matrix](../EXIGENCES.md) settle the remaining ambiguities.

| Date | Target | Nature |
|---|---|---|
| October 10 | The first complete race, end to end, in two browsers, with its E2E test (F-04.0) | Internal: integration proven early |
| October 19 | 81 of the 90 requirements complete | Internal, three weeks before the deadline |
| October 24 | The nine requirements allowed to slip, if they slipped | Internal, hard limit |
| October 20–November 1 | Extras beyond the brief | Reserve, only once the mandatory scope is complete and stable |
| November 13 | Final submission | Official deadline |

| Lot | Requirements | Observable result | Track | Target |
|---|---|---|---|---|
| 0 — Upkeep | TECH-01, TECH-08 | Next.js 16.4 and React 19.3 in production; Azure cost forecast checked against the student credit; contracts of the engine for the first race path. | A + B | Oct 8 |
| 4 — The race | COURSE-01 to COURSE-11, TECH-06, PERF-02, DES-04, DES-06, SALLE-09 | **First, F-04.0:** two accounts, a room by code, a fixed text, the countdown, keystrokes validated by the server, the ranking, saved results reopened from the history. Then on that base: persisted and guarded phase transitions, recovery after a restart, refused batches, signature track at about 4 updates per second, 30 s resumption, inactivity (D-17), restart or close, phone message. | A + B | Oct 8–12 |
| 2 — Texts and measures | CONF-02 to CONF-07 | Appendix A measures and the ranking as pure functions; random words safe for minors; three measurable complexities and text options; public-domain FR/EN corpus that I validate, loaded into the database. | B, then A | Oct 8–15 |
| 1 — Guests and complete rooms | AUTH-02, AUTH-03, SALLE-03 to SALLE-08, SALLE-10, CONF-11 | A guest picks a nickname and joins; public, code and private rooms; IP-bound invitation links; kick without return; succession to the longest-present human; 10 code attempts per minute per IP. | A + B | Oct 8–14 |
| 3 — Configuration and discovery | CONF-01, CONF-08, CONF-12, JOIN-02, JOIN-03 | The host configures the race with a control for every option, and everyone sees it change live; realtime public explorer with language and complexity filters; quickplay. | A + B | Oct 10–16 |
| 5 — Bots | BOT-01 to BOT-05, CONF-10 | Five seeded levels whose documented ranges are checked, variable speed, hesitations, corrected errors, guaranteed termination, identified on the track. | B, then A | Oct 13–16 |
| 6 — Catch-up bonuses | BONUS-01 to BONUS-04, CONF-09 | Bonuses at the 25/50/75 % milestones, fired with Enter (D-16), announced on the track and to the target, consistent progress and WPM. | B, then A | Oct 15–18 |
| 7 — Results, history, profile | RES-01 to RES-05, HIST-01, HIST-02, AUTH-04 to AUTH-06, SEC-02, I18N-03, TECH-04 | Podium, full table, WPM chart for everyone and missed-keys heatmap, personal record, paginated history, bounded and validated profile photo, statistics, seed with history; every authenticated participant keeps a result. | A + B | Oct 15–18 |
| 8 — Cross-cutting quality | PERF-03, A11Y-01 to A11Y-04, I18N-01, TEST-01, TEST-02, TECH-07, SEC-01 | 30 simulated clients really sending keystrokes (first run on October 17), smooth track in a browser, axe clean on every screen in both themes, FR/EN everywhere, race E2E, audit of the host actions. | A + B | Oct 16–19 |

**Definition of done for every lot:** each delivered screen passes axe in both themes, in French and English, at 360 px and with the keyboard, and has its E2E test. Every server input has its schema. Each engine rule has tests that fail without it, and a placeholder never counts as evidence. Lot 8 then confirms instead of catching up. What F-04.0 delivers is deducted from the cards it anticipates.

**Requirements allowed to slip past October 19**, all due by October 24:

1. The bonuses: BONUS-01 to BONUS-04 and CONF-09.
2. The profile photo: AUTH-04 and SEC-02.
3. The charts: RES-03.
4. The load test: PERF-03.

The race, the rooms, guests, configuration, results, history, the rest of the profile and the bots never slip.

**Production:** a promotion on October 11, 14, 17 and 19, outside class hours, since a deployment interrupts a race in progress (D-06). Production stays functional, and the commit history stays regular.

### Beyond the brief

A reserve, not a commitment: it starts only once the mandatory scope is complete and stable, and its hours fund the mandatory scope first if that scope runs late. Each extra reuses a part the brief already requires and shows in a two-minute demo:

- **Replay a race, race my ghost:** any race from the history replays on the track from its stored series (RES-05); a ghost is a bot that replays my best run.
- **Classroom projection mode:** the spectator host goes full screen for a projector, with a giant code, a track of 30 readable from the back of the room and an animated podium.
- **Targeted practice:** from the missed-keys heatmap, a solo room with a bot at my level and a random text that includes my weak keys (CONF-07).
- **Already drawn in my art direction:**
  - sound effects, off by default;
  - reduced motion;
  - keyboard layouts for the heatmap, including the Canadian French layout used in Québec;
  - manual host transfer and following a runner on a phone;
  - "back to the room in 20 s" and rank changes on the results;
  - account and data deletion (Québec's Law 25; the audience is minors).
- **Visible engineering:** a published load test (several rooms of 30 at once, p95 latency), explainable plausibility checks shown as a "verified race" badge, an English case study.

Not planned: public profiles and social features (the audience is minors), account linking (D-14), a teacher's class space (declined by the client), several instances.

## Trajectory to November 13

| Window | Testable result | Scope |
|---|---|---|
| October 8–10 | First complete race | F-04.0 on both tracks. |
| October 11–19 | 81 requirements complete | Lots 0 to 8, four promotions to production. |
| October 20–24 | Slipped requirements closed | Only the nine named above. |
| October 20–November 1 | Beyond the brief | The reserve above; checkpoint feedback as soon as it arrives. |
| November 2–8 | Hardening and final documents | Load, security, accessibility; ARCHITECTURE with the realtime message flow and the bots ADR; IA.md with three cases from its log and my reflection; README with screenshots and the demo account. |
| November 9–12 | Freeze and submission rehearsal | Freshly cloned repository, complete seed, timed demo, case study. |
| November 13 | Submission | No feature planned that day. |

The dates are a **work plan**, not new teacher deadlines. Lots move forward as soon as they pass their criteria.

## Lightweight process

- **Tracking.** One issue per lot, with a sub-issue per slice, in the [GitHub project of the final submission](https://github.com/users/PhilJordan18/projects/3). Each card carries a status (Backlog, Analysis, Ready, In progress, Review, Done), a track, an estimate in hours and target dates.
- **Branches.** A card branches from `dev` and catches up with it by merging, never by rebasing published work. It is reviewed and tested, then merged into `dev`; `dev` is released to `main` when stable.
- **Reviews.** Architecture, security, data and UX reviews happen according to risk, in parallel on the same commit. A fix is re-reviewed on its new commit, with the diff of the changes.
- **Matrix.** A matrix row is updated by the pull request that makes its requirement observable.

## Hosting without spending

**Superseded on October 5** by D-13 and [ADR-0002](../adr/0002-hosting.md): Azure App Service (student credit) + Neon Free, accepted by the teacher. The research below is kept as the record of the options considered.

Research of October 3; no sign-up and no remote resource created.

1. **Priority option: Azure for Students.** Offer of 100 USD of credit usable over 12 months, without a card, for eligible students aged 18 and over, full-time, at an eligible institution. The school email must be verified. It is not an unlimited free server: estimate VM, disk, IP and traffic until after grading. Keep the student subscription and its limit: credit exhausted = service disabled; do not convert to Pay-As-You-Go. Technical proposal: Linux VM, containerised application, PostgreSQL on a volume and HTTPS reverse proxy. Precise configuration only after verifying the available offer. [Microsoft offer and terms](https://azure.microsoft.com/en-us/pricing/offers/ms-azr-0170p).
2. **Fallback: Render Free for Next/Socket.IO + Neon Free for PostgreSQL.** WebSocket-compatible application server, but not an administered VPS: the teacher's agreement is needed for TECH-05. Render sleeps after 15 minutes without traffic, restarts in about one minute, has an ephemeral disk and quotas; no performance evidence at 30 players before testing. No persistent images on its disk. Without a payment method, the overages described in the documentation lead to suspensions rather than a billed extension. Do not choose Render Postgres Free for the final: it expires after 30 days. Neon Free avoids this 30-day database trial, but its quotas must be monitored. [Render Free](https://render.com/docs/free), [WebSocket](https://render.com/docs/websocket), [Neon Free](https://neon.com/blog/neon-free-plan-1-gb-per-project).
3. **Oracle Always Free is not the priority option.** Card required with a possible temporary hold, VM availability not guaranteed: a bad bet if no advance payment is possible and delivery is on Monday. [Oracle FAQ](https://www.oracle.com/cloud/free/faq/).

Do not buy a domain: look for a provided DNS name or a free DNS solution compatible with HTTPS and the OAuth callbacks. No artificial keep-alive to work around a plan's sleep mode. As long as access, a covered budget and deployment are not verified, TECH-05/08 remain not done.
