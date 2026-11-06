# Journal des bonus — qualification cloud du 6 novembre 2026

Lot 1 : #65/#67, RES-02/HIST-02, D-08. Branche `feat/07-2-bonus-journal`,
indépendante du lot corpus, depuis `dev 3f7a740a095b82cdfac7630d255bad6a4ad24e01`.
Révision d'implémentation et de tests revue :
`30b07213d7bcad512020784495927034693580c1`.
Les [commits d’implémentation](commits.txt) sont consignés séparément.
Le commit de ce dossier ajoute des preuves et une précision documentaire sur le verrou SQL; le SHA final est communiqué
avec le rapport de remise. Aucun push, PR, CI distante, merge ou déploiement.

## Comportement livré

Chaque participant a un journal dans les résultats et l'historique : type, jalon,
utilisé/non utilisé; cible et moment pour les activations. Les seules sources sont
`awards.grants` et les reçus `consumed` du coordinateur serveur. Le moment correspond
aux millisecondes depuis le départ commun, pauses comprises, affichées en secondes
localisées. Aucun événement n'est déduit des pourcentages, du client ou d'un score.

La migration additive générée `0020_lowly_veda.sql` ajoute une colonne JSON nullable.
Le journal borné à trois bonus est figé avant finalisation, validé et écrit dans la
transaction existante des résultats. Retry idempotent, rollback global sur erreur,
aucun SQL par frappe/activation. NULL reste « collecte indisponible » pour les anciennes
courses; un tableau collecté vide signifie « aucun bonus ». Aucun backfill.

Les lecteurs privés existants sont conservés. Les cibles sont des ordinaux de course,
sans cookie, compte, session ni nom d'invité dans le journal. Les invités d'une course
avec compte restent anonymisés; les résultats d'une course sans compte, journal inclus,
restent uniquement en mémoire temporaire. Le journal n'est jamais un inventaire public
pendant la course. Aucun changement d'effet, probabilité, classement, piste ou durée.

Les journaux texte sont normalisés (retours chariot de terminal et espaces de fin
supprimés), sans changement des messages ni des résultats.

## Commandes et preuves

Les commandes ont tourné exclusivement sur PostgreSQL 17 local au conteneur cloud,
avec bases synthétiques isolées. Aucun accès recette3880/3881, Mac, Azure, Neon, OAuth
réel, sauvegarde réelle ou secret de service.

| Vérification | Résultat | Preuve |
|---|---|---|
| `npm run check:no-js`, `npm run lint`, `npm run typecheck` | Réussis | [journal](lint-typecheck.txt) |
| `npm run test` | 2654 réussis : web 1106, database 157, domaine 1259, load 21, word-lists 111 | [journal](unit.txt) |
| `TEST_DATABASE_URL=<base cloud locale> npm run test:db -w @incision/database` | 433 réussis, 9 ignorés | [journal](sql.txt) |
| `TEST_DATABASE_URL=<base cloud locale> npm run test:integration -w @incision/web` | 11 réussis | [journal](integration.txt) |
| `npm run build` | Build de production réussi | [journal](build.txt) |
| `npm run test:e2e -w @incision/web` (Chromium, build de production) | 214 réussis, aucun skip, 22,9 min | [journal](browser-full.txt) |
| E2E ciblés `bonus-journal.spec.ts` | 3 réussis | [journal](browser-targeted.txt) |
| E2E ciblé `guest-temporary-results.spec.ts`, port/base distincts | 1 réussi après extension du contrôle navigateur invité/reload | [journal](guest-browser.txt) |

Les 9 skips sont exclusivement `pgbouncer.db.test.ts`, conditionnés par
`PGBOUNCER_TEST_URL` et `PGBOUNCER_DIRECT_URL`, non configurés pour cette exécution.
Aucun test n'a été désactivé ou affaibli. Les anciens résultats PgBouncer de la
qualification #197 ne sont pas une exécution sur ce lot. Pas de preuve Neon.

Le build et le lancement de la suite navigateur complète correspondent au code produit
de `fa6ec60`; une comparaison Git confirme qu'aucun fichier runtime n'a changé depuis.
Les commits suivants ajoutent/corrigent des tests et des documents. Les contrôles
invités ajoutés après le début de la suite complète sont exécutés séparément et identifiés.

## Couverture nouvelle et limites

| Critère | Preuve nouvelle ou étendue | Portée |
|---|---|---|
| Trois effets, bonus inutilisés et aucun bonus | `race-bonus.test.ts` : vraie réduction serveur, finalisation, journal figé | Pas d'événements reconstruits; reçu du double appel unique. |
| Contrat strict, borne et absence historique | `bonus-journal.test.ts`, 11 tests | Refus de clés privées, doublons, jalons/types/cibles/temps invalides. |
| Atomicité, retry et lecteur historique | `wpm-series.db.test.ts`, deux tests ajoutés | Rollback de phase et de tous les résultats; retry ne remplace pas les faits; salle/historique identiques; refus tiers. |
| Migration et anciens résultats | `guest-migrations.db.test.ts`, quatre cas étendus | Données brutes conservées depuis 0012/0013; nouvelle colonne NULL; purge invitée sans altérer les résultats du compte. |
| Confidentialité invités | `guest-retention.db.test.ts`, `temporary-room-results.test.ts`, E2E invité étendus | Journal anonymisé conservé avec compte; sans compte aucun résultat SQL; cache évincé selon les règles existantes; reload identique. |
| Course Arcade réelle jusqu'au stockage | `race.integration.test.ts` étendu | Deux comptes et un bot; activation humaine et bot, reçu rejoué, bonus restant inutilisé, journal final en SQL. Le compte nommé « guest » dans ce test est bien un compte, pas une identité invitée. |
| Rendu, ancien journal et refus historique | Nouveau `bonus-journal.spec.ts`, trois E2E | Fixtures SQL explicites; FR/EN, Abysse/Aube, 360/390/1024/1440, clavier, axe, reload, rendu sans JS et tiers refusé. |

