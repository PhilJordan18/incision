# Complexity calibration on real data (#43, D-10, P-1)

Branch `feat/02-4-random-word-data`. Inputs: the reviewed word data `wf311-r1` (#42) and the corpus
`2026-10-25.4` already on `dev`. Command, run on the code of this branch:

```sh
npm run calibrate -w @incision/word-lists -- <repo>/packages/database/corpus/2026-10-25.4
```

The script measures and decides nothing; the report it printed is copied unchanged below.

## Decisions taken from it

**Random mode — criteria `wf311-1` (was `start-1`).** Letter limits unchanged (5 / 9 / 16).
Zipf floors: easy 4.0 (unchanged), medium 3.75 (was 3.3), hard 3.5 (was 2.5).

- Why: under `start-1`, medium (Zipf ≥ 3.3) and hard (≥ 2.5) drew from almost the same pool, since the
  playable list stops at 3.5. Their generated texts had the same rare-word share (M3 ≈ 50 %): hard was
  only longer words. With `wf311-1`, every measure that defines a level rises level by level at every
  length (medians at 50 words, FR / EN):

  | Level | M1 mean letters | M2 % > 9 letters | M3 % rare (Zipf < 4) |
  |---|---|---|---|
  | easy | 4.3 / 4.3 | 0 / 0 | 0 / 0 |
  | medium | 6.6 / 6.2 | 0 / 0 | 30 / 26 |
  | hard | 7.6 / 7.1 | 20 / 14 | 52 / 53 |

- Coverage: each level × language × length (10, 50, 200 words) produced 40/40 texts with the D-19
  options; pools are 1,552 / 7,461 / 13,184 words (FR) and 2,119 / 7,727 / 12,540 (EN), and
  1,238 / 5,403 / 9,217 FR words without accents.
- The levels differ by their pools, not by a target per text: a 10-word text varies more (p10–p90
  columns), and a uniform draw cannot make "hard" texts consist only of rare words.

**Coherent passages — the editorial label stays the selection criterion.** Thresholds of
`classifyMeasures` fitted per language on the stored M1–M4 agree with the editorial labels for
43/55 (FR) and 40/56 (EN) passages in sample, and only 35/55 and 33/56 when each passage is
classified by thresholds fitted without it. Easy and hard separate fairly well; medium does not.
That is not enough evidence to replace the reviewers' labels by a measured level, so nothing in the
server uses these thresholds. The measures stay stored with each passage, and this report is the
calibration evidence for CONF-05 on passages: measured, not a measured classification.

## Report
### Calibration report — criteria wf311-1

### Random mode, FR (list wf311-r1, 13214 words)

| Level | Rule | Pool | Pool without accents | Pool mean Zipf | Pool mean letters | Pool share > 9 letters |
|---|---|---:|---:|---:|---:|---:|
| easy | ≤ 5 letters, Zipf ≥ 4 | 1552 | 1238 | 4.73 | 4.34 | 0.0 % |
| medium | ≤ 9 letters, Zipf ≥ 3.75 | 7461 | 5403 | 4.33 | 6.55 | 0.0 % |
| hard | ≤ 16 letters, Zipf ≥ 3.5 | 13184 | 9217 | 4.08 | 7.62 | 20.9 % |

Generated texts: 40 fixed seeds per cell, default options (punctuation, capitals, accents; no numbers). M1–M4 measured with `measureText`, commonZipf 4; values are p10 / median / p90.

| Level | Words | Generated | M1 mean letters | M2 % > 9 letters | M3 % rare | M4 special /100 |
|---|---:|---:|---|---|---|---|
| easy | 10 | 40/40 | 4.0 / 4.3 / 4.6 | 0.0 / 0.0 / 0.0 | 0.0 / 0.0 / 0.0 | 0.0 / 0.0 / 0.0 |
| easy | 50 | 40/40 | 4.2 / 4.3 / 4.5 | 0.0 / 0.0 / 0.0 | 0.0 / 0.0 / 0.0 | 0.0 / 0.0 / 0.0 |
| easy | 200 | 40/40 | 4.3 / 4.3 / 4.4 | 0.0 / 0.0 / 0.0 | 0.0 / 0.0 / 0.0 | 0.0 / 0.0 / 0.0 |
| medium | 10 | 40/40 | 6.0 / 6.5 / 7.0 | 0.0 / 0.0 / 0.0 | 20.0 / 30.0 / 50.0 | 0.0 / 0.0 / 10.0 |
| medium | 50 | 40/40 | 6.3 / 6.6 / 6.9 | 0.0 / 0.0 / 0.0 | 21.8 / 30.0 / 40.2 | 1.8 / 2.0 / 6.0 |
| medium | 200 | 40/40 | 6.4 / 6.6 / 6.7 | 0.0 / 0.0 / 0.0 | 26.5 / 29.8 / 35.0 | 1.5 / 2.5 / 4.1 |
| hard | 10 | 40/40 | 6.9 / 7.5 / 8.3 | 10.0 / 20.0 / 30.0 | 29.0 / 50.0 / 70.0 | 0.0 / 10.0 / 20.0 |
| hard | 50 | 40/40 | 7.2 / 7.6 / 8.0 | 14.0 / 20.0 / 30.0 | 45.8 / 52.0 / 64.0 | 0.0 / 3.0 / 8.0 |
| hard | 200 | 40/40 | 7.4 / 7.6 / 7.9 | 17.4 / 21.8 / 26.2 | 48.0 / 54.0 / 57.5 | 1.5 / 2.5 / 4.0 |

Representative samples (seed 1):

- easy, 10 words: « Coûte hein servi légal allé sorte. Arabe paie globe longs. »
- easy, 50 words: « Moins parmi plan wifi. Légal chute zones tuer. Déjà nue rôle jus barbe promo beaux formé. Plage tuer film fasse dites, vif. Nomme entre, écho poser voici soupe. Dames job rap subit. Leur parmi hôtel lave cher, base. Fous telle car peu sous rejet idées. Café mères trace perso villa. »
- medium, 10 words: « Rejeté leçons quotidien musulmane consacrée. Or vallées normal, mêler buzz. »
- medium, 50 words: « Fêter, confirmé fenêtre selon équipes ? Atteindre, croyait lequel proposer décision ! Observe détection anciennes mettent comté ! Poèmes lutte photos verbe rends contexte coq pat coucou, marche comporter cesse ? Emprunté comédien intègre protocole maxime marquée organique vagues trouble dirait boulevard, beau. Filmer, durée hum traduire couteaux la demandait connecté vendredi détourner conquis. »
- hard, 10 words: « Recouvre auprès libérale modem assise respiratoire mobilisés doivent étend votes. »
- hard, 50 words: « Lunaire refusé boit soutenu frange, gloria amènent "amont" tard plume rapportés ? Judiciaire thème, industrie profondeur entrain multinationales ! Réplique payé charges directs semble capitaine hésitation vivantes ! Demande raconté consolidation embarquement requête pensé systèmes, reprendre ? Sorti chômage irlandaise interroger annuellement protocoles, horizon finir concernée quinze rites série interrompre concert faible aucunement. Abrite. »

### Random mode, EN (list wf311-r1, 12541 words)

| Level | Rule | Pool | Pool without accents | Pool mean Zipf | Pool mean letters | Pool share > 9 letters |
|---|---|---:|---:|---:|---:|---:|
| easy | ≤ 5 letters, Zipf ≥ 4 | 2119 | 2119 | 4.74 | 4.31 | 0.0 % |
| medium | ≤ 9 letters, Zipf ≥ 3.75 | 7727 | 7727 | 4.38 | 6.27 | 0.0 % |
| hard | ≤ 16 letters, Zipf ≥ 3.5 | 12540 | 12540 | 4.14 | 7.13 | 16.1 % |

Generated texts: 40 fixed seeds per cell, default options (punctuation, capitals, accents; no numbers). M1–M4 measured with `measureText`, commonZipf 4; values are p10 / median / p90.

| Level | Words | Generated | M1 mean letters | M2 % > 9 letters | M3 % rare | M4 special /100 |
|---|---:|---:|---|---|---|---|
| easy | 10 | 40/40 | 4.0 / 4.3 / 4.5 | 0.0 / 0.0 / 0.0 | 0.0 / 0.0 / 0.0 | 0.0 / 0.0 / 1.0 |
| easy | 50 | 40/40 | 4.2 / 4.3 / 4.4 | 0.0 / 0.0 / 0.0 | 0.0 / 0.0 / 0.0 | 0.0 / 0.0 / 2.2 |
| easy | 200 | 40/40 | 4.2 / 4.3 / 4.4 | 0.0 / 0.0 / 0.0 | 0.0 / 0.0 / 0.0 | 0.5 / 1.0 / 2.1 |
| medium | 10 | 40/40 | 5.4 / 6.1 / 6.8 | 0.0 / 0.0 / 0.0 | 10.0 / 20.0 / 41.0 | 0.0 / 0.0 / 20.0 |
| medium | 50 | 40/40 | 6.0 / 6.2 / 6.5 | 0.0 / 0.0 / 0.0 | 21.8 / 26.0 / 34.0 | 2.0 / 4.0 / 8.0 |
| medium | 200 | 40/40 | 6.1 / 6.2 / 6.4 | 0.0 / 0.0 / 0.0 | 24.9 / 28.5 / 32.0 | 2.5 / 4.0 / 5.5 |
| hard | 10 | 40/40 | 6.2 / 7.1 / 8.2 | 0.0 / 10.0 / 30.0 | 29.0 / 50.0 / 70.0 | 0.0 / 10.0 / 21.0 |
| hard | 50 | 40/40 | 6.7 / 7.1 / 7.5 | 10.0 / 14.0 / 22.0 | 42.0 / 53.0 / 62.2 | 2.0 / 4.0 / 8.0 |
| hard | 200 | 40/40 | 6.9 / 7.1 / 7.3 | 13.0 / 16.8 / 20.0 | 44.5 / 49.3 / 53.0 | 2.5 / 3.5 / 5.0 |

Representative samples (seed 1):

- easy, 10 words: « Yield tape pages front image seems. Ward time radio we'll. »
- easy, 50 words: « Urge mercy songs cheat. Ship teeth rely not. Pay picks men no demo price roads swing. Click tweet plug keep opera, minus. Offer words, laugh ads curse forth. Such bill cent dairy. Staff stone level home in, sugar. List navy used toll mood house bored. Tank can't lab same met. »
- medium, 10 words: « Algorithm carol paint brother severely. Organic syrup themes, looks collected. »
- medium, 50 words: « Digital, elevator tweet challenge detached? Ships, assisting literacy item warehouse! Insurance makeup cow launch less! Mountain levy meet samples goose lifestyle officer spiritual critical, newer grind counties? Better children lords fork screwed hide close shark shower dale highest, vaccine. Enforce, spin sign thought warn tunnel withdraw curious railway obscure girl. »
- hard, 10 words: « Paintings seal boot governor's debit ventures grab provinces nonprofit existed. »
- hard, 50 words: « Researcher breaks surplus exports legends, dispatch console "albums" references controlled steering? Possible controlling, graphic ones cozy ordinary! Woke wing slavery counterparts determines cult parliamentary anybody! Recommends carrier frank innocence safer robots forced, rates? Liquor prayer educate poo pulmonary or, fortunate glacier maternal acknowledging disgust chin shocked essentials brave violin. Crashing. »

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

