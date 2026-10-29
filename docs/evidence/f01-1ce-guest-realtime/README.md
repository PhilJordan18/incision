# #31 — guest realtime identity: partial integration evidence

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
