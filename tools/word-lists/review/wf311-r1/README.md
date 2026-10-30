# Review register wf311-r1: random-mode word lists (#42, D-21)

This folder is the versioned record of the editorial review that produced the server-only word data
of `@incision/domain/words` (lists, exclusions and forbidden pairs, all version `wf311-r1`).
`npm run select:data -w @incision/word-lists -- --raw-dir <raw> --version wf311-r1` rebuilds those
four data files byte for byte from the pinned wordfreq 3.1.1 files and this register. `manifest.json`
records the SHA-256 of every input and output, and the counts.

## Files

| File | Content |
|---|---|
| `GUIDE.md` | The written criteria every reviewer applied, unchanged. |
| `fr.review.tsv`, `en.review.tsv` | One line per flagged word: `word`, action, category, reason. The reason starts with `review:` (the chunk reviewer's decision) or `coordinator:` (a decision made while harmonising the chunks). Words not listed were read and kept as they are. |
| `fr.pairs.tsv`, `en.pairs.tsv` | Extra forbidden pairs, beyond the generated ones. Both are empty in this version. |
| `manifest.json` | Selection policy, input and output digests, counts. |

## Method

1. **Candidate.** The exporter's policy 1 (`src/candidate.ts`) turns the pinned `large_fr` and `large_en`
   files into NFC, lowercase words of the language's alphabet (fr 304,773; en 307,629).
2. **Frequency floor.** Policy 1 of the selection keeps Zipf 3.50 or more (fr 15,476; en 14,999). The floor
   is the hardest level's floor after calibration (`docs/evidence/f02-4-random-word-data/calibration.md`).
3. **Reading.** The words above the floor were sorted alphabetically and cut into twelve chunks of about
   2,500 words, six per language. Each chunk was read in full, line by line, by one AI review agent
   (Claude Code subagent, 30 October 2026), against `GUIDE.md`. Each agent checked that every word it
   flagged appears exactly in its chunk and only once, then listed its borderline decisions.
   The LDNOOBW flag (CC BY 4.0, pinned in `src/pinned.ts`) was shown next to each word as a hint only.
4. **Harmonisation.** The coordinating agent read every borderline list and the complete exclusion and
   homonym lists, and decided the cases where chunks disagreed (below). Each such decision is a
   `coordinator:` line, or, when a reviewer's flag was dropped, listed below.
5. **Selection.** `src/select.ts` keeps the words at or above the floor, minus every `remove`,
   `exclude` and `homonym-exclude` word, and minus any word that folds like an excluded word. It writes
   the exclusions (`exclude` and `homonym-exclude`), and the forbidden pairs: every `identity` word with
   every `pejorative` word. Any register line naming a word that is not in the candidate, or a kept word
   that is not playable, stops the selection.

No human read the lists word by word. Philippe delegated the selection to the agents under these
criteria (work order of 29 October 2026). D-21 still requires his separate approval before any import of
these data into production.

## Actions

| Action | Effect | fr | en |
|---|---|---:|---:|
| `remove` / `proper-noun` | not playable: names, places, brands; English proper adjectives | 1,298 | 1,745 |
| `remove` / `abbreviation` | acronyms, chat forms, units, roman numerals | 318 | 451 |
| `remove` / `foreign` | words of another language that are not established loanwords | 393 | 54 |
| `remove` / `nonstandard` | missing accents, phonetic or chat spellings, noise | 126 | 96 |
| `remove` / `fragment` | tokenisation fragments, lone letters | 80 | 65 |
| `exclude` | swear words, insults, slurs, sexual or degrading vocabulary (D-21) | 93 | 83 |
| `homonym-exclude` | ordinary sense exists, but the vulgar or sexual sense dominates for 12–17 | 19 | 21 |
| `homonym-keep` | vulgar sense exists, but the ordinary sense dominates | 23 | 26 |
| `identity` | kept; forbidden next to any `pejorative` word | 205 | 33 |
| `pejorative` | kept; forbidden next to any `identity` word | 64 | 50 |

Result: fr 13,149 playable words, 112 exclusions, 13,120 forbidden pairs; en 12,484 words, 104
exclusions, 1,650 pairs (counts per category in `manifest.json`).

## Coordinator decisions

- **English capitalisation.** English capitalises nationalities, languages, religions and their
  adjectives, days, months and holidays. Their lowercase forms are misspelled in a typed text, so they are
  removed as `proper-noun`, the same rule for "french", "monday", "muslim" or "catholic". This removes them
  for their spelling, never for being identity terms: lowercase identity words (black, white, gay,
  lesbian, bisexual, queer, trans, transgender, deaf, blind, disabled, atheist…) stay drawable, with
  forbidden neighbours. In French these adjectives are lowercase and stay (`identity`).
- **Ligatures.** Random mode never draws œ or æ (P-4), so the spelled-out forms are the typable ones:
  "boeuf", "soeur", "soeurs" and "voeux" stay, as "coeur", "oeil" and "oeuvre" already did, next to the
  ligature forms that random mode filters out.
- **Slurs with an ordinary sense** are never drawn: fr "pédale" and "homo", en "colored" and "oriental"
  (`homonym-exclude` / `slur`), like en "homo", "gypsy", "mick" and fr "nègre" (`exclude` / `slur`).
- **fr "capote"** is excluded (car hood, but the condom sense is common among teenagers).
- **fr "jean"** stays ("un jean"), although the first name was flagged.
- **Independent review follow-up.** A separate review agent then read the lists and the register
  (scan of about 600 targeted terms and of about 4,200 low-frequency words per language) and found no
  blocking survivor. Its findings were applied as `coordinator:` lines: en "coloured" excluded like
  "colored"; en "heroin" excluded like "cocaine"; en "breasts" excluded like fr "seins" ("breast"
  stays); fr "lingerie" and "psycho" excluded like their English forms; en "halloween" and fr "put"
  removed; fr "caca" kept (childish, like "pipi" and "poop"); fr "héroïne", "vierge" and "vierges"
  recorded as `homonym-keep`; missing identity tags (fr russe, polonais, portugais, roumain, serbe,
  québécois, protestant, réfugié and their forms; en migrant, immigrant, refugee, native and plurals)
  and pejorative tags (fr sauvage, pourri, porc, rat and forms; en genocide, slave, slaves, pig, pigs)
  added. "gosse" (France: a kid) stays while the plural "gosses" is excluded for its Quebec sense, and
  en "nude" stays excluded while "naked" ("naked eye") and fr "nu" stay: judgement calls kept as they are.
- **Second pass.** The functional QA (Fable) found English names that reach generated texts in
  lowercase ("keith", "zoe", "somerset", "rachel", "france", "asia"). Six more agents then read the whole
  playable list again, about 4,200 to 4,400 words each, for proper nouns, foreign words and non-words
  only, and flagged 129 words. All were applied as `remove` lines, except the spelled-out ligature forms
  (the rule above), "covid" and "uni" (dictionary words), "bible" (a common noun) and fr "black" (kept
  as an identity term). The QA's "fatty" (name-calling) is excluded as an insult. fr "ho" (interjection)
  and "mu" (from "mouvoir") stay as French words.
- **Category of `homonym-exclude`.** Where a reviewer wrote a free category, the coordinator inferred one
  of the five exclusion categories from the reason; those lines say so.

## Homonyms

- Excluded (vulgar, sexual or drug sense dominates): fr anal, baiser (verb; "baisers" stays), branle,
  bâtard, capote, chatte, coke, défoncé, gosses (Quebec slang), gueule, gueules, homo, jouir, pédale,
  seins, strip, suce, sucer, érection; en ass, asses, bitch, bitches, bong, cock, colored, coloured, dick, dong, dope,
  erection, fetish, ho, hooker, intercourse, oriental, prick, pussy, tits, virgin.
- Kept (ordinary sense dominates): fr baisers, bourré, chienne, crack, défoncer, folle, fous, gaule,
  gosse, héroïne, joint, joints, jouissance, jouit, pervers, pipe, pète, pénétration, péter, pété, queue, sein,
  vierge, vierges; en
  balls, beaver, bloody, booty (pirate treasure), bum, butt, butts, coke, damned, escort, hardcore, jerk,
  joint, loser, losers, mistress, paddy, polish, pot, screw, screwed, smack, snatch, suck, sucker, sucks.

## Regional variants

Both English spellings stay (colour/color, harbour/harbor): the lists come from one frequency source and
neither is an error. French keeps the 1990 spellings (aout, boite, connaitre, maitre…) and Quebec usage
("cégep"); the slang plural "gosses" is excluded for its Quebec sense. The draw does not separate
variants, so a text can mix them.

## Limits

- This is an AI review under written criteria, recorded word by word; it is no guarantee of suitability
  for minors, and the frequency source reflects subtitles and the web.
- Chunk reviewers judged borderline words independently; the coordinator harmonised the cases reported
  or found in the complete exclusion, homonym, identity and pejorative lists, not every kept word.
- Forbidden pairs cover only identity × pejorative adjacency; a hostile phrase across three words, or a
  pair the lists do not name, is not prevented.
- The French identity list is wide (nationalities included), so French texts avoid more pairs than
  English ones. This costs a little variety; the tests in `test/real-data.test.ts` found no refusal
  over the defaults at 10, 50 and 200 words, twenty long draws and ten demanding include settings per
  language, which is evidence for those settings, not a proof for all.
