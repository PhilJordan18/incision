# Qualification finale cloud — 6 novembre 2026

Ce dossier complète la [qualification initiale](../qualification-2026-11-05/README.md), sans la réécrire. Il prépare la remise de la branche `test/qualification-finale` vers `dev`. Aucun merge, déploiement, accès à la recette, Azure, Neon, OAuth réel, sauvegarde réelle ou modification du board n'est réalisé. Toutes les données manipulées sont synthétiques et locales au cloud.

## Références

- Base `dev` récupérée dans une copie neuve : **c588a272acdeca72722dd1aac65c80c5e1d0d006**; ancêtre de la branche, historique conservé.
- Reprise demandée : **df1e80c53ff78689a547b42310d49dc8f7360337**.
- Correctif corpus : **0af453cd70caef6b5b6a66f88778bbdc1d99a741**.
- Nouveaux parcours navigateur : `47af132`; instrumentation simultanée : `8fe3106`.
- Les preuves produites sur l'arbre de travail pendant la mise au point sont distinguées de la course finale sur commit propre. Les rapports JSON portent le SHA complet, l'état de l'arbre et le build ID. Le SHA applicatif final qualifié est **f8cd6d7d4d3272f26620daf5b957db85f45c4661**. Les commits suivants archivent des preuves/documentation; le SHA livré est celui de la tête de PR, indiqué dans le compte rendu de livraison.

## Résultat et limites de la qualification

Le corpus manquait dans **la base recréée par le scénario**, pas dans la procédure générale d'installation qui demandait déjà l'import. L'outil importe désormais la version `2026-10-25.4` par les fonctions normales du projet. Aucun contournement de `TEXTS_UNAVAILABLE`, texte de repli, changement de capacité, délai, règle produit ou corpus. Un défaut confirmé par Lighthouse a aussi été corrigé : les noms accessibles des boutons de langue incluent désormais leurs libellés visibles (« FR — Français », « EN — English »), sans changement visuel ou de règle produit. Le nouveau contrôle E2E échoue sur l’ancien build puis passe après correction.

La mesure finale sous charge et Lighthouse sont consignés ci-dessous. Leur réussite fonctionnelle ne ferme pas PERF-03 : aucun seuil RTT/FPS n'est défini dans EXIGENCES.md et la recette sur appareils physiques reste humaine. PERF-01 exige **au moins 90 dans chaque catégorie sur l'accueil**; Lighthouse local sur build de production ne prouve pas l'hébergement Azure.

## Course complète et navigateur simultané

Source propre **f8cd6d7d4d3272f26620daf5b957db85f45c4661**, build ID `YxrIRQGsb7TobBaWkFPAO`, mesure `2026-11-06T04:26:13.892Z`. Commande : `PLAYWRIGHT_BROWSERS_PATH=<Chromium installé> LOAD_CONFIRM=local-only LOAD_BROWSER=1 npm run load -w @incision/load`. Aucun autre build/test pendant cette relance finale. Linux x64, Node v24.19.0, 5 CPU logiques Xeon Platinum 8573C, 17,59 Gio, PostgreSQL 17 local; clients, navigateur et serveur partagent la machine.

[JSON complet](../../../tools/load/evidence/2026-11-06-browser.json) et [journal](combined-final.txt).

| Mesure | Résultat |
|---|---:|
| Membres / participants en course / spectateurs | 50 / 30 / 20 |
| Connexions simultanées attendues et établies | 51 : 50 clients Socket.IO + onglet réel du 20e spectateur |
| Arrivés / résultats persistés / observateurs complets | 30 / 30 / 20 |
| Frappes attendues et acquittées | 8640 / 8640 |
| Erreurs protocole / déconnexions / erreurs de nettoyage | 0 / 0 / 0 |
| RTT ACK médiane / p95 / p99 / max | 1,04 / 2,94 / 24,50 / 38,06 ms |
| Intervalle reçu spectateur médiane / p95 / p99 / max | 250,13 / 255,53 / 286,89 / 304,04 ms |
| Durée totale, préparation comprise | 52,76 s |
| Observation Chromium FR/Abysse, 1440 × 1000 | 48,23 s, 30 marqueurs présents, 1131 positions distinctes |
| Intervalles rAF échantillonnés | 2874 |
| rAF médiane / p95 / p99 / max | 16,70 / 16,70 / 16,80 / 16,80 ms |
| Longues tâches observées (API navigateur, ≥50 ms) / erreurs JS | 0 / 0 |
| Tableau final visible dans le navigateur | Oui |

