# F-02.4 — reviewed random-word data and complexity calibration (C1)

Cards #42 (random words) and #43 (complexity), requirements CONF-03, CONF-05, CONF-07; decisions
D-10, D-19, D-21. Branch `feat/02-4-random-word-data` from `dev` `1a0ed97`. Work order of
29 October 2026, slice C1. Philippe gave the Go Ahead and delegated the editorial selection in the
cloud conversation of 30 October 2026; no human read the lists word by word.

## What changed

- **Inventory first.** It reuses the delivered candidate exporter (`src/candidate.ts`, PR #181), the
  pins (`src/pinned.ts`), the complete wordfreq credits (PR #184), the engine's word format, the pool and
  the generator. There are no new dependencies and no runtime network access.
- **Selection tooling** (`tools/word-lists/src/select.ts`, `select-cli.ts`, `select:data`). It applies a
  committed review register and a versioned Zipf floor (3.50) to the pinned candidate, then writes the four
  server-only data files with a manifest of every input and output digest. A rerun gives the same bytes;
  a test ties the committed files to the manifest.
- **Reviewed data `wf311-r1`.** The data replace the hand-written `fixture-1` lists:
  - fr: 13,149 words, 112 exclusions, 13,120 forbidden pairs;
  - en: 12,484 words, 104 exclusions, 1,650 forbidden pairs.

  The method, the criteria (`GUIDE.md`), every decision with its reason, the homonyms, the regional
  variants and the limits are in [`tools/word-lists/review/wf311-r1/`](../../../tools/word-lists/review/wf311-r1/README.md).
  Licence: CC BY-SA 4.0 (wordfreq), with the attribution in `notice.ts`.
- **Calibration** (`criteria wf311-1`). Medium Zipf ≥ 3.75, hard ≥ 3.5. The report and its limits are in
  [calibration.md](calibration.md). Passages keep their editorial label: fitted measure thresholds agree
  with the labels for about 60 % of passages out of sample.

## Editorial review record

1. Twelve agents read every word at or above the floor (about 2,500 each), against `GUIDE.md`.
2. The coordinator harmonised their decisions.
3. An independent agent reviewed the editorial content and the licences (Changes needed: one slur
   spelling and inconsistencies, all applied in 8669a98; re-check OK).
4. The functional QA found surviving English names, so six agents ran a second full pass for proper
   nouns and non-words (682997e).

All recorded in the register. The AI review is no guarantee of suitability for minors (D-21 limit
stated in the register).

## Checks

Run in this container with Node 24.22.2 and a disposable PostgreSQL 16.15. CI uses PostgreSQL 17, so the
database version differs. The full run below is on dcfeede; the only later commit records the
reviews in this file.

| Check | Result |
|---|---|
| `npm run check:no-js`, `npm run lint`, `npm run typecheck` | Pass |
| `npm test` (all workspaces) | Pass. Domain 1,206, word-lists 111, database 146, web 937, load 20. |
| `npm run test:db -w @incision/database` | Database tests pass. Run at efb731f; this slice changes no schema or query. |
| `npm run build` | Pass |
| `bundle-check` on `apps/web/.next/static` with the four data files and real fingerprints | Pass (no sentinel, no fingerprint) |
| `npm run test:integration -w @incision/web` | 9/9 pass at efb731f. Only test data changed after that. |
| `select:data` rerun | Byte-identical outputs; manifest unchanged |
| Real-data engine tests (`test/real-data.test.ts`) | All three levels × 10, 50 and 200 words, replay, folded exclusions, pairs over long draws, accents, include and exclude, empty pool, proven impossible include, bounded demanding include, extension words |

Not run: the Playwright suite (no interface change in this slice) and the client bundle check in CI. The
data are not yet imported by the application; C2 (#45) wires random mode on the server.

## Reviews

| Review | SHA | Verdict |
|---|---|---|
| Code reviewer | efb731f, then 9e00fea | Changes needed (one major: a test claimed pair checks it did not do), fixed, then OK |
| Security | efb731f | OK. Minor: no CI bundle check; site credits to show when random texts go live |
| Functional QA, Fable (the report names its model) | efb731f, then dcfeede | Changes needed (major: surviving English proper nouns), fixed by the second pass, then OK on dcfeede (540-draw matrix, 150-seed sweeps, 42 texts per language read) |
| Editorial and licence | efb731f, then 9e00fea | Changes needed (major: "coloured", missing identity and pejorative tags), fixed, then OK |

## Proposed requirement rows (for the coordinator, not edited here)

- **CONF-03:** stays partiel. Random mode now has reviewed data on the server-only subpath; the server and
  interface wiring comes with C2 (#45).
- **CONF-05:** partiel. The random levels are calibrated and measured (`wf311-1`). Passages are measured,
  and their editorial labels are kept because the measured agreement is insufficient.
- **CONF-07:** unchanged by this slice (engine already delivered; interface and server in C2).
- **D-21:** the lists exist, versioned with their register. The production import still needs
  Philippe's approval.

## Human acceptance

1. Read the register README and sample the lists (`packages/domain/src/words/data/fr.ts`, `en.ts`).
2. Approve or adjust the judgement calls listed there: gosse/gosses, nude/naked, the wide French
   identity list, and hard's floor equal to the list floor.
3. Decide on the D-21 approval for production and on a visible credit for wordfreq (CC BY-SA 4.0) once
   random texts are served.
