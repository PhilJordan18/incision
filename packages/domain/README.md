# @incision/domain — the engine

These are the pure rules of Incision, shared by the server, the bots and the browser. Same input,
same output: nothing here reads a clock, draws at random, schedules, or touches the network, the
disk, the database or the application. The instant and the seed are parameters.

Two things enforce this:

- **`eslint.config.ts`** forbids clocks, randomness, timers, `globalThis` and `global`, aliases of
  `Math` or `Date`, dynamic imports, and imports of Node, the database or the application. Bare
  module names match exactly, so the package's own files may be called `events` or `timers`.
  `src/eslint-guard.test.ts` proves each rule.
- **`tsconfig.json`** has `types: []` and no DOM library, so Node and browser globals do not even
  type-check here.

The server and the interface wire these rules to sockets, the database and the screen, and never
re-implement one. A missing rule is added here, not copied there.

## Conventions

- **Time** (`src/time.ts`, `src/race/elapsed.ts`). The server's clock is the only authority
  (COURSE-06).
  - An `Instant` is a point in time, in integer milliseconds since the epoch, from a monotonic clock
    the server injects. A `Duration` is an elapsed span in integer milliseconds.
  - Client timestamps never reach the engine: a keystroke batch is timed by the server's `now`.
  - Every measure uses `measuredElapsed`. It is 0 before the start, frozen at the entrant's end,
    and otherwise exact, whatever the length of the race.
  - `MAX_DURATION_MS` is the whole range of accepted instants: a bound on what the engine can
    represent, not a race limit. A race's time limit is its configuration (CONF-01, D-17).
  - The validators throw on a non-finite or out-of-range value. That is a programming error, never a
    reply to a client.
- **Identity** (`src/ids.ts`). The server resolves a `RaceId` and an `EntrantId` before calling the
  engine: the entrant comes from the authenticated socket, or is a server-driven bot. A client
  payload never carries an `EntrantId`, so it is never proof of identity. The ranking's last
  tie-break is `compareIds`, in code-unit order.
- **Text** (`src/text/graphemes.ts`). The unit is the NFC grapheme cluster, split by `toGraphemes`.
  Positions, progress and the Appendix A counts all use it; "é" counts once however it was typed.
  An insert carries one grapheme of at most `MAX_GRAPHEME_LENGTH` code units as received
  (`singleGrapheme`); its NFC form may be longer.
- **Enter** (D-16) activates a bonus and never appears in a race text. An insert holding a line
  break refuses the whole batch (`INVALID_INPUT`), so it never counts as a keystroke, and
  `createRace` throws for a text holding one. A line break is what Enter produces ("\n", "\r",
  "\r\n") or any other mandatory break of Unicode. `containsLineBreak` is exported so the
  interface can filter Enter with the same rule, and the text pipeline can turn line breaks into
  spaces before a race.
- **Randomness** (`src/random/prng.ts`). Seeded, never drawn here: the server draws a
  `RandomState` (four uint32, not all zero) with crypto and passes it in. `createRandom` runs
  xoshiro128** 1.1 (Blackman and Vigna, public domain), local to one pure call. `state()` resumes
  the exact sequence, so a stored state and `PRNG_VERSION` reproduce a draw. `index` is unbiased by
  rejection; `shuffled` is Fisher–Yates on a copy. Never for codes, tokens
  or anything secret: room codes keep crypto (D-01). A state stays on the server, never in a
  client payload or a log, and each purpose (a text, a bot, the bonuses) draws its own fresh state:
  xoshiro is invertible, so a few outputs reveal the state that produced them.
- **Refusals** are typed codes, never sentences: the interface translates them (I18N-01).

## Keystroke protocol (`src/race/types.ts`)

There are four counters, never mixed up:

| Counter | Scope | Use |
|---|---|---|
| `raceId` | the race | A batch for another race is refused (`WRONG_RACE`). |
| `seq`, `ackSeq` | one entrant | `seq` starts at 1, and every reply echoes the `seq` it answers. A retry (`seq <= ackSeq`) is a harmless `duplicate`; a gap asks for a resync. |
| `textVersion` | one entrant's text | 0 for the initial text. It changes only when a bonus changes that entrant's text. A batch typed against any other version gets a resync and is never reinterpreted. |
| `revision` | the broadcast | Starts at 0 for each race and moves by exactly 1 for each output whose public view changed (`changed`: `toRaceBroadcast` at the handled instant, revision aside), however many transitions one event triggered. Clients keep the highest revision of the current `raceId` and drop stale snapshots. It never refuses keystrokes: another player's progress never invalidates a batch. |

