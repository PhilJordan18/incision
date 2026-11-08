# Corpus et consolidation des preuves — 6 novembre 2026

Lot 2 : #40/#42/#43, CONF-03/05, D-10/D-21. Branche indépendante
`docs/02-corpus-acceptance`, créée depuis `dev`
`3f7a740a095b82cdfac7630d255bad6a4ad24e01` (#197 fusionnée).
Aucun changement de code, dépendance, passage, classement éditorial ou import.
Le journal des bonus est traité sur une autre branche, sans dépendance à celle-ci.

## Résultat

Le registre et la matrice confondaient l'absence d'une classification scientifique
avec l'absence d'une étude de calibrage. Le [calibrage déjà livré](../f02-4-random-word-data/calibration.md)
établit les critères aléatoires `wf311-1` : longueurs maximales 5/9/16, minima
Zipf 4/3,75/3,5. Il couvre 40 tirages par langue, niveau et longueur (10/50/200 mots).
Cette preuve antérieure n'a pas été recalculée pour ce lot.

Pour les passages, l'accord des seuils ajustés sur M1–M4 avec les étiquettes est
43/55 FR et 40/56 EN sur l'échantillon, mais 35/55 et 33/56 en retrait unitaire.
Le rapport conclut à conserver les étiquettes éditoriales, appuyées par les mesures.
Il ne démontre ni classification scientifique ni difficulté ressentie par les joueurs.
CONF-05 devient complet pour son critère documentaire et mesurable; ce changement
n'est pas une acceptation de données de production. CONF-03 reste partiel.
Les autres exigences parentes ne changent pas de statut.

## Preuves et portée

| Nature | Preuve | Ce qu'elle permet de conclure |
|---|---|---|
| Vérification de ce lot | [integrity.json](integrity.json), comparaison octet par octet avec la base dev et SHA-256 des huit fichiers JSON des quatre versions | Corpus entièrement conservé; 122 entrées, 61 par langue, 55 FR/56 EN retenues, 6 FR/5 EN `spare`; huit cas `editorial.escalated` inchangés. |
| Code déjà livré, relu | `packages/domain/src/text/settings.ts`, `CRITERIA_VERSION` et `COMPLEXITY_CRITERIA` | Valeurs cohérentes avec le rapport #43; pas de nouveau calibrage ni de nouvelles règles. |
| Tests antérieurs | `src/corpus/check.test.ts`, `files.test.ts`, `corpus.db.test.ts`, `race-texts.test.ts`, qualification #197 | Format, intégrité, sélection et import local; les tests ne prononcent pas une acceptation éditoriale. Non réexécutés sur cette branche documentaire. |
| Preuve cloud antérieure | [qualification](../qualification-2026-11-06/README.md), corpus 2026-10-25.4 importé en base synthétique isolée | La phrase historique « aucune course ne les tire encore » n'est plus une description générale du produit. Aucune preuve de production. |
| Déclaration humaine transmise | Mandat du coordinateur dans cette conversation | Sélection déléguée réaffirmée, sans relecture individuelle obligatoire; domaine public sourcé, 12–17 ans, préférence maritime/pirate. |
| Réserve de production | D-21 et registre | Pas d'acceptation nominative inventée pour les exceptions; acceptation de version et autorisation d'import production non attestées. |

Le registre conserve ses réserves : œuvres contenant ailleurs des termes sensibles,
cas remontés, graphies déjà signalées et recouvrement du passage Verne. La cible
« environ 60 » n'est pas transformée en obligation de 60 passages retenus exactement.
Le vocabulaire pirate rude du mode cohérent n'est pas automatiquement supprimé.
L'exclusion des jurons et insultes reste applicable aux mots aléatoires.
Aucune nouvelle exception sensible n'a été découverte par cette revue documentaire;
ce n'est pas une nouvelle vérification intégrale des sources. Une correction future
matérielle du contenu demandera une nouvelle version, sans réécrire les anciennes.

## Témoignages humains conservés

Source : Philippe, recette3881 le 5 novembre, transmission du coordinateur. Ce sont
des déclarations, **pas des tests exécutés dans ce lot**. Aucun accès à cette recette,
au Mac ou aux captures privées.

- Privé refusé par code et invisible liste/Quickplay; invitation Alice admise;
  public visible; invité CODE admis.
- Quickplay choisit Alice + bot (2/3) plutôt que Bruno (1/3); invité rejoint (3/3).
- Réglages synchronisés sans refresh et appliqués; bonus Arcade fonctionnel,
  lisibilité actuelle acceptée fonctionnellement; refonte visuelle reportée.
- Courbes et erreurs privées Bruno 17/Alice 37; invité anonymisé #2; expulsion
  annulée puis confirmée, deux onglets Alice actualisés immédiatement.
- Photos retenues après erreur, frappe libre/obligatoire, durées réelles 30/600 s,
  bornes 29/601 s et inactivité 2 min déjà déclarées validées.

La déclaration générale de validation finale ne prouve pas des parcours non décrits :
réentrée bannie, filtres/public→CODE, Quickplay vide, agrégats détaillés par mode,
ni activité continue en course illimitée au-delà de dix minutes. Les preuves automatiques
existantes restent distinctes. La cause réseau exacte de la fermeture EPTAPZ n'est
pas journalisée; aucune règle de TTL n'en est déduite.

## Remise préparée, sans écriture du board

- #40 : ajouter le lien de cette consolidation, conserver les réserves du registre
  et la décision production séparée; aucune fermeture proposée par l'agent.
- #42 : conserver les listes livrées et les exclusions D-21; aucun jeu de données modifié.
- #43 : rattacher le calibrage existant à CONF-05; distinguer critères mesurables
  documentés et classification scientifique non revendiquée.
- Coordinateur : confirmer seulement les réserves humaines encore non reçues;
  aucune demande de relire chaque passage ni de refaire les parcours inchangés.

Vérifications de ce lot : intégrité des huit JSON, valeurs des critères, références
locales des documents modifiés, 90 IDs officiels préservés, `git diff --check`.
Revue séquentielle par le même agent (documentation/données/confidentialité), sans
revue indépendante revendiquée. Aucun test ignoré ajouté. Suites runtime, navigateur,
SQL et PgBouncer non relancées ici : changement exclusivement documentaire; leurs
résultats du lot bonus sont rapportés séparément et ne sont pas attribués à cette branche.

Restent avant livraison : transmettre le SHA exact au coordinateur, obtenir `deliver`
pour push et PR vers dev, suivre ensuite la CI. Aucune PR ni CI nouvelle à ce stade;
aucun merge, déploiement, import production, activation ou changement de carte.
