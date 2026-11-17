# Recette humaine consolidée — 11, 16 et 17 novembre 2026

Source : validations explicites de Philippe dans la conversation, accompagnées
de captures. Ce sont des attestations humaines, pas des tests exécutés par l’agent.
Aucune fermeture de carte, fusion ou validation de production n’en découle.

## Référence des cinq PR testées

Recette locale sur `http://localhost:3890`, copie et base synthétique dédiées.
Base : `e663a2ea93d918163d88e0d82f4f94bdc6441863`.
Arbre combiné local : `4a45b2cbd9ab8f2f61c07710d116a7285d6364a1`.
Cet identifiant est un arbre Git, pas un commit de livraison.

| PR | Tête incluse |
|---|---|
| #204 — Bots | `b0468b2126ae8e5bcb2107658960ae7f5207b581` |
| #205 — Navigation et accueil | `704593984846e100c0b0ebdb2e538e4929b6d7b7` |
| #201 — Heatmap | `6a1bfcae037902108c3d2128dd6710bf4ab088da` |
| #202 — Qualification | `54f55cd6e60fe93cef6551b7896523d09e3bab65` |
| #203 — Écran de course | `13f1c380888b6587bffbf83987a9a49410d623ac` |

La recette ne valide pas par anticipation une tête ultérieure, notamment la mise
à jour Next.js ou le futur bouton de création dans « Mes salles ».

## Validations reçues

| Lettre | Date | Périmètre accepté par Philippe | Éléments visibles / limites |
|---|---|---|---|
| A | 16 novembre | Accueil, compte, accès salle et historique | Lien de retour à WU565D puis absence de salle. Amélioration demandée : bouton « Créer une salle » dans l’état vide. |
| B | 16 novembre | Ajout et liste des bots séparés; niveaux enregistrés, modifications en attente et sauvegarde | Captures de l’hôte et d’un autre utilisateur avec mise à jour du niveau. |
| C | 16 novembre | Texte en haut, classement à gauche, piste centrale, bonus à droite et « Ta frappe » en bas; focus et modes de frappe | Erreur encadrée, reprise du focus et trajets colorés visibles. |
| D | 16 novembre | Bonus, journal et rappel d’activité | Philippe réutilise les manches de C. Journal : Rallonge utilisée sur Bot 2 à 14,807 s; deux Brouillards inutilisés. Capture du rappel d’activité. |
| E | 16 novembre | Dispositions France AZERTY, États-Unis QWERTY, Canada français et Canada multilingue | Sept erreurs conservées lors des changements de disposition; `S` majuscule hors référence. Les captures ne prouvent pas tous les cas d’accents. |
| F | 16 novembre | Parcours invité | Safari privé, résultat anonymisé `#2`, absence de vainqueur si personne ne termine. L’anonymisation affichée ne démontre pas à elle seule l’absence de toute donnée durable en base. |
| G | 17 novembre | Contrôles transversaux déclarés corrects sur Safari et Brave | Captures FR, thèmes clair/sombre, zoom et focus clavier. Aucune validation Firefox ou VoiceOver attribuée. |

Les validations globales A–G sont conservées comme déclarations de Philippe;
chaque capture n’est pas présentée comme preuve de tous les sous-cas du parcours.

Le 11 novembre, Philippe avait également confirmé les cinq étapes du journal :
bonus utilisé/inutilisé, cohérence après rechargement/historique, ancienne course
sans faux zéro, parcours invité et présentation. Ces confirmations concernent
la version alors testée, pas une nouvelle exécution sur le correctif actuel.

## Décisions et remarques séparées

- **À corriger dans la tranche autorisée :** ajouter « Créer une salle » à l’état
  vide de « Mes salles », avec traduction EN et parcours existant inchangé.
- **Sécurité :** mise à jour ciblée de Next.js et de sa configuration ESLint;
  contrôles techniques distincts de cette recette humaine.
- **Décision explicite du 17 novembre :** conserver le rappel d’activité actuel,
  non modal, pour la remise. Une modale n’est pas un correctif restant.
- **Salle après départ :** Philippe rappelle le délai de grâce de 30 secondes.
  La disparition du lien ne suffit pas à prouver une anomalie : distinguer
  déconnexion de l’hôte, succession humaine et absence de successeur. Ne pas
  transformer cette observation en demande de changer les durées.
- **Améliorations hors tranche :** refonte pirate globale, harmonisation poussée
  des réglages, curseur-boussole de navigation, ambiance sonore et heatmap
  thermique continue. Les dispositions clavier et les trajets colorés ont déjà
  été acceptés; aucune image générée ni modification du logo n’est demandée.

## Limites avant remise

Conserver les preuves de CI et de qualification avec leurs SHA respectifs.
La validation humaine locale ne remplace ni la qualification de la combinaison
finale corrigée, ni la vérification des deux événements CI après livraison.
OAuth réel, Neon et production ne sont pas validés par ces captures. Les tests
PgBouncer exécutés ou ignorés doivent rester distingués par campagne.
Les contrôles de conservation des données invitées nécessitent leurs preuves
techniques propres : ne pas écrire « aucune donnée durable » à partir de l’UI.

Après les correctifs, une recette ciblée du bouton et un smoke test de course
suffisent pour leur retour humain; ne pas effacer les validations antérieures.
Les données, volumes, anciennes recettes et piles Aegis/HackSorel sont hors
périmètre de modification. Toute fusion reste une action de Philippe.
