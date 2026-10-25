# Registre du corpus — version 2026-10-25.1

Première version réelle du corpus du mode cohérent (CONF-03, D-21). Ce registre accompagne `fr.json` et `en.json` du même dossier et tient lieu de page de revue (décision du 21 octobre) : sources, adaptations, licences, réserves, cas remontés et contrôles.

**Statut : en étude.** Aucun import en production avant que j'accepte cette version (D-21). Le format, les contrôles du moteur et l'import local sont vérifiés (voir « Contrôles »).

## En bref

| | Français | Anglais |
|---|---:|---:|
| Passages dans le fichier | 20 | 19 |
| Retenus (tirables par les courses) | 16 | 15 |
| En réserve (`spare`, jamais tirés) | 4 | 4 |
| Textes indépendants | 19 | 19 |
| Retenus : `easy` / `medium` / `hard` | 7 / 6 / 3 | 7 / 5 / 3 |
| Auteurs / œuvres (tous statuts) | 9 / 14 | 13 / 17 |
| Longueur en mots (règle D-10) | 63 à 301 | 67 à 323 |

**Textes indépendants.** Le passage de livraison `fr-verne-vingt-mille-lieues-p1-ch14-pacifique` est un paragraphe entièrement contenu dans `fr-verne-vingt-mille-lieues-p1-ch14-oceans` : un seul extrait de la source, compté une fois. Tous les autres passages sont des extraits distincts : chapitres différents pour Loti, Bruno, Malot, Ségur et les trois passages de *Treasure Island* (chapitres VII, VIII et XIII), pièces différentes pour les *Histoires naturelles*.

**Corpus incomplet.** La cible reste d'environ 60 passages par langue (D-21). Cette version livre les passages déjà sélectionnés ; les suivants viendront par tranches relues, chacune dans une nouvelle version avec son registre.

## Sélection et étiquettes

La sélection est déléguée (D-21) : passages authentiques du domaine public, sources et conditions de réutilisation documentées, préférence pour la mer et les pirates, lisibles par des élèves de 12 à 17 ans, exceptions sensibles remontées.

L'étiquette `complexity` est **éditoriale**. Elle vient de l'appréciation de lecture notée pendant la sélection (vocabulaire, syntaxe, longueur des phrases, sujet), ramenée à trois niveaux :

| Appréciation | `complexity` |
|---|---|
| facile, facile à moyen | `easy` |
| moyen | `medium` |
| moyen à difficile, difficile | `hard` |

L'appréciation d'origine, avec ses nuances, est conservée telle quelle dans `editorial.level` et dans les tableaux ci-dessous. Ni l'étiquette ni l'appréciation ne sont une classification scientifique calculée : les mesures M1 à M4 sont fournies pour information, et leurs seuils ne sont pas calibrés (D-10, P-1).

## Format, versions et mesures