**One batch in flight per entrant, not per tab.** The client sends its next batch only after the
reply to the previous one, gathering keystrokes meanwhile, and splits more than `MAX_BATCH_EVENTS`
pending events into several batches.

- The server guarantees one emitter per entrant; the engine sees no connection. Only the entrant's
  controlling connection submits batches. Another tab of the same member observes, or asks for an
  explicit transfer of control.
- Once the controlling connection drops, the next one to take control replaces it, and batches
  still arriving from the old one are discarded before the engine. Two tabs can therefore never
  both send `seq` 1 with different events.

- A batch is applied whole or not at all, and a refusal never consumes a `seq`.
- A batch is immutable once sent: a retry repeats the same `seq` with the same events, and a `seq`
  carries other events only after a refusal or a resync of it.
- A reply whose `seq` is not the batch in flight is ignored.

| Reply | What the client does next |
|---|---|
| `applied` | Next batch is `ackSeq + 1`. |
| `duplicate` | That very batch was already applied. Next batch is `ackSeq + 1`. |
| `resync`, or `refused` with a snapshot | Drop the unapplied keystrokes, rebuild the typing zone from the snapshot, continue at `snapshot.ackSeq + 1`. |
| `refused` without a snapshot (`WRONG_RACE`, `UNKNOWN_ENTRANT`) | Reload the race. |

**On a disconnection,** the client drops the transport's send buffer, so no queued copy survives.
After the reconnection, the server sends the `RaceReveal` again, then the snapshot.

- The batch that was in flight counts as applied if and only if `snapshot.ackSeq` is at least its
  `seq`.
- Otherwise the client resends it unchanged, as the only copy, and keeps its events shown on top of
  the snapshot.

**Order of the checks:** race and entrant (`reduceRace`), then in `applyKeystrokes`:

1. shape (`INVALID_INPUT`);
2. duplicate;
3. phase and entrant status;
4. gap;
5. text version;
6. size;
7. each input;
8. plausibility of the new total.

**Error modes** (CONF-08, D-09, D-19). Both are offered; mandatory correction is the default.

- **Free mode.** The player advances despite errors: a wrong insert enters the text and counts as
  an error, and a deletion lets them correct it. The entrant finishes on reaching the target length,
  and finishers rank by arrival, as in every mode.
- **Mandatory correction.** A wrong insert counts, is never inserted, and marks the expected
  grapheme (design screen 09) until the right one is typed. Random key-mashing therefore never
  advances; this limits mashing, but it is not a general guarantee against cheating.
- **After the finishing insert,** every later event in the same batch is discarded and not counted.

## Starting a race (`createRace`)

`createRaceRefusal` gives the reason `createRace` would refuse, checked in this order:

1. the start rule (`startRefusal`, COURSE-02);
2. a duplicate entrant;
3. an empty text;
4. a text longer than `MAX_TEXT_GRAPHEMES` NFC graphemes;
5. a time limit that is neither null nor an integer from 30 000 to 600 000 ms, inclusive.

`createRace` applies it first, so the two never disagree. It reads only the participants, the text
and the time limit. Passing it guarantees valid parameters, not that the host may start or that the
room is still available: under the room lock, the start rechecks the host, the phase and the
participants, and gives `createRace` the text, configuration and entrants frozen for that
transaction.

Values only the server produces (the ids, the kinds, the error mode, its clock) are programming
errors when invalid: `createRace` throws a `RangeError` for them.

## Immediate feedback (`predictTyping`, COURSE-04)

The typing zone reacts to every key before the server replies. `predictTyping(start, events,
errorMode)` applies the engine's own typing fold, the one `applyKeystrokes` uses:

- It gives the typed graphemes, one mark per grapheme (`typedMarks`), the pending error and the
  finish, and nothing else: no counter, measure, rank or `seq`.
- It skips the checks only the server can make (sequence, phase, status, text version, size,
  plausibility). For a batch the server applies, the prediction equals the applied state.

The client keeps a confirmed start and predicts from it the batch in flight followed by the events
gathered since:

| Moment | Start | Events predicted |
|---|---|---|
| Reveal | the text, nothing typed, no pending error | everything typed so far |
| `applied` or `duplicate` of the batch in flight | that batch's prediction from the previous start, which equals the server's state | the events gathered since |
| `resync`, or `refused` with a snapshot | the snapshot | none: the unapplied keystrokes are dropped (keystroke protocol) |
| Reconnection | the snapshot | the batch in flight when `snapshot.ackSeq` is below its `seq`, then the rest |

