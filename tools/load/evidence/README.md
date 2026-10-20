# Local baseline, October 20, 2026

`2026-10-20-local.json` is the complete sanitized report from the clean code commit
`93d5199fda970d1c0cbcaca102c07e3d4bd3b4b7`, based on `dev` at `bee998e`.
The evidence/matrix commit that follows it does not change the harness or application.

Command: `LOAD_CONFIRM=local-only npm run load -w @incision/load`, after `npm run build`.
Machine: Intel i7-9750H, 12 logical CPUs, 16 GiB RAM, macOS x64, Node 24.13.0.
Client and server share this machine; other system activity is represented by its load averages.
This is not a dedicated benchmark machine, an Azure test, or a browser rendering measurement.

| Evidence | Result |
| --- | --- |
| Runners / spectators | 30 / 20 |
| Applied batches / expected | 11,910 / 11,910 |
| Finished / saved results | 30 / 30 |
| Spectators receiving racing progress and committed results | 20 / 20 |
| Protocol errors / unexpected disconnects | 0 / 0 |
| ACK RTT median / p95 / p99 / max | 0.88 / 1.71 / 5.13 / 17.77 ms |
| Spectator racing broadcast gap median / p95 / max | 250.40 / 252.16 / 347.99 ms |
| Whole run, including preparation | 69.84 seconds |
| Cleanup errors | none |

All 50 individual client summaries are in the JSON. The gap maximum is an observation,
not a claim of a guaranteed broadcast deadline. The pass result proves functional coverage;
no performance SLA or FPS threshold was invented.

An earlier exploratory run on an uncommitted working tree also completed (11,910 ACKs;
p95 RTT 2.45 ms). It is not the reference evidence. It led to stronger full-roster checks:
receiving some progress is insufficient if participants are missing or duplicated.

The production build was tested with the real configured 397-grapheme French public-domain
passage, mandatory correction, only correct inputs, one batch in flight per runner.
This does not cover human typing mistakes, reconnect storms, bots, bonuses, multiple rooms,
HTTP admission/login traffic, or rendering of the future final track. Those require distinct runs.

PERF-03 remains partial and issue #72 stays open.