La capacité officielle SALLE-05 est **30 participants, bots inclus**, plus 20 spectateurs selon D-22. Le second onglet d'un spectateur ajoute une connexion, aucun membre ni concurrent. D-15 garde une marge de lisibilité de **50 coureurs dessinés**, distincte de la capacité. PERF-03 n'a **aucun seuil numérique RTT/FPS** : le gate vérifie présence, mouvement et intégrité, pas un SLA inventé.

Le corpus `2026-10-25.4`, empreinte `9aef01c6c0166eaf32bf66e6fba653464b80b495330fed1fdc6a127e5e30e709`, est vérifié et sa version confirmée dans la course. Une salle, saisie correcte, correction obligatoire, 50 mots FR, 125–153 ms entre lots et attente d'ACK : ni bots/Arcade, ni erreurs humaines, rafale de reconnexions, admission HTTP, invités ou réseau distant dans ce benchmark. L'onglet est un vrai Chromium **headless**, sans faux transport; rAF mesure la cadence des callbacks, pas une garantie de rafraîchissement physique ou la latence frappe → affichage. Le premier intervalle sans référence précédente est exclu. Les autres langues/thèmes/largeurs sont testés séparément. PERF-03 reste partiel pour la recette humaine sur appareils cibles.

## Lighthouse local et correctif confirmé

Lighthouse **13.6.0**, profil mobile simulé 412 × 823, CPU ×4, accueil anonyme du **build de production local**, `2026-11-06T04:25:32.192Z` sur le même code `f8cd6d7` : **99 performance, 100 accessibilité, 100 bonnes pratiques, 100 SEO** (catégorie supplémentaire « agentic-browsing » : 100). Toutes dépassent le seuil officiel **≥90** de PERF-01. [Extrait vérifiable](lighthouse-local.json), avec configuration, métriques, audits restants et empreinte du rapport intégral.

Le premier audit donnait 98/100/100/100 mais signalait `label-content-name-mismatch` sur FR/EN malgré le score global d'accessibilité à 100. Le correctif `f8cd6d7` fait passer cet audit de 0 à 1; [régression avant correction](language-name-before.txt), puis [12 tests design réussis](final-design.txt). Les diagnostics de scripts inutilisés, blocage du rendu et bfcache ne sont pas transformés en projet d'optimisation hors périmètre. Ce contrôle n'atteste ni Azure, ni OAuth, ni tous les écrans, ni une écoute avec lecteur d'écran.

## Vérifications complémentaires

| Périmètre | Preuve / portée |
|---|---|
| Réentrée après bannissement | E2E existant par code, complété par une nouvelle invitation valide avec la même identité, refus visible et focus sur l'erreur; aucun membre actif recréé en SQL. FR/EN. Tests SQL des bans déjà présents. |
| Public → CODE | Deux nouveaux cas FR/EN, dérivés du scénario public → privé : disparition immédiate chez l'observateur sans actualisation. |
| Filtres / Quickplay vide | Tests existants rejoués, dont clavier, sans JS, compte et invité; aucune règle réinventée. |
| Succession / absence de successeur | Tests existants de départ explicite et perte de socket, grâce de 30 s, succession humaine et fermeture sans successeur. Aucun TTL de salle ajouté. |
| Agrégats / records | 68 tests SQL ciblés réussis : profils, détails, bots, modération, succession, départ hôte, Quickplay, seed et CLI d'historique. Exclusions bots, historiques humains, catégories correction/bonus, précision des records; pas une attestation humaine. |
| Clavier / annonces / langues / thèmes | 9 E2E piste et modération réussis après correction du nouveau sélecteur : FR/EN, Aube/Abysse, 1440/1024/390/360 px, focus, régions/statuts/erreurs, axe, animations réduites et couleurs forcées. Pas d'écoute avec lecteur d'écran physique. |
| Contrôles généraux | Lint, typecheck, `check:no-js`, 2 643 tests unitaires réussis (1106 web + 146 database + 1259 domaine + 21 load + 111 word-lists). |

La première sélection E2E a donné **32 réussis et 2 échecs** : le nouveau sélecteur `role=alert` trouvait aussi l'annonceur Next.js. Après ciblage du paragraphe d'erreur, les deux parcours FR/EN passent dans la relance de 9 tests. Les autres 32 succès restent leur preuve propre; **ce n'est pas une commande unique de 41 nouveaux tests**. Les quatre cas piste et les autres cas de modération sont des relances de couverture existante. La suite complète comprend désormais 211 cas (209 antérieurs + 2 public → CODE).

Trois essais exploratoires de l'observateur ont échoué après la course serveur terminée, sans erreur protocole ni déconnexion des clients. L'évaluation de code transformé par tsx perdait l'échantillon navigateur; le script littéral évite les helpers de compilation hors navigateur. L'intervalle initial rAF sans horodatage précédent est exclu. Les échecs ne sont pas maquillés en résultats verts; seuls les rapports finaux complets font preuve.

