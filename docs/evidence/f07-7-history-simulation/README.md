# F-07.7B — Seeded race simulation

Card [#70](https://github.com/PhilJordan18/incision/issues/70), TECH-04. Base: `dev` at `3a1dcff`, 25 October 2026.

## Delivered boundary

`simulateRace` is an offline, synchronous helper exported by `@incision/domain`. It creates a race through `createRace`, drives configured bots through `stepBot`, and applies every intention and human event through `reduceRace`. It returns that reducer's `RaceEnd` and final state without rewriting positions, measures or rankings.

This is the simulation half of the demo-history seed. It writes no database rows, does not import a corpus, does not create accounts, and is not the room bot scheduler. The existing corpus importer and demo accounts remain separate. Idempotent persistence that cannot overwrite real data is still required before #70 can close.

## Caller contract

- Supply a valid typed `CreateRaceInput`, with at least one human and the existing participant/text/time-limit rules. The simulator never weakens the minimum-human rule to allow an all-bot race.
- Supply exactly one level and nonzero PRNG seed for each bot entrant, and none for human entrants. Configuration order does not affect registration-order tie breaking.
- Supply a nondecreasing array of explicit human events if desired. Human typing keeps its actual human identity. No bot intention may be injected through that script. A silent human is subject to normal inactivity/time-limit rules; an abandoned demo participant must be scripted or genuinely abandoned by the reducer.
- Events at the same timestamp preserve human script order, followed by bot registration order. The reducer applies due deadlines before an event, so a deadline wins its documented tie with typing. Only one bot batch is submitted before inspecting its acknowledged state again.
- Identical input, seeds and script reproduce identical output. The simulator uses no wall clock, timers, IO, global randomness or mutable shared state. A seed does not promise the same output if the script or engine algorithm changes.
- Input is trusted typed seed configuration, not an HTTP/JSON parser. Invalid branded identifiers, forbidden text or other `createRace` programming errors can still throw. Structural simulation refusals are typed: invalid limits/race/bots/script, refused event, work/time limit or stalled schedule.
- `maxSteps` defaults to 100,000 scheduling iterations, with a hard maximum of 1,000,000. The existing maximum of 30 participants bounds work in an iteration. Human scripts are limited to 100,000 events. `maxDurationMs` defaults to ten virtual minutes from countdown creation, with a hard ceiling of one hour. A long multi-bot simulation may need an explicit larger work budget; exhaustion returns a refusal, never partial official results.
- Simulation stops at the first completed race; later scripted events are not executed. It does not simulate bonus effects, persistence, transport lag, disconnect detection latency or profile photos.

## Example for a future seed adapter

```ts
const result = simulateRace({
  race: {
    raceId: asRaceId("demo-race-1"), text: approvedText,
    errorMode: "mandatory", timeLimit: asDuration(120_000), now: asInstant(0),
    participants: [
      { entrantId: asEntrantId("demo-human"), kind: "human" },
      { entrantId: asEntrantId("demo-bot"), kind: "bot" },
    ],
  },
  bots: [{ entrantId: asEntrantId("demo-bot"), level: "expert", seed: [1, 2, 3, 4] }],
  humanEvents: [{ type: "abandon", entrantId: asEntrantId("demo-human"), now: asInstant(3000) }],
});
// Only result.ok yields a complete RaceEnd. A future local seed adapter must map demo
// identities, label synthetic history and persist idempotently in its own transaction.
```

`approvedText` must come from the caller's approved content; the fixture text used by unit tests is not promoted into the real corpus. No sample seed should be mistaken for a production credential or a historical human performance.

## Verification and review

Tests cover all five bot levels in both correction modes, deterministic replay and input preservation, bot-order independence, real deadline timeouts, human typing, inactivity abandonment, missing/foreign/duplicate/zero-seed bot configuration, invalid script order or identity, a refused sequence, and bounded work/time. Existing bot-engine tests are also rerun to check the integration contract.

Commands from the root (Node 24), under the shared heavy-command lock:

```sh
npm test --workspace @incision/domain -- src/simulation/simulate-race.test.ts src/bots/engine.test.ts
npm run lint --workspace @incision/domain
npm run typecheck --workspace @incision/domain
npm run check:no-js
git diff --check
```

Exact final SHA and command outcomes are recorded in the PR and #70. Code review and functional QA are applied sequentially, with architect consolidation. No browser test, SQL operation or production verification is claimed by this pure simulation tranche.

Shared-file coordination: no photo/profile, runtime, corpus, migration, dependency manifest, lockfile or database export change. The only existing source change is the additive domain export. TECH-04 remains partial; the central EXIGENCES file is preserved while Claude owns its consolidation. This note supplies the simulation evidence for that later update.

Local verification: **41 tests passed across two files** (16 simulator cases and 25 existing bot-engine tests, including the 800 calibration simulations); domain lint/typecheck, no-JavaScript and diff checks passed. The simulator test imports the public domain export. Type checking initially caught an unavailable `structuredClone` test helper; replacing it with a JSON snapshot preserved the package's intentionally minimal environment. No runtime workaround or suppression was added.

Source: [simulator](../../../packages/domain/src/simulation/simulate-race.ts), [tests](../../../packages/domain/src/simulation/simulate-race.test.ts), [bot contract](../../../packages/domain/src/bots/README.md). The domain package has no build script; this module has no web adapter in this tranche. Existing CI will verify the full workspace integration after publication.
