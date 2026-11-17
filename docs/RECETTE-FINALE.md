# Recette humaine ciblée — journal des bonus

**Recette du journal acceptée par Philippe le 11 novembre**, selon son témoignage transmis dans le mandat actif du 12 novembre. Les cinq étapes ci-dessous sont conservées comme trace du parcours accepté; elles ne sont pas à refaire intégralement. Ce ne sont pas des tests exécutés par l’agent. Aucun SHA de séance ni capture nouvelle n’a été fourni. La base intégrée vérifiée séparément est `e663a2ea93d918163d88e0d82f4f94bdc6441863` (merges #199, #198 et #200).

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
| 1. Recevoir au moins deux bonus en restant derrière le meneur; en activer un avec Entrée, conserver l’autre jusqu’à la fin. | Le journal final affiche le type et le jalon de chacun, utilisé/non utilisé; l’activation indique cible et moment. Si les attributions ne permettent pas ce cas, recommencer une manche, sans modifier les probabilités. | Accepté le 11 novembre — témoignage |
| 2. Noter le journal aux résultats, recharger, puis ouvrir la même course depuis l’historique du compte. | Mêmes attributions, activations et valeurs; aucun doublon ni bonus déduit de la seule progression. | Accepté le 11 novembre — témoignage |
| 3. Ouvrir une course sans collecte du journal (par exemple une des six courses du seed historique). | « Journal indisponible »; aucun faux « Aucun bonus reçu ». Une course récente avec collecte vide affiche bien « Aucun bonus reçu ». | Accepté le 11 novembre — témoignage |
| 4. Participer comme invité à une manche et consulter les résultats du compte. | L’invité est anonymisé par son ordinal `#n`; la cible du bonus ne révèle pas d’identité durable. L’invité n’a pas d’historique personnel persistant; ses résultats de salle sont temporaires. Un compte extérieur n’accède pas à cette page privée. | Accepté le 11 novembre — témoignage |
| 5. Ouvrir les détails du journal au clavier, en FR puis EN, dans Aube et Abysse. | Traductions et nombres cohérents, focus visible, détail lisible; pas de débordement global à 390 px (la course mobile conserve le conseil clavier physique). | Accepté le 11 novembre — témoignage |

Noter pour chaque écart : SHA, langue, thème, étape, résultat attendu et observé.
Une capture éventuelle doit provenir de ces données fictives seulement. Ne pas
publier cookie, clé, URL d’invitation ou données de recette.

## Remise et limites

La qualification automatisée est détaillée dans le
[rapport intégré](evidence/integrated-2026-11-08/README.md). Elle ne remplace pas
le témoignage humain ci-dessus. RES-02/HIST-02 sont réconciliés dans la matrice; les réserves corpus/production restent distinctes. Le masquage d’identité à l’écran ne prouve pas la purge en base. Le témoignage ne détaille pas une inspection SQL ni chaque tentative d’accès refusée; aucune de ces preuves n’est inventée.

Avant la remise scolaire : Philippe doit aussi finaliser sa réflexion personnelle
dans [IA.md](IA.md), sélectionner et mettre en forme le document selon la limite
indicative de 1 à 2 pages du brief, et confirmer les éléments humains restants de
la [matrice](EXIGENCES.md). Aucun texte personnel n’est rédigé à sa place.

Le mandat du 12 novembre autorise, après vérification, le push normal et les PR vers
`dev`. Le merge, toute promotion, les migrations/imports distants et le déploiement
restent des étapes séparées à autoriser. La procédure de retour arrière est dans
[DEPLOYMENT.md](DEPLOYMENT.md); la migration additive du journal doit être conservée
lors d’un retour applicatif compatible, sans backfill fictif.

## Nouvelle recette UX ciblée — à confirmer après intégration

Sans refaire la recette déjà acceptée, avec des données synthétiques seulement :

1. Dans la salle, reconnaître les cinq insignes avec leurs noms/difficultés; choisir le niveau du prochain bot, modifier un bot existant, constater le brouillon puis l’enregistrement et leurs annonces. Vérifier que le choix du prochain bot ne change pas.
2. Depuis **Mon compte**, retrouver la salle encore ouverte puis ouvrir **Mes courses**; distinguer présence dans la salle et consultation d’un résultat conservé. Un invité n’a pas cet historique personnel.
3. Parcourir le guide d’accueil, puis choisir les repères France AZERTY, US QWERTY, français canadien et multilingue standard dans une heatmap personnelle. Les comptes, accents/majuscules et caractères hors repère restent identiques.
4. Vérifier lisibilité/focus au clavier, FR/EN, Aube/Abysse et 390/1024/1440 px sur les pages modifiées. Les annonces réelles au lecteur d’écran et les appareils physiques restent humains.

Le curseur-boussole facultatif n’est pas livré : une éventuelle modification globale doit d’abord être coordonnée avec Claude. Aucun changement de vitesse, règle de bonus ou durée de salle n’est demandé par cette recette.
