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
  `start-1` on the first selection of these lists (commit 48db648, 2 to 4 words per language fewer
  removed than now), gave at 50 / 200 words, M3 medians: medium FR 50.0 / 51.0, EN 45.0 / 47.5; hard
  FR 52.0 / 54.0, EN 53.0 / 49.3. That run is not reproduced here; its table was not kept beyond these
  figures. With `wf311-1`, every measure that defines a level rises level by level at every length
  (medians at 50 words, FR / EN):

  | Level | M1 mean letters | M2 % > 9 letters | M3 % rare (Zipf < 4) |
  |---|---|---|---|
  | easy | 4.3 / 4.3 | 0 / 0 | 0 / 0 |
  | medium | 6.6 / 6.3 | 0 / 0 | 30 / 28 |
  | hard | 7.5 / 7.1 | 20 / 16 | 56 / 48 |

- What this proves, and what it does not: the rise is partly built in. M3 counts words under
  Zipf 4, so easy (floor 4.0) measures 0 % by construction, and medium and hard rise because their
  floors are lower; M1 and M2 follow the letter limits. The report shows that the shipped pools
  produce texts with the intended, ordered properties at every length; it is not an independent
  measure of how hard players find them, which only play data could give.
- Coverage: each level × language × length (10, 50, 200 words) produced 40/40 texts with the D-19
  options; pools are 1,552 / 7,461 / 13,182 words (FR) and 2,119 / 7,723 / 12,536 (EN), and
  1,238 / 5,403 / 9,215 FR words without accents.
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

### Random mode, FR (list wf311-r1, 13212 words)

| Level | Rule | Pool | Pool without accents | Pool mean Zipf | Pool mean letters | Pool share > 9 letters |
|---|---|---:|---:|---:|---:|---:|
| easy | ≤ 5 letters, Zipf ≥ 4 | 1552 | 1238 | 4.73 | 4.34 | 0.0 % |
| medium | ≤ 9 letters, Zipf ≥ 3.75 | 7461 | 5403 | 4.33 | 6.55 | 0.0 % |
| hard | ≤ 16 letters, Zipf ≥ 3.5 | 13182 | 9215 | 4.08 | 7.62 | 20.9 % |

Generated texts: 40 fixed seeds per cell, default options (punctuation, capitals, accents; no numbers). M1–M4 measured with `measureText`, commonZipf 4; values are p10 / median / p90.

| Level | Words | Generated | M1 mean letters | M2 % > 9 letters | M3 % rare | M4 special /100 |
|---|---:|---:|---|---|---|---|
| easy | 10 | 40/40 | 4.0 / 4.3 / 4.6 | 0.0 / 0.0 / 0.0 | 0.0 / 0.0 / 0.0 | 0.0 / 0.0 / 0.0 |
| easy | 50 | 40/40 | 4.2 / 4.3 / 4.5 | 0.0 / 0.0 / 0.0 | 0.0 / 0.0 / 0.0 | 0.0 / 0.0 / 0.0 |
| easy | 200 | 40/40 | 4.3 / 4.3 / 4.4 | 0.0 / 0.0 / 0.0 | 0.0 / 0.0 / 0.0 | 0.0 / 0.0 / 0.0 |
| medium | 10 | 40/40 | 6.0 / 6.5 / 7.0 | 0.0 / 0.0 / 0.0 | 20.0 / 30.0 / 50.0 | 0.0 / 0.0 / 10.0 |
| medium | 50 | 40/40 | 6.3 / 6.6 / 6.9 | 0.0 / 0.0 / 0.0 | 21.8 / 30.0 / 40.2 | 1.8 / 2.0 / 6.0 |
| medium | 200 | 40/40 | 6.4 / 6.6 / 6.7 | 0.0 / 0.0 / 0.0 | 26.5 / 29.8 / 35.0 | 1.5 / 2.5 / 4.1 |
| hard | 10 | 40/40 | 6.9 / 7.8 / 8.6 | 9.0 / 20.0 / 40.0 | 30.0 / 50.0 / 70.0 | 0.0 / 10.0 / 20.0 |
| hard | 50 | 40/40 | 7.2 / 7.5 / 8.1 | 14.0 / 20.0 / 26.4 | 44.0 / 56.0 / 62.0 | 0.0 / 4.0 / 8.0 |
| hard | 200 | 40/40 | 7.5 / 7.7 / 7.9 | 17.9 / 21.0 / 24.5 | 49.5 / 52.0 / 58.0 | 1.5 / 2.5 / 4.0 |

Representative samples (seed 1):

