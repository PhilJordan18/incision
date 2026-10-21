# Seeded bots — F-05.1

This is the pure engine, not a server scheduler. F-05.2 (#59) owns room controls, bot identities,
the server driver and their display. Bonus distribution/activation remains F-06. No word list,
database, dependency or UI is needed here.

## Profiles and calibration

| Engine ID | Target net WPM | Indicative error fraction | Approved French display title (#59) |
|---|---:|---:|---|
| noob | 10–20 | .12 | Mousse |
| beginner | 20–35 | .08 | Quartier-maître |
| intermediate | 35–60 | .05 | Capitaine |
| expert | 70–100 | .02 | Empereur des mers |
| impossible | 140–170 | .005 | Roi des pirates |

Philippe approved the pirate titles in the active conversation. They are a narrative progression,
not historical ranks. #59 will put the visible titles in both UI dictionaries, with an explicit
difficulty label. Technical IDs and calculations never depend on translations.

The midpoint of each range sets the base delay (12,000 / WPM milliseconds per character). Every
new intention draws a cadence factor in [.7, 1.2); a 6% hesitation adds one base delay. The local
spelling heuristic adds .025 per letter beyond six (capped at .2), and .1 when a word contains a
character outside ASCII letters. Its maximum is .3. This is a typing heuristic, not editorial
complexity, and reads no dictionary. Errors add half a base delay for the mandatory repair, or
before the erroneous insert in free mode. Thus even an erroneous finishing character costs time.
The minimum delay is 60 ms: no scheduled burst can bypass the existing plausibility validator.

Mandatory mode forces the next insert correct after an error: at most one error before progress.
Its initial error probability is r/(1-r), so repairs included give approximately r errors per
insert. Free mode uses r, advances incorrectly and preserves the error in the authoritative
counters; it never silently fixes the result. Pauses and difficult words can put individual races
outside a target range. No measures are capped or rewritten to meet the targets.

`engine.test.ts` checks 80 fixed seeds per profile and mode on a bilingual reference text, using
the real reducer and measures. It asserts pooled net WPM within the documented range, a six-sigma
error-rate tolerance plus .001 for finite-length repair bias, and variable intervals. Other tests
cover accented/long words, short texts, both modes and the final-character error. The reference
corpus is a hand-written fixture, not a replacement for the reviewed production corpus.

## Integration contract

1. Create one bot from the race/entrant IDs, frozen level, startsAt and an independent server-only
   `RandomState` drawn by the server. Never use this PRNG for room codes or tokens.
2. Pass `stepBot(bot, now, context)` the current authoritative entrant and phase. Advance the
   race reducer's due transitions first. The first call schedules, rather than inserts, a key.
3. Save the returned bot state. If `batch` exists, apply it synchronously through `reduceRace`
   with the SAME server `now`; never trust an old scheduled time as an arrival time. Save that
   authoritative race and call stepBot again with its entrant and the reply. A proposed batch
   changes no position or counters. An applied ack schedules the following key.
4. If `nextAt` exists, schedule the next call. Without batch/nextAt, await acknowledgement or
   stop for a terminal entrant/race. A refusal or resync must be supplied in `reply` with the
   updated authoritative context; a stale reply is ignored. No hidden retry timer exists.
5. An unexpected WRONG_RACE/UNKNOWN_ENTRANT indicates an adapter bug: the adapter should stop
   and diagnose it, not repeatedly retry a broken association.

The adapter is the sole writer for a bot. It must not retain an old reply as feedback for a later
attempt reusing the same seq. Each proposed batch is handled once, then its result is fed back
before requesting the next proposal. Human clients never submit bot inputs or choose their seed.
The seed, saved random state and private plans remain on the server, never in public snapshots.

The supplied context is a validated engine state, not an untrusted client payload. A restored
BotState must be a trusted snapshot produced by this engine version. IDs, numeric bounds, version,
profile and configuration are checked; this is not a parser for arbitrary persisted JSON.

## Time, target changes and termination

Early polling consumes no random numbers; a repeated call while a batch is in flight produces
nothing. Backwards time produces no action. A late call emits at most ONE insert at the current
time. Scheduling resumes from the actual time acknowledged, so a server stall slows the bot;
there is no catch-up loop, fabricated progress or retroactive victory. Replay requires the same
seed, initial state, authoritative events AND clock readings. It does not promise identical race
times across different server stalls.

The current entrant target, position and textVersion govern every new intention. If these change,
an old plan is discarded and a fresh delay is scheduled. #59 must never apply an already returned
batch after a text change without the reducer: its old version requires resynchronisation. Tests
simulate these changes; actual bonus application, fog response and seeded activation wait for F-06.

`maxBotCompletionMs(level, graphemes)` derives a conservative bound: at most two inserts per
position, each delay at most 3 × 12,000 / minimum profile WPM (rounded up). It is valid for a
stable, valid text up to 4,000 graphemes, immediate acknowledgements and calls at each deadline.
The 200-long-word Noob test demonstrates termination through the real reducer without a time
limit. Late scheduling adds its own delay; repeated external additions have no fixed completion
bound. A configured race deadline wins normally: Noob is not promised to finish 200 words in two
minutes. Overflow near MAX_INSTANT throws rather than scheduling an unrepresentable instant.

No timer, Date.now, Math.random, network or IO is used. State is immutable and JSON-serialisable;
BOT_ENGINE_VERSION and the existing PRNG_VERSION identify the replay rules. Changing these rules
requires versioning and an integration handoff, not silently replaying older saved state.
