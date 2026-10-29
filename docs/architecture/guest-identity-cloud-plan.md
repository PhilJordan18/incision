# Slice 5 — guest identity foundation (#31)

Status: F-01.1A implemented locally after Philippe's **Go Ahead in this chat** on 2026-10-28 and explicit release of the shared files. The original planning sections below are preserved as the scoping record; their “now”, “proposed” and “not executed” statements describe the planning phase. See the implementation/decision record at the end for actual changes and evidence. Guest admission and racing remain unimplemented.

## Baseline and authority

- Repository: `PhilJordan18/incision`; fetched `origin/dev` and inspected commit **`5ee148ec653db1293dffec0ec0aaa906c4759d06`**.
- Isolated local branch: `docs/31-guest-identity-cloud-plan`, created directly from that reference; initial working tree clean. This document is the only deliverable. No push, merge, deployment or board update.
- Read: `AGENTS.md`, `CONTRIBUTING.md`, `.agents/WORKFLOW.md`, `.agents/skills/scope-task/SKILL.md`, architect/analyst role instructions, `.github/ISSUE_TEMPLATE/card.md`, `apps/web/AGENTS.md`, `docs/ARCHITECTURE.md`, `docs/EXIGENCES.md`, relevant data/state/succession documentation and authentication ADR. Technical notes use English as required by CONTRIBUTING.
- Final brief `docs/Web-V-Travail-de-session.pdf`, especially §§5.2–5.3 (AUTH-02/03, SALLE-06/08/09), prevails. The brief requires a signed cookie and a 3–20-character nickname; HttpOnly is requested in this chat; the sliding 24-hour lifetime comes from D-07. These are distinct sources, not extra teacher requirements.
- [Issue #31](https://github.com/PhilJordan18/incision/issues/31) and its [planning comment](https://github.com/PhilJordan18/incision/issues/31#issuecomment-6481710087) were read. The comment describes a future lane-B handoff and approvals elsewhere; neither authorises implementation here nor overrides this chat's allocation. Parent #31 remains open until the complete guest flow is proven.
- Architecture/matrix status text lags some code: `ARCHITECTURE.md` describes `f4600af`, not this baseline. For example, settings, bots, WPM series and key-error tables now exist; voluntary host succession is implemented. This plan records source observations without changing the central matrix or asserting production verification.

## Ownership and integration boundaries

| Owner | Reserved work | Boundary for this plan |
|---|---|---|
| Local A | Configuration #45, then random mode and Arcade | No changes to settings, text generation, bonus content or their tests. |
| Local B | FR/EN lists #42 and calibration #43 | No changes to word lists, corpus data, imports, measures or calibration. |
| This cloud chat | Detailed scoping of guest identity #31 | Only this file now; no implementation ownership inferred for later work. |

The candidate exporter and 10–200-word setting are already developed and locally verified according to Philippe, but unpublished. Their absence from `origin/dev` is **not** missing work to recreate. Their local changes were not inspected or tested here.

Before any later implementation, the coordinator must allocate one writer for shared files and serialise migrations. Conflict-prone paths include `packages/domain/src/index.ts`, `packages/database/src/index.ts`, `packages/database/src/schema/{index,rooms,races}.ts`, `packages/database/drizzle/meta/*`, `apps/web/server.ts`, room actions/protocols and race services. Refetch dev and reconcile the actual published A/B changes before choosing migration numbers. No cherry-pick of unpublished local work, recipe change, backup operation or database operation is part of this plan.

## Actual integration map at the baseline

Paths below are repository-relative; new paths are explicitly marked later.

| Area | Existing code and observed contract | Consequence for guests |
|---|---|---|
| HTTP identity | `apps/web/src/server/auth/session.ts`: `AccountSession = { accountId }`; `getAccountSession` calls Auth.js and `requireAccountSession` redirects unauthenticated requests. `auth.ts` and `server/auth/session-token.ts` retain account version and absolute 24-hour sign-in deadline. | Keep these account-only APIs and absolute lifetime. A guest is not a synthetic account or an Auth.js account JWT. Add a separate resolver. |
| Socket identity | `server/realtime/socket-session.ts` reads only the Cookie header. `socket-server.ts` guards events; `session-registry.ts` tracks account ID, version, fixed expiry and revocation. Anonymous ping is allowed. | A new guest cookie does not grant existing socket permissions automatically. Sliding expiry requires a separate guest lifecycle, not changing account revocation semantics. |
| Name rules | `packages/domain/src/identity/display-name.ts`: well-formed Unicode, NFKC, trim, internal whitespace collapse; 1–40 code points; invisible/default-ignorable characters and leading combining marks refused; lowercase canonical form preserves accents. | Reuse validation, then enforce 3–20 **code points after normalisation**, matching PostgreSQL `char_length`. Do not substitute UTF-16 units, ASCII-only login rules or typing graphemes. |
| Local names | `domain/src/rooms/room-admission.ts::localDisplayName` appends ` 2`, ` 3`, etc., truncating to 40 code points. | Guest collision handling needs an explicit 20-character policy; blindly reusing the 40-character limit is incorrect. Name uniqueness is local, not global. |
| SQL membership | `database/src/schema/rooms.ts`: `account_id NOT NULL`, account FK RESTRICT, partial unique active-account index, partial unique `(lobby_id, display_name_canonical)`, `left_at`, composite host FK. No guest table. Bots live separately in `schema/room-bots.ts`. | Add a distinct guest subject and exclusive account/guest ownership; retain existing account constraints. Do not move bots into memberships just because the older conceptual diagram did. |
| Admission/readers | `database/src/rooms/membership.ts`: `findActiveMembership`, `JoinRoomInput`, `RoomMember`, `leaveCurrentRoom` are account-based. `readRoomSnapshot` skips rows with null account ID. Admission locks the room, checks phase/quota and returns the same member for repeat joins. | Changing SQL nullability alone would silently hide guests. Every reader/command must be adapted before guest admission is enabled. |
| HTTP room gates | `server/rooms/actions.ts`, `code-attempts.ts`, `room-change-limiter.ts`, `app/(site)/rooms/[code]/load-room.ts` use account identity; create remains account-only. | Admission, own-room lookup, limits and leave need subject-aware versions later. Preserve code-enumeration resistance, private-room refusal, capacity and spectator quota. |
| Presence | `server/realtime/room-presence.ts` already tracks socket sets by lobby/member ID. `room-channel.ts` resolves membership using account ID; `rooms/protocol.ts` exposes member IDs, never account IDs. | Reuse socket aggregation: one tab closing is not a departure while another remains. Never expose guest session IDs/digests in snapshots. |
| Host succession | `domain/src/rooms/host-succession.ts` already accepts `account`, `guest`, `bot`, excludes bots, orders connected active humans by SQL microseconds then stable ID. `database/src/rooms/succession.ts` currently labels every member as account. `leaveCurrentRoom` transfers under the room lock or closes. | Preserve the selector. Adapt its subject projection later; guests, including spectators, may inherit under D-03. Network-disconnect succession C2 is still a separate gap, documented in `architecture/host-succession.md`; do not claim C1 covers it. |
| Race routing | `server/realtime/race-channel.ts::connectionOf`, `server/races/race-service.ts` and `race-runtime.ts` use account IDs for followers, control, lookup and rate budgets. `RaceConnection.accountId` is mandatory. | Guest racing needs explicit subject-to-member-to-entrant routing. Reusing null account IDs would merge unrelated guests/bots. Preserve one controlling tab, page ID checks and the 30-second reconnect grace. |
| Race persistence | `database/src/schema/races.ts`, migration `0011_race_bot_identities.sql`: account ID is nullable for bots, but the identity CHECK still requires it for `kind='human'`. `lifecycle.ts` snapshots members at start and finalises under the ownership fence. | A guest cannot race by simply dropping a NOT NULL constraint. Persist a distinct guest representation and preserve human semantics in the engine and victory calculations. |
| Results/privacy | `database/src/races/results.ts` gates historical reads by account entrant; room results also require an active account member. Key errors are joined only for the reader's account. `lifecycle.ts::finalizeRace` currently accepts key-error aggregates for any result. | Guest access must be ephemeral and room-scoped; writer-side filtering must prevent durable guest private errors. Existing account checks must not be weakened to nullable-ID equality. |
| Retention | `races.lobby_id` and `race_entrants.member_id` use SET NULL; account FKs use RESTRICT; results/series/errors cascade from race/entrant parents. `history.ts` and `profile-statistics.ts` query account-owned results. | Purging a guest or room must never delete the races needed for account history. D-08 requires anonymised guest collective series without a cookie link; deletion ordering alone is insufficient if the stored entrant still links through its member. |

## Proposed first autonomous card: F-01.1A — identity foundation

**IDs:** AUTH-02 (foundation), AUTH-03 (account separation/refusals), SALLE-06 (constraint foundation), TECH-07, SEC-01. **Choices:** D-04, D-07, D-14; preserve D-03/D-06/D-08 for subsequent integration. **Due:** final submission, not a retroactive checkpoint claim.

**Observable goal:** a same-origin HTTP request can establish and resume a signed HttpOnly guest identity independently of sockets; validate a nickname; expire that identity after 24 hours without accepted activity; prove account/guest separation and the SQL invariant of at most one active membership per subject. This is a backend foundation, not yet “join and race as a guest”.

**Out of scope:** guest room admission, room UI, socket authorisation, races, host timers, public discovery, invitations/bans, guest result display, deployed cleanup, profile uploads, account linking, random mode, Arcade, list/calibration work and both unpublished completed tools/settings. No new public navigation promising a usable guest flow. No dependencies are expected beyond Node crypto, existing Zod/Drizzle and tests.

**Acceptance criteria** (all evidence below is planned):

- [ ] A strict, bounded cookie codec verifies a fixed version/algorithm and authenticates the exact bytes; altered, malformed and unknown tokens fail closed without creating an identity implicitly (T01–T03).
- [ ] Cookie flags and same-origin mutation checks are correct; no credential appears in JSON, logs, localStorage, URLs or public projections (T04, T11).
- [ ] Resume returns the same server identity across requests/tabs with the same cookie. Conditional renewal never resurrects an expired row or shortens a later concurrent renewal (T02, T05).
- [ ] Nicknames follow existing display-name normalisation and reject lengths outside 3–20 after normalisation (T06). The account parser remains 1–40.
- [ ] Account sessions retain their fixed expiry, revocation and authorisation. Guest identity grants no create/photo/profile/history privilege (T07, T11).
- [ ] SQL permits exactly one account or guest subject per membership, enforces one active room per guest and preserves local canonical-name uniqueness (T08). This is verified with synthetic repository fixtures, without enabling an admission endpoint.
- [ ] Migration from the exact preceding schema preserves existing account memberships, results, WPM series, private errors and history queries (T12).
- [ ] The card leaves #31 and end-to-end AUTH-02/03/SALLE-06 incomplete; later admission/racing cannot be enabled until their privacy and authorisation gates pass.

**Reviews:** architect, code reviewer, functional QA, security and DBA on one exact implementation SHA. UI/UX and accessibility review when a guest screen is introduced later. Deployment/security review if signing-key configuration changes are selected. **Human actions now:** none beyond reviewing this plan. No remote resource provisioning is required for planning.

## Proposed foundation contracts

These are implementation proposals to approve, not newly accepted requirements.

### Subjects and nickname

- New domain `HumanSubject`: `{ kind: 'account', accountId: string } | { kind: 'guest', guestSessionId: string }`. A separate resolver result distinguishes absent, invalid, expired and unavailable credentials. Do not overload `AccountSession`, use a guest ID as an account ID, or use `socket.id`/IP/nickname as identity.
- Server-only identity keys are namespaced (`account:<id>`, `guest:<id>`). The public room protocol continues using `memberId`; runtime entrant identity remains `entrantId`.
- `parseGuestNickname(input)` delegates existing Unicode validation/normalisation to `parseDisplayName`, then checks 3–20 code points; canonicalisation uses `canonicalDisplayName` unchanged. Validation must be server-side and repeat at admission.
- Foundation nickname validation returns an admission draft, not a persistent guest profile. The nickname remains owned by the later membership, as in `data-model.md`; it is not embedded in the cookie. Proposed HTTP response returns the normalised draft; a later admission submits it again for server validation. This avoids inventing a global guest nickname/change-name feature.
- Generated avatar integration belongs to the admission/UI card: a local deterministic decorative avatar from a room-local public seed/member ID, never the cookie secret or a globally correlatable guest ID. No photo row or third-party avatar request. Appearance still needs design review.

### Signed cookie and storage

Proposed codec: `v1.<session UUID>.<32-byte random proof in canonical base64url>.<HMAC-SHA256 tag>`. MAC input includes a fixed application/guest-purpose prefix and the preceding exact fields. Reject extra segments, noncanonical encodings, incorrect decoded lengths, duplicate cookie names and overlarge values before expensive work. Use fixed SHA-256, no client-selected algorithm, constant-time equal-length comparison. A proposed input cap is 512 bytes for this cookie; final limits are engineering constants, not brief requirements.

`guest_sessions` holds `id`, unique `secret_digest` (SHA-256 of the random proof), `created_at`, `last_seen_at`, `expires_at`, with expiry index and ordering checks. Store no raw proof, nickname, email, photo or account link. Verify MAC before lookup, then match the proof digest and deadline. Signing alone is not encryption: the payload must remain minimal. The key source/rotation policy needs the decision below; do not read, generate, set or publish a real key in this task.

Proposed HTTPS cookie name `__Host-incision.guest`: `HttpOnly`, `Secure`, `SameSite=Lax`, `Path=/`, no Domain, `Max-Age=86400` on successful issuance/renewal. Use a distinct unprefixed name only for explicitly configured local HTTP, as determined by trusted server configuration, never incoming Host/proxy claims. Database expiry is authoritative even if a browser retains a cookie.

### HTTP boundary and failures

Proposed new route `apps/web/src/app/api/guest/session/route.ts`:

- `POST { nickname }`: bounded strict Zod object, normalisation, explicit same-origin CSRF protection; create only when no guest cookie exists, otherwise resume/renew the valid existing guest identity. No caller-supplied identity, role, host flag, expiry or avatar URL.
- `GET`: read-only guest status; never creates or renews a session. Return no internal ID/proof/digest; `Cache-Control: no-store` for all responses, including errors.
- Separate `POST /api/guest/session/renew`: no identity payload, validates the cookie and records accepted activity. This gives later UI/socket integration a way to renew the browser cookie over HTTP; Socket.IO alone cannot reliably update HttpOnly cookies after upgrade.
- Proposed results: 400 invalid payload/nickname; 401 invalid/expired guest cookie; 403 wrong origin; 409 account/guest transition conflict if selected; 429 creation/renewal budget exhausted; 503 storage/configuration unavailable. Missing GET identity is an absent status, not creation. Invalid/expired cookie deletion may be returned; storage failure must preserve the cookie and be retryable.
- Require the configured application Origin for these POSTs (including rejecting missing/`null` Origin), accept only the selected JSON content type, and bound body size. `SameSite` alone is not the CSRF check. These are new routes, so do not assume Next server-action CSRF protection applies to them.
- Rate-limit before insertion, with bounded memory/concurrency. Thresholds need review against classroom NAT use; do not copy the login-password failure budget or introduce a global IP ban. Schema or database failure must not mint a replacement session.

### Inactivity and concurrency

- Evaluate expiry using a trusted clock: invalid when `now >= expires_at`. A successful conditional SQL touch requires the current deadline to be strictly in the future and sets `last_seen_at` and `expires_at = last_seen_at + 24h` atomically; concurrent activity must not move the deadline backwards. No grace resurrects an expired credential.
- Initial scope counts explicit successful session creation/resume/renewal. Failed requests and read-only GETs do not renew. The later real-time activity policy is an unresolved decision, not “all network traffic”. The 24-hour guest deadline differs from 120-second race inactivity (D-17), 30-second reconnect grace (D-06) and account absolute expiry.
- Keep the random proof stable on normal renewal to avoid cross-tab response races; database expiry remains the source of truth. Reordered Set-Cookie responses and very long socket-only sessions require browser tests and an HTTP renewal strategy before enabling guests in rooms.
- The same existing cookie yields one identity. Two simultaneous **first** requests without any cookie cannot be recognised as the same anonymous person by the server. Later UI must serialize bootstrap across tabs, re-read the established cookie via the server before admission, and handle races; cookie deletion/new browser remains explicitly outside D-04's recognisability guarantee. Do not claim an IP lock solves this.
- Foundation cleanup can delete only expired sessions with no membership references. Do not cascade identity deletion into active rooms. The later lifecycle must end presence safely before purging its rows, including inherited hosting. No production cleanup job is created here.

## Files and ordered migration plan

No file in this section is changed by the current task. “New” means proposed. Migration filenames are symbolic: **do not reserve `0012`** while local A/B have unpublished changes. `0011` is the last observed migration at this baseline.

| Order | Proposed files/contracts | Verification and boundary |
|---|---|---|
| 1 | New `packages/domain/src/identity/guest-nickname.ts`, `human-subject.ts`, corresponding tests; coordinated export in `src/index.ts`. Reuse `identity/display-name.ts`. | Pure rules first; account normalisation regression tests. No text/word module changes. |
| 2 — M1 | New `packages/database/src/schema/guest-sessions.ts`; export in `schema/index.ts`; new generated `drizzle/<next>_guest_sessions.sql`, snapshot and journal entry. | Add session table/checks/index only, no account backfill. Migration test from current predecessor. |
| 3 | New `packages/database/src/identity/guest-sessions.ts` and `test/guest-sessions.db.test.ts`; coordinated database export. | Create, read, conditional touch and bounded expiry cleanup; DB clock tests and race tests. Use existing bounded transactions. |
| 4 — M2 | `schema/rooms.ts`: add nullable `guest_session_id` FK RESTRICT; make `account_id` nullable; CHECK exactly one non-null subject; partial unique `guest_session_id WHERE left_at IS NULL`; conditional guest name length 3–20. Preserve account/local-name indexes and host FK. Generated SQL/snapshot/journal plus `test/guest-membership.db.test.ts`. | All existing rows remain accounts. SQL fixtures prove exclusivity, duplicate active guest rejection and same-name collision. No guest membership writer enabled; production rows remain account-only, so current readers are not silently exposed to guests. |
| 5 | New `apps/web/src/identity/guest-contract.ts`; new `server/identity/guest-cookie.ts`, `guest-session.ts`, `guest-session-limiter.ts`, tests; new API routes above and route tests; proposed `server/identity/request-identity.ts` for explicit account/guest resolution without altering `requireAccountSession`. | Cookie/storage/HTTP plumbing only. Shared config/export edits must be coordinated. Keep existing room/socket/race entry points account-only. |
| 6 | New `apps/web/e2e/guest-session.spec.ts`, plus targeted existing account/session tests. Add config unit coverage only if a new signing-key binding is chosen. | Verify browser flags, same-origin refusals, renewal and account isolation. Synthetic disposable PostgreSQL only after implementation authorisation; no recipe/backup/personal data. |

M2 is preparatory schema work to make the requested presence invariant independently testable, **not delivered guest admission**. If the coordinator prefers a table-only first PR, split M2 into the subsequent admission PR and explicitly remove SALLE-06 foundation acceptance from F-01.1A; never claim cookie code alone enforces one room. Any type changes caused by nullable account IDs must compile without accepting unhandled guest rows in live readers.

Migration order: review/reconcile new dev → M1 → session repository → M2 → foundation HTTP service. Apply only to a new disposable local test database during implementation, never an existing recipe. Existing accounts, memberships and race rows need no rewrite. Downgrade is application rollback while retaining additive schema; do not restore `account_id NOT NULL` or drop guest tables once guest rows exist. Admission remains disabled during foundation, and rollback after admission requires a separately reviewed drain/purge procedure, not deleting account results.

## Subsequent admission/race cards — dependency contract only

### F-01.1B: membership and presence

Depends on F-01.1A, the coordinator's shared-file handoff and an approved collision/dual-cookie policy. Adapt `database/src/rooms/{membership,host-actions,settings,succession}.ts`, `server/rooms/{actions,code-attempts,room-change-limiter,room-events}.ts`, `app/(site)/rooms/[code]/{page,room-view,join-room-form}.tsx` and `app/(site)/rooms/[code]/load-room.ts`, `server/realtime/{socket-session,socket-server,session-registry,room-channel}.ts` and composition in `apps/web/server.ts`.

Internal commands take a verified `HumanSubject`; public requests never do. Under the room lock revalidate expiry/subject and current membership, then phase, capacity, bans/invitations when delivered and name uniqueness. Preserve own-room lookup before brute-force budget consumption. Same-room retry returns the same member; another-room attempt returns `ALREADY_IN_ANOTHER_ROOM` and an explicit leave-first choice. A unique-index conflict must become a typed refusal, not a duplicate or silent switch. Spectators also occupy one identity slot.

Guest socket registry must revalidate expiry and safely update deadlines across tabs without treating account version revocation as a guest operation. Keep session failure distinct from storage unavailability. Admission must coordinate guest-row renewal/cleanup locks with the existing room lock order to avoid deadlocks and deletion-after-validation races. Guest inherited host powers derive from committed `hostMemberId`, while **create** continues requiring an account. D-03 is already the repository choice; teacher clarification is not a prerequisite invented by this plan. Host loss after the last socket needs the still-unfinished C2 contract before full SALLE-08 completion.

Add guest entry/form/avatar and FR/EN errors only after reading the corresponding design screens; preserve keyboard, two themes, 360 px and reference widths. Public snapshots may add an explicit guest presentation marker/avatar descriptor, never credential identifiers. Keep guest racing inaccessible until the next card is ready: admitting a participant who cannot race would not complete #31. Decide whether to keep the entire guest entry hidden until B+C ship together.

### F-01.1C: racing, results and retention

Depends on B, A's completed race-service/configuration handoff, and result privacy review. Adapt `server/realtime/race-channel.ts`, `server/races/{race-service,race-runtime,race-registry}.ts`, `database/src/races/{lifecycle,results,history,profile-statistics}.ts`, `schema/races.ts`, result protocols/UI and room-result loaders. Preserve the pure engine's human/bot distinction and all time/ownership fences; a guest counts as human for starting, succession and account victories (D-24).

Proposed M3: widen persisted entrant identity CHECK to distinguish account human, anonymous guest and bot explicitly (for example persisted `kind='guest'`, mapped to engine `kind='human'`). Account and bot rows retain their current meaning; review every kind switch and aggregate. Guest entrant: `account_id=NULL`, `bot_level=NULL`, **no guest_session_id, proof, stable avatar seed or durable member link**, anonymised room-independent label from the outset. A runtime-only map binds guest subject/member to entrant for reconnect; do not persist that map. This avoids a transitive cookie link through `race_entrants.member_id`. The guest's real nickname stays in the active room/runtime, not archived snapshots.

Finalisation must inspect stored entrant kinds inside the same fenced transaction: persist collective guest results/WPM series needed by account histories; never persist guest `race_key_errors`, private bonus state or raw keystrokes. Do not trust a caller merely omitting the aggregate. Historical pages/history/photo/profile remain account-only. Guest current-room results and personal errors come from authorised live memory only while that room displays the result; subsequent rounds, leaving, expiry or process loss revoke that access. No guest-to-account history transfer. An unavailable ephemeral result after restart must not become permission to fetch private stored history.

Retention order must be explicit and tested: invalidate expired guest access → complete departure/host succession under room lock → remove departed guest membership references safely → delete guest session when eligible; separately purge closed-room metadata by D-07's 24-hour deadline. Never delete `races` to purge a room/session: keep account entrants, rankings, series, own key errors and account statistics. Existing SET NULL links support room/member removal. Whether to persist any guest-only race at all, and its retention duration, still needs a decision; D-08 only justifies collective snapshots needed by account results. No broad DELETE job is implied by this proposal.

## Planned test matrix — none executed in this task

| ID / stage | Scenario | Required evidence/oracle |
|---|---|---|
| T01 / A | Forged MAC, changed UUID/proof, wrong key/version/algorithm, truncated tag, random valid-looking cookie | Codec unit tests: no accepted identity; invalid MAC rejected before SQL; no raw cookie in logs. |
| T02 / A | Exactly 24 h, just before/after; expired DB row with valid signature; deleted row; stale cookie replay | Injected clock + SQL tests: equality expires, no resurrection; rejected renewal creates no replacement; account absolute expiry unchanged. |
| T03 / A | Empty/duplicate cookie names, bad separators/base64url/UUID, overlarge input; invalid JSON/types/extra identity fields | Bounded codec/route tests: typed failure, no exception leak, no insert; DB/config outage returns unavailable rather than anonymous success. |
| T04 / A | HTTPS/local HTTP cookie, cross-origin POST, missing/null Origin, GET/preload | Route/browser tests: correct flags and Path; no Domain; cookie absent from `document.cookie`; no credential in response; no GET renewal. |
| T05 / A, B | Two tabs with same cookie renew concurrently; reordered responses; two first requests without cookie; expiry racing cleanup | DB/browser barriers: monotonic deadline and same established subject; document bootstrap limitation and test eventual single-cookie admission; cleanup cannot remove an active referenced identity. |
| T06 / A | 2/3/20/21 post-normalisation code points; NFKC expansion, full-width text, decomposed/composed accents, whitespace collapse, astral emoji, lone surrogate | Domain fixtures match `parseDisplayName`; accents preserved in canonical form; invisible/ZWJ/variation selectors/leading marks rejected under D-14; homographs not newly forbidden. Test lowercasing expansion (e.g. dotted I) and JS/SQL canonical consistency. |
| T07 / A, B | Valid account+guest cookies, expired/revoked account+valid guest, storage failure, sign-out/sign-in during presence | Resolver tests for the approved precedence policy; no silent privilege downgrade/fallback on failure, no identity merge, no account room hijack or history transfer. |
| T08 / A, B | Synthetic SQL rows with neither/both subjects; one guest joins two rooms concurrently; two joins to same room; account/guest same canonical name | Constraint tests in A; real admission transaction races in B: at most one active member, repeat same-room ID, typed other-room refusal, unique local name. New presence after a real leave gets new seniority. |
| T09 / B, C | Last socket lost vs one of two tabs closing; reconnect at 30 s and after; control takeover from another tab | Socket/runtime/integration tests: stable member/entrant, no capacity increment, existing grace boundary/timer priority, one writer; expired session never authorised by reconnect grace. |
| T10 / B, C | Guest spectator is oldest connected human; bot older; reload during succession; no human; concurrent finalisation/host departure | DB + presence tests under room lock: D-03 selection, bot excluded, C1 race continues, no successor closes; C2 grace tested separately; completed account results survive. |
| T11 / A, B, C | Guest calls create-room/photo/account/history/result detail; forged member/entrant/host ID; other guest's private errors; bad Socket Origin | Direct HTTP and socket tests bypass UI: refuse account-only access; no unauthorised data read; inherited host only gets room host powers. Generic unknown/forbidden result responses; no stable guest IDs in public snapshots. |
| T12 / A, C | Apply each migration to fixtures containing completed account races, bots, WPM series and own errors; guest expiry/purge and room deletion | Real PostgreSQL tests: counts/content, history pagination, ranks, records and statistics preserved; correct SET NULL/RESTRICT behaviour; rollback code can read legacy data. C also proves anonymised guest series persist for accounts with zero guest-session/member link and no guest key-error row. |
| T13 / C | Finish retry, lost ownership, interrupted race, guest becomes account later, result after next round/restart | Fenced transaction/runtime tests: no duplicates or invented result, no personal guest history or retroactive promotion; guest ephemeral results unavailable once their authorised window ends. |
| T14 / B/C UI | Guest nickname/refusals/avatar, join/leave/reconnect; FR/EN × two themes, keyboard, 360 px | Playwright/axe and reference screenshots after UI implementation; no upload/history affordance for guest, accessible generated avatar and clear leave-first/error flow. |

Planned commands after implementation: root `npm run check:no-js`, `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`; PostgreSQL `npm run test:db --workspace=@incision/database`; selected browser `npm run test:e2e --workspace=@incision/web -- e2e/guest-session.spec.ts`; later `npm run test:integration --workspace=@incision/web` and affected room/race/result E2E suites. Read the database test harness before running anything: use only a disposable synthetic target. Existing recipes, backups, secrets and remote databases are excluded. Report the actual SHA, commands and results later, never convert this matrix into passing evidence.

## Decisions and risks to resolve

| Decision | Existing authority / proposal | Needed before |
|---|---|---|
| Meaning of activity | D-07 says inactivity; data-model says authenticated activity, but does not settle idle open sockets, spectator viewing or background polling. Proposal: accepted explicit actions renew; rejected traffic/GETs do not; agree spectator and socket heartbeat policy plus HTTP cookie refresh. | A endpoint semantics; B realtime enablement. |
| Dual credentials / switching | No merge/history transfer is settled. Precedence and transition while already in a room are not. Proposal: valid account wins; invalid present account credentials fail closed, no silent guest fallback; explicit transition ends old presence before admission under another subject. Do not silently revive guest presence on account sign-out. | A resolver and B sign-in/out integration. |
| Nickname collisions | D-04 requires local uniqueness without changing the global account name. Existing account suffix helper allows 40 characters. Proposal for guests: return `NICKNAME_TAKEN` and let the guest choose again, or approve a 20-code-point bounded suffix policy. | B; A tests only normalisation/length and DB uniqueness. |
| Signing key / rotation | Separate cookie and signature required; key source is not specified. Proposal: dedicated guest key for independent rotation, fail closed if unavailable. Alternative: purpose-derived key from existing auth secret, explicitly documenting coupled rotation. No real secret read/change now. | A security review/configuration design; remote setup separately authorised later. |
| Bootstrap and cookie renewal races | Server cannot correlate cookie-less requests; finite cookie lifetime can end a socket-only session despite DB activity. Stable proof, serialized browser bootstrap and explicit HTTP renewal are proposals, with cross-tab tests required. | Before usable B UI. |
| Abuse limits | No guest-creation rate threshold decided; classroom NAT must remain usable. Bound body/cookie/memory/concurrency and agree budgets without claiming a new product quota. | A security/QA. |
| Cleanup schedule and guest-only races | D-07/08 set deletion after presence and room metadata deadline; job ownership, crash recovery and guest-only durable results are not specified. Never reuse result-table cascades as cleanup. | C activation, not a reason to touch existing data now. |
| Host network loss | D-03 guest eligibility is already a choice; C2 disconnect succession is not implemented by C1. Coordinator must identify its owner/dependency and test integration. | Complete guest host lifecycle/SALLE-08. |
| Shared-file handoff | A/B changes are unpublished. Migration numbers, exports and race-service context will change. | Any implementation; rebase/reinspect then allocate one writer. |

Risks with the largest impact are accidental guest-as-account authorisation, guest identifiers/private errors leaking into persistent results, cleanup deleting account history, and stale concurrent expiry/admission checks. These are release gates, not claims of discovered exploitable vulnerabilities.

## Coordinator update proposal (not posted)

> #31 / slice 5: cloud scoping prepared at dev `5ee148ec653db1293dffec0ec0aaa906c4759d06` in `docs/architecture/guest-identity-cloud-plan.md`. Awaiting Go Ahead in the cloud chat. Proposed split: F-01.1A signed identity/idle expiry/nickname/SQL subject constraints; B admission/presence; C racing/privacy/retention. Keep parent open and statuses unchanged for now. Local A retains #45 → random → Arcade; local B retains #42/#43. Exporter and 10–200-word setting are already verified locally, unpublished, and must not be rebuilt. Reserve shared-file ownership and serialize migration numbering after handoff; resolve activity, credential coexistence, collision and key policies before their dependent implementation. No board write, delivery or remote-resource action performed.

After A is implemented and verified, propose AUTH-02 **partial**, AUTH-03 **partial** only for proven separation/refusals, and SALLE-06 **partial** until actual guest admission/multi-tab flows pass. Leave existing account evidence intact; only the coordinator updates the central matrix/board with real files, executed tests and integration status.

## Review record for this document

Architect verdict: plan prepared; implementation not authorised. Read-only code inspection and repository/issue reads informed the map. `origin/dev` was fetched after the initial sandbox proxy connection failed. The local branch was created at the exact SHA above. Documentation checks: the branch HEAD and `origin/dev` both resolve to the baseline SHA; `git status --short` lists only this new document; `git diff --no-index --check /dev/null docs/architecture/guest-identity-cloud-plan.md` reports no whitespace error. Referenced existing integration paths were inspected; no application, PostgreSQL, browser, security-runtime or production tests were run. No recipe, backup, personal data, Neon/Azure/OAuth resource or secret was accessed or changed.

Next human decision: **Go Ahead** in this chat, with the applicable unresolved choices settled before dependent implementation. This is both Philippe's explicit instruction and the repository's `AGENTS.md` plan→implementation gate; `scope-task` likewise says to present the card and stop. It is not an authorisation to push, publish an issue, merge or deploy.


## Implementation and architecture decision record — F-01.1A

Approved in this chat on 2026-10-28: Go Ahead, followed by confirmation that `rooms.ts`, package exports and the migration journal are free for #31. Implementation branch `feat/31-guest-identity` remains based on `5ee148ec653db1293dffec0ec0aaa906c4759d06`; refetch found no newer dev commit. No publication or remote-resource action was authorised or performed.

### Decisions implemented for this foundation

- A separate signed guest cookie and database proof digest; no Auth.js guest account or guest profile. HMAC-SHA256 with a purpose prefix, random UUID v4 and 256-bit proof; fixed codec, strict lengths/base64url and duplicate-cookie rejection. Nicknames reuse D-14 and are returned only as an unpersisted admission draft, with 3–20 normalised code points. They are never cookie claims.
- Dedicated server-only **`GUEST_SESSION_SECRET`** (32–1024 UTF-8 bytes accepted; deployment should supply cryptographic randomness). Missing/invalid configuration returns 503 on guest endpoints and does not alter existing account sign-in. No secret value was read or configured and no `.env` file changed. Changing this key invalidates all old guest signatures immediately; no multi-key rotation window is implemented. This new variable must be added to the deployment/environment documentation by its owner before a later deployment; no deployment is part of this work.
- Existing accounts take precedence: a valid account receives 409 from guest endpoints; present invalid/expired/revoked account credentials receive 401, verification failure 503. There is no automatic guest fallback or account/guest merge. Prefix detection follows Auth.js' actual session-cookie collector, including malformed suffixes. Account-only gates and their absolute 24-hour expiry/revocation were not changed.
- Successful explicit POST start/resume/renew is activity. GET never creates or renews. SQL locks the session before sampling its clock for renewal; equality with expiry is invalid and expired rows cannot be resurrected. The stable proof avoids credential rotation races across established tabs. Idle sockets, background refresh, first-cookie bootstrap synchronisation and sign-out transitions remain for B; this foundation gives those flows no room access.
- Both POST routes require the exact configured Origin, JSON and a bounded strict schema. Body limit 2 KiB, nickname input limit 256 UTF-16 units before normalisation, body-read deadline 5 seconds. Initial engineering limits: 240 requests/minute/address, 120 starts/15 minutes/address, eight concurrent operations and 10,000 address buckets; no live budget eviction, no permanent IP ban. These single-process bounds use the existing trusted client-address header and IPv6 /64 grouping; they are not new teacher requirements or a load qualification.
- `GET /api/guest/session` gives an absent/guest status; `POST /api/guest/session` validates `{ nickname }` and creates/resumes; `POST /api/guest/session/renew` accepts `{}`. Responses are no-store and contain no session ID/proof/digest. HTTPS uses `__Host-incision.guest` with HttpOnly, Secure, SameSite=Lax, Path=/ and Max-Age 86400; explicit localhost HTTP uses `incision.guest`. Invalid cookies remain refused without an implicit replacement or clearing a possibly newer concurrent cookie. A future UI needs an explicit restart/recovery flow.

### Persistence and compatibility

Generated migrations **0012_guest_sessions → 0013_guest_membership**, with Drizzle snapshots/journal. M1 creates the ephemeral session table, expiry index, digest uniqueness and timestamp checks. M2 adds the guest FK with RESTRICT, the exclusive account/guest subject CHECK, 3–20 guest-name CHECK and partial active-guest unique index. Existing account/local-name constraints remain. There is no guest admission writer, no race schema change, no result backfill and no guest row inserted into a production room.

The repository offers a bounded cleanup function (100 rows per call, locked candidates, skip-locked) for expired **unreferenced** guest sessions. No scheduler or public cleanup route invokes it. Referenced sessions, including departed members, are deliberately retained until B/C can safely retire presence. No result/room/account table is deleted by this function.

Rollback keeps the additive schema; the old account-only app remains compatible while guest membership creation is disabled. Restoring NOT NULL or dropping these tables after future admission would require another reviewed migration. M2 takes normal ALTER TABLE/index/constraint-validation locks; production table size and rollout timing were not measured. Apply neither migration to a recipe or remote resource as part of this task.

### Local verification

Code/review reference: **`18e999a0aba9864be9cf49b87f43b6fd245b3a77`**. Subsequent changes to this file only record evidence. Tests use synthetic data on a newly created `postgres:17` Docker container, localhost port 55431, tmpfs storage and no existing volume; E2E uses its own `incision_e2e_guest31` database. The database harness creates/drops only its generated local temporary databases. No recipe, backup, personal data, Neon/Azure/OAuth resource or real secret was accessed.

| Check | Actual result |
|---|---|
| `npm run check:no-js`, `npm run lint`, `npm run typecheck` | Passed across the repository on the review reference. |
| `npm run build` | Passed on the review reference, Next 16.4.3; both guest endpoints are dynamic server routes. |
| `npm test` | 2,212 passed on the review reference: web 801, database unit 146, domain 1,198, load 20, word-lists 47. |
| `npm run test:db --workspace=@incision/database` | 273 passed, 9 existing PgBouncer tests skipped because their separate pooler URLs are not configured; no new skip added. Schema-catalog and migration tests included. |
| Targeted DB rerun on review reference | `test/guest-sessions.db.test.ts test/guest-migrations.db.test.ts`: 7 passed. |
| `npm test --workspace=@incision/web -- src/server/identity` | 37 passed, including a never-finishing body, tampering, expiry/refusal outcomes, cross-origin rejection, account precedence and bounded concurrency. |
| Guest/account browser regression | `npm run test:e2e --workspace=@incision/web -- e2e/guest-session.spec.ts e2e/session.spec.ts`: 14 passed on the final-reference build, including malformed account chunks; local Chromium only. |
| Scope/whitespace | `git diff --check` clean; central EXIGENCES, lockfile, existing race runtime, word lists and exporter unchanged. |

The provided node_modules was stale (Next 16.3.7 and missing msgpack); `npm ci --ignore-scripts` restored the existing lockfile without changing it. Initial full runs during environment repair are not counted as successful evidence. The matching Playwright Chromium was installed after launch failed for a missing executable. A new E2E test initially used French selectors without setting a French locale; the test was corrected, not the product. No test was disabled or weakened.

### Acceptance mapping and review record

Architect, code-reviewer, security, DBA and functional-QA roles were applied sequentially in this session, not by independent agents. Scope is F-01.1A only. Code and security review caught the account-cookie prefix mismatch at `4897a02`; fix `3c74de8` and regression `18e999a` address it. Final role conclusions follow the final checks below; no production or independent external audit is claimed.

| Criterion | Evidence |
|---|---|
| Signed cookie and failure without implicit identity replacement | `guest-cookie.test.ts`, `guest-http.test.ts`, forged/expired browser flow. |
| Correct cookie/Origin/privacy boundary | HTTPS flags in unit tests; real HttpOnly/local flags in Chromium, cross-origin refusals, no ID in JSON. HTTPS through Azure was not tested. |
| Stable identity and monotonic conditional renewal | Concurrent HTTP tests and two real tabs; SQL lock-barrier expiry and concurrent touch tests. First-ever cookie-less tab coordination remains B. |
| Normalised 3–20-character nickname | 17 domain cases; account parser remains 1–40. |
| Account separation and denied guest privileges | Account precedence and malformed-prefix regression; guest denied account/history/race/create page/photo/socket permissions; unchanged account session suite. |
| One active guest membership and exclusive subject | Direct synthetic SQL concurrency/constraint tests; no claim of operational guest admission. |
| Account results preserved | Upgrade from 0011 with account result/WPM/private-error fixtures, old migration replay, guest cleanup and room removal; before/after result reader/statistics/content equality. |

### Coordinator handoff after implementation (not posted)

> F-01.1A is implemented locally on `feat/31-guest-identity`; baseline dev `5ee148e`, reviewed code `18e999a`. Migrations 0012/0013 are generated and tested only on disposable local PostgreSQL. Review this branch before any other writer allocates those numbers. AUTH-02/03 and SALLE-06 are still partial at the parent-card level; #31 remains open. No guest admission, sockets/racing, avatar UI, host-loss timer or operational retention scheduler is enabled. A retains #45/random/Arcade and B retains #42/#43; unpublished exporter/10–200 work was not recreated. The central board and EXIGENCES remain untouched. Dedicated-key provisioning and all deployment actions need their own later authorisation.


Final role verdicts at `18e999a`: **code review OK**, **security OK for the foundation**, **DBA OK locally**, **functional QA OK for F-01.1A**, architect **ready for delivery review, not published**. No blocking finding remains in this scope. The security prefix finding was fixed and verified with both unit and real HTTP/browser regressions. No independent reviewers were invoked. Deployment, Azure HTTPS/proxy behaviour, PgBouncer, real OAuth, operational cleanup, guest admission/reconnection/succession/racing and avatar/UI acceptance remain unverified or outside this card. Their earlier matrix entries remain plans, not executed tests.

Local commits: `afad98a` plan; `8029b4d` domain rules; `cc7e3f7` SQL storage/constraints; `4897a02` guest HTTP/cookie service; `3c74de8` account-prefix correction; `18e999a` browser regression. The final documentation-only commit adds this evidence. No runtime change followed the reviewed code reference. No push, PR, board update, central matrix change, merge or deployment was performed. The test-only container is removed after verification; no existing database or volume is involved.
