# #31 — guest integration evidence

## Current status — October 29, 2026 (Toronto)

PR #187 remains **draft; #31 is incomplete and public guest entry stays closed**.
Latest verified executable: `0772f356300a4d9f842c18b3ab26dbb986130b3e`.
The following evidence-only commit adds this report and screenshots.

Implemented and locally verified: internal guest admission/identity, realtime
commands and accepted activity; non-host outside-race grace; account/guest host
succession (#36C2); inherited guest host start/configure/next/close actions;
room-scoped temporary results; explicit departure and account-transition fence;
identity retirement and bounded local closed-room retention; cache eviction on SQL
failure. Settings retain their existing 10–200-word semantics.

On the exact executable SHA: all root gates and **2,347 unit tests passed**;
**351 SQL passed / 9 existing PgBouncer skips**; **9 guest-session Chromium E2Es
passed**, including the real 30-second grace and direct Auth.js transition refusal.
Manual sequential reviews of this increment are recorded below. Earlier C2/start/
results E2Es retain their own exact SHA reports; they were not all rerun here.

Still to implement: browser coordination, generated avatar, public guest entry and
room UI, remaining bot-host identity adapter, full guest journey FR/EN/theme/a11y
verification. The coordinator confirmed shared action/closure/settings files for
identity wiring only; B retains lists/calibration. No new configuration rule.

Sections below are chronological evidence. **Their historical limits apply to
those commits, not to the current cumulative implementation.** No central matrix
or board, migration, dependency, recipe or remote resource has been changed.

## Historical initial realtime increment (superseded by later increments)

This is an internal integration unit, **not completion of C/E/G/F or #31**.
Public guest admission and guest race commands are not enabled. No central board,
EXIGENCES, IA, schema, migration, dependency, list, calibration, random or Arcade
file is changed. No recipe database, backup, remote infrastructure or real secret
was accessed.

## References and delivered behavior

- Base: `50f09cefda6947a943e35cf96661c49506875ebc`, the actual `dev` merge of #186,
  including #185 and the immutable published migrations through 0014.
- Branch: `codex/f-01-1cegf-guest-integration`.
- Runtime and unit-test commit: `21fd573e4524acd621131a534905cb1c9112ed44`.
- Browser evidence correction/addition: `09487a8f55fa93893a0caf80aa20471efb4eeacc`.
  Fixture alphabet correction and final review reference:
  `7d46618d57fd14a0633d9d7ad4cd8ac4dfe95cad`. Runtime is identical to 21fd573.
  Later evidence-only commits do not change it.

`human-handshake.ts` checks the account-cookie prefix first, including malformed
chunks. A present invalid account cookie cannot fall back to a guest. A signed
guest proof is revalidated against SQL and checked again against the current
clock after the read. Missing identity stays anonymous. No handshake creates or
renews identity. Only the digest/ID remain server-side; neither is a public payload.

`SessionRegistry` keeps guest and account namespaces separate. Guest timers remove
and disconnect their sockets at expiry. A verified later SQL deadline refreshes
all registered tabs of that guest; older reads cannot shorten it, and canceled
callbacks cannot disconnect a replacement entry. The existing explicit HTTP touch
now refreshes this process-wide registry after SQL success. No heartbeat, polling,
GET or room watch touches SQL activity timestamps.

`room-channel.ts` checks guest proof and active membership before following a room.
Its shared identity budget is reserved **before** the SQL proof read, limiting
concurrent watches across tabs. Guest expiry is rechecked after asynchronous reads.
Room snapshots retain their existing public projection: no account ID, guest ID,
digest or cookie is exposed. A valid guest without membership receives NOT_A_MEMBER;
this is a refusal, not an admission endpoint. Guest race-follow remains disconnected
until the full command/renewal/lifecycle integration is ready.

`RaceRuntime` can identify an internal guest connection by live member ID instead
of comparing nullable account IDs. Different guests cannot receive each other's
private state or control. Account identity and bot behavior are preserved. Rate
limit keys distinguish accounts and guest members. The existing engine supplies
D-06's inclusive 30-second in-course grace. These are internal runtime tests:
**no guest websocket race command, guest host start or guest-only persistence path
is claimed implemented**. Live member IDs do not enter the anonymous result schema.

## Human choices received October 29, 2026

These are approved choices conveyed in this chat, not new proposals:

- Only accepted actions, including typing and “Je suis là”, renew the guest's
  24-hour inactivity deadline. A passive open tab, heartbeat, polling, GET and
  Escape do not. D-17's race inactivity clock remains separate.
- Explicit leave ends presence. Account transition requires first leaving guest
  presence, with no automatic identity or results transfer.
- Courses with no account keep no durable results after their room display.
- In-course reconnection retains the existing 30 seconds and timer priority.
- For a **non-host guest only**, losing the last socket while waiting or viewing
  results starts 30 seconds of grace. A return within the grace keeps member,
  place and seniority. Otherwise presence ends, place/name are released, and a
  later return requires normal fresh admission. Do not start a second timer when
  a loss began during racing and crosses into results. Session expiry wins.
- Accounts and hosts do not inherit this new non-host policy. Host network loss
  remains the real #36C2 dependency under D-03/D-06; guests must remain eligible
  successors. Its implementation ownership was requested from the coordinator.

**The new non-host outside-race release is not implemented by this commit.** The
29,999/30,000/30,001 tests here exercise existing in-course D-06 in the guest-capable
runtime. They are not evidence of SQL departure, nickname release, phase-crossing
cleanup or cache deletion. No scheduler or new retention policy is introduced.

## Verification and limitations

At 21fd573, root check:no-js, lint, typecheck, test and build all exited 0.
`npm test`: **2,270 passed** (web 844, database 146, domain 1,198, load 20,
word-lists 62). The 34 new unit tests include signed/malformed/expired cookies,
account precedence, shared watch budgets, multiple sockets, SQL proof refusal,
isolated race control/private state, and the in-course grace boundaries.

Targeted SQL command:

```
TEST_DATABASE_URL=<isolated localhost database> npm run test:db --workspace=@incision/database -- test/guest-sessions.db.test.ts test/guest-admission.db.test.ts test/anonymous-guest-results.db.test.ts test/guest-migrations.db.test.ts
```

**33 passed, no skips**. Tests migrate their disposable databases, check proof
expiry, concurrent admission, anonymous persistence and prior foundation migration
fixtures. This run is not a claim to rerun the entire database/PgBouncer suite or
all #186 upgrade scenarios. No SQL implementation or migration changed here.

Environment: new `postgres:17` container `incision-guest31ce-tests`, tmpfs,
localhost port 55435, synthetic credentials and no pre-existing volume. Browser
server uses port 3221 and `incision_e2e_guest31ce`; never recipe3880.

The first targeted room Socket.IO invocation inside the restricted sandbox was
terminated before producing a completed test result. Its log is not a passing run
and no root cause is inferred from its silence. The authorized localhost rerun
exited 0 with 38 tests. The first browser run exposed the obsolete UNAUTHORIZED
expectation for an authenticated guest without room membership; the assertion was
updated specifically to NOT_A_MEMBER, without removing the refusal check. A new
browser case uses synthetic SQL membership to exercise two sockets, read-only watch,
explicit renewal across the old deadline, and SQL expiry refusal. This is not a
browser test of public guest admission.

Final guest Chromium run on 7d46618: **7 passed**, exit 0. The earlier combined
run had **22 passed / 1 failed**, exit 1: all 17 account-session/race cases passed,
plus five guest cases; the one failure was the refusal assertion described above.
The subsequent new-fixture run had **6 passed / 1 failed**, because the synthetic
room code contained L (excluded from the room-code alphabet). Correcting only that
fixture produced the final seven passing guest cases. No test was skipped or
weakened. Web lint and typecheck exited 0 on 09487a8; 7d46618 changes only the
fixture code string. There was no production change after the full root gates.

## Sequential role reviews at 7d46618

Applied manually in this session, not independent agents or an external audit.

- **Code reviewer — OK for this internal unit.** Reviewed identity boundaries,
  map/timer lifecycle, before-SQL watch budgeting, and runtime account/bot
  compatibility. Checked the diff against 50f09cef and the targeted regressions.
- **Security — OK for this internal unit; public activation remains incomplete.**
  Verified signed-cookie/SQL proof checks, malformed-account precedence,
  server-derived membership, expiry after awaits, private-state isolation and
  account-only race-command gates. No proof is sent to clients, no guest is
  synthesized as an account, and no passive input writes activity. New browser
  evidence confirms account/photo/history denials and the watch/renew distinction.
  Full guest action authorization, transition and post-departure cache invalidation
  remain future integration gates, not approved absent implementations.
- **DBA — OK for unchanged storage and bounded reads.** No schema/migration/query
  implementation changed. Guest watches use existing session-PK and active-guest
  membership lookups; concurrent reads are bounded before SQL. Explicit touch uses
  the existing row lock and SQL expiry guard. Targeted SQL: 33 passed. No new
  migration replay/retention/cleanup qualification is claimed.
- **Functional QA — OK for the tested internal unit; parent #31 incomplete.**
  Executed tests prove credential refusal, two-tab deadline refresh, readonly
  watches, private-state separation and guest in-course grace. They do not prove
  public guest admission, guest racing end to end, outside-race release or retention.
- **Architect — partial delivery only.** No blocking finding remains in this
  bounded unit. A draft PR may expose it for coordinator review; it must not be
  represented as completion or activation of C/E/G/F. Continue on the same branch
  for the coupled work; #36C2 needs ownership coordination before full activation.

## Remaining implementation and verification

| Unit | Next concrete work | Required proof (not executed here) |
|---|---|---|
| C admission/UI | Guest code admission action, first-cookie tab coordination, avatar without photo, account-transition gate; use existing SQL admission | Concurrent first tabs, occupied normalized nickname, full/private/closed room, account-only denials, FR/EN, keyboard and a11y |
| E commands/activity | Connect server-verified live members to race commands; bound accepted-action renewal; synchronize cookie expiry without passive renewal | Revalidate expiry/rights, rejected batches do not touch, accepted typing/present do, Escape does not, tabs share control/limits |
| C/E presence | One loss instant per member across phases; non-host guest expiry/departure under room lock; serialize reconnect versus departure, reject stale callbacks | 29,999/30,000/30,001 ms; same member before grace, fresh admission afterward; last socket only; phase transition; renewal does not reset loss; session expiry wins |
| #36C2 dependency | Coordinate shared host-loss timer and existing atomic successor/closure adapter; do not exclude guest successors | Host changes during pending timer; oldest connected human; no successor; race finalization versus closure |
| G results | Room-only temporary results for no-account races; guest access to collective room results without account history or private durable errors | Account photos/results/WPM preserved; no member/session/cookie/name in durable guest entrant; no-account path writes no durable results |
| F cleanup | End guest presence, purge private caches and safely retire identity references; apply approved room retention bounds | Idempotence/atomicity, fresh admission/name reuse, no cache after leave, account data unaffected, process-loss behavior |

Reserved paths remain identity/realtime/room admission/race runtime/results and their
associated UI/tests on this branch. No migration number is reserved by this unit.
Do not reapply the old cloud migration pair or alter 0012/0013/0014. Subsequent work
must stay in this coherent branch until integrated, or use a genuinely updated dev;
no implicit stacked branch or copied integration base.

Coordinator proposal only: keep AUTH-02/03, SALLE-06/08 and #31 partial. Record the
verified transport/runtime groundwork and the new approved non-host grace rule;
do not mark public guest admission, guest racing, retention or #36C2 done.

## C/E progress — non-host presence release (October 29)

This section supersedes the earlier “not implemented” statement **only for the
non-host outside-race presence grace**. Other outstanding items remain outstanding.

Implementation: `579f48b` (non-host SQL departure/coordinator); final code/test
reference: `18e88b5ddb6d81ece9d6ee62bd9bbe7b03c55b64`. Same branch/PR, no new
migration and no public admission activation.

The room channel starts `GuestPresenceGrace` only when the last socket of a
server-verified guest member is lost. A single loss instant survives phase changes.
The SQL adapter locks room then guest session, rechecks the exact active member
and current host, samples SQL expiry after the locks, and invokes the synchronous
presence claim. Once claimed, a returning watch waits for commit/rollback. Before
claim, an on-time return invalidates the old loss generation. A late return must
resolve departure before it can follow; failed decisions do not authorize it.
Duplicate callbacks and stale generations cannot delete a newer presence.

D-06 equality remains inclusive: no departure at 29,999 or 30,000 ms, due at
30,001 ms. Identity expiry wins at its own deadline. Renewing identity does not
reset the loss instant. During racing/countdown, ordinary absence remains the
engine's responsibility; the outside-race coordinator retains the loss instant
and reacts to results without starting another grace. A phase notification during
an in-flight read is coalesced into a fresh read, not lost. Hosts and accounts are
excluded in SQL; C2 is not implemented. Process shutdown cancels pending timers.

Departure deletes only the guest's live membership/name and increments the room
revision. Anonymous guest result rows have no member FK already; account members,
bots and durable race data remain intact. An idempotent repeat is a no-op. A later
admission goes through the existing admission transaction and receives a fresh
member ID/seniority. The guest session itself is not deleted by this adapter:
identity-reference retirement belongs to F and is still required before activation.
Committed guest departure also tells the live runtime to abandon that member only.

### Executed checks and sequential reviews

- Root no-js, lint, typecheck, test and build exited 0 at 18e88b5.
  **2,288 unit tests passed** (web 862, database 146, domain 1,198, load 20,
  word-lists 62).
- Full isolated PostgreSQL suite: **310 passed, 9 pre-existing PgBouncer skips**;
  the dedicated pooler configuration is absent. New departure cases: eight,
  including lock barriers, host promotion, rollback, duplicate expiry, readmission,
  race preservation and account/bot exclusion. No new skip.
- Chromium guest suite against the rebuilt server: **8 passed**, including the
  real 30-second last-socket departure, reconnect with unchanged member/seniority,
  post-departure NOT_A_MEMBER, and the prior identity/renewal regressions.
- Initial root test run at 579f48b failed one design-token check: the comment
  spelling of the host issue ID matched its hexadecimal-color regex. Reworded
  the comment; no guard or test was disabled. The final full run above passed.
- Exact-reference reviews applied manually, sequentially: **code OK**, including
  coalesced phase reads and timer generations; **security OK for this internal
  unit**, with server-only claims and expiry revalidation; **DBA OK locally**, with
  room/session lock order, membership-only deletion, no migration and 310 passing
  tests; **functional QA OK for non-host grace**, not for the full guest journey.
- UI/private browser cache purge, guest command activity renewal, no-account
  temporary results, account transition and complete retention are still not
  validated/complete. Passing the socket refusal test is not a claim about browser
  back-forward cache behavior. No operational or multi-instance qualification.

### Read-only C2 delta for Philippe's approval

Coordinator confirms no active implementation, branch, PR or reservation for C2;
C1's selector and voluntary departure are merged. This is a proposed implementation
scope, **not permission to implement it and not a new product rule**:

1. Add a host-presence coordinator independent of the race entrant's connection
   timer: a spectator host has no racing entrant. Track the current host member,
   last-socket loss, inclusive 30-second deadline and generation. On-time return
   keeps hosting; stale callbacks cannot act on a newly elected host.
2. Add a bounded database adapter that locks the lobby, verifies the expected
   current host and absence after the lock, then reuses
   `transferHostToConnectedMember`. Eligible successors remain the oldest connected
   active human (account or guest), including spectators, under D-03. Resolve the
   existing account-only labeling comment/projection honestly; do not exclude guests.
3. If no successor exists, reuse interruption/closure under the same room lock as
   race finalization. Finalization first preserves results; closure first prevents
   official results. Publish committed host/member changes and clear departed
   authority only after commit. Do not reuse the non-host departure function for hosts.
4. Likely paths: a new server realtime host-grace module and tests, a new database
   host-loss adapter/tests, `rooms/succession.ts`, shared room channel/presence/events
   composition in `server.ts`, and `docs/architecture/host-succession.md`. Reuse
   existing selectors/room writes; no migration is currently justified. These paths
   overlap this integration and need one coordinated writer.
5. Required tests: host participant versus spectator; last of multiple sockets;
   29,999/30,000/30,001 ms; reconnect waiting on SQL; superseded host/timer callbacks;
   tied seniority; guest/account successors; no successor; expiry and revocation;
   phase transitions without reset; concurrent finish/close; rollback and retry;
   no change to account result/photo/settings data; Socket.IO and local browser UI.

Risks: confusing entrant grace with host authority; choosing from stale presence;
lock-order inversion; a successor disconnecting during commit; process-local state
under ADR-0001; interruption versus finalization races. These are implementation
and verification concerns under existing D-03/D-06, not reasons to invent a new
successor policy. C2 is required before claiming complete guest activation, but does
not block continued command/result/non-host work on this draft branch.

## E progress — guest race commands and accepted activity

Implementation `796ad0b`; final test/review reference
`85d2c3f9a289da6000b51746414ae419f00117f8`. This supersedes the earlier statement
that all guest race commands are account-gated: typing, control, present and
abandon now support an already admitted guest. Public admission/UI remains closed;
guest host start/management and the remaining results/retention work are not yet
complete. The browser fixture admits through synthetic local SQL, not a public UI.

Each guest command has a shared pre-SQL limit of ten per second (the existing
MAX_BATCHES_PER_SECOND) and one in-flight operation per guest identity across tabs.
The new SQL adapter locks room then session, verifies proof, active exact membership
and expiry after locks, then runs the synchronous server callback. Only the server's
accepted-action outcome renews last_seen_at/expires_at. Applied keystrokes count;
duplicate/refused batches, invalid Escape input, rejected control/present/abandon,
room watches and passive events do not. D-17 engine rules are unchanged. Accepted
control/abandon are session activity, not synthetic D-17 typing activity.

The registry synchronizes verified SQL deadlines across tabs. A successful activity
notification contains no identity or credential. POST /api/guest/session/refresh
synchronizes the HttpOnly cookie with **remaining SQL lifetime only** and does not
write activity. Repeated refreshes cannot keep an idle identity alive; same-origin,
strict empty body, account priority and existing address limits remain enforced.
Browser event-driven refresh scheduling is still part of the upcoming UI work.

On SQL failure after the callback, process-local engine state cannot be rewound.
The command returns UNAVAILABLE and is never automatically executed again by the
adapter; the engine's existing sequence/idempotence contract governs any client
retry. No renewal is claimed on a failed transaction. New UNAVAILABLE protocol
variants make this distinct from unauthorized identity or an expired race.

Checks: root no-js/lint/typecheck/test/build exited 0 on 85d2c3f; **2,301 unit tests
passed** (web 875, database 146, domain 1,198, load 20, word-lists 62). Targeted SQL
command/departure tests: **14 passed**, including six new command cases. Targeted
socket/gate tests: 59 passed. Guest HTTP/cookie tests: 37 passed. Chromium guest
session + real-engine command suites: **nine passed**. The new browser case proves
accepted typing renewal, duplicate/invalid-input non-renewal, read-only cookie
synchronization and present activity against local PostgreSQL and the real runtime.

The initial full run at 796ad0b failed the existing randomized tampering test: it
replaced a generated field's first character with X even when it already was X.
The fixture now picks a different character deterministically; no signature check
or assertion was weakened. All final gates above passed after that correction.

Sequential manual code/security/DBA/QA reviews at 85d2c3f: OK for this internal
command unit. Reviewed proof isolation, lock ordering, pre-SQL budgets, accepted
versus duplicate/refused activity, failure without callback replay, and read-only
cookie expiry synchronization. Full guest UI, host controls, temporary results,
privacy cache deletion and operational retention are not claimed verified.

### C2 approval received in this chat

Philippe explicitly authorized taking C2 within the proposed minimal scope,
coordinated with this PR, with tests/evidence before delivery and no merge or recipe
change. The earlier C2 “not authorized” wording is superseded by this approval.
Implementation will follow this command unit on the same branch; no separate
preparatory PR or stacked base is needed.

## Host network succession — October 29, 2026 (Toronto)

Philippe explicitly approved taking #36C2 together with #187; the coordinator
confirmed the same authorization. Scope: the host (account or guest), after loss
of its last socket, keeps the inclusive 30-second grace; then the oldest connected
human inherits, or the room closes. This supersedes the earlier read-only C2
proposal. No merge, deployment, recipe access or additional product scope.

Executable/reviewed commit: `ada4e5b2414474c59077bd1a7610d1c3b5192e50`.
Base remains `50f09cefda6947a943e35cf96661c49506875ebc`. Same branch and draft #187.

### Implemented

- `HostPresenceGrace`: separate host policy, valid for participants and spectators
  in every phase. Last-socket loss, inclusive deadline, reconnect/claim fencing,
  stale callbacks, one pending SQL decision, bounded retry after SQL failure.
  A failed departure returns UNAVAILABLE on reconnect, not a successful admission.
- `endDisconnectedHostPresence`: bounded READ COMMITTED room/session lock order;
  rechecks the exact current host, claims live absence, transfers or closes in one
  transaction, increments revision once. Expired guest identity has priority.
- The existing selector now classifies persisted guests correctly and excludes
  expired guests. It retains exact SQL microseconds and the existing tie-break.
  Candidate sockets are checked for current server authorization; no client host
  ID, candidate list or role is accepted.
- Account departures keep account/membership history. Guest departures erase the
  outgoing live membership after releasing its host FK. Without a successor, the
  existing room-lock interruption path fences late race writes. Already finished
  races survive. Full guest session retirement remains F work, not claimed here.
- The room channel starts host grace only on last-socket loss and awaits a claimed
  departure before a returning watch. Race notifications distinguish account,
  guest and room closure; no fake account ID is used for a guest host.

### Executed verification

All commands passed on the executable SHA above; no code changed during reviews.

| Check | Result | Local log |
| --- | --- | --- |
| `npm run check:no-js` | pass | `/tmp/host-c2-final-nojs.log` |
| `npm run lint` | pass | `/tmp/host-c2-final-lint.log` |
| `npm run typecheck` | pass | `/tmp/host-c2-final-types.log` |
| `npm test` | 2,318 passed: web892/database146/domain1198/load20/wordlists62 | `/tmp/host-c2-final-unit.log` |
| `npm run build` | pass | `/tmp/host-c2-final-build.log` |
| `npm run test:db -w @incision/database` | 326 passed, 9 existing PgBouncer skips | `/tmp/host-c2-final-db.log` |
| targeted Playwright: host-network-succession, guest-race-commands, guest-session | 10 passed | `/tmp/host-c2-e2e.log` |

SQL runs used disposable synthetic databases on local PostgreSQL17 port55435.
Playwright used its isolated synthetic database and local port3221. No recipe,
Neon, Azure, OAuth provider, personal data or backup was accessed. No migration,
schema, dependency, central requirements matrix or B-owned feature was changed.

The 17 host-coordinator tests cover 29,999/30,000/30,001ms, reconnect before and
after a claimed transaction, stale timers, duplicate losses, remaining sockets,
phase changes, guest expiry/renewal, failure/retry and a replaced host. The ten
new SQL tests cover guest spectator inheritance, expired candidates, account and
settings/bot conservation, post-lock presence, stale host, rollback, duplicates,
interruption and preservation of an already-finished race. Existing C1 tests
continue to cover microsecond order, exact ties and concurrent departures.
The real-server E2E runs the actual 30-second timer for an account spectator host,
checks two tabs and an early return, transfers to a guest spectator, and refuses
the old host's late watch. This is a synthetic admitted-guest scenario, not proof
of a finished public guest UI.

### Sequential review roles on ada4e5b

- Code reviewer: OK for the C2 increment. Dedicated host policy keeps the non-host
  account policy unchanged. Timer generation, transaction claim and room revision
  are guarded; the existing selector and interruption transaction are reused.
- Security: OK for this internal surface. No new public payload, secret, cookie
  exposure or client-supplied authority; SQL and current socket authorization
  jointly restrict successor eligibility. Public guest entry remains unavailable.
- DBA: OK. Room-before-session locks, immutable migrations, existing FK ordering,
  rollback/idempotence and preservation checked in local PostgreSQL. No remote
  database or PgBouncer qualification was performed.
- Functional QA: OK for the tested C2 scope; full #31 remains partial. The browser
  test uses a production build with synthetic fixtures. UI host controls for a
  guest, accessibility, first-cookie coordination and guest-only results are not
  covered by this increment.

These roles were applied manually and sequentially by Codex; they are not an
independent external audit. No blocking finding remains in this increment.
Process-local presence still follows ADR-0001: no multi-instance or exact restart
recovery claim. Full guest retirement and closed-room retention still need F.

### Cumulative done / remaining

Done: internal guest membership/realtime identity, non-host outside-race grace,
accepted-command SQL authorization/activity, read-only cookie refresh endpoint,
and now host network succession for accounts and guests. Published migrations
0012/0013/0014 remain unchanged.

Remaining in the approved #31 mandate: guest host commands, temporary guest
results and room-scoped cache, no-account durable-result suppression, explicit
leave/account transition, identity/room retention, first-cookie/multi-tab browser
coordination, avatar/public admission UI and full FR/EN/a11y journey verification.
Do not mark #31 complete or open public admission from this evidence. Coordinator
owns the board/matrix updates; proposed status is C2 verified locally in draft187,
#31 still in progress, no new scope requested.

## Inherited guest host: race start — October 29, 2026 (Toronto)

Executable/reviewed SHA: `261ae0ccb7366a0de7685f676221af98ffa232b5`.
This continues the approved #31 mandate on the same branch, after C2. A guest
host can now use the existing internal `race:start` command. The shared start
transaction accepts either an account ID or the server-derived guest proof;
there is no account impersonation or payload-supplied guest identity.

The settings read is read-only and validates the guest proof/expiry. Start locks
the room then the guest session, rechecks membership/host/expiry/settings, and
renews only after a successful mutation in the same transaction. Refusals and
rollback do not renew. Duplicate tabs share start budgets. Expired guest
participants are not frozen into a new race. Existing account start, settings
revision and engine refusal semantics are preserved. The SQL-renewed deadline
updates the socket registry; the activity event exposes no credential.

Executed on this SHA:

- Root check:no-js, lint, typecheck, test and build: passed, **2,321 unit tests**
  (web895/database146/domain1198/load20/wordlists62).
  Logs: `/tmp/guest-host-final-{nojs,lint,types,unit,build}.log`.
- SQL `guest-host-start`, `anonymous-guest-results`, `races`: **66 passed**, no skips
  in this selection; `/tmp/guest-host-final-db.log`. Seven new SQL cases include
  proof forgery, expiry, stale settings, rollback, duplicate starts, a host change
  while waiting for the room lock, and expired participant exclusion.
- Playwright `guest-race-commands.spec.ts`: **2 passed**, production build/local
  synthetic database; `/tmp/guest-host-final-e2e.log`. Both account and guest host
  starts reach the real engine, then exercise guest typing, duplicate rejection,
  accepted activity and cookie refresh.
- An initial typecheck found the guest connection factory's overly broad union
  return type. It was narrowed to its actual null-account return; no suppression
  or runtime cast was added. The final checks above passed after that correction.

Manual sequential code/security/DBA/functional-QA review on 261ae0c: OK for this
increment; shared actor authorization, no private credential emission, bounded
transactions and rollback inspected. Not an external independent audit. No UI,
remote database, PgBouncer or deployment qualification is claimed. No migration,
dependency or configuration rule changed.

Remaining guest host commands (settings/next round/explicit close) require the
shared host-action files; availability was requested from the coordinator to
avoid B's configuration work. Race start is implemented, not the entire host UI.
Temporary results, retention, transitions and public entry remain in progress.

## Temporary room results — October 29, 2026 (Toronto)

Executable/reviewed SHA: `c6ab3fc3212b7140ecbccba8909efcea1664e436`.
Same #187 branch and base; this replaces the preparatory guest-only start refusal,
following Philippe's approved no-durable-results rule for races without an account
participant. Account spectators do not create an account result/history to retain.

### Implemented and exercised

- Finalization classifies persisted entrant kinds. With guest entrants and no
  account entrant, it validates the complete result set and WPM payloads, commits
  the fenced race/room transition, and writes **no** `race_results`,
  `race_wpm_series` or `race_key_errors` rows. No insert-then-delete shortcut.
  Duplicate finalization recognizes the committed transition; malformed results
  roll the transaction back. Account races retain the existing durable path.
- A process-local room display receives only confirmed frozen results. It stores
  no cookie/proof, account ID, nickname or private key-error aggregate. Guest self
  mapping is limited to live membership and the current race. Account-race
  metrics still come from SQL; the cache supplies guest self mapping only there.
- Guest results SQL reads hold room/session locks, require current membership,
  the current race and RESULTS phase, and revalidate expiry. Account heatmaps and
  personal records are excluded in SQL/projection, not merely hidden in a client.
- `GET /api/guest/rooms/[lobbyId]/races/[raceId]` validates cookie/parameters,
  refuses account-cookie fallback, bounds reads, returns private/no-store with
  Vary: Cookie and never creates/renews a session or sets a cookie. Unknown race,
  ended presence and expired guest all reveal no result.
- Committed host closure discards the display directly. Phase/race notifications
  reconcile it against SQL with a generation check; stale cleanup cannot erase a
  newer display. Non-host guest departure removes self mapping. Process shutdown
  clears memory; no exact result recovery after a crash is claimed.

### Verification at c6ab3fc

| Check | Executed result | Local log |
| --- | --- | --- |
| root check:no-js / lint / typecheck / build | pass | `/tmp/guest-results-final-{nojs,lint,types,build}.log` |
| root unit suite | **2,333 passed**: web907/database146/domain1198/load20/wordlists62 | `/tmp/guest-results-final-unit.log` |
| complete local SQL suite | **337 passed, 9 existing PgBouncer skips** | `/tmp/guest-results-final-db.log` |
| Playwright guest commands + temporary results | **3 passed** | `/tmp/guest-results-final-e2e.log` |

The real-server E2E starts a two-guest race, abandons both entrants through the
real command gate, reads both private room-result views with distinct self
mapping, asserts all three durable metric tables empty, then proves refusal
after membership deletion and after RESULTS ends. The other two E2Es retain
account-host and guest-host starts plus accepted guest typing/activity.
SQL tests also exercise malformed ephemeral results/rollback, concurrent retries,
forged/expired/departed result readers and preservation of account history/private
heatmaps. Cache/HTTP unit tests cover disclosure, no cookie writes, budgets,
failure containment, departed/new member mapping and stale asynchronous cleanup.

All database/browser runs used synthetic local fixtures, never recipe3880 or
remote resources. No migration/schema/dependency/central matrix change. Earlier
focused command named a nonexistent `results.db.test.ts`; Vitest actually ran
only the two matching files (63 passed). It is not evidence for a third file.
The final full SQL run above includes the real `results-details.db.test.ts` and
history/profile suites. An initial typecheck found that the runtime helper's
entrant annotation omitted `ordinal`; it now retains the actual `StartedEntrant`
contract, without casts or invented ordinals.

Manual sequential code/security/DBA/functional-QA review on c6ab3fc: OK for this
internal results increment, no blocking finding in the delivered scope. No
external independent audit. Fenced finalization, null-account privacy, lock order,
read authorization, generation-safe cleanup and all final test outputs inspected.
This is not complete guest UI, general retention or multi-instance qualification.

### Remaining and coordination

The public guest entry remains closed. Remaining #31 work: the other inherited
host actions (settings/next round/close), explicit leave and account transition,
full guest-session/closed-room retention, browser first-cookie and refresh
coordination, avatar/admission UI, FR/EN and accessibility journey checks.

Display cleanup on a phase notification whose SQL read fails currently waits for
a later notification; SQL authorization still denies a closed/old race. The F
retention work must bound this cleanup and retire all guest session references
before public activation. No new retention scheduler or product policy is
introduced here. The cache API alone never authorizes a request.

Coordinator action proposed: record C2, guest host start and internal temporary
results as locally verified in draft187; keep #31 in progress. Confirm shared
host-action file availability before that final coupled wiring. This evidence
does not modify the board and does not request a merge.


## Guest lifetime increment — implementation, October 29, 2026

Shared actions/closure/settings paths were explicitly released to this unit by the
coordinator. Only identity authorization is extended; settings semantics remain
10–200 words. No migration or dependency is introduced.

- Accepted guest configure/next-round actions renew SQL activity atomically; stale
  revisions and duplicate next-round submissions do not. Close and explicit leave
  retire guest membership/session, with existing host succession and race semantics.
- Account login refuses active guest presence in both actions and the Auth.js
  callback. The final callback locks the guest identity against admission: an unused
  identity is retired, an admitted identity requires explicit departure. No results
  or account data are copied. SQL/configuration failures do not permit login.
- The sign-in screen explains departure consequences and provides an explicit
  translated confirmation. Guest cookies remain HttpOnly; no proof enters props.
- The local maintenance worker runs non-overlapping batches of at most 50 expired
  presences / 50 closed rooms, plus 100 unused expired identities, every 30 seconds
  after completion. Closed rooms become eligible at 23 hours, a technical margin
  under D-07's 24-hour maximum. No open room is purged. Account races survive room
  deletion with their collective entrants/results/series unchanged; no-account
  race metadata is removed with the room. No external scheduler is configured.
- SQL failures evict unverifiable temporary displays, including failures after
  partial maintenance commits. Removed guest sockets are disconnected before the
  next room snapshot. No history or missing ephemeral result is reconstructed.

Operational limit: outage or sustained cleanup backlog can delay physical deletion;
server-side expiry and authorization still deny access. These are bounded batches,
not a proof of a hard deletion SLA during database unavailability. Public guest entry
remains closed pending the remaining browser/UI integration and cumulative review.

Verification pending on the committed implementation. Intermediate targeted results:
42 unit checks, 40 room-channel checks, 10 host-action/transition SQL checks, and one
local Chromium departure/login test passed. The browser test exercised a direct
Auth.js callback and axe/no-overflow at 390/1024/1440 px. It preceded the final SQL
transition fence and must be rerun with the rebuilt application. A missing fixture
admission caused the first new room-channel test to fail; the fixture was corrected.


### Final lifetime verification @ 0772f356300a4d9f842c18b3ab26dbb986130b3e

Commits: `08d06682bd3ca1cd3309f904608894deff8f634f` implements the lifetime increment;
`0772f356300a4d9f842c18b3ab26dbb986130b3e` addresses DBA review by batching guest
retirement at closure and evicts the closing room cache before writing its cookie.
No edits occurred during the final gates/reviews.

| Check | Observed result |
| --- | --- |
| `npm run check:no-js` | Passed |
| `npm run lint` | Passed |
| `npm run typecheck` | Passed |
| `npm test` | 2,347 passed: web 921, database 146, domain 1,198, load 20, word-lists 62 |
| `npm run build` | Passed |
| `npm run test:db -w @incision/database` | 351 passed, 9 existing PgBouncer skips; local PostgreSQL 17 only |
| `npm run test:e2e -w @incision/web -- guest-session.spec.ts` | 9 passed; production build on localhost:3221, isolated synthetic database |
| Sign-in departure UI | axe WCAG 2.1 A/AA + no horizontal overflow at 390/1024/1440; screenshots manually inspected against screen 02 |

Local logs: `/tmp/guest-lifetime-verified-{nojs,lint,types,unit,build,db,e2e}.log`.
The earlier `guest-lifetime-final-*` logs cover 08d0668, not the final correction.
Snapshots: [390 px](transition-390.png), [1024 px](transition-1024.png),
[1440 px](transition-1440.png). These capture French/Aube; the entire guest room UI,
English browser flow and Nuit comparison remain part of the next integration unit.

Reviews applied manually and sequentially, not independent subagents/external audits:

- **Code reviewer — OK for this increment.** Read lifetime diff, typed account/guest
  host actor, action refusal paths, post-commit notification/cache handling, socket
  departure and worker shutdown/batching. Full root gates passed. Current cumulative
  README replaces contradictory historical status while retaining dated evidence.
- **Security — OK for this increment; public entry remains closed.** Signed proof
  stays server-side, account-prefix precedence remains, expiry/host authorization is
  rechecked in SQL, stale/forged actions do not renew. Direct Auth.js callback cannot
  bypass explicit departure. SQL transition/admission race has only one winner.
  Removed guest sockets get no subsequent room snapshot. SQL failures discard cache
  rather than retaining unverifiable member mappings. No OAuth provider contacted.
- **DBA — OK after correction.** Room-before-session order retained; sorted batch
  session locks and set-based retirement replace per-member closure queries.
  Transactions preserve account rows, synthetic photo bytes, account result views,
  collective metrics/series; open rooms and settings remain intact. Repeated purge
  is idempotent. All published migrations remain byte-for-byte unchanged; no new
  migration. Physical cleanup during outage/backlog is not a hard SLA guarantee.
- **Functional QA/UI — OK for the tested increment, not full #31.** HTTP cookie/
  expiry/forgery/origin/account precedence, multi-tab watch, real non-host grace,
  explicit departure then local credentials login, direct callback refusal, SQL
  conservation and targeted responsive accessibility passed. No guest entry/race
  journey, browser matrix beyond Chromium, remote database, or deployment claimed.

Coordinator proposal only: retain #187 as draft/in progress; mark lifetime/transition
increment verified at 0772f35, with the browser/public-entry/room-UI items above still
to do. No central board or requirements matrix was edited. No merge or deployment.