When an event would be refused (`INVALID_INPUT`, Enter included), `predictTyping` gives
`{ ok: false }`, and the zone shows the start, marked with `typedMarks`. A client that filters
Enter and sends one grapheme per insert never sees it. A wrong prediction is only visual: any
snapshot replaces it.

## Deadlines (`RaceEvent`)

Time never runs backwards: an event earlier than the race `clock` is handled at the clock. Before
and after handling any event, `reduceRace` applies every transition due at that instant, so a late
timer never decides a result:

1. **The start.** The race starts at `startsAt`.
2. **The time limit** (when there is one). The race ends at `startsAt + timeLimit`, inclusive, and
   whoever is still racing times out at that deadline. It wins a tie with any other deadline (D-06).
3. **Everyone terminal.** A race whose entrants are all terminal ends, never from the countdown.
   When everyone abandons during the countdown, it ends at `startsAt`:
   - every entrant is an abandon;
   - the elapsed time and the measures are zero, and the countdown never counts as typing time;
   - no victory and no record is awarded.

A confirmed abandon (COURSE-07) is `voluntary`, during the countdown or the race. An abandon that
changes nothing is ignored for an unknown entrant, then for a race already over, then for an entrant
already terminal.

With no time limit there is no hidden cap (CONF-01, D-17). A configured limit is announced before
the start and shown during the race. The runtime schedules one `tick` at the `nextDeadline` that the
reducer returns.

**Interruption** (D-06):

- If the room closes before the race is finalised, the race is `interrupted` and produces no
  official result. The performances in memory are never persisted, and never become victories or
  records.
- A race that already ended keeps its results when the room closes later.
- When closing and finalising compete, one transaction wins under the room lock.
- An ended or interrupted race is final: no later event, including a late timer, changes it. The
  reducer returns it as is, clock included; a batch still gets its reply after the usual checks
  (`duplicate` for a retry, `NOT_RACING` for a new well-formed batch of a known entrant).
- The results (`ended`) come exactly once, on the transition to `ended`.

## Limits and bounds (`src/race/limits.ts`, `src/measures/types.ts`)

The server shares these limits, and the E2E tests stay within them, with no bypass:

- the countdown, the grace period and inactivity (D-17);
- at most 10 batches per second and 1 batch in flight per player;
- at most 64 events per batch;
- `maxPlausibleInserts`: 20 inserts plus 25 per second since the start, counted on the entrant's
  applied inserts. Above it, the batch is refused whole (`IMPLAUSIBLE`).

Three notions are kept apart:

1. **The plausibility limits** accept or refuse keystrokes:
   - `MAX_PLAUSIBLE_INSERTS_PER_SECOND`: 25 per second, 300 WPM sustained;
   - `PLAUSIBILITY_BURST_INSERTS`: a burst margin of 20, for a network flush and the first seconds.

   They are a plausibility threshold chosen for the product, not an absolute guarantee: set far
   above the speeds expected from our students, they aim at scripts and replays. F-04.4 tunes them.
2. **The measures** are Appendix A computed exactly from the counters and the elapsed time
   (`computeMeasures`), unrounded and never capped, over an exact elapsed time. They are the
   official values, stored with the counters and the elapsed time they come from. A high value at the very start, from the burst
   margin, stays exact. For accepted counters it never exceeds `MAX_COMPUTABLE_WPM` (240 000),
   which is derived from the limits: 20 inserts after 1 ms.
3. **A display limit**, if any, belongs to the interface. It is explicitly flagged there and never
   replaces a stored or official value.

Stored values are bounded, so database columns can be sized from these constants:

| Value | Bound |
|---|---|
| Net and raw WPM | ≤ `MAX_COMPUTABLE_WPM` (240 000) for accepted counters: Appendix A exactly, never capped |
| Accuracy | in [0, 100] |
| Insert counters | ≤ `MAX_ENTRANT_INSERTS` (about 1.03 × 10¹¹): 64-bit integer column |
| Position, length | ≤ `MAX_TEXT_GRAPHEMES` (4 000) |
| Elapsed time | ≤ `MAX_DURATION_MS` (the instant range, about 4.1 × 10¹² ms): 64-bit integer column, exact |
| Ranks | exactly 1 to n, each once |

## Words for random texts (`src/words/`, F-02.4)

- **Data, server only.** The lists, the exclusions (P-2) and the forbidden pairs come from the
  subpath `@incision/domain/words`, never from `index.ts`, which exports only the types and the
  pure functions. Today they are hand-written fixtures (`WORD_DATA_NOTICE`). The reviewed lists
  replace them once their packaging, licences and attributions have been reviewed.
