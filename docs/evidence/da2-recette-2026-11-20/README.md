# Contrôle C1 après fusion — 20 novembre 2026

## Périmètre et état testé

Contrôle ciblé demandé par Philippe, après fusion des PR #208, #211, #212,
#217, #220, #214, #215, #216, #218, #219 et #222, dans cet ordre.

- Code applicatif : `cbe2c2e12d0920633833435a9fece625038c3b40` (`dev`).
- Build effectué sur `a572f2e261eff45b27e9631b06b6fe797d20f0bf`, dont le seul
  écart avec ce `dev` est le délai de CI dans `.github/workflows/ci.yml` (#223).
- Node 24.13.0, build Next.js 16.4.6 de production, Chromium Playwright.
- Serveur local : port 3892. PostgreSQL 17 : service `db-test` du projet
  Compose isolé `incision-c1-smoke-20261120`, port 5433, stockage temporaire.
- Base : `incision_e2e_c1_20261120`, créée pour ce contrôle seulement.
- Comptes de démonstration, secrets éphémères, identifiants OAuth factices.
- Corpus `2026-11-18.1` importé : actif, 120 passages; 20 passages FR et
  19 EN compatibles avec les réglages par défaut. `RACE_FIXTURE_TEXTS` absent.
- Aucun accès à Neon, Azure ou aux données de la recette humaine sur 3890.

## Commandes et résultat

- `npm ci --no-audit --no-fund` : réussi (installation initiale sous Node 22;
  build et exécution des tests explicitement sous Node 24.13.0).
- `npm run build` : réussi sous Node 24.13.0.
- Préparation locale : migrations et comptes de démonstration via
  `apps/web/e2e/prepare-database.ts`, sur la seule base jetable ci-dessus.
- Import : script `packages/database/scripts/import-corpus.ts --version 2026-11-18.1`,
  avec `DATABASE_URL_UNPOOLED` dirigé vers cette même base locale.
- Playwright : configuration locale temporaire dérivée de `playwright.config.ts`,
  import du corpus avant le démarrage, fixtures désactivées par absence de variable;
  `npx playwright test --config playwright.c1-smoke.config.ts` avec `CI=1`,
  `E2E_PORT=3892` et l'URL de la base jetable.
- Résultat : **2 tests réussis, 1,3 minute**; Abysse 33,2 s, Aube 34,7 s.
  Une première tentative de préparation a refusé la valeur temporaire
  `RACE_FIXTURE_TEXTS=disabled`; corrigée en retirant la variable, sans changement produit.

## Parcours observé

Deux contextes neufs, en français, 1440 × 900, thème système sombre puis clair.
Pour chaque thème :

1. Connexion réelle avec le compte local `demo-alice`.
2. Création de salle, ajout d'un bot « impossible », départ de course.
3. Champ de frappe disponible; focus conservé pendant les mises à jour du bot.
4. Progression du moteur serveur constatée sans simuler de frappe du bot.
5. Abandon humain avec confirmation; attente de l'arrivée effective du bot.
6. Résultats vérifiés en SQL : humain `abandoned`, bot `finished`.
7. Rechargement des résultats, ouverture de la fiche et présence du bot dans le tableau.
8. « Prochaine manche » : retour en attente, bot conservé, lancement disponible.
9. Départ confirmé de cette salle synthétique.

Absence de débordement horizontal vérifiée sur course et résultats à 1440 px;
aucune exception JavaScript `pageerror` pendant les deux parcours.
Captures de course et résultats ouvertes et inspectées : textes lisibles, côte,
navires et fanions présents; le fanion neutre du bot aux résultats correspond
à la limite déjà acceptée. Aucun nouveau défaut bloquant constaté sur ce parcours.

| Capture | Abysse | Aube |
|---|---|---|
| Attente | [Attente](abysse-waiting.png) | [Attente](aube-waiting.png) |
| Course | [Course](abysse-race.png) | [Course](aube-race.png) |
| Résultats | [Résultats](abysse-results.png) | [Résultats](aube-results.png) |

## Limites explicites

Ce contrôle automatisé avec inspection des captures est le minimum post-fusion
demandé, pas une nouvelle recette humaine complète. La validation humaine C1
des étapes 1–4 et l'acceptation des étapes 5–7 restent distinctes.

Non rejoués ici : A–G, anglais, Safari, second joueur humain, invité spectateur,
10 bots, formats 1024/390/écran bas/tablette, clavier seul complet, zoom 200 %,
lecteur d'écran, couleurs forcées, mesure de contraste, erreurs concurrentes,
frappe humaine jusqu'à l'arrivée, historique et compte. Aucun statut global
de la matrice n'est promu sur la base de ces deux parcours.

## CI

La CI initiale de `dev`, [44789876564](https://github.com/PhilJordan18/incision/actions/runs/44789876564),
a été coupée au plafond Playwright de 25 minutes après le test 310 sur 365.
Les étapes précédentes étaient réussies; ce timeout n'est pas une suite complète verte.
La correction de délai est livrée séparément dans la [PR #223](https://github.com/PhilJordan18/incision/pull/223).
Résultats définitifs sur `a572f2e261eff45b27e9631b06b6fe797d20f0bf` :

- [CI push 44800527451](https://github.com/PhilJordan18/incision/actions/runs/44800527451) : réussie.
- [CI pull_request 44800540107](https://github.com/PhilJordan18/incision/actions/runs/44800540107) : réussie.
- Playwright du run pull_request : **360 réussis, 5 ignorés**, 28,1 minutes
  (étape de 19:24:50 à 19:53:00 UTC). Aucun test n'a été désactivé par #223.
- #223 ouverte, tête inchangée, état GitHub `MERGEABLE` lors de la vérification finale.

Après la fusion humaine de #223, `dev` à `dab04d6` a été intégré localement
à la branche documentaire avec l'autorisation explicite de Philippe.
La PR de preuves vers `dev` ne contient que ce rapport et les six captures;
elle hérite du plafond CI corrigé. Le résultat synthétique est aussi publié
dans #223. Aucun merge GitHub n'est effectué par l'agent.

Revue documentaire : portée, SHA, isolation et limites explicites contrôlés.
Aucun merge, déploiement, fermeture manuelle de carte ou modification des données existantes.