- Format de F-02.3a (`packages/database/src/corpus/format.ts`), normalisation version 2. Chaque fichier est écrit exactement comme `JSON.stringify(valeur, null, 2)` suivi d'un saut de ligne.
- `text` est exactement `normalizePassage(sourceText, langue)` du moteur, et `wordCount` est `countWords(text)`. `sourceText` est l'extrait exact de la source ; ses sauts de paragraphe sont gardés (`\n`).
- Moteur : `@incision/domain` de la tête de F-02.3a (1ccf480), normalisation 2 (`checks.engineVersion`).
- Mesures (`measureText` du moteur, `measures.measuredWith`) : M1, nombre moyen de lettres par mot ; M2, part des mots de plus de 9 lettres (%) ; M3, part des mots hors du vocabulaire courant, noms propres à part (%) ; M4, caractères spéciaux pour 100 mots (; : ! ? " ( ), chiffres, apostrophes et traits d'union). Fréquences : wordfreq 3.1.1, listes `large_fr` et `large_en` (CC BY-SA 4.0), seuil du vocabulaire courant Zipf 4, sur les 200 premiers mots au plus.
- Cinq passages mesurés lors de la première tranche avec un état antérieur de l'outil de mesure ont des mesures différentes de mes notes de travail : `fr-daudet-lettres-moulin-installation`, `fr-dumas-monte-cristo-ch01-pharaon`, `en-stevenson-treasure-island-ch08-spy-glass`, `en-faraday-candle-lecture1-opening` et le passage de livraison anglais (M3 7,6 au lieu de 8,1). Les fichiers portent les valeurs recalculées par le moteur le 25 octobre ; les étiquettes n'en dépendent pas.

## Sources et licences

- **Français : Wikisource.** Chaque passage cite la révision exacte de sa page (`source.url` en `oldid`, `source.revision`) et l'édition transcrite (`source.edition`). Les œuvres sont du domaine public au Canada (auteurs morts entre 1870 et 1923) et aux États-Unis (publiées entre 1844 et 1909). Wikisource publie ses pages sous CC BY-SA 4.0 : l'attribution est le lien vers la révision.
- **Anglais : Project Gutenberg.** Chaque passage cite le numéro de l'eBook (`source.url`, `source.revision`) et le fichier texte utilisé (`pgN.txt`, `source.edition`) ; `checks.sourceFileUpdatedAt` donne la date de dernière mise à jour annoncée dans ce fichier. Les œuvres sont du domaine public au Canada (auteurs morts entre 1731 et 1956) et aux États-Unis (publiées entre 1719 et 1926). Seul l'extrait est repris, sans l'en-tête, la licence ni la marque Project Gutenberg, qui ne sont pas redistribués ; citer l'eBook comme source n'est pas une redistribution sous la marque.
- `source.licence` de chaque passage donne la date de mort de l'auteur et la date de publication retenues.
- **Point signalé, non tranché ici :** le dépôt n'a pas de licence propre pour ses données. Si une transcription de Wikisource portait un droit distinct du texte du domaine public, sa reprise devrait rester sous CC BY-SA 4.0. Je ne choisis pas de licence pour ces fichiers dans cette version.

## Adaptations

Les adaptations sont listées passage par passage dans `adaptations`, avec leur nombre, du texte source exact au texte tapé :

- **Toutes sources :** espaces insécables et sauts de paragraphe remplacés par une espace ; apostrophes et guillemets typographiques remplacés par `'` et `"` (les guillemets français perdent leurs espaces intérieures) ; points de suspension écrits en trois points ; ligatures écrites en toutes lettres (œ en oe, P-4) ; tirets de phrase écrits « - » entre espaces. Ce sont les règles de la normalisation 2, appliquées par le moteur ; le générateur vérifie que chaque changement signalé par le moteur a sa ligne, et réciproquement.
- **Project Gutenberg :** les retours à la ligne forcés de la transcription sont joints par une espace. Balisage de transcription retiré, compté dans `adaptations` : marques d'italique `_` dans `en-carroll-alice-ch01-rabbit-hole` (6) et `en-milne-winnie-pooh-ch09-island` (2), lignes `[Illustration]` dans `en-potter-squirrel-nutkin-opening` (4).
- Aucun mot n'est retiré ni remplacé dans un passage littéraire (D3). Quand l'hôte désactive les nombres, la ponctuation, les majuscules ou les accents, le moteur transforme le texte tapé au moment de la course ; le passage stocké ne change pas.

## Passages

### Français (`fr.json`)

| Passage | Statut | `complexity` | Appréciation (`editorial.level`) | Mots | M1 / M2 / M3 / M4 | Source |
|---|---|---|---|---:|---|---|
| `fr-verne-vingt-mille-lieues-p1-ch14-pacifique` (livraison) | retenu | medium | moyen | 63 | 5.02 / 6.3 / 17.5 / 19 | Jules Verne, *Vingt mille lieues sous les mers*, 1re partie, chapitre XIV « Le Fleuve noir », paragraphe entier ([Wikisource revision 11270647](https://fr.wikisource.org/w/index.php?oldid=11270647)) |
| `fr-verne-tour-du-monde-ch01-fogg` (LFR1) | retenu | medium | moyen | 202 | 5.11 / 8.5 / 16.2 / 10 | Jules Verne, *Le Tour du monde en quatre-vingts jours*, chapitre I, trois paragraphes consécutifs ([Wikisource revision 12868439](https://fr.wikisource.org/w/index.php?oldid=12868439)) |
| `fr-verne-vingt-mille-lieues-p1-ch14-oceans` (LFR2) | retenu | hard | difficile (nombres en lettres) | 212 | 5.26 / 9.5 / 18.1 / 12.5 | Jules Verne, *Vingt mille lieues sous les mers*, 1re partie, chapitre XIV « Le Fleuve noir », quatre paragraphes ([Wikisource revision 11270647](https://fr.wikisource.org/w/index.php?oldid=11270647)) |
| `fr-malot-sans-famille-p1-ch01-nourrice` (LFR4) | retenu | easy | facile à moyen | 231 | 4.43 / 1.5 / 12 / 7 | Hector Malot, *Sans famille*, 1re partie, chapitre I, sept premiers paragraphes ([Wikisource revision 5070999](https://fr.wikisource.org/w/index.php?oldid=5070999)) |
| `fr-daudet-lettres-moulin-installation` (LFR3) | retenu | medium | moyen | 291 | 4.43 / 3.5 / 15.1 / 9.5 | Alphonse Daudet, *Lettres de mon moulin*, « Installation », deux premiers paragraphes ([Wikisource revision 9702331](https://fr.wikisource.org/w/index.php?oldid=9702331)) |
| `fr-verne-deux-ans-vacances-ch01-tempete` (LFR6) | retenu | medium | moyen | 220 | 4.96 / 6.5 / 21.6 / 14.5 | Jules Verne, *Deux ans de vacances*, chapitre I, trois paragraphes consécutifs ([Wikisource revision 5641105](https://fr.wikisource.org/w/index.php?oldid=5641105)) |
| `fr-verne-ile-mysterieuse-p1-ch11-carte` (LFR7) | retenu | hard | moyen à difficile (géographie, « très-déterminé » à l’ancienne) | 269 | 5.07 / 8.5 / 20.6 / 11.5 | Jules Verne, *L’Île mystérieuse*, 1re partie, chapitre XI, six paragraphes consécutifs ([Wikisource revision 11450963](https://fr.wikisource.org/w/index.php?oldid=11450963)) |
| `fr-verne-enfants-capitaine-grant-p1-ch09-magellan` (LFR8) | retenu | hard | difficile (noms de lieux, oiseaux, M3 élevée) | 255 | 5.05 / 8.5 / 30.7 / 8.5 | Jules Verne, *Les Enfants du capitaine Grant*, 1re partie, chapitre IX « Le détroit de Magellan », un paragraphe ([Wikisource revision 4522936](https://fr.wikisource.org/w/index.php?oldid=4522936)) |
| `fr-loti-pecheur-islande-p1-ch02-marie` (LFR9) | retenu | medium | moyen | 266 | 4.64 / 3 / 19.3 / 6 | Pierre Loti, *Pêcheur d’Islande*, 1re partie, chapitre II, cinq premiers paragraphes ([Wikisource revision 15007157](https://fr.wikisource.org/w/index.php?oldid=15007157)) |
| `fr-hugo-travailleurs-mer-p2-l1-ch01-douvres` (LFR10) | retenu | medium | moyen | 237 | 4.75 / 8 / 19.1 / 8.5 | Victor Hugo, *Les Travailleurs de la mer*, 2e partie, livre I, chapitre I, trois paragraphes consécutifs ([Wikisource revision 5543264](https://fr.wikisource.org/w/index.php?oldid=5543264)) |
| `fr-bruno-tour-france-ch088-ocean` (LFR13) | retenu | easy | facile | 290 | 4.27 / 4 / 3.1 / 11 | G. Bruno, *Le Tour de la France par deux enfants*, ch. LXXXVIII, cinq premiers paragraphes de la lettre de Julien ([Wikisource revision 3741061](https://fr.wikisource.org/w/index.php?oldid=3741061)) |
| `fr-renard-histoires-naturelles-souris` (LFR14) | retenu | easy | facile | 207 | 4.22 / 2.5 / 13 / 11.5 | Jules Renard, *Histoires naturelles*, « La Souris », le texte entier ([Wikisource revision 10420641](https://fr.wikisource.org/w/index.php?oldid=10420641)) |
| `fr-segur-malheurs-sophie-ch11-ecureuil` (LFR15) | retenu | easy | facile | 215 | 4.25 / 0.5 / 18.2 / 12.5 | Comtesse de Ségur, *Les Malheurs de Sophie*, ch. XI « L’Écureuil », six premiers paragraphes ([Wikisource revision 2075001](https://fr.wikisource.org/w/index.php?oldid=2075001)) |
| `fr-malot-sans-famille-p1-ch11-miche` (LFR16) | retenu | easy | facile à moyen | 272 | 4.37 / 2.5 / 13.8 / 10.5 | Hector Malot, *Sans famille*, 1re partie, ch. XI, sept paragraphes consécutifs ([Wikisource revision 5071034](https://fr.wikisource.org/w/index.php?oldid=5071034)) |
| `fr-renard-histoires-naturelles-goujon` (LFR17) | retenu | easy | facile | 208 | 4.17 / 0.5 / 17.5 / 8.5 | Jules Renard, *Histoires naturelles*, « Le Goujon », première section (15 courts paragraphes) ([Wikisource revision 10420641](https://fr.wikisource.org/w/index.php?oldid=10420641)) |
| `fr-daudet-petit-chose-p1-ch01-robinson` (LFR18) | retenu | easy | facile à moyen | 257 | 4.51 / 5 / 13.6 / 9.5 | Alphonse Daudet, *Le Petit Chose*, 1re partie, ch. I, deux paragraphes ([Wikisource revision 15581873](https://fr.wikisource.org/w/index.php?oldid=15581873)) |
| `fr-dumas-monte-cristo-ch01-pharaon` (LFR11) | réserve | medium | moyen | 301 | 4.98 / 5.6 / 15.3 / 15.5 | Alexandre Dumas, *Le Comte de Monte-Cristo*, chapitre I « Marseille. — L’arrivée », cinq premiers paragraphes ([Wikisource revision 4642213](https://fr.wikisource.org/w/index.php?oldid=4642213)) |
| `fr-loti-pecheur-islande-p1-ch06-morues` (LFR12) | réserve | medium | moyen | 268 | 4.96 / 9.5 / 19.6 / 6 | Pierre Loti, *Pêcheur d’Islande*, 1re partie, chapitre VI, trois paragraphes consécutifs ([Wikisource revision 15007157](https://fr.wikisource.org/w/index.php?oldid=15007157)) |
| `fr-segur-malheurs-sophie-ch09-pain-chevaux` (LFR19) | réserve | easy | facile | 254 | 4.3 / 2 / 11.8 / 9.5 | Comtesse de Ségur, *Les Malheurs de Sophie*, ch. IX « Le Pain des chevaux », sept premiers paragraphes ([Wikisource revision 2074957](https://fr.wikisource.org/w/index.php?oldid=2074957)) |
| `fr-bruno-tour-france-ch089-tempete` (LFR20) | réserve | easy | facile à moyen | 231 | 4.65 / 5 / 11.7 / 10 | G. Bruno, *Le Tour de la France par deux enfants*, ch. LXXXIX, trois premiers paragraphes ([Wikisource revision 3741062](https://fr.wikisource.org/w/index.php?oldid=3741062)) |

### Anglais (`en.json`)

| Passage | Statut | `complexity` | Appréciation (`editorial.level`) | Mots | M1 / M2 / M3 / M4 | Source |
|---|---|---|---|---:|---|---|
| `en-stevenson-treasure-island-ch07-map` (livraison) | retenu | medium | moyen | 67 | 4.54 / 4.5 / 7.6 / 6 | Robert Louis Stevenson, *Treasure Island*, chapter VII “I Go to Bristol”, two consecutive sentences ([Project Gutenberg eBook no. 120](https://www.gutenberg.org/ebooks/120)) |
| `en-carroll-alice-ch01-rabbit-hole` (LEN1) | retenu | easy | facile | 274 | 4.06 / 3.5 / 3.1 / 9.5 | Lewis Carroll, *Alice’s Adventures in Wonderland*, chapter I “Down the Rabbit-Hole”, first four paragraphs ([Project Gutenberg eBook no. 11](https://www.gutenberg.org/ebooks/11)) |
| `en-grahame-wind-willows-ch01-river-bank` (LEN2) | retenu | medium | moyen | 314 | 4.45 / 3.5 / 16.4 / 8 | Kenneth Grahame, *The Wind in the Willows*, chapter I “The River Bank”, first two paragraphs ([Project Gutenberg eBook no. 289](https://www.gutenberg.org/ebooks/289)) |
| `en-montgomery-anne-green-gables-ch02-shining-waters` (LEN3) | retenu | hard | moyen à difficile | 236 | 4.17 / 1.5 / 17.9 / 6.5 | L. M. Montgomery, *Anne of Green Gables*, chapter II, three consecutive paragraphs ([Project Gutenberg eBook no. 45](https://www.gutenberg.org/ebooks/45)) |
| `en-stevenson-treasure-island-ch08-spy-glass` (LEN4) | retenu | medium | moyen | 285 | 3.98 / 1.5 / 10.3 / 1.5 | Robert Louis Stevenson, *Treasure Island*, chapter VIII “At the Sign of the Spy-glass”, first four paragraphs ([Project Gutenberg eBook no. 120](https://www.gutenberg.org/ebooks/120)) |
| `en-faraday-candle-lecture1-opening` (LEN5) | retenu | hard | difficile (style oratoire) | 284 | 4.37 / 4 / 6.1 / 1.5 | Michael Faraday, *The Chemical History of a Candle*, Lecture I, first two paragraphs ([Project Gutenberg eBook no. 14474](https://www.gutenberg.org/ebooks/14474)) |
| `en-dana-two-years-mast-ch31-iceberg` (LEN7) | retenu | medium | moyen | 261 | 4.29 / 3 / 11.6 / 4 | Richard Henry Dana Jr., *Two Years Before the Mast*, chapter XXXI, three consecutive paragraphs ([Project Gutenberg eBook no. 2055](https://www.gutenberg.org/ebooks/2055)) |
| `en-melville-moby-dick-ch01-loomings` (LEN8) | retenu | hard | difficile (vocabulaire du XIXe, M3 élevée) | 288 | 4.54 / 1.5 / 22 / 7 | Herman Melville, *Moby-Dick; or, The Whale*, chapter 1 “Loomings”, paragraphs 2 to 4 ([Project Gutenberg eBook no. 2701](https://www.gutenberg.org/ebooks/2701)) |
| `en-stevenson-kidnapped-ch14-islet` (LEN9) | retenu | easy | facile à moyen | 230 | 3.87 / 1 / 9 / 4.5 | Robert Louis Stevenson, *Kidnapped*, chapter XIV “The Islet”, first two paragraphs ([Project Gutenberg eBook no. 421](https://www.gutenberg.org/ebooks/421)) |
| `en-kipling-captains-courageous-ch01-forecastle` (LEN10) | retenu | medium | moyen | 272 | 4.21 / 3 / 11.1 / 4.5 | Rudyard Kipling, *Captains Courageous*, chapter I, one paragraph ([Project Gutenberg eBook no. 2186](https://www.gutenberg.org/ebooks/2186)) |
| `en-defoe-robinson-crusoe-ch07-valley` (LEN11) | retenu | easy | facile à moyen | 314 | 3.99 / 1.5 / 6.1 / 2.5 | Daniel Defoe, *Robinson Crusoe*, chapter VII (editorial chapter titles), one paragraph ([Project Gutenberg eBook no. 521](https://www.gutenberg.org/ebooks/521)) |
| `en-potter-squirrel-nutkin-opening` (LEN14) | retenu | easy | facile | 211 | 3.98 / 1.5 / 9.1 / 4 | Beatrix Potter, *The Tale of Squirrel Nutkin*, opening of the tale, up to the first request to the owl ([Project Gutenberg eBook no. 14872](https://www.gutenberg.org/ebooks/14872)) |
| `en-milne-winnie-pooh-ch09-island` (LEN15) | retenu | easy | facile | 213 | 3.83 / 1.5 / 4.2 / 5 | A. A. Milne, *Winnie-the-Pooh*, chapter IX, four paragraphs after the second section break ([Project Gutenberg eBook no. 67098](https://www.gutenberg.org/ebooks/67098)) |
| `en-kipling-jungle-book-white-seal-beaches` (LEN16) | retenu | easy | facile à moyen | 244 | 4.3 / 3 / 11.2 / 3 | Rudyard Kipling, *The Jungle Book*, “The White Seal”, three consecutive paragraphs ([Project Gutenberg eBook no. 236](https://www.gutenberg.org/ebooks/236)) |
| `en-baum-wizard-oz-ch01-cyclone` (LEN17) | retenu | easy | facile | 241 | 4.04 / 0.5 / 7.6 / 1 | L. Frank Baum, *The Wonderful Wizard of Oz*, chapter I, five consecutive paragraphs ([Project Gutenberg eBook no. 55](https://www.gutenberg.org/ebooks/55)) |
| `en-stevenson-treasure-island-ch13-island` (LEN12) | réserve | medium | moyen | 258 | 4.42 / 4 / 13.6 / 3.5 | Robert Louis Stevenson, *Treasure Island*, chapter XIII, first two paragraphs ([Project Gutenberg eBook no. 120](https://www.gutenberg.org/ebooks/120)) |
| `en-conrad-typhoon-ch03-storm` (LEN13) | réserve | hard | difficile (vocabulaire nautique) | 323 | 4.47 / 2.5 / 20.8 / 2.5 | Joseph Conrad, *Typhoon*, chapter III, two consecutive paragraphs ([Project Gutenberg eBook no. 1142](https://www.gutenberg.org/ebooks/1142)) |
| `en-potter-jeremy-fisher-opening` (LEN18) | réserve | easy | facile | 277 | 3.97 / 2 / 10.6 / 7 | Beatrix Potter, *The Tale of Mr. Jeremy Fisher*, opening of the tale ([Project Gutenberg eBook no. 15077](https://www.gutenberg.org/ebooks/15077)) |
| `en-kipling-just-so-cat-opening` (LEN19) | réserve | easy | facile (langue ancienne : « befell and behappened ») | 306 | 3.71 / 1 / 4.5 / 6.5 | Rudyard Kipling, *Just So Stories*, “The Cat that Walked by Himself”, first three paragraphs ([Project Gutenberg eBook no. 2781](https://www.gutenberg.org/ebooks/2781)) |

## Réserves et cas remontés

Une réserve décrit ce qu'un relecteur doit savoir du passage ou de son œuvre ; elle ne retire rien du texte. Quand une œuvre emploie ailleurs un terme racial ou une insulte, la réserve le signale sans le reproduire.

- `fr-verne-tour-du-monde-ch01-fogg` : tirets normalisés en « - ».
- `fr-verne-vingt-mille-lieues-p1-ch14-oceans` : guillemets normalisés.
- `fr-malot-sans-famille-p1-ch01-nourrice` : thème de l’abandon, traité avec douceur.
- `fr-daudet-lettres-moulin-installation` : « œil » devient « oeil » (normalisation v2, P-4).
- `fr-verne-deux-ans-vacances-ch01-tempete` : le chapitre I emploie plus loin un terme racial d’époque (paragraphe non retenu) ; le passage lui-même n’en dit rien.
- `fr-bruno-tour-france-ch088-ocean` : l’ouvrage contient ailleurs une légende hiérarchisant « les quatre races d’hommes » (ch. LXXVI) et un terme racial d’époque (ch. XCV), et l’édition de 1904 est très religieuse et patriotique ; le passage n’en contient rien.
- `fr-segur-malheurs-sophie-ch11-ecureuil` : plus loin dans le chapitre, l’écureuil est capturé et meurt ; ailleurs dans le livre, le fouet et des animaux qui meurent par imprudence. Le passage s’arrête avant.
- `fr-malot-sans-famille-p1-ch11-miche` : « Joli-Cœur » devient « Joli-Coeur » (ligatures, P-4). Le livre contient ailleurs de la violence (Garofoli bat des enfants) et une insulte raciale anglaise (2e partie, ch. XVIII) ; le passage n’en contient rien.
- `fr-renard-histoires-naturelles-goujon` : « la lèvre déchirée » du poisson, sans insistance ; « gros œil » devient « gros oeil ».
- `fr-daudet-petit-chose-p1-ch01-robinson` : exclamations « Juste Dieu ! » et « grand Dieu ! » ; nombreux points de suspension.
- `fr-dumas-monte-cristo-ch01-pharaon` : « l’œil » devient « l’oeil » (normalisation v2, P-4) ; chiffres (24, 1815).
- `fr-segur-malheurs-sophie-ch09-pain-chevaux` : une morsure, sans détail ; mêmes signalements d’œuvre que LFR15.
- `fr-bruno-tour-france-ch089-tempete` : peur de mourir et prière, sans blessure ; mêmes signalements d’œuvre que LFR13.
- `en-carroll-alice-ch01-rabbit-hole` : italiques Gutenberg retirées ; « stupid » qualifie Alice.
- `en-grahame-wind-willows-ch01-river-bank` : exclamations légères (« Bother! »).
- `en-montgomery-anne-green-gables-ch02-shining-waters` : doubles traits d’union normalisés en « - ».
- `en-stevenson-treasure-island-ch08-spy-glass` : taverne, tabac et jambe amputée décrits sans violence : conformes aux critères ; « -- » normalisés.
- `en-faraday-candle-lecture1-opening` : tirets normalisés.
- `en-dana-two-years-mast-ch31-iceberg` : aucune dans le passage ; le juron censuré (« d--- you ») est au paragraphe précédent, non retenu.
- `en-kipling-captains-courageous-ch01-forecastle` (cas remonté) : le passage est propre, mais le livre emploie ailleurs une insulte raciale (9 fois) et des caricatures en dialecte ; cas remonté pour information.
- `en-defoe-robinson-crusoe-ch07-valley` : le livre comporte ailleurs un contenu colonial et racial (Vendredi, « savages ») ; le passage nomme seulement « the Indians », terme d’époque sans jugement, à propos du pain de manioc. « 15th » disparaît quand les nombres sont désactivés.
- `en-potter-squirrel-nutkin-opening` : quatre lignes « [Illustration] » de la transcription Gutenberg retirées (balisage, pas texte de l’autrice) ; « trois souris grasses » offertes au hibou.
- `en-milne-winnie-pooh-ch09-island` : texte du domaine public au Canada (auteur mort en 1956) et aux États-Unis (1926) ; les illustrations de Shepard ne sont pas utilisées.
- `en-kipling-jungle-book-white-seal-beaches` : l’histoire décrit plus tôt la chasse aux phoques ; le passage n’en montre rien.
- `en-stevenson-treasure-island-ch13-island` : « HISPANIOLA » en capitales dans la source Gutenberg.
- `en-conrad-typhoon-ch03-storm` : le livre caricature ailleurs ses passagers chinois ; le passage n’en contient pas. En réserve, 323 mots après normalisation.
- `en-kipling-just-so-cat-opening` : 306 mots ; « Wipe you feet » est la formule de Kipling ; une insulte raciale ailleurs dans le recueil (conte du léopard).

**Cas remonté (`editorial.escalated`) :** `en-kipling-captains-courageous-ch01-forecastle`, signalé pour information le 12 octobre. Le passage lui-même est propre ; l'œuvre emploie ailleurs une insulte raciale. Il reste retenu selon la politique déléguée, et je peux le passer en réserve dans une prochaine version sans toucher aux autres.

**Mots relus dans les passages retenus.** Aucun juron, aucune insulte. Quelques mots demandent un contexte et sont acceptés tels quels : « une race vaillante de marins » (Loti) et « la race des meuniers » (Daudet), au sens ancien de lignée ; « the Indians » (Defoe), terme d'époque sans jugement ; « stupid » et « stupide » appliqués à Alice qui a sommeil et à l'œil d'un poisson.

## Couverture

Nombre de passages retenus qui servent chaque réglage du mode cohérent, d'après `passageCut` du moteur, avec une vraie génération de texte pour chaque case. Le nombre est le même pour les 16 combinaisons d'options (ponctuation, nombres, majuscules, accents).

| Langue, niveau | 10, 25 et 50 mots | 75, 100, 150 et 200 mots |
|---|---:|---:|
| fr `easy` | 7 | 7 |
| fr `medium` | 6 | 5 |
| fr `hard` | 3 | 3 |
| en `easy` | 7 | 7 |
| en `medium` | 5 | 4 |
| en `hard` | 3 | 3 |

Les passages de livraison (63 et 67 mots) ne servent que jusqu'à leur longueur ; tous les autres dépassent 200 mots. Chaque case est servie, mais le niveau `hard` n'a que 3 passages par langue : les prochaines tranches viseront d'abord `hard`, puis `medium`.

**Réglages par défaut (D-19 : cohérent, 50 mots, `medium`, ponctuation, majuscules et accents activés, nombres désactivés).** 6 passages retenus en français et 5 en anglais les servent ; `checkCorpus` le vérifie par un vrai tirage dans chaque langue.

## Contrôles

- **Sources revérifiées le 25 octobre 2026** (`checks.sourceRetrievedAt`, `checks.sourceVerifiedAt`) : chacun des 39 `sourceText` est retrouvé mot pour mot dans sa source fixée. Pour Wikisource, la page est relue par son `oldid`, et la révision servie est bien celle citée. Pour Project Gutenberg, le texte est relu dans `pgN.txt`, balisage de transcription compté à part. Cette revérification remplace les dates de mes notes de travail : une date de la troisième tranche y était inexacte, et l'adaptation des deux marques d'italique de *Winnie-the-Pooh* n'y figurait pas ; les deux sont corrigées ici.
- **Moteur le 25 octobre** (`checks.engineAcceptedAt`) : pour chaque passage, `normalizePassage(sourceText)` est accepté et donne exactement `text` ; `checkPassages` accepte le passage ; un tirage cohérent sur ce seul passage réussit.
- **Format et import (code de F-02.3a, 1ccf480)** : `readCorpusVersion` et `checkCorpus` acceptent la version (empreinte de version `b2b351b3c52ba7f06e082b5a7bf9d07dcbf4747b0dcc939bfec0367198e0ce9c`). Sur des bases locales jetables (`db:import:corpus`) : le premier import affiche `imported, active` (39 nouveaux passages), le deuxième `unchanged`. Importée après la fixture du contrat, la version garde les deux passages de livraison (`passages new 37, kept 2`), et réimporter ensuite la fixture ne la réactive pas (`unchanged, NOT active`). `loadActiveCorpus` relit les 31 passages retenus, et un tirage aux réglages par défaut réussit dans chaque langue.
- **Passages de livraison** : leur identité (texte, texte source, adaptations, source) est celle du contrat de F-02.3a, octet pour octet ; leur empreinte de contenu est identique. Leurs mesures, leur note éditoriale et leurs dates de contrôle sont celles de cette version.
- **Fuite** (`db:check-corpus-leak` de F-02.3a, sur un build de production et une archive de version) : chaque passage a ses empreintes (84 au total), aucune n'apparaît dans le build (409 fichiers) ni dans ce que l'archive livre (706 fichiers), hormis les deux passages de livraison dans `race-texts.ts`, l'exception prévue ; l'archive ne contient pas le dossier du corpus.

## Limites

- Corpus incomplet : 19 textes indépendants par langue pour une cible d'environ 60.
- Étiquettes éditoriales, non calibrées ; les seuils des mesures restent des paramètres (P-1).
- Le passage `fr-verne-vingt-mille-lieues-p1-ch14-oceans` (`hard`) contient le passage de livraison français (`medium`) : un joueur peut retrouver le même paragraphe dans deux niveaux.
- Les courses ne tirent pas encore ce corpus : la sélection côté serveur vient avec F-02.3b. D'ici là, elles tournent sur les deux passages de livraison de `race-texts.ts`.
