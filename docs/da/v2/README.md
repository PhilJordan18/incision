# Direction artistique, deuxième itération : C1 « Cap »

Ce dossier complète [`apps/design/`](../../../apps/design/README.md), qui reste ma direction artistique d'origine (6 octobre 2026) et n'est pas modifié. Il archive les maquettes de la deuxième itération que j'ai approuvées le 17 novembre 2026, pour que l'intégration ne dépende pas de fichiers temporaires.

`apps/design/tokens.css` reste la seule source des couleurs, des typographies et des rayons. Mon nom de site et mon logo ne changent pas; les maquettes lisent les fichiers de `apps/design/logo/` sans les copier. Aucune image n'est générée : tout est dessiné en HTML, CSS et SVG avec les jetons.

## Qui a fait quoi

**Ce que j'ai fourni.**

- Le mandat de cette itération et ses contraintes : mêmes fonctions et mêmes parcours, interface en français et en anglais, zone de frappe calme, accessibilité, `apps/design/` intact.
- Les choix : la direction C « Pavillon » parmi trois, puis sa variante calme C1 « Cap »; la côte rouge à la place de la brume rouge; l'accueil long sans les trois cartes de visibilité; « Ta frappe » sur toute la largeur.
- Les décisions du 17 novembre : une seule action rouge par écran, un journal de bord sans chiffres inventés, « Fermer la salle » sous « Lancer la course », l'édition d'un bot sur demande avec enregistrement et annulation explicites, le compteur de spectateurs.
- Des captures de mon application et des images de cartes marines que j'ai montrées pendant la conception. Elles appartiennent à leurs auteurs et ne sont pas reproduites ici.

**Ce que l'agent a proposé, et que j'ai approuvé.**

- Toutes les maquettes de `maquettes/` et leurs captures : les navires, les fanions, la côte, le compas, les scènes des escales, la disposition de la salle d'attente.
- Le [plan d'intégration](plan.md), le [guide d'intégration](guide-integration.md), la [couverture](couverture.md) et le texte proposé pour [D-15](adaptations-d15.md).

Ce dossier ne contient ni croquis, ni recherche, ni retour d'utilisateur. Ma démarche créative d'origine reste décrite dans [DEMARCHE-CREATIVE.md](../../DEMARCHE-CREATIVE.md).

## Ce qui est approuvé

Approuvé le 17 novembre 2026, d'après la version 15 des maquettes :

| Écran | Maquettes |
|---|---|
| Accueil long (carte de route, quatre escales, quai) | `accueil-1440`, `accueil-1024`, `accueil-390`, `accueil-1440-aube` |
| Course (navires, fanions, côte rouge, compas) | `course-1440`, `course-1024`, `course-390`, `course-1440-aube`, `vocabulaire-pavillons` |
| Créer une salle | `creer-salle-1440`, `creer-salle-390` |
| Rejoindre une salle | `rejoindre-1440` |
| Salles publiques | `salles-publiques-1440`, `salles-publiques-390` |
| Salle d'attente, deuxième disposition | `salle-attente-sans-bot-1440`, `-deux-bots-1440`, `-dix-bots-1440`, `-dix-bots-1024`, `-dix-bots-390`, `-dix-bots-1440-aube`, `-dix-bots-1440-en`, `-complete-1440`, `-non-hote-1440` |
| Résultats et journal des bonus | `resultats-1440`, `resultats-390` |
| Fiche de course | `fiche-course-1440` |
| Historique | `historique-1440` |
| Compte et statistiques | `compte-1440`, `compte-390` |
| États, refus et erreurs des salles | `etats-salle-1440`, `etats-salle-390` |

Chaque nom désigne `maquettes/<nom>.html` et `captures/<nom>.jpg`.

Demandé le même jour, sans maquette : le formulaire d'édition des réglages de la course, regroupé et placé avant la liste des bots, et la version Aube de toutes ces pages. Leur description est dans le [plan](plan.md); leurs captures viendront de l'application.

Inchangés : connexion, erreur d'authentification, entrée d'invité, invitation, décompte, en-tête et pied de page.

## Limites des maquettes

- Ce sont des dessins statiques. Les contrôles faits dessus ([couverture](couverture.md)) ne valent pas pour l'application : chaque écran est vérifié de nouveau une fois intégré.
- Dans l'en-tête des maquettes, les liens FR / EN sont dessinés à 22 px de haut. C'est un raccourci de dessin : l'application garde son en-tête et ses cibles de 44 px.
- La planche `vocabulaire-pavillons` montre trois découpes de fanion (triangle, queue d'aronde, rectangle). À l'intégration, le fanion garde la forme du type de coureur (triangle pour un humain, carré pour un bot) et le tracé de sa route est repris par un trait sous le fanion : une queue d'aronde se confondrait avec le rectangle d'un bot. Cet écart à la planche est en étude.
- Les noms, les vitesses et les rangs des maquettes sont des exemples. L'application n'affiche que ses vraies données.
- `maquettes/jetons-lecture.css` est une copie de lecture des jetons pour ouvrir les maquettes hors de l'application. Elle n'est jamais importée par l'application.

## Suivi

Les cartes `DA2-n` sont des repères de travail. Elles se rattachent aux exigences officielles de [EXIGENCES.md](../../EXIGENCES.md) (surtout DES-04) et n'ajoutent aucune exigence au cours. La recette A–G reste la preuve de la version précédente; chaque livraison y ajoute une qualification ciblée de ce qu'elle change.
