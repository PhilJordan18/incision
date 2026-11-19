# Bilan de l'intégration C1

État relevé le 18 novembre 2026 vers 15 h, `dev` à `b98314a`. Les CI en cours à cette heure sont notées « en cours » : leur résultat se lit sur la pull request, pas ici. Ce bilan sépare quatre choses qui ne se valent pas :

- **rapporté** : ce que la session de travail d'un lot dit avoir fait et testé;
- **livré** : la branche poussée et sa pull request vers `dev`;
- **validé** : le diff relu et comparé aux références par une revue indépendante, sur un SHA exact, et la CI lue sur ce même SHA;
- **intégré** : fusionné dans `dev`.

**Aucun lot n'est intégré.** Tout ce qui suit est dans des pull requests ouvertes; l'application de `dev` garde les écrans de la version précédente.

Les revues indépendantes sont des lectures statiques (diff, tests, captures déposées dans la branche) faites par des agents de revue en lecture seule, distincts de la session qui a écrit le code. Elles n'ont rien exécuté. L'**auto-vérification** désigne les tests et les revues lancés par la session du lot elle-même. Je n'ai pas encore joué la [recette de l'ensemble](recette-c1.md) : elle attend l'état combiné.

## Relevé du 19 novembre, 14 h 30

`dev` est à `4564778` (#213 fusionnée). Toujours aucun lot C1 intégré. Ce relevé remplace, pour les SHA et les verdicts, le tableau du 18 novembre gardé plus bas comme historique. Chaque branche se fusionne sans conflit avec `dev` et avec les autres (fusions d'essai, sans exécution).

| Lot | PR | SHA proposé | CI sur ce SHA (push / PR) | Revue indépendante sur ce SHA | Verdict |
|---|---|---|---|---|---|
| DA2-1 Références | #208 | `1838d44` | verte / verte | lecture d'architecte | prêt à fusionner |
| DA2-0 Primitives | #211 | `fcc8af8` | en cours / verte | code : OK, deux mineurs du 18 corrigés | prêt à fusionner dès la CI push verte |
| DA2-2 Course | #212 | `5b9dd53` | verte / en cours | code : OK, les trois majeures du 18 traitées | prêt côté code; décision 2 ouverte; assertions affaiblies à déclarer dans la PR |
| DA2-3/4 Accueil | #217 | `1d79eb5` | en cours / en cours | code @ `7b8da57` : OK; `1d79eb5` non relu | prêt après relecture du dernier commit et CI verte |
| DA2-6 Entrée de salle | #220 | `0ddfad7` | en cours / en cours | interface : OK pour les trois scènes; code : corrections nécessaires (deux majeures dans la spec de tests) | corrections nécessaires |
| DA2-5a Salle d'attente | #214 | `1345e32` | en cours / en cours | code : OK | prêt à fusionner avec #215 et #216, CI verte attendue |
| DA2-5b Bots | #215 | `7e8c47e` | en cours / en cours | code : OK, majeures du 18 corrigées; QA fonctionnelle non rejouée sur ce SHA | prêt côté code; assertions remplacées à déclarer dans la PR |
| DA2-8 Réglages | #216 | `1c85fac` (inchangé) | verte / **échec** | celle du 18 : corrections nécessaires | corrections nécessaires; ne contient pas la tête de #215 |
| DA2-7 Résultats | #218 (brouillon) | `0f05d3c` | en cours / en cours | code : corrections nécessaires pour le seul critère du fanion | décision 3 |

### Ce que la revérification a établi

- **#212 Course.** Les contrôles de `race-track.spec.ts` ont de nouveau une cible réelle pour les coureurs nommés. Sur tablette, les coureurs sans nom sont maintenant gris comme sur ordinateur : la décision 2 s'étend donc à la tablette. « ARRIVÉE » et « + N autres coureurs » ont une plaque opaque au-dessus des navires : un navire près de la côte, le mien compris, passe derrière. Assertions affaiblies par le correctif, à dire telles quelles : « aucune coque sur une autre » devenu « aucune coque sur la mienne » (`da2-race.spec.ts:139-140`), et jusqu'à 3 % des paires sous la marge dans `track-layout.test.ts:42-44`. Le commentaire « Philippe, 18 November » de `race-track.spec.ts:87-88` n'est pas une approbation.
- **#215 Bots.** Une ligne ne se referme plus que sur sa propre confirmation; un refus prend le focus sur « Recharger la salle ». La règle existante (un niveau reçu en direct remplace le brouillon) est inchangée. Le contrôle « enregistrer à côté du select » ne tourne plus qu'à 1440 px.
- **#217 Accueil.** Fanions et anneaux viennent des primitives partagées : la queue d'aronde de l'escale 04 a disparu. Première vue testée à 1024 × 768; à 390 px le test vérifie l'ordre (titre, actions, carte), pas la première vue, et le dit.
- **#218 Résultats.** Les tests ne se lisent plus comme une preuve du critère; le README de preuves dit « critère partiellement rempli ». `packages/` reste intact.
- **#220 Entrée de salle.** Code produit sans constat bloquant; aucune spec existante modifiée. Majeures : l'étape « trop d'essais » de `da2-room-entry.spec.ts:410, 458-460` dépend d'une fenêtre de 60 s et peut échouer sur une machine lente; la spec est lourde (environ 132 analyses d'accessibilité et 136 captures, écrites même hors mode preuves). Trois fichiers sans propriétaire sont modifiés (`components/ui/state-panel.tsx`, `components/errors/error-state.tsx`, `not-found-panel.tsx`) : décision 14.

### Blocage d'intégration : la durée de la CI

L'étape Playwright est coupée à 25 minutes. Sur `dev` elle dure 17 min 42 s. Sur #216 @ `1c85fac`, les 289 tests réussissent mais l'exécution PR a été coupée à 25 min 05 s (échec) et l'exécution push est passée à 24 min 52 s. L'état combiné ajoute encore les specs de la course, de l'accueil, de l'entrée de salle et des résultats : il dépassera la limite. Ce n'est pas un test en échec, mais la CI de `dev` sera rouge après les fusions si rien ne change. Voir la décision 15.

### Décisions ajoutées le 19 novembre

| # | Référence | Capture réelle | Différence | Recommandation | Conséquence |
|---|---|---|---|---|---|
| 12 | `captures/etats-salle-1440.jpg` : six traits de vagues bien visibles dans le coin des panneaux | `docs/evidence/da2-6-room-entry/app/state-unknown-fr-abysse-1440.png` (#220), `docs/evidence/da2-5-waiting-room/etat-fermee-fr-abysse-1440.jpg` (#214) | deux traits pâles (un seul sur téléphone) | accepter pour la remise : la primitive partagée est celle de la course, et la densifier touche `components/nautical` la veille de la remise | si je veux les six traits : option de densité dans le lot course, puis captures des onze panneaux à refaire |
| 13 | `captures/etats-salle-390.jpg` | #220 et #214 | sous 640 px, #220 dessine une petite marque sous l'étiquette, #214 n'en dessine aucune | un seul comportement : celui de #220 (la propriété `waves`), que #214 reprend après la fusion de #220 | petite reprise dans `room-view.tsx`, lot salle d'attente |
| 14 | Plan : un lot nomme un changement hors de ses fichiers au lieu de le faire | #220 | `state-panel.tsx`, `error-state.tsx` et `not-found-panel.tsx` modifiés (propriété `waves`, désactivée par défaut); la page 404 et l'erreur générale reçoivent aussi les marques | accepter : le changement est optionnel, déclaré et sans effet par défaut | sinon, #220 retire ces trois fichiers et sept panneaux perdent leurs marques |
| 15 | `.github/workflows/ci.yml`, limite de 25 min | exécutions `44380501100` (coupée) et `44380264989` (24 min 52 s) | la suite combinée dépasse la limite | alléger d'abord les specs C1 (captures seulement en mode preuves, moins d'analyses répétées), puis relever la limite dans une PR à part, avec les revues déploiement et sécurité | sans cela, CI rouge sur `dev` après les fusions, sans test en échec |

La décision 1 (découpe du fanion) n'a plus d'écart dans le code : triangle et rectangle partout, accueil compris. Elle reste à moi.

### Risque pour la coupure de ce soir

| Lot | Risque | Pourquoi |
|---|---|---|
| DA2-8 Réglages (#216) | élevé | aucun correctif poussé, CI PR en échec, à refusionner avec #215; bloque la pile #214 → #216 |
| DA2-7 Résultats (#218) | élevé | brouillon; critère du fanion partiel tant que la décision 3 n'est pas prise |
| DA2-6 Entrée de salle (#220) | moyen | deux majeures de test à corriger, puis CI |
| DA2-2 Course (#212) | faible à moyen | code prêt; il manque ma décision 2 |
| DA2-0, DA2-1, DA2-3/4, DA2-5a, DA2-5b | faible | relus; CI en cours |

## État par lot (relevé du 18 novembre, historique)

L'ordre est celui du [plan](plan.md) : références → primitives → course → accueil → entrée de salle → salle d'attente → bots → réglages → résultats.

| Lot | Branche, PR | SHA proposé | Dépend de | Livré | CI sur ce SHA (push / PR) | Revue indépendante | Verdict |
|---|---|---|---|---|---|---|---|
| DA2-1 Références | `docs/da2-1-references`, #208 | `1838d44` | `dev` | oui | verte / verte | lecture d'architecte @ `1838d44` | prêt à fusionner |
| DA2-0 Primitives | `feat/da2-0-nautical-primitives`, #211 | `b5d2769` | `dev` (partie de `e899596`; fusion sans conflit avec `b98314a`) | oui | verte / verte | code @ `b5d2769` : OK; interface : vue à travers la course | prêt à fusionner |
| DA2-2 Course | `feat/da2-2-race-ships`, #212 | `686d496` | #211 | oui | en cours / en cours (`b40917e`, le dernier commit de code : verte / verte) | code et interface @ `b40917e` : corrections nécessaires | corrections nécessaires |
| DA2-3/4 Accueil | `feat/da2-3-home-route`, #217 | `b755b3a` | #211 | oui | en cours / en cours | code @ `b755b3a` : corrections nécessaires, sans bloquant; interface : OK | prêt à fusionner si la CI est verte et si j'accepte la copie du formulaire du quai (décision 9); textes en étude (décision 5) |
| DA2-6 Entrée de salle | aucune branche poussée, aucune PR | — | #211 | non | — | aucune | non vérifié |
| DA2-5a Salle d'attente | `feat/da2-5a-waiting-room-layout`, #214 | `60046d4` | #211 | oui | verte / en cours | code et interface @ `60046d4` : OK | prêt à fusionner avec #215 et #216, CI verte attendue |
| DA2-5b Bots | `feat/da2-5b-bot-rows`, #215 | `a8f6404` | #214 | oui | en cours / en cours | code et interface @ `a8f6404` : corrections nécessaires; QA fonctionnelle : OK | corrections nécessaires |
| DA2-8 Réglages | `feat/da2-8-settings-form`, #216 | `1c85fac` | #215 | oui | en cours / en cours | code @ `1c85fac` : corrections nécessaires; interface : OK; QA fonctionnelle : OK | corrections nécessaires |
| DA2-7 Résultats | `feat/da2-7-results-pages`, #218 (brouillon) | `860e633` | #211 | oui, en brouillon | en cours / en cours (annulée sur `e4c4649`, remplacé pendant la CI) | code et interface @ `e4c4649` : corrections nécessaires; `860e633` (tests seulement) non relu | corrections nécessaires, et décision 3 |

Les pull requests #210 et #213, étrangères à C1, modifient aussi `docs/EXIGENCES.md` : la dernière fusionnée des trois devra reprendre les sections des autres.

### Dépendances à respecter à la fusion

- #211 d'abord : tous les lots de code en partent.
- #214 → #215 → #216 sont empilées et se fusionnent ensemble, dans cet ordre. #214 seule laisserait la salle d'attente dans le nouvel ordre avec l'ancienne ligne de bot.
- #218 ne contient pas #212. Son code n'en dépend pas, mais son critère « même fanion qu'en course » ne se vérifie qu'avec les deux fusionnées.
- Les sessions ont testé chacune sur la base des primitives, pas sur `dev` combiné. Seule la recette de l'ensemble couvre les interactions entre lots.

## Détail par lot

### DA2-0 Primitives — #211 @ `b5d2769`

- **Critères** : remplis (navire, fanion, côte, compas, marques de vagues, sans couleur écrite hors jetons).
- **Tests rapportés** : contrôles du dépôt et suite de bout en bout, CI verte sur le SHA.
- **Constats mineurs, non bloquants** : le test « n'écrit aucune couleur » de `nautical.test.ts:76` ne lit pas la feuille de style; `Quay` et `SpectatorEye` arrivent un lot plus tôt que prévu; `waveMarkPositions` (`shapes.ts:38`) peut sortir d'une boîte de moins de 14 px de haut.

### DA2-2 Course — #212 @ `686d496`

`686d496` n'ajoute que de la documentation (`docs/evidence/da2-2-race-ships/fanions-comparaison.jpg` et son README) à `b40917e`, le SHA relu.

- **Critères remplis** : disposition (texte en haut, classement à gauche, piste au centre, bonus à droite, « Ta frappe » en bas), voile triangulaire ou carrée selon le type, côte rouge avec « ARRIVÉE », compas immobile, aucune fenêtre modale ajoutée, aucun fichier de règle, de vitesse ou de score modifié.
- **Critères partiels** : « route, navire et fanion d'un même coureur partagent couleur et tracé » — voir la décision 2.
- **Corrections nécessaires (majeures)** :
  1. `e2e/race-track.spec.ts` : le rapport dit qu'aucune assertion n'est retirée; c'est inexact. Le compte des cinq couleurs sur les routes est parti vers les fanions du classement; les assertions des lignes 84 et 189 restent mais lisent un marqueur de 0 × 0 px; les 13 paires couleur × tracé ne sont plus lues sur les routes. Aucun seuil n'est abaissé, mais ces contrôles doivent retrouver une cible réelle.
  2. Les coureurs sans nom affichés en gris contredisent l'invariant du plan : décision 2.
  3. Tablette (640 à 1023 px), `race-track.module.css:179-180` : trois coureurs gardent une route colorée sans nom; visible sur `course-800x1000-*.jpg`.
- **Prédit par le code, sans capture** : sur les pistes basses (1024 × 768, 1280 × 640) et sur tablette, un navire à plus de 92 % environ peut recouvrir « ARRIVÉE » ou « + N autres coureurs ». À vérifier à la recette.
- **Régression** : aucune constatée.

### DA2-3/4 Accueil — #217 @ `b755b3a`

- **Tests rapportés par la session** : suite de bout en bout complète, 261 réussis, sur `e7d865a` (dernier commit de code); une seule action rouge testée; escale 04 sans chiffre; `journey.ts` et `account-journey.spec.ts` intacts. Revues de la session faites sur `fef09be`, plus ancien : auto-vérification.
- **Revue de code indépendante @ `b755b3a`** : corrections nécessaires, sans constat bloquant. Confirmé à la lecture : périmètre respecté, aucune couleur écrite, une seule action rouge (`design.spec.ts:109, 191, 238`), scènes hors de l'arbre d'accessibilité et sans animation, aucune assertion retirée ni affaiblie dans `e2e/design.spec.ts` (le contrôle de la première vue passe d'une à trois tailles d'écran).
- **Majeure** : `_home/quay-join-form.tsx:29-73` est une copie à la main de `components/rooms/join-code-form.tsx`, qui appartient au lot entrée de salle. Le comportement est identique aujourd'hui (même action serveur, même validation, même limite de débit), mais une correction d'un côté n'atteindra pas l'autre et aucun test ne les compare. Voir la décision 9.
- **Mineurs** : `home.module.css:5-9` restyle la coque partagée par `main:has(> .route)` (sans effet sur les autres pages; la solution durable est une option pleine largeur de `components/site-shell.tsx`, fichier sans propriétaire); le journal de bord de l'escale dessine ses propres fanions, dont une queue d'aronde que `pennant.tsx` ne connaît pas (`escale-scenes.tsx:301-305`, liée à la décision 1); les anneaux du meneur et du mien sont redessinés à la main au lieu des propriétés de `Ship`; sous 1024 px, une scène de 300 px précède le titre et le champ de code, sans test à ces largeurs; chaîne `home.visibilityHeading` devenue inutile.
- **Revue d'interface indépendante @ `b755b3a`** : OK, sans constat majeur. Confirmé sur les captures : première vue à 1440 et à 1280 × 640 avec le champ de code et les deux actions, une seule action rouge, aucun chiffre inventé (escale 04 comprise), côte rouge sans halo, rien ne bouge, refus du quai dit par un signe et un texte. Aucune exigence manquante; pas de captures « avant » dans le dossier, donc pas de comparaison de régression.
- **Mineurs d'interface** : `home-route.ts:41`, le « ? » de « l'ancre ? » passe seul à la ligne à 360 px (espace fine insécable à mettre); `h-14` n'a pas d'effet sur des styles qui portent déjà `h-[52px]`, d'où des boutons secondaires de 52 px à côté d'un champ de 56 px; la capture « couleurs forcées » n'impose pas de palette système et ne prouve que les règles `forced-colors`; en Aube, la mer passe derrière le titre sans le fondu de la maquette (contraste intact).
- **Téléphone** : à 390 et 360 px, la mer précède le titre et ni le champ de code ni les deux actions ne tiennent dans une première vue de 844 px. La maquette approuvée `accueil-390` dessine le même ordre, et le critère du plan ne nomme que 1440 × 800 et 1366 × 700 : ce n'est pas un critère manqué. Voir la décision 10.

### DA2-6 Entrée de salle — rien de livré

Aucune branche et aucune pull request ne sont visibles. Cela ne dit pas que rien n'est fait : je ne vois pas le travail local de la session. Tant que rien n'est poussé, créer, rejoindre, salles publiques et les états de salle restent ceux de la version précédente, qui fonctionnent. **Lot à risque pour la coupure du 19 novembre au soir.**

### DA2-5a Salle d'attente — #214 @ `60046d4`

- **Critères** : remplis (ordre de la deuxième disposition, « Lancer la course » seule action rouge, équipage en deux groupes, compteur des spectateurs, quai décoratif hors de l'arbre d'accessibilité).
- **Comparaison** `dix-bots-fr-abysse-1440` contre `salle-attente-dix-bots-1440` : fidèle.
- **Mineurs** : la note de départ est maintenant lue par les non-hôtes (dessinée dans la maquette approuvée `salle-attente-non-hote-1440`, gardée); `ROOM_MAX_SPECTATORS = 20` recopie pour l'affichage une limite écrite en dur dans `packages/domain/src/rooms/room-admission.ts:47`.

### DA2-5b Bots — #215 @ `a8f6404`

- **Critères remplis** : édition sur demande, « Changer le niveau » seul enregistrement, « Annuler », « Non enregistré » dit par un signe et un mot, brouillons gardés quand un joueur entre.
- **Corrections nécessaires (majeures)** :
  1. `room-bots-panel.tsx:44,81` et `room-bot-row.tsx:42` : la cible d'enregistrement n'est jamais remise à zéro; une ligne peut se refermer sur l'enregistrement d'une autre.
  2. `room-bot-row.tsx:106-109` : après un refus d'enregistrement, le focus n'est placé nulle part.
  3. `e2e/room-bots.spec.ts` : huit assertions remplacées (lignes 84, 86, 87, 94-96, 124-125) alors que le rapport dit « aucune retirée ». Aucun seuil abaissé; le rapport doit le dire tel quel.
- **Décision fonctionnelle** : voir la décision 7.
- **Chemins non testés** : refus de « Retirer », retrait pendant que des brouillons sont ouverts, limite de débit sur une ligne.

### DA2-8 Réglages — #216 @ `1c85fac`

- **Critères remplis** : panneau avant les bots, quatre groupes, modification en attente marquée près du champ, erreurs près du champ, bornes de validation identiques à l'ancien `validDraft`, aucun fichier serveur ou domaine modifié, specs `room-settings`, `arcade-settings` et `text-settings` intactes.
- **Corrections nécessaires (majeures)** :
  1. `room-settings-panel.tsx:157-162,365,373` : aucun focus géré après les refus qui demandent un rechargement (révision périmée, indisponible, plus hôte, salle plus en attente).
  2. `e2e/da2-settings-form.spec.ts:258-264` : la boucle de limite de débit attend n'importe quel statut; test fragile.
- **Mineurs** : champs désactivés d'apparence active; « 060 » compté comme une modification; « Duration » contre « Time limit (seconds) » en anglais.
- **Décisions** : 6 et 8.

### DA2-7 Résultats — #218 (brouillon) @ `860e633`

`860e633` ne modifie que `e2e/da2-results.spec.ts`, après les revues indépendantes faites sur `e4c4649` : il n'est pas relu.

- **Tests rapportés par la session** : suite de bout en bout, 256 réussis, 3 ignorés (les captures, hors `DA2_CAPTURES`). Revues de la session sur `a591aad`; les correctifs `36e386b`, `7ad78e1` et `e4c4649` sont postérieurs : auto-vérification, sur un SHA dépassé.
- **Revue de code indépendante @ `e4c4649`** : corrections nécessaires, aucun défaut de code bloquant. Confirmé à la lecture : périmètre respecté, `track-layout.ts` non modifié, une seule table de couleurs (`result-routes.ts:25` appelle `routeStyles`), textes, colonnes, actions et états inchangés, compatible avec `track-layout.ts` de #212 (mêmes signatures; non compilé ensemble).
- **Critère partiel (majeure)** : « chaque coureur porte le même fanion qu'en course ». Seul mon fanion porte sa couleur de piste; ceux des autres ont la bonne forme mais restent neutres (`ecume`, tracé plein). `EntrantResultView` (`packages/database/src/races/results.ts:37-49`) ne porte pas l'identifiant de course dont dépend la couleur. Aucune fausse couleur n'est jamais affichée. La correction tient en un fichier, hors du lot : projeter `raceEntrants.id` dans la vue, sans requête ni migration nouvelles; elle touche le partage des résultats et demande les revues dba et sécurité. Voir le point partagé 1 et la décision 3.
- **Majeure** : `result-routes.test.ts:57-82` — les deux premiers tests injectent un identifiant que la production ne fournit jamais et portent un titre qui se lit comme une preuve du critère. À renommer (« quand la vue porte l'identifiant ») ou à retirer avec la branche de code correspondante.
- **Mineurs** : un fanion neutre garde un trait de sillage plein, et `ecume` est proche d'`embrun`, que porte le troisième coureur sur la piste; `e2e/da2-results-captures.spec.ts:13` est le premier fichier ignoré de `apps/web/e2e` (à sortir du dossier de tests ou à déclarer dans le rapport); `da2-results.spec.ts:291-302` renomme la table `race_results` pour simuler une panne, sans garde de restauration en tête de fichier; deux styles de titre de panneau restent (`race-charts.tsx:13`); « Tes statistiques » passe à 24 / 30 px.
- **Revue d'interface indépendante @ `e4c4649`** : corrections nécessaires, pour le même critère du fanion. Confirmé sur les captures : aucun texte, colonne, action ni état changé; « Prochaine manche » seule action rouge; côte à plat sans halo; marques de vagues limitées au bandeau du titre; type de coureur dit par la forme et par le mot « Bot ». Aucune régression vue sur la paire avant / après ouverte (`room-results-host-fr-abysse-1440`).
- **Mineurs d'interface** : dans la légende du graphique, le trait sous le fanion des autres coureurs est blanc et plein alors que leurs courbes sont orange ou grises et tiretées (décision 4); scène d'arrivée plus petite et moins colorée que la maquette (amélioration facultative); la salle des preuves n'a que trois coureurs, donc aucune capture ne montre deux fanions d'autres coureurs.

## Points partagés entre lots

Un seul propriétaire par fichier, comme dans le plan.

| Point | Propriétaire | Classement | Suite |
|---|---|---|---|
| 1. Fanions entre course et résultats | calcul : lot course (`track-layout.ts`, `routeStyles`); affichage : lot résultats (`result-routes.ts`); la donnée manquante est dans `packages/database`, à personne | **exigence manquante** du lot résultats pour la couleur des autres coureurs; forme et tracé corrects | décision 3 |
| 2. Quatre panneaux d'état de `room-view.tsx` (expulsé, salle fermée, non-membre, session terminée) | lot salle d'attente, seul à modifier `room-view.tsx`; le lot entrée de salle habille les panneaux hors de ce fichier | textes et actions inchangés : aucune exigence manquante; les marques de vagues y seraient une **amélioration facultative** | rien avant la remise, sauf si le lot salle d'attente a du temps après ses corrections |
| 3. Bouton « Lancer la course » sur toute la largeur à 390 px | `start-race-button.tsx`, sans propriétaire | **adaptation responsive justifiée** (cible large, action principale) | gardé |
| 4. Quai sans route pointillée ni compas | lot salle d'attente | **amélioration facultative** | pas de travail |
| 5. Trois coques sans compte sous 1024 px | lot salle d'attente | **adaptation responsive justifiée** : le compte reste écrit dans l'équipage | gardé |
| 6. `[.EN DIRECT]` au lieu de la pastille dessinée | lot salle d'attente | **amélioration facultative** : c'est le composant existant | gardé |
| 7. Insigne de bot de 48 px | `bot-insignia.tsx`, sans propriétaire | **amélioration facultative** | pas de travail |
| 8. Limite de 20 spectateurs recopiée pour l'affichage | `packages/domain`, sans propriétaire | dette technique, ni écart artistique ni régression | carte séparée après la remise |
| 9. Mot-symbole invisible en couleurs forcées | `components/site-shell.tsx`, sans propriétaire | existait avant C1 : pas une régression de C1 | à vérifier à la recette |

## Décisions encore en étude

La présence d'un choix dans le code ne vaut pas mon approbation. Les lots continuent sur tout ce qui ne dépend pas de ces décisions.

| # | Référence | Capture réelle | Différence | Recommandation | Conséquence |
|---|---|---|---|---|---|
| 1 | Découpe du fanion : `captures/vocabulaire-pavillons.jpg`, `captures/course-1440.jpg` | `docs/evidence/da2-2-race-ships/fanions-comparaison.jpg` (#212) | la planche dessine une queue d'aronde pour les routes en tirets; l'application garde triangle (humain) ou rectangle (bot) et reprend le tracé par un trait sous le fanion | garder la version intégrée : la queue d'aronde se confond avec le rectangle d'un bot à 24 × 16 px | si je préfère la planche : `pennant.tsx` à reprendre dans le lot course, puis captures de la course, de la salle et des résultats à refaire. Si je garde triangle et rectangle : l'escale 04 de l'accueil, qui dessine encore une queue d'aronde (`escale-scenes.tsx:304`), s'aligne |
| 2 | Plan, DA2-2 : route, navire et fanion d'un coureur partagent couleur et tracé | `docs/evidence/da2-2-race-ships/course-*` (#212 @ `b40917e`) | les coureurs sans nom affiché sur la piste sont gris; leur fanion au classement reste coloré | à trancher : soit le gris est voulu et le plan est amendé (avec la tablette, où trois routes restent colorées sans nom), soit la couleur revient | le message de commit dit que c'est ma demande; je dois le confirmer avant d'amender le plan |
| 3 | `captures/resultats-1440.jpg` : fanions colorés pour tous | `docs/evidence/da2-7-results-pages/after/room-results-host-fr-abysse-1440.jpg` (#218) | fanions neutres pour les autres coureurs | pour la remise, garder les fanions neutres : ils n'affichent jamais une fausse couleur. Exposer l'identité de course dans la vue des résultats touche `packages/database`, hors des lots, la veille de la coupure | le critère DA2-7 reste partiel et est noté tel quel; la correction complète devient une carte après la remise |
| 4 | `captures/fiche-course-1440.jpg` : légende du graphique | captures de #218 | le fanion de la légende n'est pas la clé de couleur de sa courbe | suit la décision 3 | idem |
| 5 | `captures/accueil-*.jpg` | `docs/evidence/da2-3-home-route/` (#217) | sept écarts de texte ou de dessin signalés par la session : bouton du quai « Embarquer avec ce code »; nom accessible du champ du quai; escale 01 en liste de description; escale 02 sans jalons; escale 04 en lignes simples; petits navires avec drapeau; marges de 48 px à 1024 et disposition non dessinée de 768 à 1023 px. Anglais proposé : « Route chart », « Port of call 01 », « Departure », « Ready to cast off? », « Board with this code » | à lire sur les captures avant la fusion; les textes sont les miens à choisir | un texte refusé se corrige dans `i18n/home-route.ts` sans toucher au reste |
| 6 | Plan, DA2-8 : liste des chaînes | #216 | chaîne ajoutée hors liste : `durationInvalid` (erreur près du champ de durée) | l'accepter : elle sert le critère « l'erreur est près du champ » | amender la liste du plan |
| 7 | Règle existante, testée à `room-bots.spec.ts:251` | #215 | un changement de niveau reçu en direct remplace le brouillon ouvert de la ligne | garder la règle existante pour la remise : la changer modifierait un comportement, hors mandat | si je préfère garder le brouillon : changement fonctionnel, à étiqueter à part |
| 8 | Comportement d'avant | #216, `room-settings-panel.tsx:105` | le refus du serveur sur le texte disparaît dès que le brouillon change, quel que soit le champ | n'effacer le refus que lorsque le champ concerné change | petite correction dans le lot réglages |
| 9 | `components/rooms/join-code-form.tsx` | #217, `_home/quay-join-form.tsx` | le formulaire du quai est une copie du formulaire de code | l'accepter pour la remise; après la fusion du lot entrée de salle, donner trois propriétés à `JoinCodeForm` et supprimer la copie | suivi nommé après la remise; aucun effet visible aujourd'hui |
| 10 | `captures/accueil-390.jpg` | `docs/evidence/da2-3-home-route/accueil-390.jpg`, `accueil-360.jpg` (#217) | sur téléphone, la première vue s'ouvre sur la mer; le champ de code et les deux actions sont sous la ligne de flottaison, comme dans la maquette | garder pour la remise : c'est la maquette approuvée, et le plan ne fixe la première vue que sur ordinateur | si je veux les actions dans la première vue du téléphone : la scène passe sous le titre, dans le lot accueil |
| 11 | [guide d'intégration](guide-integration.md) : marques de vagues « jamais derrière un texte à lire » | `docs/evidence/da2-3-home-route/accueil-1440.jpg` (#217) | les marques et le numéro en contour passent derrière le texte des escales, comme dans la maquette `accueil-1440`; le guide et sa maquette se contredisent | suivre la maquette (état actuel) et préciser le guide : la règle vaut pour les marques posées par l'application sur ses panneaux de données | une ligne à corriger dans le guide |

Les décisions 1 à 5, 10 et 11 sont artistiques; 6 à 9 touchent le comportement, le plan ou le code.

## Coupure du 19 novembre au soir

| Lot | Risque | Pourquoi |
|---|---|---|
| DA2-6 Entrée de salle | élevé | rien de livré, donc rien de relu |
| DA2-7 Résultats | élevé | brouillon, critère du fanion partiel, correctifs non relus |
| DA2-5b Bots, DA2-8 Réglages | moyen | temps réel; majeures à corriger puis à relire; empilés avec #214 |
| DA2-2 Course | moyen | trois majeures, dont une attend ma décision |
| DA2-3/4 Accueil | faible | relu sans majeure d'interface; il reste mes décisions de texte et la copie du formulaire du quai |
| DA2-0, DA2-1, DA2-5a | faible | relus, sans correction en attente |

Un lot qui n'est pas prêt reste hors de la remise : son écran garde la version précédente, qui a sa recette. Je ne réduis aucun contrôle pour le faire entrer.

## Ce qui n'est pas vérifié

- Aucune exécution locale de ma part sur ces branches : ni tests, ni navigateur. Les revues indépendantes sont statiques.
- L'état combiné des lots : aucun test, aucune capture.
- Lecteur d'écran, zoom 200 % et couleurs forcées sur l'application : seulement ce que les sessions rapportent.
- Les correctifs que les sessions pousseront après ce relevé : à relire sur leurs nouveaux SHA.
