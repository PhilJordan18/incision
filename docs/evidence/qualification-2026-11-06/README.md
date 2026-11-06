# Qualification finale cloud — 6 novembre 2026

Ce dossier complète la [qualification initiale](../qualification-2026-11-05/README.md), sans la réécrire. Il prépare la remise de la branche `test/qualification-finale` vers `dev`. Aucun merge, déploiement, accès à la recette, Azure, Neon, OAuth réel, sauvegarde réelle ou modification du board n'est réalisé. Toutes les données manipulées sont synthétiques et locales au cloud.

## Références

- Base `dev` récupérée dans une copie neuve : **c588a272acdeca72722dd1aac65c80c5e1d0d006**; ancêtre de la branche, historique conservé.
- Reprise demandée : **df1e80c53ff78689a547b42310d49dc8f7360337**.
- Correctif corpus : **0af453cd70caef6b5b6a66f88778bbdc1d99a741**.
- Nouveaux parcours navigateur : `47af132`; instrumentation simultanée : `8fe3106`.
- Les preuves produites sur l'arbre de travail pendant la mise au point sont distinguées de la course finale sur commit propre. Les rapports JSON portent le SHA complet, l'état de l'arbre et le build ID. Le SHA livré est celui de la tête de PR, indiqué dans le compte rendu de livraison.

## Résultat et limites de la qualification

Le corpus manquait dans **la base recréée par le scénario**, pas dans la procédure générale d'installation qui demandait déjà l'import. L'outil importe désormais la version `2026-10-25.4` par les fonctions normales du projet. Aucun contournement de `TEXTS_UNAVAILABLE`, texte de repli, changement de capacité, délai, règle produit ou corpus. Les seules modifications exécutables de cette suite sont dans les outils et tests.

La mesure finale sous charge et Lighthouse sont consignés dans les fichiers associés après leur exécution. Leur réussite fonctionnelle ne ferme pas PERF-03 : aucun seuil RTT/FPS n'est défini dans EXIGENCES.md et la recette sur appareils physiques reste humaine. PERF-01 exige **au moins 90 dans chaque catégorie sur l'accueil**; Lighthouse local sur build de production ne prouve pas l'hébergement Azure.

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

Les journaux du dossier du 5 novembre restent la source pour : 209 E2E complets, 11 intégrations à deux processus, 431 SQL réussis + **9 PgBouncer ignorés** dans la commande générale, migrations et archive. Les neuf tests PgBouncer ont ensuite été exécutés séparément avec succès sur PostgreSQL 17/PgBouncer 1.26 locaux, sans skip. Ne pas annoncer un nouveau « 440/440 » d'une commande unique. Neon n'est pas testé. Les builds et sources produit restent inchangés par les nouveaux tests.

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

Revue séquentielle selon `implement-task`, `verify-task`, `deliver-branch` et les rôles du dépôt : code, QA, données, sécurité des outils locaux et cohérence documentaire. Les revues portent sur le diff depuis dev, sans modifier le produit pendant leur exécution. Leur consolidation finale et les liens de livraison sont ajoutés après les dernières vérifications.

Restent humains ou hors périmètre : acceptation éditoriale du corpus/listes et complexités; appareils physiques et lecteur d'écran; réflexion personnelle IA; course illimitée active >10 minutes; journal des bonus RES-02/HIST-02; budget/hébergement/OAuth réel et recette de production. Aucun feu vert global ni fermeture de carte n'en est déduit.
