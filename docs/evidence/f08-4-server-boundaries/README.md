# F-08.4A — Server input and host-authorisation inventory

Card [#75](https://github.com/PhilJordan18/incision/issues/75), TECH-07 and SEC-01. Baseline: `dev` **3a1dcff**, 25 October 2026. This inventory covers the application entry points present at that commit, including merged history and display-name changes. It does not cover the forthcoming photo upload or corpus-selection branch.

This tranche adds boundary regression tests and records existing validation. It does not declare the complete #75 audit finished: configure, invite and kick actions do not exist yet. Their future schemas, permissions and refusal tests remain required. Nor does it equate a domain parser, a library protocol handler or an ignored payload with a Zod schema.

Paths below are repository-relative. Test names are source references unless explicitly included in the executed-check record at the end.

## Server Actions

Discovery: all files containing `"use server"` under `apps/web/src`; five modules, ten exported actions. Previous-state arguments are not used as an identity or authorisation source.

| Entry / source | Consumed input and validation | Authorisation / refusal evidence |
|---|---|---|
| `signInWithCredentials`, `app/(auth)/sign-in/actions.ts` | Form `login` and `password`: `credentialsFormSchema` bounds; `callbackUrl`: `safeRedirectPath`. Non-string fields become empty strings. | Public sign-in; `authorizeCredentials` independently applies `credentialsInputSchema`, address/account limits and password verification. `server/auth/credentials.test.ts`. No password returned in form state. |
| `signInWithProvider`, same module | Provider enum restricted to GitHub/Discord; callback path canonicalised by `safeRedirectPath`. | Public start of library OAuth flow, not an authenticated identity claim; malformed provider redirects to the configuration error. |
| `setLocaleAction`, `components/preferences/actions.ts` | `localeSchema`: FR/EN enum; ignores invalid value before cookies/refresh. | Public preference, no account mutation. Cookie flags from validated configuration. |
| `signOutEverywhereAction`, `app/(site)/account/actions.ts` | No consumed form payload. | Account comes from `getAccountSession`; no session redirects before revocation. `server/auth/revocation.test.ts` and existing session E2E. |
| `updateDisplayNameAction`, `app/(site)/account/display-name-action.ts` | `changeDisplayName`: exactly one string of at most 1,024 code units, then `parseDisplayName` domain rules. | `requireAccountSession`; submitted identity ignored; update uses session account. `display-name-action.test.ts`, `server/auth/change-display-name.test.ts`. Profile source remains owned by #68. |
| `joinRoomAction`, `server/rooms/actions.ts` | String code truncated to input bound, then `parseRoomCode`; `roleSchema` participant/spectator (last checkbox value; default participant). | Account session required for admission; address/code and account mutation budgets; SQL membership checks. `actions.test.ts`, `code-attempts.test.ts`, database `membership.db.test.ts`. Code validation is a domain parser, not Zod. |
| `createRoomAction`, same module | `roleSchema`; capacity, visibility and random code are server-selected. | Session required before mutation; account becomes host through the transaction. New `action-boundaries.test.ts` rejects missing session and ignores forged account fields. |
| `leaveRoomAction`, same module | `returnToSchema` wraps safe same-site path validation with `/` fallback; no supplied member identity consumed. | Session account determines departure; the database determines whether the host left. New tests check authentication, identity and exact safe redirect. |
| `nextRoundAction`, same module | `raceIdSchema`: UUID, lowercased. | Session account and race passed to the SQL transaction, which verifies current host and phase. `host-actions.test.ts`, new boundary tests and `races.db.test.ts`. |
| `closeRoomAction`, same module | Zod string fallback, then `parseRoomCode`. | Session account and code passed to SQL host check; refusals produce no room notification. Same three layers of evidence as next round. |

Next 16.4.3's installed `dist/docs/01-app/02-guides/server-actions.md` was consulted: actions are reachable POST endpoints and their Origin/Host check does not replace application authentication. The new tests invoke exported actions directly, without rendering their protected pages.

## HTTP route handlers and pages

Three route-handler modules are present; framework internals/static assets are not custom application routes.

| Entry | Validation and access boundary | Evidence / limit |
|---|---|---|
| `GET /api/health/live` | No request fields consumed; constant liveness response. | No authentication needed, no account data. |
| `GET /api/health` | No request fields consumed; readiness query to SQL, generic failure. | `app/api/health/route.test.ts`; no secret/database detail in the response. |
| `GET/POST /api/auth/[...nextauth]` | Delegates protocol parsing to Auth.js handlers in `auth.ts`. Application credential/JWT/provider callbacks validate their own inputs. | Library-managed OAuth/CSRF parsing is not an application Zod schema or a live-provider audit. `credentials.test.ts`, `session-callbacks.test.ts`, `session-token.test.ts`. |
| `/rooms/[code]`, including metadata | `parseRoomCode` before code lookup; canonical redirect; account session; `load-room.ts` enforces code-attempt limits and authorised room projection. | `load-room.test.ts`, `code-attempts.test.ts`, existing code-limit E2E. Domain parser rather than Zod for the route code. |
| `/races/[id]`, including metadata | Session before reading; `readRaceForEntrant` rejects malformed UUIDs with a regex and requires an entrant belonging to that account in SQL. | `packages/database/test/races.db.test.ts`; unknown/unauthorised race both return no result. Regex is not Zod. |
| `/history?cursor=…` | Session account cannot be selected by the URL; `parseHistoryCursor` checks type/length then a Zod tuple, in both page and reader. | `packages/database/src/races/history.test.ts`, `test/history.db.test.ts`; pagination does not authorise another account. |
| `/account`, `/rooms/new` | No dynamic business parameter; server session guard. | Profile actions separately authorise mutations. |
| `/sign-in?callbackUrl=…&error=…&code=…` | Safe same-site redirect helper; known error-key selection, never raw error markup. | Explicit helper/allowlist validation rather than blanket Zod coverage. |
| `/auth/error?error=…` | Literal comparison to `AccessDenied`, otherwise generic translated error. | No identifier or mutation derived from this value. |
| `/` and fallback pages | No business query payload consumed. Shared preference/session readers still apply. | Rendering a page alone grants no mutation authority. |

## Client-to-server socket events

Transport: `server/realtime/socket-server.ts`; Socket.IO bounds incoming messages to 32 KiB. Acknowledgement callbacks are checked with `typeof === "function"`. These transport checks are distinct from business payload schemas.

| Event | Input validator | Permission and relevant test sources |
|---|---|---|
| `system:ping` | Strict `{ sentAt: number }` Zod object in `ping.ts`. | Public server-time response; `ping.test.ts`. |
| `session:whoami` | Payload intentionally ignored; no payload schema. | `currentSession` checks origin, expiry and local revocation before exposing this socket's account; `socket-server.test.ts`. No caller-selected identity. |
| `room:watch` | Strict `roomWatchPayloadSchema` in `rooms/protocol.ts`. | Current session and database membership; room/account budgets; `room-channel.test.ts`, `rooms/protocol.test.ts`. |
| `race:start` | Strict empty `raceStartPayloadSchema`; validation in `RaceService.start`. | Current session, per-socket/account budgets; transaction verifies host and room phase. `race-channel.test.ts`, `race-service.test.ts`, database `races.db.test.ts`. |
| `race:batch` | `parseKeystrokeBatch` / strict bounded `keystrokeBatchPayloadSchema`; domain performs semantic checks too. | Session, followed room, entrant and controlling tab; sequence/text version and frequency checks. `race-channel.test.ts`, `races/protocol.test.ts`, runtime tests. |
| `race:control` | Strict UUID `raceControlPayloadSchema`. | Session, followed account/room and correct race; controlling-tab transfer rules. Channel/service/runtime tests. |
| `race:present`, `race:abandon` | Strict UUID `raceEntrantActionPayloadSchema`. | Session, followed account, correct race and entrant; shared frequency budget. Channel/service/runtime tests. |
| `race:bonus:activate` | Strict `bonusActivationPayloadSchema` in `races/bonus-protocol.ts`. | Session, followed room, account budget, controlling tab and matching entrant/race; `bonus-channel.test.ts`, protocol tests. Ordinary rooms still have bonuses disabled at this baseline. |

`disconnect` is a transport lifecycle callback, not a client-selected business command. Server emissions (`room:snapshot`, `race:reveal`, `race:self`, `race:progress`, `race:confirming`, bonus self/announcements) are not additional inbound mutation routes.

## Shared inputs and trust boundaries

- **Environment:** `server/config.ts` uses `serverEnvSchema` and production refinements; `config.test.ts`. This revision neither reads secret values nor modifies configuration.
- **Session cookie/JWT:** Auth.js decrypts; `sessionClaimsSchema` and `checkSession` validate subject, version and deadline against the account. `socket-session.test.ts`, `session-token.test.ts`. Anonymous transport does not grant private actions.
- **OAuth profile:** Auth.js handles the provider protocol; application account mapping and callbacks remain separate from client-submitted account IDs. This is not a remote OAuth penetration test.
- **Origin and client address:** `realtime/origin.ts` allows the configured origin and rejects cross-site/JSONP; missing Origin remains allowed. `server/http/client-address.ts` derives an address from the configured trusted proxy chain; `server.ts` overwrites the internal address header. Their tests cover parsing/spoofing boundaries. These parsers are not Zod schemas.
- **Locale/theme headers and cookies:** `i18n/locale.ts` and theme readers select known values/fallbacks; they do not authorise access. Raw strings are not treated as account identities.

## Host-authorisation evidence and remaining scope

| Operation | Delivered boundary | Status in this tranche |
|---|---|---|
| Start | Channel session → service strict payload → `startRace` transaction checking host. | Existing service refusal tests and SQL tests; targeted service tests rerun. |
| Next round | Action session/UUID → `startNextRound` host/current-race transaction. | Existing action and SQL tests; new direct-action identity tests. |
| Close | Action session/code → `closeRoom` host transaction. | Existing action and SQL tests; new direct-action identity tests. |
| Configure / invite / kick | No corresponding implemented endpoint at baseline. | Not audited as delivered; retain #75's second checkbox open. |

No exploitable authorisation defect was established by this tranche. The remaining **TECH-07 conformance gap** is explicit: some consumed route/form/header inputs use domain/regex/allowlist validation rather than Zod, and the `session:whoami` payload is ignored. These are not proof of unvalidated SQL or an authorisation bypass; they also do not justify marking “every input validated with Zod” complete. Harmonisation and new endpoints need scoped follow-up and coordination, not silent changes to shared sources.

## Verification record

The new `apps/web/src/server/rooms/action-boundaries.test.ts` contains eight cases: four anonymous mutation refusals, two forged-host identity/refusal cases, session-owned creation, and session-owned departure with an exact safe redirect assertion. Database calls are mocked here: these tests prove action-to-transaction identity and guard ordering, not the SQL host check itself. The existing SQL tests cited above cover the latter; they were inspected, not rerun by this tranche.

A targeted run covers the new tests, existing host actions, room/race/bonus channels, ping, session claims, wire protocols and race service. Exact counts and the final SHA are recorded in the PR and #75 after verification. Lint, type checking, no-JavaScript and diff checks are also recorded there. No new browser run, database reset, build, remote resource operation or production claim is made by these test/documentation changes.

The initial socket test run in the restricted sandbox did not complete; it was terminated. The successful run uses localhost permissions and dependencies installed inside this worktree. No other session's processes or database were stopped.

Reviews on the final SHA: code review, functional QA and security roles applied sequentially, with architect consolidation. The matrix remains partial; do not promote future endpoints or parser differences to complete. Profile/identity/upload sources and Claude's corpus/runtime sources remain unchanged.

### Reproducible local commands

Run from the repository root with Node 24 (socket tests need localhost access):

```sh
npm test --workspace @incision/web -- src/server/rooms/action-boundaries.test.ts src/server/rooms/host-actions.test.ts src/server/realtime/race-channel.test.ts src/server/realtime/room-channel.test.ts src/server/realtime/bonus-channel.test.ts src/server/realtime/ping.test.ts src/races/protocol.test.ts src/races/bonus-protocol.test.ts src/rooms/protocol.test.ts src/server/auth/session-token.test.ts src/server/races/race-service.test.ts
npm exec --workspace @incision/web -- eslint src/server/rooms/action-boundaries.test.ts
npm run typecheck --workspace @incision/web
npm run check:no-js
git diff --check
```

Result: **11 test files, 139 tests passed**, including the eight new cases; lint and type checking passed. Dependencies installed with `npm ci --no-audit --no-fund` in this isolated worktree, with no lockfile change. Commands run under the shared heavy-command lock.

### Matrix handoff

TECH-07 and SEC-01 remain **partiel**. The other Codex agreed to line-level ownership of these two rows, but Claude's active selection branch also edits `docs/EXIGENCES.md`. Without confirmation from that editor, this tranche preserves the shared file. The following evidence is ready to fold into its two rows at coordinated integration:

- TECH-07: add this inventory and the protocol/channel/service test files to the evidence. Replace the obsolete statement that race events are still future work: their schemas are delivered. Retain the explicit parser-versus-Zod gaps and future endpoint work above.
- SEC-01: add `server/rooms/action-boundaries.test.ts`, `host-actions.test.ts`, `server/races/race-service.test.ts` and the existing SQL host checks. Start, close and next round are delivered; configure/invite/kick remain pending. The new eight tests prove the HTTP action guards and session-derived identity, not SQL correctness by mocking.

This handoff is a remaining integration task, not a claim that the central matrix has already been edited.

### Source navigation

- [Room actions](../../../../apps/web/src/server/rooms/actions.ts) and [new boundary tests](../../../../apps/web/src/server/rooms/action-boundaries.test.ts)
- [Race channel](../../../../apps/web/src/server/realtime/race-channel.ts) and [race service](../../../../apps/web/src/server/races/race-service.ts)
- [Race protocol](../../../../apps/web/src/races/protocol.ts), [bonus protocol](../../../../apps/web/src/races/bonus-protocol.ts) and [room protocol](../../../../apps/web/src/rooms/protocol.ts)
- [SQL lifecycle/host checks](../../../../packages/database/src/races/lifecycle.ts) and [SQL regression tests](../../../../packages/database/test/races.db.test.ts)
