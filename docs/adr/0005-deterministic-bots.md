# ADR-0005 — Pure deterministic bot engine, server-driven integration

- Status: **accepted and implemented for the engine**; room admission and scheduling remain F-05.2.
- Date: 25 October 2026; reviewed against `dev` at `f4600af`.
- Scope: engine behaviour for BOT-01/02/03/05 in F-05.1. This is not evidence that their room integration or BOT-04 presentation and bonus behaviour are complete.

## Context and decision

Bots need five distinguishable levels while obeying the same text, correction and scoring rules as human entrants. I keep their decision-making in a [pure domain engine](../../packages/domain/src/bots/engine.ts). The caller supplies time, authoritative typing state and feedback. Each bot retains its own versioned pseudo-random state. No timer, socket, database access or global random source is hidden inside the engine.

I chose generated typing intentions applied through the normal race reducer instead of directly changing a bot's progress or WPM. This preserves correction, text versions, limits and ranking semantics. The domain can represent bot entrants; the current server service and persisted account-backed entrants do not yet provide their room integration.

## Alternatives

| Approach | Trade-off | Decision |
|---|---|---|
| Update progress using a speed formula | Small implementation, bypasses actual typing and correction | Rejected. |
| Run bots in a browser | Convenient local animation, lets a client influence authoritative competitors | Rejected. |
| Timer and global randomness inside each bot | Easy initial wiring, hard to reproduce or test delayed execution | Rejected. |
| Pure engine with server-supplied time and reducer feedback | Reproducible and shares human rules; requires a separate driver | Selected. The driver remains an integration task. |

## Implemented contract

`createBot` fixes identity, level, seed and start time. `stepBot(previous, now, context)` returns the next bot state, an optional typing batch and an optional next deadline. The first call schedules an intention. A due call proposes at most one insertion, then waits for authoritative feedback before proposing another. Early polling consumes no randomness; moving time backwards produces no action.

A change in sequence, text version, position or expected grapheme invalidates a pending plan. Refusal or resynchronisation feedback clears the obsolete proposal. The caller must apply the returned batch through the race reducer using the **current server time**, then supply the resulting state. A delayed wake-up slows the bot instead of backdating an arrival or emitting a catch-up burst.

The random generator is [xoshiro128** 1.1](../../packages/domain/src/random/prng.ts), with four 32-bit words and a nonzero state. Its version and `BOT_ENGINE_VERSION` make the algorithm explicit. It is not cryptographic: future server integration must obtain seeds from a suitable server-side source and must not use this PRNG for room codes, sessions or secrets. Changing an algorithm version requires deliberate compatibility and calibration review; no durable replay facility is claimed here.

## Profiles and correction

The [profile table](../../packages/domain/src/bots/profiles.ts) fixes the following targets. These are engine parameters, not a guarantee that each short run falls inside its WPM interval.

| Level | Target WPM range | Target wrong-insertion rate |
|---|---:|---:|
| Noob | 10–20 | 12% |
| Beginner | 20–35 | 8% |
| Intermediate | 35–60 | 5% |
| Expert | 70–100 | 2% |
| Impossible | 140–170 | 0.5% |

The base delay uses the midpoint of the WPM interval. Seeded variation, occasional hesitation, local text difficulty and correction cost modify it, with a 60 ms minimum. In mandatory correction mode, an error is followed by a correct repair; the initial error probability accounts for those extra repair insertions. In free mode the target error rate applies directly, without silently repairing the score.

`maxBotCompletionMs` supplies a conservative completion bound for a stable valid target of at most 4,000 graphemes, prompt acknowledgements and calls at the scheduled deadlines. Delayed scheduling adds delay. Repeated text extensions or a stalled driver invalidate a fixed wall-clock completion claim. The [engine README](../../packages/domain/src/bots/README.md) explains the calculation and caller contract.

## Verification

The [engine tests](../../packages/domain/src/bots/engine.test.ts) exercise determinism, correction, scheduling, delayed polling, refusal, text-version resynchronisation and completion through the real race reducer. Calibration covers 80 seeds × five levels × two error modes: **800 simulations**, with explicit statistical tolerance. The [PRNG tests](../../packages/domain/src/random/prng.test.ts) cover the generator separately.

The targeted run for this documentation revision passed **62 tests across these two files**; see the [verification record](../evidence/f10-2-architecture/README.md). This validates domain behaviour locally, not bot admission, server load, browser presentation or production operation.

## Integration still required

F-05.2 must connect authorised add/remove operations, entrant identity and persistence, server scheduling and feedback, and visible bot identification. Those changes need their own tests and acceptance evidence. The ordinary room path currently creates account-backed human entrants and does not invoke this engine.

Bonus coordination exists separately, but its presence does not prove that playable bots and Arcade are qualified together. I retain that boundary in the [architecture](../ARCHITECTURE.md#7-bots-et-bonus--limites-de-lintégration) rather than treating a pure-engine delivery as the entire bots epic.
