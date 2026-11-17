# État vide « Mes salles » — 17 novembre 2026

Complément autorisé de F-07.4 / #67, PR #205, après la recette A–G de Philippe.
Code vérifié : `08951d201f539ea039d1d2aad30dcc01ad149e1d`, ajouté sans réécriture
à `704593984846e100c0b0ebdb2e538e4929b6d7b7`.

## Résultat

« Créer une salle » / « Create a room » apparaît uniquement dans l’état vide
du compte connecté. Le lien ouvre `/rooms/new`, sans créer de salle par GET.
Une salle active conserve son lien de retour; une lecture indisponible conserve
son alerte. Ni admission, ni rétention, ni rappel d’activité ne sont modifiés.

## Vérifications exécutées

- `npm run lint`, `npm run typecheck` : réussis.
- `npm test` : 2 654 tests unitaires réussis.
- `npm run build` : réussi à la deuxième invocation. La première a été arrêtée
  par l’avertissement de sécurité de Next.js 16.4.3, après génération des pages.
  Aucun contrôle désactivé. La correction 16.4.6 est livrée séparément dans #206;
  cette branche ne prétend pas la contenir.
- `E2E_PORT=3219 E2E_DATABASE_URL=<base synthétique isolée> npm run test:e2e
  -w @incision/web -- account-journey.spec.ts` : 6/6 réussis en 48,5 s, aucun
  test ignoré ou relancé. FR/EN, thèmes clair/sombre, 360/390/1024/1440 px,
  absence de débordement horizontal, axe, focus puis Entrée sur le lien,
  compteur SQL nul après ouverture du formulaire, salle privée et invité.
- Revue code/QA : branches vide/active/indisponible distinctes, URL fixe,
  tests des transitions conservés; aucun constat bloquant.
- Revue sécurité/DBA : authentification existante conservée, aucune nouvelle
  requête ni mutation, aucun changement de schéma ou de permissions.
- Revue UI : bouton secondaire existant, jetons et cible de 52 px, aucun
  nouvel accent rouge; comparaison avec la référence profil et les adaptations
  de navigation déjà autorisées. Captures examinées à 1440/1024/390 px.

## Captures

- [FR clair, 1440 px](screens/fr-light-1440.png)
- [FR sombre, 1024 px](screens/fr-dark-1024.png)
- [EN sombre, 390 px](screens/en-dark-390.png)

## Limites et recette restante

La suite E2E complète, les tests SQL et l’intégration ne sont pas réexécutés
localement pour ce delta de lien; la CI distante doit être lue séparément.
L’état indisponible est revu statiquement, sans panne DB injectée dans ce test.
La validation humaine antérieure ne vaut pas validation humaine de ce bouton.
Après intégration des PR par Philippe : vérifier le bouton vide puis le retour
à une salle active et un court parcours de course sur la combinaison exacte.
Les données de recette, anciennes preuves, stacks et volumes sont inchangés.
Aucun merge, déploiement ou fermeture de carte.
