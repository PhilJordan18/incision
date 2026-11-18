# Finalisation de la recette — 18 novembre 2026

Branche : `codex/finalize-corpus-acceptance`. Code vérifié : `74da22e`.
Base : `dev` (`b98314a`), puis bundle de recette `ecb279f` conservé.
Commits de finalisation : `e0ea938`, `0418f3c`, `74da22e`.
Ce rapport et les captures sont ajoutés ensuite sans changement du code exécuté.

## Résultat

- SALLE-07 : refus `ROOM_BANNED` explicite pour comptes et invités, par code autorisé ou invitation valide. FR : « L’hôte t’a expulsé de cette salle. Tu ne peux plus la rejoindre, même avec une invitation. » Version anglaise équivalente. Les codes privés et invitations invalides gardent leur refus générique. Quickplay ignore les salles interdites et conserve sa reprise sur concurrence.
- CONF-03 : corpus `2026-11-18.1`, retrait des deux réserves refusées par Philippe; 120 entrées conservées, dont 111 jouables (55 FR, 56 EN), sans altération des passages historiques. Import local effectué dans la recette sur le port 3887; aucun import distant.
- AUTH-01 : validation GitHub/Discord du checkpoint 1 reconnue, confirmée par Philippe le 18 novembre. Aucun nouveau test OAuth réel revendiqué, aucune configuration fournisseur modifiée.
- Les validations humaines sont détaillées dans [human-validation.md](human-validation.md), avec leur portée et les captures originales.

## Commandes et preuves

Sur le code final, `npm run check:no-js`, `npm run lint`, `npm run typecheck` et `git diff --check` passent.

`npm run test --workspaces --if-present -- --maxWorkers=1` : **2 670 tests réussis** (web 1121, database 157, domain 1259, load 22, wordlists 111). `npm run build` réussit.
Le premier lancement parallèle avait dépassé le délai de 5 secondes d’un test du limiteur invité sous charge; la reprise avec un worker réussit sans modifier le délai ni désactiver un test.

`npm run test:db -w @incision/database -- test/room-moderation.db.test.ts test/room-invitations.db.test.ts test/guest-admission.db.test.ts test/quickplay.db.test.ts test/room-visibility.db.test.ts test/corpus.db.test.ts test/corpus-acceptance.db.test.ts` : **94 tests réussis**, PostgreSQL local jetable. Le test d’import contrôle aussi l’idempotence, les textes historiques et l’absence des deux réserves dans la nouvelle version. Une attente initiale erronée de `retiredPassages=2` a été corrigée : ce compteur concerne les textes précédemment jouables; les deux réserves ne l’étaient pas.

`npm run test:e2e -w @incision/web -- e2e/room-moderation.spec.ts e2e/quickplay.spec.ts e2e/room-visibility.spec.ts e2e/session.spec.ts e2e/race.spec.ts --grep 'expels|guest expulsion|without a room|guest quickplays|host picks|earlier signing secret|held e'` : **13 parcours Chromium réussis**, port 3888 et base distincts de la recette humaine.
Cela couvre comptes FR/EN, invités aux trois phases, code/invitation, Quickplay vide et invité, visibilité, ancienne clé de session et régression de composition accentuée. Les erreurs JWT attendues du scénario de clé périmée ne sont pas des échecs.

Captures automatiques et axe aux largeurs 1440, 1024 et 390, thèmes clair/sombre, FR/EN; contrôle de débordement horizontal réussi. Inspection visuelle directe des trois captures FR archivées : message lisible, pictogramme d’erreur, adaptation mobile sans débordement. Aucune refonte des composants/designs.

## Revues séquentielles

Rôles appliqués par le même agent, sans prétendre à des avis indépendants :
- Code / architecture : propagation du refus typée jusqu’aux deux interfaces, traitement Quickplay exhaustif; aucun blocage relevé.
- Sécurité : contrôle d’accès et preuve d’invitation avant divulgation du bannissement; refus des invitations révoquées et codes privés conservés, testé.
- DBA : pas de migration de schéma; verrous d’admission conservés; import transactionnel et historique inchangé, testé.
- QA fonctionnelle / UI : critères couverts par tests ci-dessus et témoignages précisément attribués; réserve de message corrigée.

## Matrice et limites

AUTH-01, AUTH-06, SALLE-07, JOIN-03, CONF-01, CONF-03 et RES-04 : complets dans la matrice. Total : 41 complets, 49 partiels, 0 non fait. Les autres critères partiels ne sont pas déclarés terminés par cette tranche.

Les accents natifs Safari et T1–T5 sont les validations de Philippe, pas de nouvelles exécutions de l’agent. `ê` et `è` ne sont pas attribués à un test manuel absent. T2 a été validé le 17 novembre, SHA exact non fourni. Les tests complets SQL/PgBouncer et la production n’ont pas été rejoués dans cette tranche. Le nouveau message est vérifié techniquement, pas encore accepté visuellement par Philippe sur ce commit.

Aucun push, PR, merge, changement de secrets, OAuth distant ou déploiement de production. Prêt à livrer; le mot `deliver` reste nécessaire pour pousser et ouvrir la PR vers `dev`.
