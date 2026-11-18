# Adaptations à consigner dans D-15

Texte proposé pour [EXIGENCES.md](../../EXIGENCES.md), choix D-15, et lignes de la matrice concernées. Ce fichier ne modifie pas la matrice : la réconciliation générale se fait dans son propre lot, à partir des preuves de chaque livraison.

Aucune règle de design ou d'accessibilité n'est retirée globalement. Chaque adaptation ci-dessous a une portée précise.

## Texte proposé pour D-15

> **Deuxième itération de la direction artistique (C1 « Cap », 17 novembre 2026).** Mes maquettes approuvées sont dans `docs/da/v2/`; `apps/design/` n'est pas modifié et `tokens.css` reste la seule source des jetons. Adaptations, écran par écran :
>
> - **Piste et classement.** Un coureur nommé est dessiné en navire, avec une voile triangulaire pour un humain et carrée pour un bot; sa voile, sa route et son fanion au classement portent la même couleur et le même tracé (les couleurs choisies le 12 novembre sont conservées). Les coureurs sans nom restent des points. La règle 5 du design est respectée : les couleurs vives restent celles des coureurs.
> - **Arrivée.** La ligne d'arrivée devient une côte : une terre `erreur-fond` bordée d'un trait `ligne`, avec le mot ARRIVÉE. En Aube, où `erreur-fond` est trop pâle pour se lire comme une terre, la côte mêle 20 % de `ligne` à `nuit`; aucune couleur n'est écrite hors des jetons.
> - **Brume Red Line (règle 4).** L'accueil et les résultats n'ont plus de halo rouge : la côte rouge le remplace. Les autres écrans gardent la règle.
> - **Compas.** Un compas sous verre, décoratif et immobile, est posé sur la piste, loin du texte à taper.
> - **Accueil.** La page défile : elle devient une carte de route en quatre escales, qui reprennent les titres et les textes du guide existant, et se termine par un quai de départ. Cela remplace l'adaptation du 7 octobre (« la page tient sur un écran sans défilement »); la première vue contient toujours le champ de code, « Rejoindre la salle » et « Créer une salle ». Les trois cartes de visibilité sont remplacées par l'escale 01, qui présente les trois accès sous forme de liste. Le quai répète le champ de code avec un bouton secondaire : la page garde une seule action rouge. L'escale 04 ne montre aucun chiffre.
> - **Salle d'attente.** Ordre : code et « Lancer la course », avec « Fermer la salle » seul dessous comme auparavant; réglages de la course; visibilité, capacité et invitations; équipage et bots; modération. « Ajouter un bot » est un bloc séparé au-dessus de la liste. Chaque bot tient sur une ligne; son niveau ne se modifie qu'après « Modifier », s'enregistre par « Changer le niveau » et s'abandonne par « Annuler ». Une modification non enregistrée ne se referme jamais seule. L'équipage se lit en deux groupes, participants et spectateurs, avec le nombre de spectateurs sur 20 (D-22). Le quai décoratif montre au plus huit navires.
> - **Réglages de la course.** Le formulaire d'édition regroupe le texte, la durée, le mode de frappe et le mode de jeu, distingue la valeur enregistrée de la modification en attente, et place chaque erreur près de son champ. Les valeurs par défaut (D-19), les règles et les contraintes du corpus (D-10, D-21) ne changent pas.
> - **Créer une salle, rejoindre, salles publiques.** Une carte des trois accès ou une scène décorative accompagne le formulaire; elle disparaît sous 640 px sur la page des salles publiques.
> - **Résultats, fiche de course, historique, compte, états des salles.** Le fanion de chaque coureur accompagne son nom dans le podium, le tableau, le journal des bonus et la légende du graphique. Des marques de vagues décoratives se placent derrière les titres. Aucun texte, colonne, action ou état ne change.
> - **En-tête.** Inchangé; les liens FR / EN gardent leur cible de 44 px (les maquettes les dessinent plus petits par raccourci).
>
> Textes ajoutés à l'interface, en français et en anglais, sans toucher aux clés existantes : « Carte de route », « Escale 01 » à « Escale 04 », « Départ », « Prêt à lever l'ancre ? »; « Modifier », « Annuler », « Participants », « Spectateurs », « n / 20 », « Non enregistré », « +N au mouillage »; les titres des groupes de réglages.

## Lignes de la matrice concernées

Aucun statut ne change du seul fait de ces adaptations. Les lots fournissent leurs preuves pour ces lignes :

| Carte | Écrans | Exigences officielles | Choix |
|---|---|---|---|
| DA2-1 | ce dossier | DES-03, DES-04 | D-15 |
| DA2-0, DA2-2 | navire, fanion, côte; piste et classement | DES-04, COURSE-05, BOT-04, PERF-03, DES-05, DES-06, A11Y-01 | D-15, D-20 |
| DA2-3, DA2-4 | accueil | DES-04, JOIN-01, I18N-01, DES-05, DES-06, A11Y-01, A11Y-02 | D-15 |
| DA2-5 | salle d'attente | DES-04, SALLE-05, CONF-10, CONF-11, BOT-04, COURSE-11, I18N-01, DES-06, A11Y-02, A11Y-04 | D-15, D-22 |
| DA2-8 | réglages de la course | CONF-01 à CONF-09, CONF-12, I18N-01, A11Y-03, A11Y-04 | D-10, D-19, D-21 |
| DA2-6 | créer, rejoindre, salles publiques, états des salles | DES-04, SALLE-01, SALLE-03, JOIN-01, JOIN-02, JOIN-03, I18N-01 | D-15 |
| DA2-7 | résultats, fiche, historique, compte | DES-04, RES-01, RES-02, RES-03, HIST-01, HIST-02, AUTH-05, AUTH-06, COURSE-11 | D-15 |
| toutes | thème Aube | DES-05, A11Y-01 | — |

Les cartes DA2 sont des repères de travail : elles n'ajoutent aucune exigence au cours.
