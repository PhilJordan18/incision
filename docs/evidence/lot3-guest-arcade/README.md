# Correctifs ciblés et qualification du lot 3

La branche locale `codex/typing-auth-lot3` part de
`origin/dev b98314ac6257c358ab93865d57f00e12f70b5fb9`. Le lancement initial
`npm ci` a installé 465 paquets. Les bases, comptes et cookies utilisés pour
les essais ont été créés pour ce travail dans le cloud. Les recettes A–G des
16–17 novembre et 1/2 du 17 novembre restent attribuées à leurs versions.
Le chantier UI C1 est distinct.

## Frappe, session et inactivité

- **COURSE-04.** Sur le build de `dev`, la régression Chromium reproduit un
  `insertReplacementText` annulé et le `e` de base déjà envoyé. Le correctif
  garde le `e` ou le `E` provisoire dans le champ natif pendant la sélection.
  Un remplacement ne peut consommer que cette lettre sélectionnée, par un
  seul accent de la bonne casse. Relâcher sans sélection ou changer de focus
  termine la frappe de base. L’envoi garde les événements existants du moteur.
  Le scénario synthétique renforcé vérifie ensuite le résultat SQL de la
  manche avec une seule erreur et exactement un insert de plus que le texte.
- **AUTH-01.** Un JWT émis avec une autre clé provoque trois lignes
  `[auth] JWTSessionError (Error)` avant la nouvelle connexion dans les
  scénarios Chromium et WebKit.
  Les accès HTTP et Socket.IO sont refusés. Une nouvelle connexion restaure la
  session et le socket. Ce scénario rend plausible l’effet d’un ancien lanceur
  qui régénérait les secrets, sans établir la cause de l’incident Safari.
  La configuration locale réutilisée est documentée dans
  [SETUP](../../SETUP.md). La recette active et l’authentification de production
  n’ont subi aucune modification.
- **Focus et D-17.** Les tests du runtime établissent le rappel après 60 s et
  l’abandon après 120 s d’inactivité où une réponse est possible. Le terminal
  « abandon (inactivité) » désactive la saisie. La capture à 33 % et 5:50.8
  documente cet état final. La raison de l’absence initiale de saisie reste
  indéterminée. Le focus au départ, la reprise après Échap, la réponse au rappel
  et la saisie pendant le rappel sont testés indépendamment du JWT.

WebKit Linux met le dialogue natif non modal dans l’ordre de tabulation. Un
test HTML minimal a observé `DIALOG` au premier Tab et `BUTTON` au deuxième.
L’assertion E2E accepte cette étape uniquement si le dialogue a effectivement
le focus. Elle exige ensuite le bouton et le retour au champ après la réponse.

## Charge et SQL

Mesure mixte sur `5647eb4d22f60195a96bd3c365d41831884764dd` propre, build
`cOzMO0vhSX4xtccuGKf6M`, Node 24.19.0, PostgreSQL 17.11. Le harnais a créé,
migré et supprimé sa propre base, en important le corpus `2026-10-25.4`.
Il a utilisé 15 comptes et 15 invités pour la frappe, 20 comptes spectateurs
et un onglet Chromium supplémentaire pour un de ces spectateurs. Les
admissions sont des fixtures de base via les fonctions du produit.
`INCISION_LOT3_ADMIN_URL` désigne l’URL du serveur jetable sur
`127.0.0.1:5433/postgres`.

```sh
LOAD_CONFIRM=local-only LOAD_GUEST_ARCADE=1 LOAD_BROWSER=1 \
  LOAD_DATABASE_URL="$INCISION_LOT3_ADMIN_URL" \
  npm run load -w @incision/load
```

| Contrôle | Mesure |
|---|---|
| Course et résultats | 30/30 terminés et persistés, dont 15/15 invités. 8 190/8 190 lots acquittés, dont 4 095 invités. Zéro erreur inattendue et zéro déconnexion sur les clients du harnais. |
| Arcade | 24 coureurs avec un bonus reçu. Un compte a activé le Brouillard. Les 20 spectateurs ont reçu l’annonce. Un invité a reçu le refus `UNAUTHORIZED` prévu par le canal actuel. |
| Appels SQL | 186 appels agrégés pendant 55,10 s, dont 15 lectures de session invitée avec verrou et 15 écritures d’activité. Budget de régression par compteur de 30, soit 15 invités × (une attribution initiale + une fenêtre de 60 s). La fenêtre finit à la publication des résultats, avant les dernières observations et l’arrêt. |
| Latence aller-retour d’un lot | p95 2,11 ms, p99 16,08 ms, maximum 109,96 ms. |
| Intervalle des progressions reçues par les spectateurs | p95 252,41 ms, p99 256,59 ms, maximum 334,41 ms. |
| Piste Chromium headless à 1440 × 1000 | 30 marqueurs, 3 293 intervalles rAF sur 55,10 s, p99 et max 16,80 ms, zéro longue tâche ≥50 ms et zéro erreur de page. Résultats visibles. |

[Mesures agrégées du harnais](load.json)

Référence Entraînement sur `b98314a` propre, sans onglet d’observation, avec
`LOAD_CONFIRM=local-only`. 30 résultats, 20 spectateurs, 9 480/9 480 lots,
zéro erreur ni déconnexion, RTT p95 7,88 ms et p99 36,23 ms, 56,77 s. Les
passages et les conditions diffèrent entre les exécutions, ce qui limite la
comparaison des latences.

### Échecs et reprises

- Accent, Chromium sur `b98314a`. Première tentative sans exécutable headless.
  La tentative suivante a frappé un `t` minuscule dans la fixture. Après
  correction du test avec `T` explicite, un test a échoué au résultat attendu
  (`aria-invalid=false`), puis est passé sur le build corrigé.
