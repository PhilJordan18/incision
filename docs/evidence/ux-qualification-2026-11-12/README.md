# Qualification UX — 12 novembre 2026

Base : `e663a2ea93d918163d88e0d82f4f94bdc6441863` (dev distant, merges #199, #198, #200 vérifiés). Mandat actif : cloud uniquement, données synthétiques, livraison autorisée après vérification. Aucun merge, fermeture de carte, déploiement ni accès Mac/recette.

## Dossiers indépendants

| Lot | Branche | Périmètre et preuves |
|---|---|---|
| A / F-05.2 / #59 | `feat/05-2-bot-roster-clarity` | Deux zones bots, niveau futur indépendant, brouillon/enregistré, annonces, cinq insignes originaux. Dossier `ux-bots-2026-11-12` sur cette branche. |
| B+D / F-07.4 / #67 | `feat/07-4-navigation-onboarding` | Accès salle ouverte/historique depuis le compte; guide d’accueil. Dossier `ux-navigation-2026-11-12` sur cette branche. |
| E / F-09.5 / #82 | `feat/09-5-character-layouts` | Quatre repères explicites, comptes exacts, variantes canadiennes distinctes. Préférence persistante de profil/QWERTZ hors tranche. Dossier `ux-layouts-2026-11-12` sur cette branche. |
| C + preuves / F-10 / #88, #36 | `test/10-ux-qualification` | Diagnostic de présence après résultats et réconciliation humaine. Ce dossier. |

Ces branches partent toutes de la même base, sans empilement. La matrice et la recette finale sont modifiées ici seulement. Les implémentations des autres branches ne sont pas incluses dans le SHA de ce dossier. Aucun résultat combiné après merge n’est revendiqué.

## Fermeture après résultats

Le code suit la présence des sockets de la page de salle. La fiche privée `/races/[id]` ne suit pas cette présence. Quitter le dernier onglet de salle déclenche le délai existant de 30 secondes de l’hôte; ensuite un humain connecté peut lui succéder, sinon la salle ferme. Cela diffère d’un départ volontaire confirmé, qui n’attend pas ce délai. Une autre connexion du même hôte ou son retour avant échéance évite cette succession.

`e2e/result-navigation-presence.spec.ts` reproduit deux parcours avec une course réelle humain/bot et des textes fixtures synthétiques : consultation de la fiche puis fermeture sans successeur, ou maintien de la salle avec succession. Le test contrôle aussi l’absence de départ volontaire immédiat et la conservation des deux résultats. Résultats d’exécution consignés dans le rapport de vérification ajouté après la suite.

Ce mécanisme n’établit pas la cause réseau exacte de la fermeture historique EPTAPZ, non journalisée. Aucune durée ni règle de salle n’est changée. Proposition UX séparée à coordonner avec Claude : expliquer près du lien vers la fiche que la présence est liée à la salle et permettre de garder son onglet ouvert; aucun patch du composant de course n’est appliqué ici.

## Témoignages et preuves

Les témoignages du 5 novembre restent détaillés dans EXIGENCES. Philippe a déclaré le 11 novembre les cinq étapes finales du journal acceptées, dont bonus utilisé/inutilisé, reload/historique, ancienne course indisponible, heatmap personnelle et invité anonymisé. Source : mandat actif transmis le 12 novembre. Aucun SHA de séance ni nouvelle capture n’a été fourni. Ce sont des validations humaines déclarées, pas des exécutions de l’agent ni des inspections SQL.

La distinction reste explicite : capture = rendu observé; test automatisé = assertion sur un scénario; requête SQL = état synthétique réellement inspecté; témoignage = déclaration reçue. Une identité masquée ne prouve pas la purge en base. Les réserves de production, corpus, OAuth et de recette non attestée restent distinctes. RES-02/HIST-02 sont réconciliés, sans fermeture de carte.

## Coordination et suivi

Aucune PR ouverte au départ ni nouvelle branche distante identifiable de Claude. Ses composants de course, moteur de frappe, styles de course et rappel d’activité restent réservés. Le lot E extrait uniquement la heatmap de résultats; les chemins exacts figurent dans son diff. Les autres lots évitent le header et la feuille globale. Une future branche Claude non publiée reste une limite de coordination.

Lecture GraphQL du board tentée le 12 novembre : `Forbidden`. Les colonnes Projects ne peuvent donc pas être déclarées mises à jour. Mises à jour des issues et liens de livraison à consigner après création des PR; toutes les cartes restent ouvertes. Parent #82 reste partiel : ce mandat ne livre pas une préférence persistante ni toute sa portée initiale.

La recette humaine restante est limitée aux nouvelles interfaces dans [RECETTE-FINALE](../../RECETTE-FINALE.md). Refonte globale, nouvelle piste/animations, sons, curseur-boussole facultatif et heatmap thermique continue sont reportés. Le curseur nécessiterait une coordination de styles partagés; tous les curseurs natifs restent conservés.
