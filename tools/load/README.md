# Local race load harness — F-08.1 / #72

This records transport and persistence, with optional simultaneous browser observation.
It does not certify Azure capacity or physical-device smoothness.
It launches this checkout's production build with 30 typing clients and 20 spectators in one room.
No changes to the application, rate limits, authentication checks or race rules.

## Run

Requires Node 24, installed workspace dependencies, the Incision test PostgreSQL server on
`127.0.0.1:5433`, and a clean isolated checkout without `apps/web/.env*` files.
Do not run alongside another build, load test or human acceptance session.

```sh
npm ci
npm run build
LOAD_CONFIRM=local-only npm run load -w @incision/load
```

The default uses the documented local test database credentials. `LOAD_DATABASE_URL`, if set,
must point to the admin database `postgres` on **literal `127.0.0.1:5433`**, without query
parameters or fragments. `LOAD_PORT` defaults to 3420. A used port is refused.
There is intentionally no configurable target server: `LOAD_URL` is refused.
The harness creates its own server and a unique `incision_load_<timestamp>_<random>` database.
It never resets an existing database. On completion or a handled interruption it stops its own
server and deletes only that run-owned database. Cleanup errors are reported and fail the command.
A forced OS kill can leave resources; inspect the exact reported run name before manual cleanup.
The Docker test service is not stopped by this harness.

## What is exercised

1. Apply the real migrations to a fresh local database, then check and import the pinned
   `packages/database/corpus/2026-10-25.4/` through the project's normal corpus importer.
   Record its version, checksum and the passage actually saved in the race. No fixed-text
   fallback is enabled; `TEXTS_UNAVAILABLE` still fails the run. This local import does
   not imply editorial acceptance or permission to import into production.
2. Create 50 synthetic accounts, generate local Auth.js session cookies with a fresh secret, and
   create/join the room through the real database membership functions. This **does not measure
   HTTP admission, password login or OAuth**. There are no real users or credentials.
3. Connect 50 real WebSocket-only Socket.IO clients; authenticate and watch their room.
4. Ask the real host socket to start the race. Receive the actual configured public-domain passage,
   not the short E2E fixture. Honour the server countdown, then type the passage correctly with
   30 independent clients (125–153 ms between acknowledged inserts, plus network/processing time).
   Each sends one grapheme per batch, one batch in flight, no backdated or catch-up sends.
5. Require every batch to be applied, all 30 results to be saved as `finished`, and all 20
   spectators to receive racing progress and committed results. Any missing evidence, refusal,
   protocol error, unexpected disconnect, timeout or cleanup failure makes the command fail.
6. Save a sanitized JSON report under ignored `results/`. The run has a 180-second cancellation
   deadline; startup, socket acknowledgements, observations and SQL waits are also bounded.

This baseline is deliberately independent of the bot engine (#58) and bot UI (#59).
These are simulated human protocol clients, not product bots. Reconnection, malformed batches,
bot profiles, bonuses, multiple rooms and admission bursts are separate scenarios.

## Reading the results

- `batchAckRttMs`: monotonic client elapsed time from emitting a batch to its acknowledgment.
  Includes client scheduling, local transport and server work; not pure server execution time.
- `spectatorBroadcastGapMs`: interval between received racing progress messages. **Not** one-way
  network latency, frame time or input-to-paint latency. Countdown and finalization gaps excluded.
- Percentiles use nearest rank; empty samples yield `null`, never a misleading zero.
- Per-client counts and summaries prevent aggregate percentiles from hiding a missing spectator.
- Machine, Node, SHA, dirty state and build ID identify the measured environment. Client and server
  share a computer, so results are a local baseline, not a capacity certification.
- Official scope: `SALLE-05` permits 2–30 participants, and D-22 adds at most 20 spectators.
  These 50 simultaneous connections are **30 racing participants**, not 50 racers. D-15
  separately asks for readability up to 50 drawn runners as a visual safety margin.
  `PERF-03` requires a smooth track at maximum capacity; it specifies no numeric RTT/FPS threshold.
- No latency target has been approved. Report measured values; do not invent a pass threshold.
  The executable gate asserts functional coverage, not an undocumented latency SLA.
- A clean final run and its summarized evidence are committed separately; raw reports contain no
  cookies, secret, DB URL, account IDs or room code.

## Simultaneous browser observation

Install the workspace's Chromium (`npx playwright install chromium`), then run:

```sh
LOAD_CONFIRM=local-only LOAD_BROWSER=1 npm run load -w @incision/load
```

A real Chromium headless tab observes the same room using an existing spectator's synthetic
session: **51 socket connections, 50 members, 30 racers and 20 spectators**. The extra tab
is not an extra spectator member. No route/Socket.IO mocks are used. The probe samples
`requestAnimationFrame` intervals while runners are present, marker movement, runner counts,
long tasks (browser Long Tasks API, ≥50 ms), JavaScript errors and the persisted results table.
Its gate checks functional observation, never an invented FPS target. The initial frame is
excluded from interval calculation because its timestamp may precede probe setup.

The report describes one headless FR/Abysse viewport (1440 × 1000), not input-to-paint latency,
a subjective visual judgement or a physical screen refresh guarantee. It runs on the same
machine as the load clients and server; sampling itself has overhead. Other locales, themes,
small widths and keyboard behavior are covered separately by existing browser tests.

## Remaining PERF-03 evidence

Repeat the observation on target physical devices and obtain human acceptance. The final signature track, and later server/UI
changes, require a rerun. Production load requires Philippe's separate explicit authorization.
The issue remains open and PERF-03 partial until those checks are complete.

## Verification

`npm run lint -w @incision/load`, `npm run typecheck -w @incision/load`,
`npm test -w @incision/load`, plus the repository checks and a real local run.
The unit suite pins local-only guards, metrics and coverage failure modes.
The workspace is dev-only and must not appear in the release archive.
