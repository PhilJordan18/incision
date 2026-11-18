# Recette de l'ensemble C1

Cette recette se joue **une fois les pull requests C1 fusionnées dans `dev`**, sur l'état combiné, en local, avec une base isolée. Une CI verte par branche ne la remplace pas. Elle n'a pas encore été exécutée : ce document la prépare.

Elle ne rejoue pas la recette A–G, qui reste la preuve de la version précédente. Elle qualifie ce que la deuxième itération change : l'habillage, l'ordre de la salle d'attente, la ligne d'un bot et le formulaire des réglages.

## Avant de commencer

- Noter le SHA de `dev` testé et la liste des pull requests C1 qu'il contient. Un lot absent de `dev` n'est pas testé : son écran reste celui de la version précédente, et la section correspondante est marquée « hors recette ».
- `npm ci`, `npm run check:no-js`, `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`, puis la suite de bout en bout complète, sur PostgreSQL local. Noter les résultats, les tests ignorés et tout échec avant de le rejouer.
- Deux navigateurs (ou deux profils) : un hôte connecté et un second joueur; un troisième onglet en invité spectateur pour l'étape 4.
- Aucune donnée de production, aucune ressource distante.

## Formats à couvrir

Chaque étape se regarde dans la colonne « complet »; les autres colonnes se contrôlent sur les écrans indiqués.

| Format | Où |
|---|---|
| 1440 × 900, Abysse, français | complet : toutes les étapes |
| 1440 × 900, Aube, anglais | toutes les étapes |
| 1024 × 768 | accueil, salle d'attente, course, résultats |
| 390 × 844 et 360 × 740 | toutes les étapes, sans défilement horizontal |
| 1280 × 640 (écran bas) | accueil (première vue), salle d'attente (code et « Lancer la course » visibles), course |
| 800 × 1000 (tablette) | course : piste horizontale |
| Zoom 200 % | salle d'attente, formulaire des réglages, course |
| Couleurs forcées | salle d'attente, ligne d'un bot ouverte, course, résultats |
| Clavier seul | parcours complet de l'étape 1 à l'étape 7, sans souris |
| Lecteur d'écran (VoiceOver) | ciblé : ligne d'un bot (« Modifier », « Annuler », « Non enregistré »), formulaire des réglages (erreur près du champ, modifications en attente), classement en course |

## Parcours

Pour chaque étape : comparer avec la capture de référence de `captures/`, puis cocher les contrôles. Une différence se classe avec la grille de [bilan-c1.md](bilan-c1.md) : exigence manquante, régression, adaptation justifiée ou amélioration facultative.

### 1. Accueil

Référence : `accueil-1440`, `accueil-1024`, `accueil-390`, `accueil-1440-aube`.

- [ ] La première vue contient le champ de code, « Rejoindre la salle » et « Créer une salle ».
- [ ] La page défile : carte de route, quatre escales, quai. Les titres et les textes des escales sont ceux du guide existant.
- [ ] Une seule action rouge sur la page; le champ de code du quai a un bouton secondaire.
- [ ] Aucun chiffre inventé (escale 04 comprise). Aucun halo rouge : la côte rouge.
- [ ] Rien ne bouge sans action; mouvement réduit respecté.
- [ ] Code invalide : le refus est dit par un texte, pas seulement par une couleur.

### 2. Créer, rejoindre, salles publiques

Référence : `creer-salle-*`, `rejoindre-1440`, `salles-publiques-*`, `etats-salle-*`.

- [ ] Créer une salle dans chacune des trois visibilités; la carte des trois accès accompagne le formulaire sans le remplacer.
- [ ] Rejoindre par code depuis le second navigateur; code inconnu, salle privée, salle pleine : chaque refus garde son texte et son signe.
- [ ] Salles publiques : liste en direct, filtres, partie rapide; la scène décorative disparaît sous 640 px.
- [ ] États de salle : fermée, expulsé, non-membre, session terminée — mêmes textes et mêmes actions qu'avant.

### 3. Salle d'attente

Référence : `salle-attente-*`.

- [ ] Ordre, au clavier comme à l'écran : code et « Lancer la course », « Fermer la salle » seul dessous; réglages de la course; visibilité, capacité, invitations; équipage et bots; modération.
- [ ] « Lancer la course » est la seule action rouge. « Fermer la salle » demande toujours sa confirmation.
- [ ] Équipage en deux groupes, participants et spectateurs; compteur des spectateurs sur 20; le compteur du haut reste participants + bots sur la capacité.
- [ ] Salle à 0, 2 et 10 bots; salle pleine : le refus s'affiche après la tentative d'ajout, comme avant.
- [ ] Non-hôte (participant, puis spectateur) : aucun contrôle d'hôte; les changements de l'hôte arrivent en direct.
- [ ] Le quai est décoratif, absent de l'arbre d'accessibilité, sans mot rogné à aucune largeur.

### 4. Réglages et bots

