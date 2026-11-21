# Recette de production et rapprochement — 20 novembre 2026

## Mandat et provenance

Philippe demande de rapprocher les validations acquises de la matrice, de ne pas
rejouer les recettes, puis de livrer une PR documentaire vers `dev`, sans merge
ni déploiement. Aucun changement applicatif, de base ou de configuration dans
cette tranche. Aucun ticket fermé.

Base documentaire : `e6ba892` (dev, après #224).
Production observée dans la conversation : `276c06f4bfe2e6a081429ca9179f487dbb3f7778`
(main, promotion #221). Le déploiement
[44835346332, tentative 2](https://github.com/PhilJordan18/incision/actions/runs/44835346332)
a réussi après correction de la configuration de migration; le premier échec
n’est pas effacé. Les courses et l’entrée invitée fonctionnent après activation
des fonctionnalités et configuration de leurs secrets par Philippe. Aucune
valeur de secret n’est conservée ici.

**Témoignage humain, pas tests exécutés par l’agent :** Philippe confirme toutes
les Courses, les bonus déjà essayés, les modes Arcade et Entraînement, et une
course sans problème à **30 participants : lui et 29 bots**. Il enchaîne une
manche en anglais avec des mots aléatoires. Les captures originales ci-dessous
complètent ce témoignage; elles ne mesurent pas seules une cadence, un calcul
serveur ou une synchronisation multi-navigateurs.

Les validations A–G, T1–T5, OAuth et C1 restent acquises dans leur portée initiale.
Les tests techniques existants complètent les observations humaines : on ne
demande pas à une capture de prouver la concurrence SQL ou le déterminisme.

## Pièces jointes originales

Les 16 PNG sont copiés sans retouche des fichiers fournis par Philippe.
Date : 20 novembre 2026, heures locales de Montréal.

| Capture | Heure | Observation et portée |
|---|---|---|
| [01 — Attente](01-training-waiting.png) | 21:21:21 | Entraînement, réglages initiaux, départ indisponible avec un seul participant. |
| [02 — Brouillon](02-settings-draft.png) | 21:23:00 | Anglais, 75 mots, passage cohérent, Arcade et 120 s. |
| [03 — Réglages enregistrés](03-settings-saved.png) | 21:23:11 | Configuration enregistrée, interface française indépendante de la langue du texte. |
| [04 — Capacité maximale](04-thirty-participants.png) | 21:23:29 | 30/30 participants, un humain et 29 bots; pas 30 navigateurs humains. |
| [05 — Décompte](05-countdown.png) | 21:23:41 | Décompte et texte anglais révélé; la synchronisation exacte relève aussi des tests existants. |
| [06 — Brouillard](06-fog.png) | 21:24:35 | Brouillard visible pendant la course, compteurs et bonus disponibles. |
| [07 — Refus sans cible](07-no-target.png) | 21:24:51 | Refus explicite, bonus conservé en réserve. |
| [08 — Résultats manche 1](08-round-one-results.png) | 21:25:50 | 6e/30, 29 MPM nets, 32 bruts, 91,5 %, 2:00, aucun finisseur ni vainqueur. |
| [09 — Classement manche 1](09-round-one-ranking.png) | 21:25:58 | Podium et tableau, niveaux de bots, temps écoulé et mesures. |
| [10 — Rallonge](10-extension-journal.png) | 21:26:17 | Alice utilise Rallonge vers Bot 23 à 115,047 s, jalon 50 %. |
| [11 — Utilisé/non utilisé](11-unused-fog.png) | 21:26:27 | Bot 5 : Rallonge utilisée, Brouillard non utilisé. |
| [12 — Trois jalons](12-three-shortcuts.png) | 21:26:34 | Bot 28 : Raccourci aux jalons 25/50/75 %, instants distincts. |
| [13 — Nouveau brouillon](13-random-draft.png) | 21:27:48 | Passage aux mots aléatoires anglais et à la frappe libre. |
| [14 — Nouvelle configuration](14-random-saved.png) | 21:27:56 | 75 mots aléatoires, complexité moyenne, frappe libre, Arcade, 120 s enregistrés. |
| [15 — Résultats manche 2](15-round-two-results.png) | 21:30:11 | 1er/30, 31 MPM nets, 35 bruts, 88,9 %, temps écoulé; toujours aucun vainqueur. |
| [16 — Classement manche 2](16-round-two-ranking.png) | 21:30:26 | Tableau et podium cohérents avec le rang affiché, erreurs et niveaux distincts. |

Lighthouse : captures transmises dans la conversation à 20:34:07
(95 performance, 100 dans les trois autres catégories) et 20:37:05 (100 partout);
Philippe confirme mobile et ordinateur. Ces anciens fichiers temporaires ne sont
plus disponibles au moment de la copie : **ils ne sont pas joints à ce dossier**.
Aucun rapport JSON/HTML ni nouvelle mesure n’est fabriqué. PERF-01 repose sur les
résultats fournis et l’attestation, en complément de ses mesures historiques.

Même distinction pour le défaut `î` constaté en course invitée vers 21:02 :
capture reçue dans la conversation, fichier temporaire non récupérable ici.
La limite est confirmée par le chemin de saisie actuel, pas par une image inventée.

## Rapprochement par groupe

Les fichiers et tests détaillés de chaque ligne de [la matrice](../../EXIGENCES.md)
sont conservés. Les notes actuelles remplacent les anciennes attentes génériques.

| IDs promus de partiel à complet | Preuves et justification |
|---|---|
| TECH-01, TECH-04, TECH-05 | Correctif Next intégré, CI/build, migrations et seeds testés, déploiement réussi, import et courses de production. PgBouncer local : 9 tests réussis dans le lot 3, distinct du service Neon. |
| TECH-07, SEC-01, SEC-02 | Tests de validation, autorisation sous verrou et upload réel déjà cités; aucun défaut précis correspondant laissé ouvert. « Audit exhaustif non fait » n’est pas une implémentation partielle de ces critères. |
| DES-04 | C1 intégré, approuvé pour la remise, contrôle post-merge dans les deux thèmes et piste réelle à capacité maximale. Les écarts artistiques explicitement acceptés ne sont pas de nouvelles exigences. |
| AUTH-02, AUTH-03 | Tests invités, refus et rétention; recette F et anonymisation déjà reçues, entrée/course de production confirmées. Pas d’inspection de la base humaine revendiquée. |
| AUTH-04, AUTH-05 | Tests unitaires/SQL/E2E de profil existants; photo conservée après refus déjà attestée et écran compte accepté. Aucun nouvel upload ou changement de nom en production déduit. |
| SALLE-03, SALLE-04, SALLE-05, SALLE-06, SALLE-08, JOIN-02 | Tests d’admission, invitations, unicité et succession, recettes existantes de visibilité/modération et T2, capacité maximale du 20 novembre. Contrôle IP Azure gardé sous SALLE-10. |
| CONF-02, CONF-04, CONF-06, CONF-07, CONF-09, CONF-11, CONF-12 | Tests des options, bornes/refus et synchronisation; recettes antérieures et deux manches avec configuration modifiée. Les champs inclus/exclus vides ne prouvent pas un essai humain de toutes les combinaisons. |
| COURSE-01, COURSE-02, COURSE-03, COURSE-06, COURSE-09, COURSE-10, COURSE-11 | Tests moteur/runtime/SQL/E2E et confirmation de toutes les Courses; deux manches en production. T1 à 11:29,4 lève déjà la réserve de course illimitée. COURSE-04 reste partiel pour le défaut nommé ci-dessous. |
| BOT-01, BOT-02, BOT-03, BOT-05 | Calibration, cadence, erreurs et déterminisme testés, recette B acquise et 29 bots réels en course. Aucun besoin de « validation humaine du déterminisme » supplémentaire. |
| BONUS-01, BONUS-04 | Tests des jalons, retardataires, version de texte et mesures; bonus attestés et journal de production. BONUS-02 garde le refus invité. |
| I18N-01, I18N-03, A11Y-02, A11Y-03, A11Y-04 | Tests FR/EN, formatage, axe/clavier et recette G, puis C1 accepté. Absence de lecteur d’écran physique ou d’une visite de chaque date non présentée comme réussite; aucun défaut précis de ces critères identifié ici. |
| PERF-01, PERF-02, PERF-03 | Lighthouse transmis, budgets SQL et charge mixte du lot 3, puis observation humaine physique de la piste Azure à 30 participants. Ne vaut pas charge Azure de 30 humains/20 spectateurs ni mesure de FPS en production. |

Bilan : **45 promotions**, **1 retour à partiel** (COURSE-04),
soit **85 complets, 5 partiels, 0 non fait** sur les 90 IDs.
Les limites de méthodes restent écrites sans créer des exigences supplémentaires.

## Les cinq réserves actuelles

| ID | Réserve réelle | Ce qui ne la lève pas |
|---|---|---|
| TECH-08 | Crédit Azure et quotas Neon actuels non relevés; dernière mesure financière du 19 octobre. | Site fonctionnel et déploiement réussi ne prouvent pas le budget jusqu’à la correction. |
| SALLE-10 | Vérification derrière le frontal Azure réel : extraction de l’adresse, résistance aux en-têtes forgés, séparation des budgets sur deux réseaux. Tests locaux derrière proxy déjà présents. | Course humaine et Lighthouse. |
| COURSE-04 | macOS : maintien de `i` puis choix de `î` non géré par le chemin de remplacement natif limité à `e/E`. **Philippe reporte le correctif.** | Validation générale des Courses; succès des accents `e` déjà acquis. |
| BONUS-02 | Activation d’un bonus par invité refusée : `currentSession` absent → `UNAUTHORIZED` dans `apps/web/src/server/realtime/race-channel.ts`. Le rapport du lot 3 a effectivement observé ce refus. | Tests Arcade avec compte et bots; pouvoir rejoindre ou taper en invité. |
| A11Y-01 | Voile secondaire C1 en Aube : contraste précédemment signalé autour de 2,86:1, à qualifier/corriger; `.jib` reste à 0,75 d’opacité. | Lighthouse 100 ou captures Abysse; aucune nouvelle mesure AA exhaustive. |

Aucun correctif n’est effectué ni autorisé implicitement par cette réconciliation.
Les fanions neutres des autres coureurs sont acceptés artistiquement; ils ne
s’ajoutent pas à ces cinq réserves officielles. La remise administrative et les
documents personnels restent sous la responsabilité de Philippe.

## Preuves existantes utilisées, sans réexécution

- [Recette A–G](../human-2026-11-17/README.md), [rapprochement A–G](../matrix-ag-2026-11-17/README.md).
- [Finalisation T1–T5 et corpus](../finalization-2026-11-18/human-validation.md).
- [Qualification du lot 3](../lot3-guest-arcade/README.md) : charge mixte, SQL, PgBouncer, refus bonus invité.
- [Contrôle C1 post-merge](../da2-recette-2026-11-20/README.md) : deux tests Abysse/Aube, corpus réel local.
- [Bilan et décisions C1](../../da/v2/bilan-c1.md).
- Tests spécifiques et rapports pointés par chacune des lignes de la matrice.

## Vérification de cette livraison

Revue d’architecte documentaire : critères officiels conservés, témoignages
distingués des tests, aucune nouvelle exécution applicative revendiquée.
Contrôles locaux : unicité et nombre des IDs, cinq réserves nommées, statuts
autorisés, liens locaux du nouveau dossier, intégrité des PNG, diff limité aux
documents et pièces fournies, `git diff --check`.
Aucun build nécessaire pour cette tranche documentaire (CONTRIBUTING.md).