### Preuves antérieures et tests ignorés

Les journaux du dossier du 5 novembre restent la source pour : 209 E2E complets, 11 intégrations à deux processus, 431 SQL réussis + **9 PgBouncer ignorés** dans la commande générale, migrations et archive. Les neuf tests PgBouncer ont ensuite été exécutés séparément avec succès sur PostgreSQL 17/PgBouncer 1.26 locaux, sans skip. Ne pas annoncer un nouveau « 440/440 » d'une commande unique. Neon n'est pas testé. Les règles produit sont inchangées; le seul correctif applicatif ultérieur concerne le nom accessible des boutons FR/EN.

## Installation, seed et restauration synthétique

Sur deux nouvelles bases locales dédiées (`incision_qualification_seed_20261106` et `incision_qualification_restore_20261106`) : migrations, seed de démonstration, import du corpus et seed d'historique, puis second passage idempotent; `pg_dump -Fc`, restauration avec `pg_restore --exit-on-error --no-owner`, comparaison triée des lignes JSON et empreintes SHA-256 par table. Le [résultat](synthetic-backup.json) confirme l'égalité des 19 tables, dont 20 migrations, 4 comptes synthétiques, 6 courses, 12 résultats et 122 passages. Les autres tables vides ne prouvent pas une restauration de données qu'elles ne contiennent pas.

Commandes applicatives employées, depuis la racine : `CI=1 DATABASE_URL_UNPOOLED=<base locale dédiée> npm run db:migrate -w @incision/database`, puis `db:seed:demo`; `DEMO_HISTORY_DATABASE_URL=<même base> node --import tsx packages/database/scripts/seed-history.ts --version 2026-10-25.4`. Aucun `.env` ni secret distant utilisé. Les données du dump ne sont pas livrées; seuls comptes/résultats et empreintes non sensibles de la comparaison sont rapportés. La reproduction du seed est couverte aussi par les tests SQL/CLI ciblés.

## Documents et témoignages

Les quatre documents obligatoires ont été relus :

- **ARCHITECTURE** : correction des assertions anciennes sur les textes fixes, bots, invités, réglages, statistiques, piste et succession, d'après `c588a272`.
- **EXIGENCES** : 90 IDs conservés; preuves automatisées et témoignages séparés, parents partiels conservés. La section « Témoignage humain transmis par le coordinateur » rapporte précisément les validations reçues sur c588a272.
- **DEMARCHE-CREATIVE** : relue et conservée; nom, logo, croquis et fichiers design non modifiés, aucune preuve créative inventée.
- **IA** : erreur d'instrumentation ajoutée au journal, trois cas réels sélectionnés; réflexion personnelle laissée explicitement à Philippe.

Le témoignage couvre visibilité/invitations, Quickplay Alice+bot, réglages en direct, bonus fonctionnel, résultats privés (course `793a43fd-c982-4845-a3f2-f0f54e9cd9e6`), reconnexion courte et expulsion multi-onglets. Il ne couvre pas ban/réentrée, filtres, public → CODE, Quickplay vide ou agrégats détaillés. EPTAPZ est compatible avec la succession 30 s sans socket puis absence de successeur; la cause réseau exacte n'a pas été journalisée. Le retour UX sur la visibilité des bonus reste ouvert sans modification produit.