- Charge `8eef565`. Le scénario demandait une activation au socket invité et
  s’est arrêté après 1 986 lots. Le canal réserve cette commande aux comptes.
  La relance `dd892d1` a terminé 9 330 lots, a persisté 15 résultats invités
  et a mesuré 15 verrous et 15 écritures. Son seuil de trois bonus pour chaque
  coureur ne correspondait pas à la règle des retardataires. `5647eb4` a
  terminé avec des coureurs éligibles dans les deux groupes.
- PgBouncer. L’examen automatique a refusé d’élargir les permissions des deux
  fichiers de configuration, puis le montage d’origine a donné `Permission
  denied`. Le pooler a été relancé comme l’UID/GID non-root propriétaire des
  fichiers en `0600`. Les deux mêmes fichiers étaient montés en lecture seule,
  sur le réseau du projet `incision-lot3-pgb`, avec les images épinglées et le
  mode transactionnel prévus par le dépôt.
- WebKit. Les dépendances système manquaient et l’installation globale a
  échoué faute de privilèges. Les bibliothèques ont été extraites dans le
  dossier de test privé. Sur `1cb2532`, trois scénarios ont réussi et D-17 a
  échoué sur la supposition d’un seul Tab. Sur `b98314a`, le même scénario
  échoue à la même assertion. Le comportement natif a été isolé sur une
  page HTML minimale. Les quatre scénarios passent sur `60c17ca` avec
  l’assertion adaptée.
- Archive. Le premier assemblage a échoué faute de `rsync`. Le binaire et sa
  dépendance ont été extraits dans le dossier cloud de test.

## Vérification par SHA

| SHA | Commande | Résultat |
|---|---|---|
| `b98314a` | `npm ci` puis `npm run check:no-js && npm run lint && npm test` et `npm run build` | 465 paquets installés. Contrôles et build réussis, 2 669 unitaires. |
| `b98314a` | `npm run test:db -w @incision/database -- test/pgbouncer.db.test.ts`, avec les deux URLs du pooler | 9 réussis, 0 ignoré, 22,51 s. PostgreSQL 17.11, PgBouncer 1.26.0 en mode transaction. |
| `1cb25322945a50f8978882c76e5c55c4619c214f` | `npm run check:no-js`, `npm run lint`, `npm run typecheck`, `npm test`, `npm run build` | Tous réussis. 2 670 unitaires sans skip (1 121 web + 157 database + 1 259 domain + 22 load + 111 word-lists). |
| `1cb2532` | `npm run test:db -w @incision/database`, `TEST_DATABASE_URL` sur 5433, `PGBOUNCER_TEST_URL` sur 6451 et `PGBOUNCER_DIRECT_URL` sur 5451 | 442 réussis sur 41 fichiers, **0 ignoré**, 114,55 s. Les 9 tests PgBouncer font partie de cette exécution. |
| `1cb2532` | `npm run test:integration -w @incision/web` | 11 réussis sur deux fichiers, 154,10 s, dont l’Arcade avec humain et bot. |
| `1cb2532` | `npm run test:e2e -w @incision/web -- e2e/session.spec.ts e2e/race.spec.ts e2e/typing-clarity.spec.ts e2e/guest-race-commands.spec.ts e2e/arcade-settings.spec.ts` | Chromium, 30 réussis, 0 ignoré, 4,1 min. Le rappel D-17, les deux modes de frappe, FR/EN, Aube/Abysse et les refus d’édition font partie de ces parcours. |
| `60c17ca32c685050be4cad97008b0758a2390d3d` | `npm run test:e2e -w @incision/web -- --config /workspace/scratch/incision-lot3-webkit/playwright.config.ts e2e/session.spec.ts e2e/race.spec.ts -g 'earlier signing secret\|held e\|idle player\|leave asks'` | WebKit 26.6 Linux, 4 réussis, 0 ignoré, 1,5 min. Configuration locale basée sur celle du dépôt, avec un projet WebKit et les bibliothèques extraites. |
| `1cb2532` | `npm run db:generate -w @incision/database` et `scripts/package-release.sh 1cb25322945a50f8978882c76e5c55c4619c214f /workspace/scratch/incision-lot3-release.zip` | 18 tables, aucun écart de migration. Archive de 127 Mio inspectée, serveur et build présents, outils de charge et dépendances exclues selon le contrôle CI. |

Revues locales séquentielles du diff applicatif et du harnais. La revue de code
a vérifié que l’événement d’accent reste un insert du moteur existant. La
revue fonctionnelle et accessibilité s’appuie sur les parcours navigateur et
distingue la tabulation native du rappel et l’abandon terminal. La revue
sécurité couvre la portée des secrets synthétiques, les refus HTTP et socket,
le collage et l’absence de modification des contrôles de session. La revue DBA
a vérifié le périmètre des bases créées, les compteurs agrégés et le passage
par le pooler. La revue exploitation a vérifié la configuration privée et
l’archive locale. Aucun constat bloquant dans le périmètre vérifié.

## Limites

La validation résiduelle sur un Mac consiste à maintenir `e` dans « Ta frappe »,
choisir `3` dans le menu natif pour obtenir `ê`, et vérifier un seul insert,
puis la saisie directe de `é` et `è`. Chromium et WebKit Linux simulent les
événements du navigateur. Ils ne déclenchent pas le menu macOS. La qualification
ne couvre ni la charge d’admission HTTP, ni plusieurs salles actives, ni
l’observation physique de la piste, ni Neon, Azure ou un fournisseur OAuth réel.
