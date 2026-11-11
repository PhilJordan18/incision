# Recette humaine ciblée — journal des bonus

**À confirmer par Philippe ou le coordinateur.** Cette fiche n’atteste aucune
exécution humaine nouvelle. Elle complète les témoignages du 5 novembre, sans
refaire les parcours déjà acceptés. Référence intégrée : `dev 39fe1249a1ce5b7337976acf4c36614557b305a1`
(PR #199 puis #198 fusionnées le 8 novembre).

## Préparation

Utiliser une copie et une base de démonstration isolées, préparées selon
[SETUP.md](SETUP.md), avec le corpus versionné et les migrations jusqu’à `0020`.
Aucune donnée ni sauvegarde existante à réinitialiser. L’activation du parcours
invité ne concerne que cette copie; aucune activation de recette ou de production.

Prévoir deux comptes fictifs dans deux navigateurs/contextes distincts et un bot.
Pour le contrôle invité, utiliser un troisième contexte éphémère. Choisir Arcade
et un texte suffisamment long pour laisser le meneur franchir plusieurs jalons.
Ne pas imposer un type de bonus : son attribution reste celle du serveur.

## Parcours à consigner

| Étape | Attendu | Résultat humain |
|---|---|---|
| 1. Recevoir au moins deux bonus en restant derrière le meneur; en activer un avec Entrée, conserver l’autre jusqu’à la fin. | Le journal final affiche le type et le jalon de chacun, utilisé/non utilisé; l’activation indique cible et moment. Si les attributions ne permettent pas ce cas, recommencer une manche, sans modifier les probabilités. | À confirmer |
| 2. Noter le journal aux résultats, recharger, puis ouvrir la même course depuis l’historique du compte. | Mêmes attributions, activations et valeurs; aucun doublon ni bonus déduit de la seule progression. | À confirmer |
| 3. Ouvrir une course sans collecte du journal (par exemple une des six courses du seed historique). | « Journal indisponible »; aucun faux « Aucun bonus reçu ». Une course récente avec collecte vide affiche bien « Aucun bonus reçu ». | À confirmer |
| 4. Participer comme invité à une manche et consulter les résultats du compte. | L’invité est anonymisé par son ordinal `#n`; la cible du bonus ne révèle pas d’identité durable. L’invité n’a pas d’historique personnel persistant; ses résultats de salle sont temporaires. Un compte extérieur n’accède pas à cette page privée. | À confirmer |
| 5. Ouvrir les détails du journal au clavier, en FR puis EN, dans Aube et Abysse. | Traductions et nombres cohérents, focus visible, détail lisible; pas de débordement global à 390 px (la course mobile conserve le conseil clavier physique). | À confirmer |

Noter pour chaque écart : SHA, langue, thème, étape, résultat attendu et observé.
Une capture éventuelle doit provenir de ces données fictives seulement. Ne pas
publier cookie, clé, URL d’invitation ou données de recette.

## Remise et limites

La qualification automatisée est détaillée dans le
[rapport intégré](evidence/integrated-2026-11-08/README.md). Elle ne remplace pas
les confirmations ci-dessus. RES-02/HIST-02 restent partiels en attendant cette
recette delta; les réserves corpus/production restent distinctes.

Avant la remise scolaire : Philippe doit aussi finaliser sa réflexion personnelle
dans [IA.md](IA.md), sélectionner et mettre en forme le document selon la limite
indicative de 1 à 2 pages du brief, et confirmer les éléments humains restants de
la [matrice](EXIGENCES.md). Aucun texte personnel n’est rédigé à sa place.

Après le rapport vérifié, « deliver » autorisera seulement le push et la PR vers
`dev`. Le merge, toute promotion, les migrations/imports distants et le déploiement
restent des étapes séparées à autoriser. La procédure de retour arrière est dans
[DEPLOYMENT.md](DEPLOYMENT.md); la migration additive du journal doit être conservée
lors d’un retour applicatif compatible, sans backfill fictif.