- easy, 10 words: « Coûte hein servi légal allé sorte. Arabe paie globe longs. »
- easy, 50 words: « Moins parmi plan wifi. Légal chute zones tuer. Déjà nue rôle jus barbe promo beaux formé. Plage tuer film fasse dites, vif. Nomme entre, écho poser voici soupe. Dames job rap subit. Leur parmi hôtel lave cher, base. Fous telle car peu sous rejet idées. Café mères trace perso villa. »
- medium, 10 words: « Rejeté leçons quotidien musulmane consacrée. Or vallées normal, mêler buzz. »
- medium, 50 words: « Fêter, confirmé fenêtre selon équipes ? Atteindre, croyait lequel proposer décision ! Observe détection anciennes mettent comté ! Poèmes lutte photos verbe rends contexte coq pat coucou, marche comporter cesse ? Emprunté confiée intègre protocole maxime marquée organique vagues trouble dirait boulevard, beau. Fonder, durée hum traduire couteaux la demandait convertir vendredi détourner conquis. »
- hard, 10 words: « Entretiens peintres réputée posts glisse artisan mémoires autorisé conseillers sportifs. »
- hard, 50 words: « Contributions neiges moche alimentation évoque, pipi conservées "déclare" dénoncer convictions châtiment ? Empêchant retraites, abeille contredire gazette exclus ! Retenus hongrois dispose études soixantaine nationalistes initiatives vendue ! Vivres requêtes possibilités aquarium réunir ajouter devrais, erreur ? Peur déposée intervenant intérieure assistante imitation, clip tuent fréquemment paires index agneau réside médiateur signifier aigle. Remplis. »

### Random mode, EN (list wf311-r1, 12537 words)

| Level | Rule | Pool | Pool without accents | Pool mean Zipf | Pool mean letters | Pool share > 9 letters |
|---|---|---:|---:|---:|---:|---:|
| easy | ≤ 5 letters, Zipf ≥ 4 | 2119 | 2119 | 4.74 | 4.31 | 0.0 % |
| medium | ≤ 9 letters, Zipf ≥ 3.75 | 7723 | 7723 | 4.38 | 6.27 | 0.0 % |
| hard | ≤ 16 letters, Zipf ≥ 3.5 | 12536 | 12536 | 4.14 | 7.13 | 16.1 % |

Generated texts: 40 fixed seeds per cell, default options (punctuation, capitals, accents; no numbers). M1–M4 measured with `measureText`, commonZipf 4; values are p10 / median / p90.

| Level | Words | Generated | M1 mean letters | M2 % > 9 letters | M3 % rare | M4 special /100 |
|---|---:|---:|---|---|---|---|
| easy | 10 | 40/40 | 4.0 / 4.3 / 4.5 | 0.0 / 0.0 / 0.0 | 0.0 / 0.0 / 0.0 | 0.0 / 0.0 / 1.0 |
| easy | 50 | 40/40 | 4.2 / 4.3 / 4.4 | 0.0 / 0.0 / 0.0 | 0.0 / 0.0 / 0.0 | 0.0 / 0.0 / 2.2 |
| easy | 200 | 40/40 | 4.2 / 4.3 / 4.4 | 0.0 / 0.0 / 0.0 | 0.0 / 0.0 / 0.0 | 0.5 / 1.0 / 2.1 |
| medium | 10 | 40/40 | 5.5 / 6.3 / 7.0 | 0.0 / 0.0 / 0.0 | 0.0 / 30.0 / 40.0 | 0.0 / 0.0 / 20.0 |
| medium | 50 | 40/40 | 6.0 / 6.3 / 6.5 | 0.0 / 0.0 / 0.0 | 20.0 / 28.0 / 38.0 | 2.0 / 4.0 / 8.0 |
| medium | 200 | 40/40 | 6.1 / 6.2 / 6.4 | 0.0 / 0.0 / 0.0 | 24.4 / 27.3 / 30.5 | 2.5 / 3.5 / 5.5 |
| hard | 10 | 40/40 | 6.0 / 7.0 / 7.8 | 0.0 / 10.0 / 30.0 | 30.0 / 50.0 / 70.0 | 0.0 / 10.0 / 20.0 |
| hard | 50 | 40/40 | 6.6 / 7.1 / 7.6 | 11.8 / 16.0 / 24.0 | 42.0 / 48.0 / 58.2 | 0.0 / 4.0 / 8.0 |
| hard | 200 | 40/40 | 6.9 / 7.1 / 7.3 | 12.9 / 15.8 / 19.0 | 45.0 / 48.0 / 52.0 | 2.0 / 3.5 / 5.1 |

Representative samples (seed 1):

- easy, 10 words: « Yield tape pages front image seems. Ward time radio we'll. »
- easy, 50 words: « Urge mercy songs cheat. Ship teeth rely not. Pay picks men no demo price roads swing. Click tweet plug keep opera, minus. Offer words, laugh ads curse forth. Such bill cent dairy. Staff stone level home in, sugar. List navy used toll mood house bored. Tank can't lab same met. »
- medium, 10 words: « Diagram baking taste monster named. Assuming wore maturity, header explains. »
- medium, 50 words: « Returning, parent exceed guardian mini? Art, roses reluctant immune way! Publicity firing internet grill restore! Channel bot elderly altar musicians repeating strings nationals supports, accident less invented? Crime rainfall lasted damage neural worker ages trucks privacy alter summary, mint. Reporters, highest powers horizon online pills order spider sterling aligned operative. »
- hard, 10 words: « Prevalent forestry creators valley father marching mothers cliff storms replica. »
- hard, 50 words: « Articles oracle arrangement power illustration, outdated arrogance "decisive" dislike local hearings? Inevitably reportedly, becoming ion aircraft forgot! Photo abundant goodness venue controlling crust used quiz! First reached regimes framework warns skull fascist, try? Shoe sand mechanism hypocrisy wedge sleepy, ware privilege pitching audience undoubtedly graffiti jewellery experts apples misconduct. Drafts. »

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