La [fiche de démonstration](../../DEMONSTRATION.md) et sa courte checklist listent les confirmations humaines restantes. La procédure [déploiement/retour arrière](../../DEPLOYMENT.md#préparation-de-remise--6-novembre-2026) est préparée sans être exécutée : choisir un artefact compatible, préserver la possibilité de restauration, vérifier les données et redémarrer après restauration; ne pas revenir aveuglément aux anciens textes fixes.

## Revues et remise

Revue séquentielle selon `implement-task`, `verify-task`, `deliver-branch` et les rôles du dépôt : code, QA, données, sécurité des outils locaux et cohérence documentaire. Les revues portent sur le diff depuis dev, sans modifier le produit pendant leur exécution. La consolidation ci-dessous porte sur le SHA applicatif final; les liens de PR et de CI suivent à la livraison.

Restent humains ou hors périmètre : acceptation éditoriale du corpus/listes et complexités; appareils physiques et lecteur d'écran; réflexion personnelle IA; course illimitée active >10 minutes; journal des bonus RES-02/HIST-02; budget/hébergement/OAuth réel et recette de production. Aucun feu vert global ni fermeture de carte n'en est déduit.

### Consolidation des revues sur f8cd6d7

Revues appliquées séquentiellement par Codex, sans revue indépendante prétendue :

| Rôle | Verdict et périmètre |
|---|---|
| Code-reviewer | OK : diff complet depuis c588a272 relu; corpus épinglé, fonctions d’import existantes, observation bornée et fermeture du navigateur, aucune règle métier copiée ou modifiée. Dépendance Playwright de développement déjà verrouillée à la même version dans le projet. |
| Functional QA | OK dans le périmètre local : refus de ban, transitions de visibilité et couvertures existantes reliés aux journaux; course finale complète et résultats prouvés pour les 50 membres. Limites de données synthétiques et témoignages explicites. |
| DBA | OK local : aucune migration ajoutée/modifiée; base de charge propre à l’exécution, import normal, nettoyage sans erreur; seed idempotent et restauration identique. Pas de preuve Neon. |
| Security | OK sur le changement : cibles de charge bornées au loopback, refus des dotenv web, sessions synthétiques, pas de secrets dans les JSON. Réentrée bannie refusée par le produit inchangé. Ce contrôle du diff n’est pas un audit exhaustif de sécurité du dépôt. |
| UI/UX | OK pour le correctif de libellé : aucune modification visuelle ou des jetons; Lighthouse corrigé, activation clavier, focus visible et captures des deux thèmes/langues. La recette physique et le lecteur d’écran restent humains. |
| Architecte / procédure de livraison | OK : 90 identifiants et parents partiels conservés, preuves humaines attribuées, architecture actualisée, démonstration et procédure de retour arrière sans exécution distante. |

Les [16 contrôles d’accueil à largeur fixe](home-viewports.json) passent à 1440/1024/390/360 px, FR/EN, Aube/Abysse : focus de 3 px et absence de débordement horizontal. Les [captures](screenshots/) ont été comparées à la référence 01; les adaptations existantes du brief sont conservées. Un probe exploratoire qui redimensionnait successivement la page après captures signalait parfois un débordement à 390 px, non reproduit à l’ouverture à largeur fixe ni par les contrôles responsive existants; aucune correction produit spéculative n’en a été tirée. Ce parcours de redimensionnement reste à vérifier sur appareil.

Build de production et archive finale réalisés sur le code f8cd6d7 : [journal build](final-build.txt), [archive](final-release.txt), [inspection des chemins](archive-check.json). L’archive contient 18 965 entrées, pas l’outil de charge, les dépendances Playwright de premier niveau, le corpus source, les E2E ou un fichier dotenv. Le premier appel de packaging a échoué car `rsync` n’était pas dans PATH; relance réussie avec l’outil local déjà extrait dans le cloud, sans changement du script. Aucun artefact déployé.

Aucun finding bloquant non corrigé dans le changement autorisé. Les réserves de qualification globale et les confirmations humaines ci-dessus restent ouvertes. Livrable prêt à pousser vers `dev` selon l’autorisation transmise; état CI distant à lire dans la PR, jamais déduit des contrôles locaux.

Contrôle de fuite du corpus également réussi : [journal](final-corpus-leak.txt), 687 fichiers build et 1 211 fichiers embarqués comparés à 260 empreintes. L'appel initial de tsx était bloqué par l'IPC du sandbox réseau; relance dans le profil réseau autorisé, sans modifier le contrôle. Le nombre de lignes d'archive annoncé par ce script inclut sa ligne finale vide; l'inspection ZIP compte 18 965 entrées réelles.

## Livraison autorisée

PR **[#197 vers dev](https://github.com/PhilJordan18/incision/pull/197)**, ouverte le 6 novembre après push normal. Code qualifié : **f8cd6d7d4d3272f26620daf5b957db85f45c4661**; dossier de preuves : **c9ff21dd6a4ba6a2928c354f2e39d4c48d9ee821**. Le présent ajout ne modifie que cette référence de livraison. Le SHA exact livré est consultable dans la tête de PR et fourni dans le compte rendu final.

**CI à l'ouverture : en attente**, aucun succès présumé. [Contrôles de la PR](https://github.com/PhilJordan18/incision/pull/197/checks) et [historique de CI de la branche](https://github.com/PhilJordan18/incision/actions/workflows/ci.yml?query=branch%3Atest%2Fqualification-finale) : vérifier que le run correspond au SHA livré et qu'il est terminé avant toute décision de merge. Le compte rendu final précise l'état effectivement observé après suivi.

Fait : qualification cloud, correction du scénario/corpus et du libellé accessible, tests supplémentaires, restauration synthétique, matrice et dossier de démonstration, push et PR. Restant : fin de CI si encore en cours, revue/confirmations humaines listées plus haut, puis décision de merge par Philippe et éventuelle autorisation de production séparée. Aucune carte fermée, aucun merge ni déploiement réalisé.