- **Leak detection.** Each list is one template literal opening with `WORD_DATA_SENTINEL`, so no
  bundler can keep the words and drop the marker. `tools/word-lists` fails when a client asset
  holds the sentinel or a fingerprint word, and checks that the sentinel lives only under
  `src/words/data/`, imported from nowhere else in the engine. That check covers the client assets
  in `.next/static`, not the RSC payloads of prerendered pages; the rule for F-02.5 is that the
  lists are never passed as props to client components.
- **`buildWordPool`** applies the exclusions first and always, on exact folded forms
  (`foldForExclusion`: compatibility forms unified, invisible characters removed, no accents, œ and
  æ spelled out, straight apostrophes, lowercase). Excluding
  "con" never removes "conte". An `accept` filter (a level, letters without accents…) runs after.
- **`forbiddenPairRule`** says whether two words may not follow each other, in either order. A word
  of a pair stays drawable alone. The generator (F-02.5) applies it with a bounded, deterministic
  search and a typed refusal, never by deleting a word after drawing.

## Race texts (`src/text/`, F-02.5)

- **Settings.** `TextSettings` is coherent or random (CONF-02 to CONF-07, D-10, D-19): a language,
  10 to 200 words, a complexity, and four options (punctuation, numbers, capitals, accents).
  Random settings add the characters to include or exclude; coherent settings cannot express them.
  `textSettingsRefusal` needs no data, so the interface runs it as the host configures.
- **Complexity.** `COMPLEXITY_CRITERIA` holds the starting values (letters, Zipf, marks, largest
  number, sentence length), versioned by `CRITERIA_VERSION`. They stay parameters until they are
  calibrated on the real lists (P-1). `measureText` gives a passage's measures M1 to M4;
  `classifyMeasures` turns them into a level with thresholds the caller provides. The measures are
  only measures: the editorial appraisal of a passage (theme, suitability) is recorded with the
  corpus, never computed here.
- **Two normalisations.** Dictionary words follow `src/words` (an explicit alphabet per language,
  then folding for exclusions). Passages follow `normalizePassage` (version 2): special spaces,
  typographic apostrophes and quotes, the ellipsis, the ligatures spelled out (œ to oe, æ to ae; Œ
  and Æ to Oe and Ae before a lowercase letter, OE and AE otherwise: P-4), sentence dashes to " - "
  with the words kept apart, the typographic hyphens ‐ and ‑ inside a word to "-", French spacing
  before `; : ! ?` (none before a ":" followed by a digit, as in 10:30). Every change is reported,
  Unicode composition included, and a normalised text normalises to itself. Invisible characters,
  primes and anything untypable (bidirectional controls) are refused with their position, never
  changed blindly. Version 1 refused œ and æ, so its texts are version 2 texts too: nothing stored is
  renormalised, and a race keeps its text and its version.
- **Words.** A word is a token holding a letter or a digit (D-10): a lone `?` or a dash is none.
  A cut ends after its Nth word, with the closing punctuation that directly follows (a closing
  quote included); never on a lone dash or an opening mark. Measures leave tokens with a digit
  ("1866", "1er") out of M1 to M3, and look a word spelled out from a ligature up under the list's
  spelling ("coeur" as "cœur").
- **Coherent mode.** A frozen corpus of frozen passages is checked once; any other is checked on
  every call. A passage longer than `MAX_PASSAGE_LENGTH` (8,000 code units, far beyond the 200
  words ever typed) is refused, which also bounds the work each call does per passage. The options apply to the normalised passage first (numbers, punctuation,
  capitals, accents, in that order), then the text is cut after its Nth word from the passage's
  start. Nothing is invented, rewritten or joined from distant passages. With numbers off, a run
  of numbers ("1914 - 1918", "1 000", "1, 2, 3") goes whole, with the quotes or parentheses it
  opens and closes. A run stops at a quote, a parenthesis or an end mark, so the marks stay
  balanced and no two sentences merge.
