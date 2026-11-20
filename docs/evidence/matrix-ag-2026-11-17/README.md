# Réconciliation documentaire A–G — 17 novembre 2026

## Mandat et référence

Tranche 1 autorisée par Philippe : rapprocher les preuves existantes et les
fusions, sans rejouer A–G, modifier la recette ou fermer de carte.
Base : `e899596751c93312263babd90d5edfb8c1999276` (merge documentaire #207).
L’API GitHub confirme #207 fusionnée le 17 novembre à 20:48:03 UTC et cette
référence comme tête de dev lors du contrôle. Les six PR applicatives
#204/#205/#201/#203/#202/#206 sont déjà intégrées dans son ascendance.

La [recette humaine](../human-2026-11-17/README.md) reste attachée à son arbre
combiné et aux têtes qu’elle nomme, pas rétroactivement à cette base.
La [réconciliation précédente](../reconciliation-2026-11-17/README.md) conserve
la provenance des résultats automatiques : 2 668 unitaires, 433 SQL,
11 intégration, 251 E2E; 9 PgBouncer ignorés. L’API du run push
[44153734667](https://github.com/PhilJordan18/incision/actions/runs/44153734667)
confirme SUCCESS sur `5619c6e1167c198cf668c11b0fd8bcb092626303`.
Les nombres sont repris de ce rapport, sans nouvelle exécution ni nouvelle
lecture intégrale des journaux dans cette tranche.

## Rapprochement des validations humaines

| Preuve | Exigences concernées | Décision documentaire et limites |
|---|---|---|
| A — accueil, compte, salle/historique | HIST-01/02, SALLE-01; I18N-01 | Historique déjà complet. Navigation reçue; bouton d’état vide intégré ensuite par #205 avec preuves ciblées. A ne valide ni les permissions exhaustives ni tous les états vides. |
| B — bots, niveaux et sauvegarde | CONF-10, BOT-04; CONF-12, BOT-01/02/03/05 | CONF-10/BOT-04 déjà complets. Synchronisation de niveaux acquise; ne pas demander de rejouer B. Pas d’attestation de chaque paramètre de calibration ou de tous les réglages. |
| C — course, frappe et piste | TECH-06, CONF-08, COURSE-04/05; DES-04, COURSE-03/06, PERF-03 | TECH-06 devient complet pour la progression temps réel; CONF-08 et COURSE-04/05 le sont déjà. Les captures ne mesurent ni latence asymétrique, ni charge maximale actuelle, ni synchronisation exacte du décompte. |
| D — bonus et journal, manches de C | BONUS-01/02/03/04, RES-01/02/05, HIST-02, COURSE-09/10 | BONUS-03 et RES-01/05 deviennent complets avec les tests cités dans leurs lignes. Journal déjà complet. Les captures attestent activation/cible et utilisé/inutilisé, pas tous les seuils, calculs sous modification simultanée ou une course active de plus de dix minutes. |
| E — quatre dispositions | RES-03, HIST-02 | RES-03 devient complet : courbes déjà attestées les 5/11 novembre, heatmap et dispositions acceptées, tests de graphèmes cités conservés. Aucun besoin de QWERTZ, préférence de profil ou carte thermique pour ce critère. |
| F — invité | AUTH-02/03, RES-01/02/05 | Parcours et anonymisation d’affichage reçus. Pas une preuve de purge physique, des limites de panne ou de l’intégralité des permissions invitées. |
| G — Safari/Brave, langues, thèmes, clavier/zoom | I18N-01/02/03, A11Y-01/02/03/04, DES-05/06 | Acceptation transversale conservée; I18N-02 et DES-05/06 déjà complets. Pas d’extrapolation à chaque écran/état, au lecteur d’écran, à Firefox ou au futur C1. |

## Changements de statut

| ID | Avant → après | Justification |
|---|---|---|
| TECH-06 | partiel → complet | Socket.IO intégré, tests de canal/intégration et ancienne charge identifiés; C/G apportent l’acceptation de la progression affichée. Production et fluidité maximale restent suivies séparément. |
| BONUS-03 | partiel → complet | Auteur/effet/cible et refus testés; C/D attestent l’annonce et le journal de la Rallonge vers Bot 2. Aucune mesure de performance déduite. |
| RES-01 | partiel → complet | Podium et statuts intégrés/testés; D/F/G confirment les résultats, y compris sans finisseur. |
| RES-03 | partiel → complet | Preuves courbes et erreurs existantes, recette des 5/11 novembre et E; les quatre dispositions ne sont plus une PR en attente. |
| RES-05 | partiel → complet | Invariants atomiques et séries vérifiés par SQL/intégration; relecture résultats/historique attestée. Aucun accès à la base humaine nécessaire ou effectué. |

Les 85 autres statuts sont inchangés. Total : **90 identifiants uniques,
34 complets, 56 partiels, 0 non fait**. Le comptage antérieur de 83 excluait
par erreur les préfixes contenant des chiffres (I18N et A11Y).
Ce décompte de lignes n’est pas un pourcentage de travail restant.

## Réserves conservées, sans nouvelle demande de recette

- Les mentions génériques de recette finale dans les lignes encore partielles
  doivent se lire avec le tableau ci-dessus : elles ne rouvrent pas A–G.
  Une acceptation partielle ne couvre pas tous les sous-cas d’une exigence.
- COURSE-03 : fusion acquise, attente de fusion supprimée; les images de C ne
  prouvent pas seules le décompte/révélation synchronisés. Évaluer les preuves
  techniques existantes avant de demander une éventuelle vérification ciblée.
- Réserves déjà identifiées : course illimitée active >10 min, réentrée après
  ban, quickplay vide, public → code, agrégats et records par mode. Aucun de
  ces contrôles n’a été exécuté dans ce lot documentaire.
- Corpus : fonctionnement de l’import distinct de l’acceptation éditoriale
  et de la mise en production; choix délégués antérieurs conservés.
- Qualification technique : charge actuelle avec invités/Arcade/piste,
  contrôle des autorisations et entrées, budgets SQL, pooler/Neon. Les neuf
  skips de cette CI ne deviennent pas neuf succès par une ancienne campagne.
- Production : HTTPS, OAuth réel, version déployée, Lighthouse et coûts
  actuels ne sont pas prouvés par une recette locale. Aucune action distante
  de production autorisée ou exécutée ici.
- Remise : documents personnels et dépôt final à confirmer par Philippe.
  Aucune réflexion personnelle ni preuve créative inventée.

Les 56 lignes partielles ne sont pas artificiellement ramenées à « 15 réserves » :
un regroupement opérationnel ne remplace pas leurs critères. La suite devra
lever chaque réserve avec une preuve précise, sans refaire A–G.

## C1 et vérification documentaire

C1, les autres écrans approuvés, les réglages et Aube sont un chantier séparé.
L’approbation des maquettes n’est pas une recette de leur implémentation.
Le rappel non modal reste la décision retenue. Aucun fichier de design ou
d’application n’est modifié ici.

Revue architecte manuelle : provenance et portée des preuves distinguées,
statuts non promus par extrapolation à la production, historique conservé.
Contrôles réussis : `git diff --check`, 90 IDs uniques, statuts autorisés,
aucun lien Markdown local manquant dans les quatre documents touchés et
liste des fichiers modifiés limitée à la documentation. Aucun build requis
pour ce lot exclusivement documentaire (CONTRIBUTING).
Publication en attente de « deliver »; aucune carte fermée.
