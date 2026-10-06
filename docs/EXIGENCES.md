# Requirements matrix — final brief

Status observed on **October 2, 2026**, updated on **October 3** for the complete art direction, Philippe's decisions and hosting. The **90 official identifiers** below come from [Web-V-Travail-de-session.pdf](Web-V-Travail-de-session.pdf). This requirements matrix replaces the specification's old IDs for tracking implementation, without modifying the [submitted specification](cahier-des-charges-incision.pdf).

**Statuses:** complete = behaviour delivered and verified; partial = only part of it exists; not done = no verified implementation. These labels translate the original French statuses one to one: complet → complete, partiel → partial, non fait → not done. A decision described in the architecture does not make its feature complete. "—" in the tests column means **no existing associated test**, not a passing test. The tests mentioned in the notes are still to be written.

## Technical

| ID | Expected (summary) | Status | Main existing files | Associated tests | Notes and choices |
|---|---|---|---|---|---|
| TECH-01 | Next.js App Router and React, current stable version | partial | apps/web/package.json; apps/web/src/app | — | Skeleton installed; stable version to be re-checked at delivery. |
| TECH-02 | TS only, strict, no explicit any | complete | apps/web/tsconfig.json; tsconfig.base.json; apps/web/eslint.config.ts; packages/domain/eslint.config.ts; package.json (`check:no-js`) | CI on every push: `check:no-js`, lint (`no-explicit-any` and `ban-ts-comment` as errors), `tsc --noEmit` | `strict` in every workspace; `no-explicit-any` pinned as error in every workspace's ESLint config; tracked `.js/.jsx/.mjs/.cjs` files fail CI (case-insensitive). Ongoing constraint, enforced automatically. |
| TECH-03 | Tailwind CSS | partial | apps/web/src/app/globals.css; apps/web/postcss.config.json | — | Integrated in the template, not yet applied to the product interface. |
| TECH-04 | PostgreSQL, ORM, migrations, seed of texts/accounts/history | partial | packages/database/src/schema; packages/database/drizzle; packages/database/src/migrations.ts; packages/database/src/identity/demo-accounts.ts; packages/database/scripts/seed-demo.ts; .github/workflows/deploy.yml; .github/workflows/seed-demo.yml | packages/database/test/*.db.test.ts on PostgreSQL 17 in CI (demo-accounts.db.test.ts: idempotent, never overwrites) | Drizzle + PostgreSQL, versioned migrations, serialised migrator run before deployment. Idempotent demo-account seed (local, CI, manual production workflow on approval); texts and history with the game tables. |
| TECH-05 | Server/VPS, public HTTPS at the checkpoint and at the final | partial | docs/adr/0002-hosting.md; docs/DEPLOYMENT.md; .github/workflows/deploy.yml; apps/web/server.ts | `npm run smoke` (health + WebSocket), run by the Deploy workflow | D-13: Azure App Service + Neon, accepted by the teacher on October 5. Pipeline and runtime ready and tested locally in production mode; first production deployment pending. |
| TECH-06 | Realtime progress, free choice of transport | partial | apps/web/server.ts; apps/web/src/server/realtime/ | apps/web/src/server/realtime/*.test.ts; smoke WebSocket ping | Socket.IO served by the custom server, same-origin handshake only; progress visualisation not built yet. |
| TECH-07 | Schemas on all server inputs | partial | apps/web/src/server/config.ts; apps/web/src/server/realtime/ping.ts; apps/web/src/server/auth; apps/web/src/app/(auth)/sign-in/actions.ts; apps/web/src/components/preferences/actions.ts; apps/web/src/app/(site)/_home/actions.ts | config.test.ts; ping.test.ts; session-token.test.ts; credentials.test.ts | Zod validates the server environment, the ping event, JWT claims, credentials input, the sign-in form, the provider name and the language choice; the room code goes through the domain rule `parseRoomCode`. Room and race events come with their cards. |
| TECH-08 | Server at own expense or cégep; other services free | partial | docs/adr/0002-hosting.md; docs/DEPLOYMENT.md | — | App Service paid by Philippe's Azure for Students credit, never converted to a paid plan; Neon on its free plan; nothing to pay for grading. Complete once production runs within these limits; the Azure health check must not query Neon (free compute quota). |
| TECH-09 | GitHub Actions: lint, tsc without emit, unit tests on every push | complete | .github/workflows/ci.yml; package.json | First green run: [37387851342](https://github.com/PhilJordan18/incision/actions/runs/37387851342) | Every push and PR: JS guard, lint, `tsc --noEmit` (after `next typegen`), Vitest, build. Deployment after success: CP-02. |
| TECH-10 | Complete .env.example, no committed secret | partial | .env.example; .gitignore; docs/DEPLOYMENT.md | — | Database (pooled and direct), APP_URL and PORT documented with placeholders; OAuth and session variables come with authentication (CP-04). |

## Design

| ID | Expected (summary) | Status | Main existing files | Associated tests | Notes and choices |
|---|---|---|---|---|---|
| DES-01 | Original name created by the student without AI, written process | partial | docs/da/da_incision.pdf | — | Incision confirmed by Philippe on October 3; process present pp.10–11; Markdown entry missing. |
| DES-02 | Student logo without AI, sketches, app and favicon | partial | docs/da/da_incision.pdf; apps/design/logo; apps/web/public/brand; apps/web/src/app/icon.svg | e2e/design.spec.ts (logo and favicon served) | Final logo drawn by Philippe from his pen sketches (pp.15–17, notebook p.16), SVG exports copied unchanged into the app: header and sign-in logo (wordmark white on Abysse, black on Aube), favicon = red icon. The abandoned first sketch made with AI is kept as a trace (p.14). `docs/DEMARCHE-CREATIVE.md` entry remaining. |
| DES-03 | Prior art direction, moodboard of 3–5 refs, palette, typefaces | partial | docs/da/da_incision.pdf; apps/design | — | Final version of October 6, 27 pages: five references (pp.5–9), palette p.19, typefaces p.20, motion p.21; code-ready tokens, components and 17 screens in `apps/design/`. Markdown entry and its application in the app (CP-05) remaining; adaptations to the brief in D-15. |
| DES-04 | Own design, signature track, no generic template | partial | apps/design; apps/web/src/app; apps/web/src/components | e2e/design.spec.ts | Own design applied to the existing pages (night palette, Red Line mist, orbits and routes, Big Shoulders / Instrument Serif / Geist); the race track itself comes with the race screens. |
| DES-05 | Light/dark, system default, flash-free selector | complete | apps/web/src/theme; apps/web/src/app/layout.tsx; apps/web/src/components/preferences/theme-toggle.tsx; apps/design/tokens.css | theme.test.ts; e2e/design.spec.ts (system light → Aube before React, server-rendered choice, persisted) | System preference by default; an explicit Abysse/Aube choice is kept in a cookie and rendered by the server; an inline script applies the system theme before the first paint. |
| DES-06 | Pages ≥360 px; physical keyboard message instead of the race on mobile | partial | apps/web/src/app | e2e/design.spec.ts (no horizontal scroll at 360 px on every page) | Existing pages fit 360 px; the physical-keyboard message comes with the race screens. |

## Identity

| ID | Expected (summary) | Status | Main existing files | Associated tests | Notes and choices |
|---|---|---|---|---|---|
| AUTH-01 | GitHub AND Discord OAuth; local credentials allowed | partial | apps/web/src/auth.ts; apps/web/src/server/auth; apps/web/src/app/(auth)/sign-in; packages/database/src/identity/accounts.ts | session-callbacks.test.ts (simulated OAuth sign-ins); accounts.db.test.ts (identity by provider + subject, concurrent first sign-ins, no orphan); e2e/oauth-simulated.spec.ts (authorisation URL, scopes); e2e/sign-in.spec.ts and session.spec.ts (local credentials) | Auth.js v5, JWT sessions bound to `accounts.session_version` (ADR-0003). GitHub without scope, Discord `identify`, no email. Local credentials complete; **real GitHub and Discord sign-ins not yet proven** locally or in production: complete only after those manual trials. |
| AUTH-02 | Guest with a 3–20 character nickname and a signed cookie | not done | — | — | Identity distinct from the socket; decisions D-04, D-07. |
| AUTH-03 | Guest without room creation, photo or persistent history | not done | — | — | Generated avatar; no transfer of guest history to the account. D-03/D-08. |
| AUTH-04 | JPEG/PNG/WebP photo ≤2 MB, server validation, resizing | not done | — | — | Local persistent storage possible, no paid service needed. |
| AUTH-05 | Editing the display name | not done | — | — | Separate from the local identifier and the OAuth subject. |
| AUTH-06 | Profile: best/average MPM, accuracy, races/wins, curve | not done | — | — | Personal profile first; social network outside the graded scope. |

## Rooms

| ID | Expected (summary) | Status | Main existing files | Associated tests | Notes and choices |
|---|---|---|---|---|---|
| SALLE-01 | An account creates a room and becomes the host as participant or spectator | not done | — | — | Checkpoint priority. |
| SALLE-02 | Unique 6-character code without 0/O/1/I/L | partial | packages/domain/src/rooms/room-code.ts; packages/database/src/schema/rooms.ts; packages/database/src/rooms/create-room.ts | room-code.test.ts; schema.db.test.ts; create-room.db.test.ts | Format rule and database uniqueness with the same alphabet; collisions retry the creation transaction (D-01). Joining by code comes with CP-06. |
| SALLE-03 | PUBLIC / CODE / PRIVATE and the matching access | not done | — | — | PRIVATE always refuses the code alone. |
| SALLE-04 | Strong invitations, tracking, IP binding, resumption, revocation | not done | — | — | 32 random bytes; IP + session to distinguish a class behind NAT; D-02. |
| SALLE-05 | Capacity of 2–30 participants, bots included, spectators excluded | not done | — | — | Replaces 50 humans; room lock on admission. |
| SALLE-06 | Only one room per person, database constraint, no duplicate through tabs | partial | packages/database/src/schema/rooms.ts; packages/database/src/rooms/create-room.ts | schema.db.test.ts; create-room.db.test.ts (concurrent creations) | Unique index on the active membership of an account (D-04), reported as ALREADY_IN_ROOM. Guests, the offer to leave and tab handling come with CP-06. |
| SALLE-07 | Kicking a participant/spectator, readmission forbidden | not done | — | — | Ban by identity and revocation of the links; not by IP for an entire class. |
| SALLE-08 | Succession to the most senior connected human, otherwise closure | not done | — | — | Present guest eligible under interpretation D-03; no preferred successor. |
| SALLE-09 | Admission only while waiting or at results | not done | — | — | No new spectator during a race; a member's reconnection is a separate case. |
| SALLE-10 | Limit code attempts per IP | not done | — | — | Proposed initial value 10/min; known proxy, tests for exceeding the limit. |

## Joining

| ID | Expected (summary) | Status | Main existing files | Associated tests | Notes and choices |
|---|---|---|---|---|---|
| JOIN-01 | Code field from the home page | partial | apps/web/src/app/(site)/_home | e2e/design.spec.ts (domain rule, translated errors, redirect) | The home field checks the code with the domain rule on the server and sends the visitor to `/rooms/<code>`; admission comes with CP-06. |
| JOIN-02 | Realtime public explorer, data and language/complexity filters | not done | — | — | Development after the by-code slice. |
| JOIN-03 | Quickplay to the fullest room, then the oldest | not done | — | — | D-05; if none: offer creation to the account, empty state to the guest. |

## Configuration

| ID | Expected (summary) | Status | Main existing files | Associated tests | Notes and choices |
|---|---|---|---|---|---|
| CONF-01 | No timer, or 30 seconds to 10 minutes | not done | — | — | Former automatic estimate not required and deferred. |
| CONF-02 | FR/EN text independent of the interface | not done | — | — | Two separate parameters. |
| CONF-03 | Coherent corpus in the database or random dictionary words | not done | — | — | Provenance of the corpora/dictionaries to be provided. |
| CONF-04 | Configurable word count | not done | — | — | D-10: cut at word boundaries; safety limit documented before implementation. |
| CONF-05 | Three complexities with measurable criteria | not done | — | — | D-10 defines the initial criteria. |
| CONF-06 | Punctuation, numbers, capitals, FR accents | not done | — | — | Deterministic transformation before the snapshot; test all supported combinations. |
| CONF-07 | Included/excluded characters in random mode; decision for coherent mode | not done | — | — | Disabled in coherent mode; refuse an impossible random combination, D-10. |
| CONF-08 | Mandatory or free correction | not done | — | — | Same server validator, explicit counter rules D-09. |
| CONF-09 | Bonuses enabled or not | not done | — | — | No bonus awarded if disabled. |
| CONF-10 | Add/remove bots, choose the level | not done | — | — | Five profiles and shared capacity. |
| CONF-11 | Configurable visibility and capacity | not done | — | — | Do not accept a capacity lower than the participants present. |
| CONF-12 | Configuration synchronised for everyone | not done | — | — | Monotonic revision, snapshot and host authorisation. |

## Race

| ID | Expected (summary) | Status | Main existing files | Associated tests | Notes and choices |
|---|---|---|---|---|---|
| COURSE-01 | Explicit states and documented machine | partial | docs/ARCHITECTURE.md; docs/architecture/state-machines.md | — | Diagram present; engine not implemented. |
| COURSE-02 | Host start: at least 2 participants including 1 human | not done | — | — | Bots counted, spectators not; no mandatory ready status added. |
| COURSE-03 | Synchronised 3,2,1 countdown; text revealed at its start | not done | — | — | Replaces the former 5-second countdown. |
| COURSE-04 | Input, feedback, live MPM/accuracy, paste disabled | not done | — | — | Paste blocked on the UI side, validation/anti-jump on the server side. |
| COURSE-05 | Track with avatars/names/MPM, local player, spectators, ~4 updates/s | not done | — | — | Interpolation; vertical track from the art direction. |
| COURSE-06 | Authoritative server for time/progress/rank/bonuses | not done | — | — | Sequenced batches and plausibility limits; no absolute anti-cheat guarantee. |
| COURSE-07 | Abandonment with confirmation | not done | — | — | Terminal for the round. |
| COURSE-08 | Resumption within 30 seconds, otherwise abandonment | not done | — | — | D-06, boundary tests and race finished before resumption. |
| COURSE-09 | End when all have finished/abandoned or the timer is reached | not done | — | — | Idempotent finalisation. |
| COURSE-10 | Finishers by arrival, timed out by progress, abandonments last | not done | — | — | MPM no longer ranks finishers; D-09. |
| COURSE-11 | Results: restart/configure/close; others stay/leave | not done | — | — | Persistent room, distinct rounds. |

## Bots and bonuses

| ID | Expected (summary) | Status | Main existing files | Associated tests | Notes and choices |
|---|---|---|---|---|---|
| BOT-01 | Five levels with documented parameters | not done | — | — | Initial profiles described in ARCHITECTURE, engine missing. |
| BOT-02 | Variable speed, hesitations and difficulty | not done | — | — | Seeded simulation; no constant cadence. |
| BOT-03 | Errors, correction cost, respect of the mode | not done | — | — | Same business engine as humans. |
| BOT-04 | Visual identification and bonus/malus application | not done | — | — | No score privilege for a bot. |
| BOT-05 | Determinism by seed and unit tests | not done | — | — | Injected seed and clock, repeatability tests planned. |
| BONUS-01 | Award to trailing players at the 25/50/75% thresholds, max 3 | not done | — | — | D-11: tied last players or gap strictly >25 points. |
| BONUS-02 | At least 3 types, help and slowdown | not done | — | — | Proposal: -3 words, +3 words and 3 s fog; D-11. |
| BONUS-03 | Visual announcement of the activation and the target | not done | — | — | Not only an audio announcement. |
| BONUS-04 | Consistent progress/MPM if the length is changed | not done | — | — | Effective target, only real keystrokes counted; D-09/D-11. |

## Results and history

| ID | Expected (summary) | Status | Main existing files | Associated tests | Notes and choices |
|---|---|---|---|---|---|
| RES-01 | Podium of the top three | not done | — | — | Show only the existing places if there are two participants. |
| RES-02 | Complete table MPM/gross/accuracy/errors/time/status/bonuses | not done | — | — | Three official statuses, fields kept in the results. |
| RES-03 | MPM curve for everyone and personal map of missed keys | not done | — | — | Series and aggregated errors planned, not computed from a final score alone. |
| RES-04 | Personal record indicator | not done | — | — | D-12: records on finished races, segmented with/without bonuses and by error mode. |
| RES-05 | Results of connected humans persisted, MPM series included | not done | — | — | D-08: snapshots of the others to render the complete race. |
| HIST-01 | Paginated personal history of finished races | not done | — | — | Account/race index, no unbounded list. |
| HIST-02 | Full redisplay of a results page | not done | — | — | Immutable snapshot independent of the current lobby. |

## Languages, tests, performance, accessibility and security

| ID | Expected (summary) | Status | Main existing files | Associated tests | Notes and choices |
|---|---|---|---|---|---|
| I18N-01 | Whole UI in FR/EN, errors/empty states/metadata included | partial | apps/web/src/i18n; apps/web/src/app; apps/web/src/components | locale.test.ts (negotiation, identical keys); e2e/sign-in.spec.ts, e2e/design.spec.ts (FR and EN pages, errors, titles) | Typed FR/EN dictionaries (French with tutoiement, design tone); every existing page, its errors, the 404, the error boundaries and the metadata are translated; the global error page is bilingual. Each new screen must keep this. |
| I18N-02 | Selector everywhere, choice kept, browser default | complete | apps/web/src/components/preferences; apps/web/src/i18n | locale.test.ts; e2e/design.spec.ts (switch, persisted, metadata) | FR/EN selector in the header of every page (and on the sign-in screen); choice kept in a cookie, browser language by default, French otherwise. |
| I18N-03 | Dates and numbers according to the locale | not done | — | — | Use Intl and FR/EN tests. |
| TEST-01 | Unit tests of the rules | partial | packages/domain/src; apps/web/src/server; packages/database/src | Vitest in CI (domain, web server, database) | Room code, login and display-name rules, server configuration, realtime handshake and health, password hashing, session checks, rate limits, socket sessions; business rules of the game still to come. |
| TEST-02 | Playwright E2E | partial | apps/web/playwright.config.ts; apps/web/e2e | Playwright in CI on the production build | Authentication flows, including two independent browser contexts for sign-out on every device; room flows with CP-06. |
| TEST-03 | E2E through username/password | complete | apps/web/e2e; apps/web/e2e/prepare-database.ts; packages/database/src/identity/demo-accounts.ts | e2e/sign-in.spec.ts, e2e/session.spec.ts in CI | Disposable database rebuilt and seeded at every run; sign-in, generic error, rate limit, keyboard, protected page, sign-out, refused cookies. OAuth sites are never automated. |
| PERF-01 | Lighthouse ≥90 in every category on the home page | not done | — | — | Production measurement to keep; no presumed score. |
| PERF-02 | Limited progress traffic, no SQL per keystroke | not done | — | — | Proposal: 10 sends/s/player, batches, server memory. |
| PERF-03 | Smooth track at maximum capacity | not done | — | — | 30-participant test; separate spectator quota if needed and documented. |
| A11Y-01 | WCAG AA contrast in both themes | partial | apps/design/tokens.css; apps/web/src | e2e/design.spec.ts (axe WCAG 2.1 A/AA, Abysse and Aube) | No axe violation, contrast included, on every existing page in both themes; to repeat on each new screen. |
| A11Y-02 | Semantic HTML for actions/links/headings/regions/tables | partial | apps/web/src/app; apps/web/src/components | e2e/design.spec.ts (axe) | header/nav/main/footer, real buttons, labelled groups, one h1 per page; to repeat on each new screen. |
| A11Y-03 | Image alternatives, field labels | partial | apps/web/src/components/brand; apps/web/src/app | e2e/design.spec.ts (axe) | Decorative SVGs hidden, logo link labelled, every field labelled, errors tied by aria-describedby with a sign, never colour alone. |
| A11Y-04 | Keyboard navigation and visible focus | partial | apps/design/tokens.css; apps/web/src/components/submit-button.tsx | e2e/sign-in.spec.ts (keyboard flow) | Skip link, 3 px Moi focus ring, ≥44 px targets, pending buttons keep focus, focus moves to the first invalid field. |
| SEC-01 | Server authorisation of every host action | partial | apps/web/src/server/auth/session.ts; apps/web/src/app/(site)/account/actions.ts; apps/web/src/server/realtime/socket-server.ts | socket-server.test.ts; e2e/session.spec.ts | Groundwork: protected page and server action check the session on the server; protected socket events re-check expiry, revocation and origin. Host actions come with rooms (CP-06). |
| SEC-02 | Upload: size and real type checked on the server | not done | — | — | Decoding/re-encoding, no trust in the extension or the declared MIME type. |
| SEC-03 | Suitable password hash, no plaintext stored/logged | complete | packages/database/src/identity/password.ts; apps/web/src/server/auth/credentials.ts; apps/web/src/server/auth/log.ts | password.test.ts; credentials.test.ts; log.test.ts; schema.db.test.ts (hash format check) | Async scrypt N=2^15, r=8, p=3, random salt, constant-time check, strict bounded parser plus database shape check; decoy work for unknown logins, generic error; limits counted before any password check (5 failures per login and address, 50 per login, 100 per address per 15 min, 8 checks at once); logs carry error types only. |

## Deviations from the submitted specification

| Former choice | New priority rule |
|---|---|
| Reference load of 50 humans | Product capacity of 2..30 participants; bots included, spectators excluded (SALLE-05). A higher load remains a possible internal test, not a new promised capacity. |
| Resumption up to 5 minutes; 5-second countdown | 30 seconds and 3 seconds (COURSE-08/03). |
| Finishers ranked by net MPM | Finishers ranked by arrival time (COURSE-10); Appendix A formulas. |
| Four bots | Five levels and determinism by seed (BOT-01/05). |
| Guest with photo and recoverable history | Generated avatar, no persistent personal history (AUTH-03). |
| Private room accessible by code; spectator admitted during a race | Three visibilities; private by link only; admissions outside races only. |
| Invitation simply consumed | Bound to an IP at first use; resumption by the holder; revocation and closure (SALLE-04). |
| Chosen successor or system host | Most senior connected human, otherwise closure (SALLE-08); quickplay offers creation to the account (JOIN-03). |
| Spectator phone | Message recommending a physical keyboard instead of the race on mobile (DES-06). |
| OAuth postponed until after the checkpoint | GitHub and Discord required by AUTH-01 and §7.1. |

Kept without widening: TypeScript/Next/React/Tailwind, PostgreSQL/Drizzle, server validation, CI, agreed automatic deployment, visual inspiration and vertical track. Deferred: estimated timer, text typed in by the host, public profiles, recovery of guest history, voluntary cancellation during a race, other ungraded extras. No rewrite of the already graded specification.

## Interpretation choices — brief §2.2

These decisions are project choices, not statements attributed to the teacher. They will be tested with their features; a clarification from the teacher will explicitly replace them.

- **D-01 — Codes.** Unique even among retained rooms; cryptographic generation and retry on collision. Unambiguous alphabet, input normalised to uppercase. Initial limit of 10 attempts/IP/minute, messages that do not disclose private rooms.
- **D-02 — Invitations.** 256-bit token, digest in the database; first use bound to the IP and to the member/session. This prevents two students behind the same IP from sharing an invitation. Reconnection by the same identity and IP; another IP is refused in accordance with the text. Links valid as long as the room is open and they are not revoked; no arbitrary 24 h expiry while the room exists.
- **D-03 — Succession.** "Connected human" means an active network presence, account or guest. AUTH-03 forbids the guest from creating, not from inheriting. The most senior human becomes the host; otherwise closure. Point to clarify with the teacher if their intent was "authenticated account"; no prototype dependency requires waiting for this answer.
- **D-04 — Identity.** An account or a guest session can occupy only one room; partial unique indexes in the database. A cleared cookie does not make it possible to recognise an anonymous person. Multi-tab = same member, not extra capacity. Guest nickname of 3..20 Unicode characters, normalised with NFKC/trim; local canonicalisation in lowercase, accents kept. No change to the global nickname because of a local collision.
- **D-05 — Quickplay.** "Close to its capacity" = fewest free participant spots, then oldest room, then stable ID. Revalidate phase/capacity at admission time; try another candidate in case of concurrency. Do not create a room automatically without an action from the account.
- **D-06 — Resumption.** 30-second grace period after the last socket is lost; resumption accepted up to and including the deadline. If the race ends on the timer before the expiry, timed-out status; otherwise abandonment at the deadline. For exactly equal deadlines, the race timer takes precedence. Host disconnection: same grace period, then succession. Complete process crash: race interrupted, no promise of exact resumption and no fake results.
- **D-07 — Sessions and retention.** Guest: expiry after 24 h of inactivity, deletion after the end of presence; room/invitation/ban data purged no later than 24 h after closure. Account session: 24 h from sign-in, never extended by activity, no "remember me"; sign-out revokes every session of the account through `accounts.session_version` (ADR-0003). Post-grading policy to be settled before real use in a school.
- **D-08 — Guests and charts.** No guest profile or personal history. For HIST-02/RES-03, the results recorded for an account keep the series of all entrants; the guest is anonymised, with no link to their cookie, and is not searchable. The heatmap remains personal. A guest sees their results in memory as long as the room shows them, with no later history.
- **D-09 — Measurement.** Count typed characters (spaces included), not navigation/deletion keys. A wrong insertion counts as an error even if corrected; a new correct insertion counts as a correct keystroke. Use the same normalised Unicode segmentation for the target, the input and the counters. In free mode, an accepted wrong character advances the server-validated offset without increasing correct keystrokes; this validated position determines progress/finish, with accuracy penalising the errors. In mandatory correction mode, no advancing beyond the error. Zero keystrokes/zero time: display zero, never NaN/Infinity. Exact rank tie-break: accuracy then stable ID, after the three imposed groups and their main criterion.
- **D-10 — Texts.** Included/excluded characters disabled in coherent mode; punctuation/numbers/case/accents transformations applied before the snapshot. Word count measured as space-separated tokens after normalisation; choose/cut a passage to the requested number, refuse if no compatible content exists. Random: exclude the forbidden characters, guarantee the requested characters in the result, refuse an impossible configuration. Initial criteria outside options: easy, words ≤5 letters and common vocabulary; medium ≤9 letters and common/extended vocabulary; hard allows words >9 letters and rare vocabulary. The frequency lists, length limits and exact metrics will be versioned with the corpus before CONF-05 is declared complete.
- **D-11 — Bonuses.** At each first crossing of 25/50/75% by the leader, evaluate the active entrants: tied last, or more than 25 progress points behind. At most one award per entrant/milestone, three in total; no bonus if nobody is really behind. Manual activation by default, automatic option inherited from the specification. Three proposed effects: remove up to 3 not-yet-started words from one's own text; add 3 words to the active leader; fog over the leader's upcoming words for 3 seconds. Effects forbidden on a terminal result, no already typed word removed, a text keeps at least its part in progress; an activation that no longer has a valid target is refused. Bots subject to the same rules. Crossings memorised to avoid duplicates after progress goes back; seeded pseudo-random selector, temporary effects not stacked beyond their initial duration.
- **D-12 — Records.** Personal MPM record on finished races, separated with/without bonuses and by error mode so as not to compare incompatible conditions. Profile aggregates explicitly labelled; no school ranking and no automated judgement of a student.
- **D-13 — Hosting.** TECH-05 names a VPS; Incision runs on Azure App Service (Linux, Node 24, one B2 instance) with PostgreSQL on Neon's free plan, paid by Philippe's student credit. The teacher accepted this managed server for TECH-05 on October 5, 2026. Details and consequences in [ADR-0002](adr/0002-hosting.md).
- **D-14 — Identifiers and names.** Local logins are 3–32 ASCII letters, digits, `_` or `-`, unique case-insensitively (`login_canonical = lower(login)`, checked by PostgreSQL). Display names are 1–40 characters after NFKC normalisation and whitespace collapsing; uniqueness inside a room compares the lowercase NFKC form, accents kept. Invisible or blank-looking characters are refused (control, format, private-use, unassigned and default-ignorable characters, blank glyphs such as blank braille, a leading combining mark), so emoji built with a zero-width joiner or a variation selector (e.g. 👩‍💻, ❤️) are refused too: an explicit checkpoint limitation, not a teacher requirement. Look-alike letters from other scripts remain allowed, and a spacing accent is refused at the start of a name (NFKC turns it into a combining mark) but accepted elsewhere. No email address is stored anywhere. At the checkpoint, a GitHub sign-in and a Discord sign-in create two distinct accounts: no automatic merge by name or email, and no account linking promised.
- **D-15 — Design source and final brief.** The art direction and `apps/design/` were drawn before the final brief, mostly from the client's words. They are the visual source of truth (tokens, typefaces, components, screens); the brief and this matrix prevail for product rules: 6-character room code (SALLE-02); 2–30 participants (SALLE-05), the track and the system staying readable up to 50 runners as a safety margin; 3-2-1 countdown (COURSE-03); 30-second reconnection (D-06); five bot levels (BOT-01); no mandatory ready status (COURSE-02); a physical-keyboard message instead of the race on phones (DES-06); visibilities PUBLIC / CODE / PRIVATE, PRIVATE refusing the code alone (SALLE-03). Speed reads MPM in French and WPM in English (same measure). Checkpoint adaptations: no sign-up tab and no "remember me" (24 h sessions, D-07), guest link hidden until AUTH-02, navigation limited to existing pages, no invented figures on the home page, routes kept in English (`/sign-in`, `/account`), local logins follow D-14 (no `.`), the "sea rises" loader postponed. Google Fonts now ships "Big Shoulders Display" inside the "Big Shoulders" family: the app loads that family (same design, weights 800 and 900). Accessibility over two design values, **to be approved by Philippe**: the primary button keeps `action` on hover and is underlined, because white on `ligne` is 4.0:1 (below AA 4.5:1); text fields are bordered with `voile` (≥ 3:1 in both themes, as the design's own checklist and WCAG 1.4.11 require) instead of `houle` (about 1.5:1). The home page's blue glow of screen 01 (`rgba(34,82,150,.35)`) is not a token and is left out until one is added to `tokens.css`. Philippe's design files are never modified; adaptations are recorded here.

## Watch points not resolved by code

1. **Complete art direction V3 received:** 24 pages read on October 3. The chosen direction stays intact. Adapt the old examples in the product: 50/32 → maximum of 30 participants; 5→1 → 3→1 for digits and sounds; code example B7K4P → six characters. The "ready" orbits remain a visual idea, not an additional imposed start condition. The other, faded runners must remain identifiable/viewable; the system theme remains the technical default. DEMARCHE-CREATIVE.md, human sketches, logo exports and sound sources still to be completed. The PDF is not modified.
2. **Name confirmed:** Philippe keeps **Incision** on October 3, distinguishes his product from Incision Academy and does not want a rename. Decision recorded; no longer treat this topic as a development blocker. The research already recorded remains a trace, not a validation of DES-01 by the teacher nor a legal conclusion.
3. **Hosting:** resolved by D-13 on October 5: Azure App Service (student credit) + Neon Free, accepted by the teacher. Credit and Neon quotas must be monitored until grading ([DEPLOYMENT.md](DEPLOYMENT.md#costs)).
4. **OAuth:** create/configure the GitHub and Discord applications and their localhost/production callbacks. Never put their secrets in the cards or the repository.

## Maintaining the requirements matrix

Each card cites the official IDs, an observable result, the expected refusals and its tests. On merge, replace the projected files with the real paths and the "—" with the tests actually run. Design alone does not validate features. The four mandatory final documents are ARCHITECTURE, EXIGENCES, DEMARCHE-CREATIVE and IA; the last two are not yet complete/created.
