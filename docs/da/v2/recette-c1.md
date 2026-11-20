# Recette de l'ensemble C1

Cette recette qualifie ce que la deuxième itération change : l'habillage, l'ordre de la salle d'attente, la ligne d'un bot et le formulaire des réglages. Elle ne rejoue pas la recette A–G, qui reste la preuve de la version précédente. Une CI verte par branche ne la remplace pas.

Elle se joue deux fois :

1. **Avant les fusions**, sur une branche locale qui fusionne toutes les pull requests C1 dans l'ordre du plan. Je la joue moi-même pour décider des fusions. La branche n'est jamais poussée.
2. **Après les fusions**, sur `dev`, pour confirmer que l'état fusionné est celui que j'ai testé : mêmes SHA, même suite de bout en bout.

## Avant de commencer

- Noter le SHA testé et la liste des pull requests qu'il contient. Un lot absent n'est pas testé : son écran reste celui de la version précédente, et la section correspondante est marquée « hors recette ».
- Base PostgreSQL locale et jetable (le serveur `db-test` de Docker Compose), migrée puis remplie des comptes de démonstration. Build de production, secrets générés pour la séance, connexion GitHub et Discord désactivée (identifiants factices) : la connexion se fait avec les comptes de démonstration.
- Deux navigateurs (ou une fenêtre privée) : `demo-alice` en hôte, `demo-bruno` en second joueur; un troisième onglet en invité spectateur pour l'étape 3.
- Aucune donnée de production, aucune ressource distante.

## Formats à couvrir

Chaque étape se regarde d'abord en 1440, Abysse, français. Les autres formats se contrôlent sur les écrans indiqués.

| Format | Où |
|---|---|
| 1440 × 900, Abysse, français | toutes les étapes |
| 1440 × 900, Aube, anglais | toutes les étapes |
| 1024 × 768 | accueil, salle d'attente, course, résultats |
| 390 × 844 | toutes les étapes, sans défilement horizontal |
| 1280 × 640 (écran bas) | accueil (première vue), salle d'attente (code et « Lancer la course » visibles), course |
| 800 × 1000 (tablette) | course : piste horizontale |
| Clavier seul | parcours complet, sans souris |

Zoom 200 %, couleurs forcées et lecteur d'écran sont couverts par les preuves des lots; je les rejoue si le temps le permet, sinon ils restent non vérifiés par moi.

## Parcours

Pour chaque étape : comparer avec la maquette (`captures/`), puis cocher. Une différence se classe avec la grille de [bilan-c1.md](bilan-c1.md) : exigence manquante, régression, adaptation justifiée ou amélioration facultative.

### 1. Accueil

Référence : `accueil-1440`, `accueil-1024`, `accueil-390`, `accueil-1440-aube`.

- [ ] La première vue contient le champ de code et « Créer une salle »; la page défile : carte de route, quatre escales, quai.
- [ ] Une seule action rouge; le bouton du quai est « Embarquer avec ce code » (écart approuvé le 20 novembre).
- [ ] Aucun chiffre inventé; la côte rouge, aucun halo.
- [ ] Rien ne bouge sans action.
- [ ] Code invalide au quai : le refus est dit par un texte, pas seulement par une couleur.

### 2. Créer, rejoindre, salles publiques, états

Référence : `creer-salle-*`, `rejoindre-1440`, `salles-publiques-*`, `etats-salle-*`.

- [ ] Créer une salle dans chacune des trois visibilités; la carte des trois accès accompagne le formulaire sans le remplacer.
- [ ] Rejoindre par code depuis le second navigateur; code inconnu, salle pleine : chaque refus garde son texte et son signe.
- [ ] Après un refus d'entrée, « Je participe à la course » garde l'état choisi, et l'entrée suivante respecte ce choix (point relevé en revue, non vérifié).
- [ ] Salles publiques : liste en direct, partie rapide; la flotte décorative n'apparaît qu'à côté de la carte, dès 1024 px.
- [ ] États de salle : fermée, introuvable, course en cours, trop de tentatives : mêmes textes et mêmes actions qu'avant, marques de vagues dans le coin.

### 3. Salle d'attente

Référence : `salle-attente-*`.

- [ ] Ordre, au clavier comme à l'écran : code et « Lancer la course », « Fermer la salle » seul dessous; réglages de la course; visibilité, capacité, invitations; équipage et bots; modération.
- [ ] « Lancer la course » est la seule action rouge. « Fermer la salle » demande toujours sa confirmation.
- [ ] La note de départ n'est lue que par l'hôte, comme avant (décision du 20 novembre).
- [ ] Équipage en deux groupes, participants et spectateurs; compteur des spectateurs sur 20; le compteur du haut reste participants + bots sur la capacité.
- [ ] Salle à 0, 2 et 10 bots; salle pleine : le refus s'affiche après la tentative d'ajout, comme avant.
- [ ] Non-hôte (participant, puis spectateur) : aucun contrôle d'hôte; les changements de l'hôte arrivent en direct.
- [ ] Le quai est décoratif, sans mot rogné à aucune largeur; sous 1024 px il montre trois coques sans compte (accepté le 20 novembre).

