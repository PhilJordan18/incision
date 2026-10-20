# Local race load harness — F-08.1 / #72

This is **transport and persistence evidence**, not a claim of visual smoothness or Azure capacity.
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

1. Apply the real migrations to a fresh local database.
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
- No latency target has been approved. Report measured values; do not invent a pass threshold.
  The executable gate asserts functional coverage, not an undocumented latency SLA.
- A clean final run and its summarized evidence are committed separately; raw reports contain no
  cookies, secret, DB URL, account IDs or room code.

## Remaining PERF-03 evidence

Open the final track in a real browser under equivalent load and record smoothness, responsiveness
and long frames on the target viewport/device. The final signature track, and later server/UI
changes, require a rerun. Production load requires Philippe's separate explicit authorization.
The issue remains open and PERF-03 partial until those checks are complete.

## Verification

`npm run lint -w @incision/load`, `npm run typecheck -w @incision/load`,
`npm test -w @incision/load`, plus the repository checks and a real local run.
The unit suite pins local-only guards, metrics and coverage failure modes.
The workspace is dev-only and must not appear in the release archive.