Les E2E bonus antérieurs vérifient déjà les effets, le changement d'onglet et la
reconnexion; ils sont réexécutés dans la suite complète. Leurs fixtures runtime ne
constituent pas à elles seules une preuve SQL, d'où les tests intégrés séparés.
Aucune nouvelle mesure de charge, Lighthouse, appareils physiques ou lecteur d'écran
n'est revendiquée. Le journal ne trace pas les tentatives refusées ou expirations;
les anciennes courses restent non collectées. Les contraintes SQL bornent l'enveloppe;
la validation applicative stricte vérifie son contenu imbriqué et les cibles.

## Échecs rencontrés et résolution

- Premier passage SQL : 429 réussis, 4 échecs, 9 skips. Le nouveau lecteur appelait
  `bonus_journal` sur le schéma historique avant migration dans le test de montée de
  version. Le test compare désormais les lignes brutes avant/après migration, avec
  le seul ajout NULL attendu, puis vérifie le lecteur après migration et après purge.
  Aucune compatibilité avec un schéma non migré n'est inventée; les 433 tests passent.
- Premier passage intégration : 10 réussis, 1 échec. La nouvelle assertion de retry
  comparait aussi la révision privée courante, qui évolue pendant les actions des
  autres coureurs. La comparaison porte désormais sur le reçu stable; le journal
  contient une seule activation. Les 11 tests passent.

- Dernier rejeu unitaire : un appel avec accès réseau additionnel n'a pas démarré,
  le contrôle automatique d'autorisation ayant expiré. Le repli dans le profil isolé
  a atteint le délai du test socket `bonus-client-channel.test.ts`; cette exécution
  a été arrêtée et n'est pas comptée comme réussie. Relance dans le profil réseau
  autorisé, sans modification de code ni de test; son résultat est consigné ci-dessus.

## Revues sur la même révision

Rôles appliqués séquentiellement par le même agent, sans indépendance revendiquée.

| Rôle | Conclusion et limites |
|---|---|
| Code-reviewer | Pas de constat bloquant : projection au seul point final, absence d'I/O nouvelle pendant la course, limites bornées, composant partagé résultats/historique, aucune dépendance ajoutée. |
| DBA | Migration additive générée; autres tables et anciennes colonnes identiques au snapshot 0019; anciennes migrations inchangées. Transaction/fence/retry conservés, pas de N+1. Schéma à appliquer avant code; verrou ALTER TABLE de production non mesuré. |
| Confidentialité/sécurité | Accès privé inchangé, aucune nouvelle route publique, clés JSON strictes, cibles locales anonymisées, aucune liaison durable invitée. Revue ciblée de ce diff, pas audit exhaustif. |
| QA fonctionnelle | Critères reliés aux preuves ci-dessus; anciennes courses et journal vide distincts. Recette humaine delta encore attendue. |
| UI/UX | Captures comparées à l'écran 10 à 390/1024/1440, jetons existants, disclosures natifs, focus global de 3 px; tests FR/EN/deux thèmes/360 px et axe. Aucun changement d'identité visuelle ou de piste. |

Captures synthétiques dans ce dossier : `journal-<fr/en>-<abysse/aube>-<390/1024/1440>.png`.
Les images historiques écrasées par les autres E2E sont remises à leur contenu versionné;
44 fichiers ont ainsi été restaurés; ils ne sont pas attribués à ce changement.

## Recette humaine delta et livraison

1. Terminer une course Arcade avec un bot, activer un bonus et en laisser un inutilisé;
   vérifier type, jalon, cible et moment dans les volets des participants.
2. Recharger puis rouvrir par l'historique : même journal, invité éventuel anonymisé.
3. Ouvrir une ancienne course : collecte indisponible, sans faux « aucun bonus ».

Les validations antérieures de Philippe restent des témoignages transmis par le
coordinateur, pas des tests réalisés par cet agent. Aucun nouveau parcours humain
n'est déduit d'une déclaration générale de validation; les parents RES-02/HIST-02
restent partiels jusqu'à confirmation de ce delta.

Board/proofs préparés : rattacher ce dossier à #65/#67 et RES-02/HIST-02; état technique
implémenté et vérifié, recette delta à confirmer. Aucun changement de carte effectué.
Le lot corpus est vérifié sur `docs/02-corpus-acceptance`, SHA
`bd912d60c06a2a8b15e734851efdf77b78ebbe95`, depuis la même base; les deux modifient des lignes
distinctes d'EXIGENCES et doivent conserver leurs preuves lors de l'intégration.

Avant livraison : rapport/SHA au coordinateur, autorisation `deliver`, push normal et
PR vers dev, puis CI et revue. Pas de CI verte annoncée avant son exécution. Aucun
merge ou déploiement. Pour une future livraison autorisée, appliquer 0020 avant le
nouveau code; en retour arrière applicatif, conserver la colonne et les données
([ADR-0008](../../adr/0008-final-bonus-journals.md)).