Pas de maquette pour le formulaire : la description est dans le [plan](plan.md), carte DA2-8.

Bots :
- [ ] « Modifier » ouvre le niveau et y place le focus; « Changer le niveau » est le seul enregistrement; « Annuler » abandonne et rend le focus.
- [ ] Ouvrir trois lignes, modifier deux niveaux, faire entrer un joueur depuis le second navigateur : aucune ligne ne se referme, aucun brouillon ne se perd.
- [ ] Enregistrer une ligne à côté d'un brouillon : seule la ligne enregistrée se referme.
- [ ] Changer le niveau du même bot depuis un second onglet de l'hôte : le refus s'affiche sur la ligne, le brouillon reste, « Recharger la salle » débloque.
- [ ] Couper le réseau : les éditeurs se désactivent, les brouillons restent, « Annuler » fonctionne.
- [ ] « Non enregistré » est dit par un signe et un mot.

Réglages :
- [ ] Le panneau est avant la liste des bots; quatre groupes : texte, durée, mode de frappe, mode de jeu; tous les champs et indications d'avant sont là.
- [ ] Une modification non enregistrée est marquée près de son champ, avec la valeur enregistrée; le résumé ne change qu'après l'enregistrement.
- [ ] Nombre de mots, durée et caractères invalides : l'erreur est près du champ.
- [ ] Refus du serveur (aucun mot ne convient) : message près du champ, focus dessus, brouillon gardé.
- [ ] Enregistrer d'autres réglages depuis un second onglet pendant qu'un brouillon est ouvert : message de conflit, brouillon gardé, « Recharger les réglages » seul moyen de le remplacer.
- [ ] Le non-hôte lit le résumé synchronisé et ne peut rien modifier; les réglages se verrouillent selon l'état de la salle, comme avant.
- [ ] Valeurs par défaut (D-19), règles et contraintes du corpus (D-10, D-21) inchangées : créer une salle neuve et comparer avec la recette précédente.

### 5. Course

Référence : `course-*`, `vocabulaire-pavillons`.

- [ ] Texte en haut, classement à gauche, piste au centre, bonus à droite, « Ta frappe » en bas, sur toute la largeur.
- [ ] Un humain a une voile triangulaire, un bot une voile carrée; mon navire garde ses deux anneaux, le meneur son anneau `or`.
- [ ] Voile, route et fanion d'un même coureur ont la même couleur et le même tracé, sur la piste et au classement.
- [ ] La côte rouge porte « ARRIVÉE »; aucun halo. Le compas est immobile, loin du texte.
- [ ] Rien ne bouge près du texte à taper; le focus reste dans le champ de frappe pendant les mises à jour.
- [ ] Rappel d'activité, bonus, abandon confirmé : inchangés, aucune nouvelle fenêtre modale.
- [ ] Sous 768 px : le conseil « clavier physique » remplace le texte et la frappe; la piste reste.
- [ ] Une course avec bots jusqu'au bout; une course avec un abandon; vitesses, scores et bonus identiques à la version précédente.

### 6. Résultats

Référence : `resultats-*`.

- [ ] Rang, note de record, tuiles, podium, tableau, journal des bonus, actions de l'hôte : mêmes textes, mêmes colonnes.
- [ ] Chaque coureur porte le même fanion qu'en course (couleur, forme, tracé) dans le podium, le tableau et le journal. Le vérifier sur trois coureurs au moins, dont un bot et moi.
- [ ] La côte accompagne le rang; aucun halo rouge.
- [ ] « Rejouer » ramène à la salle d'attente avec les mêmes réglages.

### 7. Fiche de course, historique, compte

Référence : `fiche-course-1440`, `historique-1440`, `compte-*`.

- [ ] Fiche : fanions dans la légende du graphique, courbes, tableaux, grille des touches, note de confidentialité.
- [ ] Historique : tableau, pagination, état vide et carte d'erreur.
- [ ] Compte : salles, courses, photo, nom avec son enregistrement, déconnexion, tuiles, graphique; état vide avec « Créer une salle ».
- [ ] Les marques de vagues ne passent derrière aucun texte à lire.

## Contrôles transversaux

- [ ] En-tête inchangé : liens FR / EN de 44 px, thème sans flash au chargement, dans les deux sens.
- [ ] Toutes les nouvelles chaînes existent en français et en anglais; aucune clé affichée brute.
- [ ] Focus visible à chaque arrêt de tabulation; cibles d'au moins 44 px.
- [ ] Contraste AA du texte dans les deux thèmes; 3:1 pour les marques qui portent une information.
- [ ] Mon nom de site et mon logo sont identiques à ceux de `apps/design/logo/`.

## Compte rendu

Le compte rendu va dans `docs/evidence/da2-recette-<date>/README.md` : SHA de `dev`, pull requests contenues, commandes et résultats, cases cochées ou non par étape et par format, captures, différences classées, ce qui n'a pas été vérifié et pourquoi. Une case non jouée reste non cochée.