### 4. Réglages et bots

Pas de maquette pour le formulaire : la description est dans le [plan](plan.md), carte DA2-8.

Bots :
- [ ] « Modifier » ouvre le niveau et y place le focus; « Changer le niveau » est le seul enregistrement; « Annuler » abandonne et rend le focus.
- [ ] Ouvrir trois lignes, modifier deux niveaux, faire entrer un joueur depuis le second navigateur : aucune ligne ne se referme, aucun brouillon ne se perd.
- [ ] Enregistrer une ligne à côté d'un brouillon : seule la ligne enregistrée se referme.
- [ ] Changer le niveau du même bot depuis un second onglet de l'hôte : le niveau enregistré remplace le brouillon ouvert, comme avant (décision du 20 novembre).
- [ ] « Non enregistré » est dit par un signe et un mot.

Réglages :
- [ ] Le panneau est avant la liste des bots; quatre groupes : Texte, Durée, Mode de frappe, Mode de jeu; tous les champs et indications d'avant sont là.
- [ ] Une modification non enregistrée est marquée près de son champ, avec la valeur enregistrée; le résumé ne change qu'après l'enregistrement.
- [ ] Nombre de mots et durée invalides : l'erreur est près du champ.
- [ ] Refus du serveur (caractères exclus tels qu'aucun mot ne convient) : message près du champ, focus dessus, brouillon gardé.
- [ ] Enregistrer d'autres réglages depuis un second onglet pendant qu'un brouillon est ouvert : message de conflit, brouillon gardé, « Recharger les réglages » prend le focus.
- [ ] Échap ferme le formulaire et abandonne le brouillon, comme avant.
- [ ] Le non-hôte lit le résumé et ne peut rien modifier.

### 5. Course

Référence : `course-*`, `vocabulaire-pavillons`.

- [ ] Texte en haut, classement, piste, bonus, « Ta frappe » en bas : disposition inchangée.
- [ ] Un humain a une voile et un fanion triangulaires, un bot carrés; mon navire garde ses deux anneaux, le meneur son anneau `or`.
- [ ] Voile, route et fanion d'un coureur nommé ont la même couleur et le même tracé; les coureurs non nommés sont des points gris.
- [ ] Chaque navire est sur son point; quand des coques se chevauchent, la mienne est dessinée par-dessus (décision du 20 novembre).
- [ ] Aucun navire ne passe sur « ARRIVÉE »; la côte rouge, aucun halo; le compas est immobile.
- [ ] Rien ne bouge près du texte à taper; le focus reste dans le champ de frappe pendant les mises à jour.
- [ ] Sous 768 px : le conseil « clavier physique » remplace le texte et la frappe; la piste reste.
- [ ] Une course avec bots jusqu'au bout; une course avec un abandon.

### 6. Résultats

Référence : `resultats-*`.

- [ ] Rang, tuiles, podium, tableau, journal des bonus, actions de l'hôte : mêmes textes, mêmes colonnes.
- [ ] Mon fanion a la couleur et le tracé de ma route; les autres ont la bonne forme et une couleur neutre (limite acceptée le 19 novembre).
- [ ] La côte accompagne le rang; aucun halo rouge.
- [ ] « Rejouer » ramène à la salle d'attente avec les mêmes réglages.
- [ ] Un bouton d'envoi en attente garde un libellé lisible et montre un sablier fixe (#222).

### 7. Fiche de course, historique, compte

Référence : `fiche-course-1440`, `historique-1440`, `compte-*`.

- [ ] Fiche : légende du graphique, courbes, tableaux, grille des touches.
- [ ] Historique : tableau, pagination, état vide.
- [ ] Compte : nom avec son enregistrement, photo, déconnexion, tuiles, graphique; état vide avec « Créer une salle ».

## Contrôles transversaux

- [ ] En-tête inchangé : liens FR / EN de 44 px, thème sans flash au chargement.
- [ ] Toutes les nouvelles chaînes existent en français et en anglais; aucune clé affichée brute.
- [ ] Focus visible à chaque arrêt de tabulation.
- [ ] Mon nom de site et mon logo sont identiques à ceux de `apps/design/logo/`.

## Compte rendu

Le compte rendu va dans `docs/evidence/da2-recette-<date>/README.md` : SHA testé, pull requests contenues, commandes et résultats, cases cochées ou non par étape et par format, différences classées, ce qui n'a pas été vérifié et pourquoi. Une case non jouée reste non cochée.
