# Complexity calibration on real data (#43, D-10, P-1)

Branch `feat/02-4-random-word-data`. Inputs: the reviewed word data `wf311-r1` (#42) and the corpus
`2026-10-25.4` already on `dev`. Command, run on the code of this branch:

```sh
npm run calibrate -w @incision/word-lists -- <repo>/packages/database/corpus/2026-10-25.4
```

The script measures and decides nothing. Its output is reproduced in the last section, with its
headings moved one level down; nothing else changed.

## Decisions taken from it

**Random mode — criteria `wf311-1` (was `start-1`).** Letter limits unchanged (5 / 9 / 16).
Zipf floors: easy 4.0 (unchanged), medium 3.75 (was 3.3), hard 3.5 (was 2.5).

- Why: under `start-1`, medium (Zipf ≥ 3.3) and hard (≥ 2.5) drew from almost the same pool, since the
  playable list stops at 3.5, and their texts had the same rare-word share. The same script, run with
  `start-1` on the first selection of these lists (commit 48db648, before the editorial follow-ups
  removed about 60 more words per language), gave at 50 / 200 words, M3 medians: medium FR 50.0 / 51.0, EN 45.0 / 47.5; hard
  FR 52.0 / 54.0, EN 53.0 / 49.3. That run is not reproduced here; its table was not kept beyond these
  figures. With `wf311-1`, every measure that defines a level rises level by level at every length
  (medians at 50 words, FR / EN):

  | Level | M1 mean letters | M2 % > 9 letters | M3 % rare (Zipf < 4) |
  |---|---|---|---|
  | easy | 4.3 / 4.3 | 0.0 / 0.0 | 0.0 / 0.0 |
  | medium | 6.6 / 6.3 | 0.0 / 0.0 | 33.0 / 26.0 |
  | hard | 7.7 / 7.2 | 20.0 / 14.0 | 54.0 / 48.0 |

- What this proves, and what it does not: the rise is partly built in. M3 counts words under
  Zipf 4, so easy (floor 4.0) measures 0 % by construction, and medium and hard rise because their
  floors are lower; M1 and M2 follow the letter limits. The report shows that the shipped pools
  produce texts with the intended, ordered properties at every length; it is not an independent
  measure of how hard players find them, which only play data could give.
- Coverage: each level × language × length (10, 50, 200 words) produced 40/40 texts with the D-19
  options; pools are 1,542 / 7,429 / 13,119 words (FR) and 2,108 / 7,691 / 12,483 (EN), and
  1,229 / 5,372 / 9,156 FR words without accents.
- The levels differ by their pools, not by a target per text: a 10-word text varies more (p10–p90
  columns), and a uniform draw cannot make "hard" texts consist only of rare words. The list floor
  (Zipf 3.50) equals hard's floor; a test keeps the list floor at or below every level's floor.

**Coherent passages — the editorial label stays the selection criterion.** Thresholds of
`classifyMeasures` fitted per language on the stored M1–M4 agree with the editorial labels for
43/55 (FR) and 40/56 (EN) passages in sample, and only 35/55 and 33/56 when each passage is
classified by thresholds fitted without it. Easy and hard separate fairly well; medium does not.
That is not enough evidence to replace the reviewers' labels by a measured level, so nothing in the
server uses these thresholds. The measures stay stored with each passage, and this report is the
calibration evidence for CONF-05 on passages: measured, not a measured classification.

## Report

### Calibration report — criteria wf311-1

### Random mode, FR (list wf311-r1, 13149 words)

| Level | Rule | Pool | Pool without accents | Pool mean Zipf | Pool mean letters | Pool share > 9 letters |
|---|---|---:|---:|---:|---:|---:|
| easy | ≤ 5 letters, Zipf ≥ 4 | 1542 | 1229 | 4.74 | 4.34 | 0.0 % |
| medium | ≤ 9 letters, Zipf ≥ 3.75 | 7429 | 5372 | 4.33 | 6.56 | 0.0 % |
| hard | ≤ 16 letters, Zipf ≥ 3.5 | 13119 | 9156 | 4.09 | 7.64 | 21.0 % |

Generated texts: 40 fixed seeds per cell, default options (punctuation, capitals, accents; no numbers). M1–M4 measured with `measureText`, commonZipf 4; values are p10 / median / p90.

| Level | Words | Generated | M1 mean letters | M2 % > 9 letters | M3 % rare | M4 special /100 |
|---|---:|---:|---|---|---|---|
| easy | 10 | 40/40 | 4.1 / 4.3 / 4.7 | 0.0 / 0.0 / 0.0 | 0.0 / 0.0 / 0.0 | 0.0 / 0.0 / 0.0 |
| easy | 50 | 40/40 | 4.2 / 4.3 / 4.5 | 0.0 / 0.0 / 0.0 | 0.0 / 0.0 / 0.0 | 0.0 / 0.0 / 0.0 |
| easy | 200 | 40/40 | 4.3 / 4.3 / 4.4 | 0.0 / 0.0 / 0.0 | 0.0 / 0.0 / 0.0 | 0.0 / 0.0 / 0.0 |
| medium | 10 | 40/40 | 6.0 / 6.6 / 7.2 | 0.0 / 0.0 / 0.0 | 10.0 / 30.0 / 50.0 | 0.0 / 0.0 / 10.0 |
| medium | 50 | 40/40 | 6.3 / 6.6 / 6.8 | 0.0 / 0.0 / 0.0 | 24.0 / 33.0 / 40.0 | 2.0 / 3.0 / 6.0 |
| medium | 200 | 40/40 | 6.4 / 6.6 / 6.8 | 0.0 / 0.0 / 0.0 | 27.0 / 31.0 / 35.1 | 1.5 / 2.5 / 4.1 |
| hard | 10 | 40/40 | 6.6 / 7.5 / 8.5 | 9.0 / 20.0 / 31.0 | 39.0 / 55.0 / 80.0 | 0.0 / 10.0 / 20.0 |
| hard | 50 | 40/40 | 7.2 / 7.7 / 8.0 | 14.0 / 20.0 / 28.0 | 43.8 / 54.0 / 62.0 | 0.0 / 3.0 / 8.0 |
| hard | 200 | 40/40 | 7.5 / 7.7 / 7.9 | 18.4 / 21.5 / 25.0 | 50.5 / 54.0 / 58.0 | 1.5 / 2.5 / 4.0 |

Representative samples (seed 1):

- easy, 10 words: « Fait uni seras parle foie bonus. Roux fils port sens. »
- easy, 50 words: « Barre biais bonne cri. Écho radio gain ses. Usage taxe corps vols par siège rage bravo. Dates débit paire ont fan, delà. Flux règne, pro parts flics veuve. Boss geste oeil entre. Passé lisez le sera digne, lapin. Dames délit faim ceci chien quant bail. Dieu gérer codes honte monde. »
- medium, 10 words: « Virtuelle restés terreur ban poursuite. Chef complexe locale, urgent ethnique. »
- medium, 50 words: « Passagers, malade race fut déplacé ? Lutte, régulière ambitieux couleurs employeur ! Coûteux action libres trouve processus ! Éliminé champion auriez appétit celui muet codes enlève dépens, injuste groupe veux ? Vendu boire engagée systèmes admis dettes débute drapeau auras parvient visuel, quotidien. Gratuits, pôle traversé épée crie quotidien étude interdits proposé croisés mineurs. »
- hard, 10 words: « Résumé revienne mentent paquet limité persuadé self motiver contribué cuillère. »
- hard, 50 words: « Couple haineux justifie entraine commissariat, humanisme armée "perdre" corpus expérimentation crimes ? Ligne demandé, sieste opératoire destinations répartis ! Épaisseur ensuite réacteur cachées augmenté atout renouvelé interne ! Assiste obtenu utilisé liquide mosquées pertinente veuille, dixième ? Certifié fondant globe finalement autrui modèle, étage écouter contrôler maire ferment chaton entières thon fièrement installer. Commandé. »

### Random mode, EN (list wf311-r1, 12484 words)

| Level | Rule | Pool | Pool without accents | Pool mean Zipf | Pool mean letters | Pool share > 9 letters |
|---|---|---:|---:|---:|---:|---:|
| easy | ≤ 5 letters, Zipf ≥ 4 | 2108 | 2108 | 4.74 | 4.31 | 0.0 % |
| medium | ≤ 9 letters, Zipf ≥ 3.75 | 7691 | 7691 | 4.38 | 6.28 | 0.0 % |
| hard | ≤ 16 letters, Zipf ≥ 3.5 | 12483 | 12483 | 4.14 | 7.14 | 16.2 % |

Generated texts: 40 fixed seeds per cell, default options (punctuation, capitals, accents; no numbers). M1–M4 measured with `measureText`, commonZipf 4; values are p10 / median / p90.

| Level | Words | Generated | M1 mean letters | M2 % > 9 letters | M3 % rare | M4 special /100 |
|---|---:|---:|---|---|---|---|
| easy | 10 | 40/40 | 4.0 / 4.3 / 4.5 | 0.0 / 0.0 / 0.0 | 0.0 / 0.0 / 0.0 | 0.0 / 0.0 / 0.0 |
| easy | 50 | 40/40 | 4.2 / 4.3 / 4.4 | 0.0 / 0.0 / 0.0 | 0.0 / 0.0 / 0.0 | 0.0 / 1.0 / 4.0 |
| easy | 200 | 40/40 | 4.2 / 4.3 / 4.4 | 0.0 / 0.0 / 0.0 | 0.0 / 0.0 / 0.0 | 0.0 / 1.0 / 2.0 |
| medium | 10 | 40/40 | 5.7 / 6.3 / 6.9 | 0.0 / 0.0 / 0.0 | 10.0 / 30.0 / 50.0 | 0.0 / 0.0 / 10.0 |
| medium | 50 | 40/40 | 5.9 / 6.3 / 6.6 | 0.0 / 0.0 / 0.0 | 22.0 / 26.0 / 36.0 | 1.8 / 4.0 / 8.0 |
| medium | 200 | 40/40 | 6.1 / 6.3 / 6.4 | 0.0 / 0.0 / 0.0 | 24.0 / 28.0 / 32.0 | 2.0 / 3.5 / 4.6 |
| hard | 10 | 40/40 | 6.1 / 7.2 / 8.0 | 0.0 / 10.0 / 30.0 | 29.0 / 50.0 / 71.0 | 0.0 / 10.0 / 20.0 |
| hard | 50 | 40/40 | 6.8 / 7.2 / 7.6 | 10.0 / 14.0 / 22.0 | 42.0 / 48.0 / 56.2 | 2.0 / 4.0 / 8.0 |
| hard | 200 | 40/40 | 6.9 / 7.1 / 7.3 | 13.4 / 16.0 / 19.6 | 45.5 / 48.5 / 52.0 | 2.5 / 3.5 / 5.1 |

Representative samples (seed 1):

- easy, 10 words: « Tech ray armed grain lemon ski. Path ones wind roll. »
- easy, 50 words: « Pat milk big fairy. Bring pairs puppy knees. Bill beast keys wider union agree award boat. Pages front plays hair apart, soil. Table mail, anger won word asks. Gut asks farm class. Their peer down drive looks, glass. Cat goes army blue suite dirt zoo. Lots home twist tops myth. »
- medium, 10 words: « Formation thank out exempt sand. Aunt deployed bank, retail chatting. »
- medium, 50 words: « Butterfly, acts terribly doubles magnetic? Shouting, credits tick slam burnt! Approve native okay origin remedies! Medals decline women abstract seated knows standard artistic delayed, feature utilized buried? Depressed aye water probable humidity served attending anymore vendors reviews flies, tropical. Notified, siege song athletes play bottom beautiful missiles accessed evolve volume. »
- hard, 10 words: « Kind brands statistical penetrate hey happier economics naval rushing sat. »
- hard, 50 words: « Besides cuts shouting planning beau, concealed panels "wishing" marriages edged sake? Stadium beneficial, movies settlements tap status! Humidity wisely succession improve mysteries ring embrace retire! She's there surrounding samples haunted travel attracts, low? Misuse screen benign devotion purchasing or, insignificant that's mineral pairing encounters care artillery stops gorilla honeymoon. Do. »

### Coherent passages, FR (corpus 2026-10-25.4, 55 retained of 61)

Stored measures by editorial label, p10 / median / p90.

| Label | Passages | M1 | M2 | M3 | M4 |
|---|---:|---|---|---|---|
| easy | 17 | 4.2 / 4.5 / 4.6 | 1.1 / 3.0 / 5.0 | 12.6 / 14.2 / 17.8 | 6.1 / 8.5 / 11.9 |
| medium | 20 | 4.5 / 4.8 / 5.0 | 3.0 / 5.0 / 7.6 | 16.0 / 17.9 / 21.6 | 6.0 / 8.5 / 11.4 |
| hard | 18 | 4.6 / 5.0 / 5.3 | 4.8 / 7.3 / 10.6 | 18.6 / 21.7 / 28.8 | 5.8 / 8.0 / 11.8 |

Thresholds fitted on these 55 passages (coordinate search over the observed values, maximising agreement with the editorial labels; in-sample, so an optimistic estimate):

```json
{"easyMaxMeanLetters":4.59,"easyMaxRareShare":1000,"easyMaxSpecialPer100":1000,"hardMinMeanLetters":4.91,"hardMinRareShare":21.8,"hardMinLongShare":1000}
```

Agreement of `classifyMeasures` with the fitted thresholds (rows: editorial label; columns: measured level).

| Label | easy | medium | hard | Agreement |
|---|---:|---:|---:|---:|
| easy | 16 | 1 | 0 | 94 % |
| medium | 4 | 12 | 4 | 60 % |
| hard | 1 | 2 | 15 | 83 % |

Leave-one-out agreement (each passage classified by thresholds fitted without it): 35/55.

Overall agreement: 43/55.

### Coherent passages, EN (corpus 2026-10-25.4, 56 retained of 61)

Stored measures by editorial label, p10 / median / p90.

| Label | Passages | M1 | M2 | M3 | M4 |
|---|---:|---|---|---|---|
| easy | 18 | 3.9 / 4.0 / 4.3 | 0.4 / 1.0 / 2.0 | 3.9 / 8.3 / 11.4 | 1.4 / 2.8 / 5.3 |
| medium | 19 | 4.1 / 4.3 / 4.5 | 1.0 / 3.0 / 4.6 | 8.5 / 11.6 / 16.4 | 1.0 / 2.0 / 6.1 |
| hard | 19 | 4.3 / 4.5 / 4.8 | 1.5 / 4.0 / 5.6 | 9.7 / 14.5 / 20.8 | 1.4 / 4.0 / 6.6 |

Thresholds fitted on these 56 passages (coordinate search over the observed values, maximising agreement with the editorial labels; in-sample, so an optimistic estimate):

```json
{"easyMaxMeanLetters":4.25,"easyMaxRareShare":9.1,"easyMaxSpecialPer100":1000,"hardMinMeanLetters":4.3,"hardMinRareShare":12.6,"hardMinLongShare":1000}
```

Agreement of `classifyMeasures` with the fitted thresholds (rows: editorial label; columns: measured level).

| Label | easy | medium | hard | Agreement |
|---|---:|---:|---:|---:|
| easy | 13 | 2 | 3 | 72 % |
| medium | 2 | 9 | 8 | 47 % |
| hard | 0 | 1 | 18 | 95 % |

Leave-one-out agreement (each passage classified by thresholds fitted without it): 33/56.

Overall agreement: 40/56.