- **Random mode.** The pool removes the exclusions first, then applies the band, the accents
  policy (words without diacritics when accents are off, never misspelled), the excluded
  characters, and leaves out œ and æ. Two words are the same when they are spelled the same ("la"
  and "là" differ, Q-7); forbidden pairs compare folded forms, and a number between two words
  does not separate them. Proven incompatibilities are refused before any draw:
  `NO_COMPATIBLE_WORDS`, `INCLUDED_CHARACTER_UNAVAILABLE`, `INCLUDED_CHARACTERS_DO_NOT_FIT` and
  `FORBIDDEN_PAIRS_UNAVOIDABLE`. The fit is counted: letters no word holds together each need a
  word, no word holds more letters than the richest one, each included end mark needs a sentence
  and each quote or parenthesis a word of its own. These proofs hold under the documented rules
  (about one number in ten tokens, Q-4; a sentence starts with a word, Q-2). The draw is then a
  deterministic, bounded search. It redraws the words covering the included letters (at most
  `COVER_ATTEMPTS` covers, within `COVER_WORK_BUDGET` steps, counted rather than timed), abandons
  a cover as soon as it outgrows the word slots, then places the cover and the drawn words so
  that no word repeats and no forbidden pair touches (at most `ARRANGE_ATTEMPTS` arrangements per
  cover and `DRAWS_PER_SLOT` draws per slot, so 16 × 16 × 200 × 32 neighbour checks at worst),
  and inserts the numbers; no word is deleted afterwards. When it ends without a text it answers
  `TEXT_SEARCH_EXHAUSTED`, which proves nothing. The letters each pool word holds are computed
  once per call. On synthetic lists of 60,000 words, the configuration check takes 0.1 to 0.2 s,
  and a text or a failed search 0.15 to 0.3 s, words of 16 letters being the slowest case.
- **Diversity warning (Q-7).** `raceTextDiversity` gives the number of distinct words a random
  text may draw from for these settings, and flags fewer than `LOW_DIVERSITY_POOL_SIZE` (50), so
  the interface can warn the host that the words will repeat often (F-03.1). It is a provisional
  indicator, never a refusal, and it proves nothing: an empty pool keeps its refusal
  (`NO_COMPATIBLE_WORDS`), and proven incompatibilities and `TEXT_SEARCH_EXHAUSTED` stay apart. The
  generator promises no even spread of the words, whatever the pool. It runs on the server, which
  holds the lists.
- **Final checks.** `raceTextViolations` lists every guarantee the final text breaks: exactly N
  words, typable characters, no line break, the grapheme bound, each option's effect; in random
  mode, each word read from the list itself (band, exclusions, alphabet, accents), included and
  excluded characters, repeats, pairs, numbers, marks in pairs and their spacing, a word at each sentence
  start, and capitals only there when every sentence end shows a mark. `generateRaceText` throws
  on any, since a broken guarantee is a bug. A rule never names a word of the text, since one may
  be an excluded word and the message reaches logs. `generateRaceText` returns the text with its
  versions (generator, criteria, normalisation, PRNG) and its provenance (list versions and pool
  size, or the passage id).
- **Seed.** The generator takes a `RandomState` drawn by the server with crypto for this text
  alone, kept private (Q-15).

## Contracts and examples

- **Types first.** Functions that are not implemented yet exist only as types, so there is never a
  stub to call. Every function of the first race path is implemented; later cards add theirs the
  same way.
- **Implementing a contract.** A function that implements a contract type is declared
  `export const name: ContractType = …`, so the compiler checks it against the contract.
- **Examples.** `*.examples.ts` hold the worked examples, which are not exported from `index.ts`.
  They are type-checked, and they count as evidence only once the implementing card runs them.
- **Implemented now:**
  - `createRaceRefusal`, `createRace`, `reduceRace`, `toRaceBroadcast` and `toRaceReveal`: a race
    on a fixed text, from the reveal to the results (F-04.1, engine half);
  - `toEntrantMeasures`: one entrant's live measures, timed exactly as the broadcast's net WPM
    (COURSE-04);
  - `predictTyping` and `typedMarks`: immediate, visual-only feedback from the same fold;
  - `applyKeystrokes` and `toEntrantSnapshot`: one entrant's batch, whole or not at all, and its
    authoritative snapshot (F-04.4, engine half);
  - `computeMeasures`: Appendix A, exact and never capped (F-02.1);
  - `rankEntrants`: the final ranking of COURSE-10, ranks 1 to n (F-02.2);
  - `startRefusal` (COURSE-02);
  - `toGraphemes`, `singleGrapheme` and `containsLineBreak`;
  - `measuredElapsed`;
  - the time and id validators, and `compareIds`;
  - `maxPlausibleInserts`;
  - `asRandomState`, `createRandom` and `shuffled`: seeded randomness (F-02.4);
  - `buildWordPool`, `foldForExclusion` and `forbiddenPairRule`, with the data on the
    `./words` subpath (F-02.4);
  - `textSettingsRefusal`, `raceTextRefusal`, `raceTextDiversity`, `generateRaceText`, `raceTextViolations`,
    `normalizePassage`, `countWords`, `cutToWords` and `measureText` (F-02.5, on fixtures).
- **Changes.** A contract changes only through an engine pull request, announced before the
  integration that depends on it.
