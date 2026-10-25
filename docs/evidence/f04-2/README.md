# F-04.2 — round-trip countdown clock

Code reviewed at `fc47f826e60b9ac1e379a0405e20dd0131036fd4`, from `dev` `2b99993`.
The following documentation commit does not change executable sources.

## Delivered scope

The room probes the existing `system:ping` endpoint on connect, without waiting
before watching the room. Three initial serial probes are spaced by 250 ms;
subsequent probes are spaced by 30 seconds. Each has a five-second deadline.
The clock keeps at most eight samples from the preceding two minutes and uses
the shortest round trip. At receipt, estimated server time is the ping reply's
`serverTime + RTT / 2`. Elapsed time then uses `performance.now()` so changing the
browser wall clock does not move a calibrated countdown. Reveal/progress time
is fallback only until calibration succeeds. Failed refreshes retain the last
usable estimate; reconnect starts a fresh sample window. Disconnect/unmount
cancel timers and invalidate pending replies.

No server authority, event shape, text reveal, dependency, data or UI markup
changes. Midpoint estimation assumes roughly symmetric network paths: this is
not an exact synchronization guarantee over arbitrary asymmetric links.

## Verification, October 25, 2026

- Root no-JS guard, lint and typecheck: pass.
- Root unit suite: **1,681 passed** (web 527, database 70, domain 1,018,
  load 20, word-list tools 46).
- Targeted final-SHA rerun: **25 passed** across `clock-sync.test.ts`,
  `clock-sync.socket.test.ts`, `race-client.test.ts` and `ping.test.ts`.
  Deterministic scenarios cover midpoint delay, shortest RTT, sample expiry,
  wall-clock adjustments, malformed replies, timeout/recovery, reconnect,
  late replies and cleanup. RaceClient retains calibration after a delayed
  reveal. A real loopback Socket.IO acknowledgement corrects a browser clock
  intentionally ahead by 60 seconds using the existing server ping handler.
- The first loopback run failed under sandbox `listen EPERM`; it passes outside
  that sandbox. No product workaround or test skip was introduced.
- Production build: passes after one unchanged retry. The first build stopped
  after compilation on the existing Next.js security advisory. The retry does
  not fix the dependency vulnerability; remediation is separately scoped by
  the other Codex session before production.
- One existing two-browser race scenario was attempted, not the whole suite.
  It **did not start**: local PostgreSQL refused connections on port 5433.
  No scenario passed, no database was recreated, and no other session's database
  was used. Browser acceptance remains pending.
- `git diff --check`: pass. No presentation change; no new screen completion
  or screenshot comparison claimed.

Historical text-secrecy evidence remains the merged integration test in #111
and the integrated-dev gate recorded on October 21. These are not new runs.

## Reviews and coordination

Code-reviewer and functional-qa roles were applied sequentially in this session,
not by independent agents. No blocking code finding remains. The browser
acceptance limitation above stays visible; the PR is for review, not approval
to merge or deploy. UI review is limited to the unchanged markup and three
socket lifecycle additions; layout, dictionaries, tokens and logo are unchanged.

The other Codex explicitly released `room-view.tsx`, `race-client.ts`/tests and
COURSE-03 after publishing #133. Claude A/B received coordination on #40/#129;
their reserved files are untouched. The first merge-tree check detected adjacent
connect/disconnect insertions conflicting with #133. Separate socket listeners
fixed that conflict without incorporating or modifying #133. Final read-only
composition at `fc47f82` with #133's `67edcfb` succeeds (tree
`0ff59177c14aac295ab33d2b906bac7be81e9cba`), preserving both lifecycles. This is
static composition evidence, not a merged-branch runtime test.

#50 remains open until review and pending acceptance are complete. COURSE-03
stays partial in the matrix. No merge, production deployment or remote-resource
operation was performed.
