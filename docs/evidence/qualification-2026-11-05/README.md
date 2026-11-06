# Qualification locale — 5 novembre 2026

Note historique conservée. La [suite du 6 novembre](../qualification-2026-11-06/README.md) ajoute les témoignages reçus, les nouvelles mesures et la livraison autorisée. Les mentions « non reçu », « non mesuré » ou « aucun push » ci-dessous décrivent l’état à cette première étape.

Le correctif de préparation du test de charge et la réconciliation documentaire sont
prêts à livrer. La course sous charge réussit sans contourner `TEXTS_UNAVAILABLE`.
La recette humaine finale, la qualification de la production et la fermeture des
exigences qui en dépendent ne sont pas prononcées.

## Références et périmètre

- Base : `dev` **c588a272acdeca72722dd1aac65c80c5e1d0d006**, récupéré dans un clone neuf.
- Branche dédiée : `test/qualification-finale`.
- Commit de code qualifié : **0af453cd70caef6b5b6a66f88778bbdc1d99a741**.
- Le commit documentaire qui contient ce rapport ne change ni le produit, ni les
  tests, ni le corpus. Son SHA exact est fourni dans le compte rendu de livraison.
- Horodatage du test : 6 novembre à 03:41:37 UTC, soit **5 novembre à 22:41:37 à Toronto**.
- Node 24.19.0, Linux x64, 5 CPU logiques Xeon Platinum 8573C, 17,59 Gio de RAM;
  PostgreSQL 17 local. Clients et serveur partagent la même machine.

Aucun merge, push, déploiement, fermeture de carte, accès aux données de recette ou
connexion à Neon. Les comptes sont synthétiques. Les bases créées par les scénarios
sont locales et jetables; les tests OAuth ne se connectent pas aux fournisseurs.

## Cause et correction

Le scénario de charge appliquait les migrations et créait ses comptes dans une
nouvelle base, puis démarrait le serveur **sans importer de corpus**. La procédure
[d'installation](../../SETUP.md) demandait déjà cet import pour la base de développement :
le faire dans cette dernière ne peut pas alimenter la base recréée par le scénario.
L'absence provenait donc du scénario. Le guide citait aussi `NO_COMPATIBLE_PASSAGE`
pour un corpus absent; le code correct est `TEXTS_UNAVAILABLE`. Le premier code
reste applicable à un corpus actif sans passage adapté aux réglages.

Le scénario utilise maintenant `readCorpusVersion`, `checkCorpus` et `importCorpus`,
les mêmes fonctions que la commande d'import du projet. Il épingle la version
**2026-10-25.4**, vérifie l'activation et contrôle la version réellement enregistrée
dans la course. Version, empreinte et passage figurent dans le rapport JSON. Une
future version ne remplacera pas silencieusement cette référence.

Aucune modification de capacité, cadence, délai de course, règle produit, texte du
corpus ou garde locale. Aucun `RACE_FIXTURE_TEXTS`, repli ni traitement spécial de
`TEXTS_UNAVAILABLE`. Les refus de départ issus du protocole validé sont désormais
identifiables dans les rapports d'échec, sans journaliser d'erreur SQL brute.

Le corpus contient 122 passages : 55 FR et 56 EN retenus, 6 FR et 5 EN en réserve;
20 FR et 19 EN servent les réglages par défaut. Son [registre](../../../packages/database/corpus/2026-10-25.4/registre.md)
reste **en étude**. Cet import local autorisé pour la qualification ne vaut pas
acceptation éditoriale ni autorisation d'importer en production. Le calibrage des
complexités reste éditorial et doit être confirmé avec le coordinateur.

## Seuil officiel et mesures distinctes

| Référence | Ce qui est demandé / mesuré |
|---|---|
| SALLE-05 | 2–30 participants, bots compris, spectateurs exclus. |
| D-22 | Jusqu'à 20 spectateurs en plus. |
| Scénario exécuté | 50 connexions Socket.IO simultanées : **30 participants en course et 20 spectateurs**, pas 50 participants. |
| D-15 | Marge de lisibilité de la piste jusqu'à 50 coureurs dessinés; pas une hausse de capacité produit. |
| PERF-02 | Progression plafonnée à 4 diffusions/s; le délai observé à réception n'est pas une garantie de latence. |
| PERF-03 | Piste fluide à capacité maximale; **aucun seuil numérique RTT/FPS** dans EXIGENCES.md. |
| PERF-01 | Lighthouse ≥90 dans chaque catégorie sur l'accueil : exigence distincte, non remesurée ici. |

### Course réelle sous charge

Commande : `LOAD_CONFIRM=local-only npm run load -w @incision/load`, sur arbre propre
au commit de code ci-dessus, sans autre build/test simultané. Le build produit avait
été construit pendant la qualification de `c588a272`; ses sources applicatives sont
inchangées par le correctif de l'outil. Le build a aussi été refait avec succès après
le correctif. Le rapport conserve l'identifiant exact du build utilisé sous charge.

[Rapport JSON complet](../../../tools/load/evidence/2026-11-05-local.json), avec
résumé individuel des 50 clients, empreinte du corpus et passage tiré.

| Mesure | Résultat |
|---|---:|
| Participants arrivés / résultats persistés | 30 / 30 |
| Spectateurs ayant reçu progression et résultats confirmés | 20 / 20 |
| Frappes attendues / acquittées | 8 790 / 8 790 |
| Erreurs protocole / déconnexions inattendues | 0 / 0 |
| RTT acquittements médiane / p95 / p99 / maximum | 0,92 / 2,55 / 21,01 / 42,28 ms |
| Intervalle de progression reçu médiane / p95 / p99 / maximum | 250,06 / 252,70 / 274,50 / 284,18 ms |
| Durée totale, préparation comprise | 53,39 s |
| Erreurs de nettoyage | 0 |

La course utilise 50 mots français, correction obligatoire, saisie correcte, un
lot en vol par coureur et 125–153 ms entre frappes plus l'attente de l'acquittement.
Le RTT inclut ordonnancement, transport local et travail serveur. Les intervalles
spectateurs ne sont ni une mesure aller simple, ni une mesure des images affichées.

Limites : une salle, comptes authentifiés synthétiques, admissions préparées par les
fonctions SQL (pas de charge HTTP/OAuth), pas de bots, invités, fautes, bonus,
reconnexions en rafale ou réseau distant. La réussite ne certifie pas la capacité Azure.
Le seuil de réussite exécutable porte sur l'intégrité de la course, pas sur un SLA inventé.

### Fluidité navigateur, mesurée séparément

Les **4 tests** de `e2e/race-track.spec.ts` ont été relancés après le build sur le
commit de code qualifié : [journal](qualification-browser-track.txt).
FR/EN, Aube/Abysse, clavier et contrôles responsive passent. Le scénario dessine
30 coureurs en FR et 50 en EN avec une **fixture de progression**, non 50 joueurs
admis dans une vraie salle.

Sur chacun des quatre échantillons d'environ 2,3 secondes à 1440 × 1000 : 140 images,
80–81 positions distinctes du marqueur, intervalle maximal observé de **16,8 ms**.
Ce n'est pas une mesure exhaustive des longues images pendant une course complète.
Ces mesures ne sont **pas simultanées** à la charge réelle ci-dessus, ne portent pas
sur un téléphone physique et ne remplacent pas la recette humaine sur les appareils
cibles. **PERF-03 reste partiel** pour cette raison.

## Vérifications et tests ignorés

| Vérification | Résultat et provenance |
|---|---|
| `check:no-js`, lint, typecheck | Réussis après le correctif : journaux `qualification-*.txt`. |
| `npm test` | **2 643 réussis**, aucun ignoré : web 1 106, database 146, domain 1 259, load 21, word-lists 111. [Journal](qualification-test.txt). |
| `npm run build` | Réussi après le correctif. [Journal](qualification-build.txt). |
| Test dédié du corpus | Vérifie le véritable corpus épinglé, son empreinte et sa compatibilité avec les deux langues par défaut; inclus dans les 21 tests load. |
| PostgreSQL complet | Preuve conservée à `c588a272` : **431 réussis, 9 ignorés**, ces neuf appartenant à PgBouncer. Produit et suite SQL inchangés. [Journal](baseline-database.txt). |
| PgBouncer dédié | **9 réussis, aucun ignoré**, après le correctif, PostgreSQL 17 et PgBouncer 1.26 en pooling transactionnel. [Journal](qualification-pgbouncer.txt). |
| E2E complet | Preuve conservée à `c588a272` : **209 réussis**, aucun ignoré, 19,8 min. Produit et suite E2E inchangés. [Journal](baseline-e2e.txt). |
| Intégration à deux processus | Preuve conservée à `c588a272` : **11 réussis**, aucun ignoré. [Journal](baseline-integration.txt). |
| E2E piste ciblés | **4 réussis**, relancés après le correctif et le nouveau build. Ils font partie des 209, ne pas les additionner comme nouveaux scénarios. |
| Migrations et archive | Preuves de la qualification précédente à `c588a272` : schéma concordant, archive construite et inspectée. Aucun changement de schéma ni de packaging depuis. |

Les neuf tests PgBouncer étaient ignorés car `PGBOUNCER_TEST_URL` et
`PGBOUNCER_DIRECT_URL` n'étaient pas définis dans la suite générale. Ils ont maintenant
été exécutés séparément avec le compose fourni par le projet, ports locaux 6451/5451,
identifiants de test publics. **Il n'existe pas un nouveau résultat « 440/440 » d'une
commande unique** : ce sont 431 + 9 tests exécutés dans leurs configurations respectives.
Aucune des vérifications exécutées ne reste ignorée faute de PgBouncer; Neon lui-même
reste non testé et n'a pas été contacté.

Le premier démarrage de PgBouncer échouait sur la lecture de ses fichiers montés,
créés en mode 600 par cet environnement. Des copies locales des deux fichiers de test,
identiques et lisibles (644), ont été montées en lecture seule par un override compose
hors dépôt. Aucune politique de sécurité ni configuration fonctionnelle modifiée.
Projet compose isolé : `incision-qualification-pgb`; aucune ressource partagée réinitialisée.

## Réconciliation et confirmations attendues

Les **90 identifiants officiels** sont conservés. La [matrice](../../EXIGENCES.md)
ne présente plus comme absents la succession, les réglages de texte, la piste,
l'intégration des bots, l'activation Arcade, les statistiques et les graphiques déjà
vérifiés. TEST-01/02 s'appuient sur les suites exécutées. Les fonctionnalités dont la
recette humaine n'a pas été reçue restent partielles : la présence dans `dev` ou un
journal vert ne constitue pas une approbation humaine.

À confirmer **avec le coordinateur**, sans message envoyé en son nom :

- Recette humaine des parcours livrés, notamment invités, visibilité, invitations,
  modération, succession, quickplay, réglages, bots/Arcade, profil et résultats.
- Acceptation du corpus et des listes de mots; calibrage mesurable des complexités
  (CONF-03/05, D-10/D-21). Aucune acceptation n'est déduite des fichiers historiques.
- Fluidité sur les appareils cibles pendant une charge réelle, puis PERF-03.
- Course illimitée réellement active au-delà de dix minutes : le test à horloge
  simulée et les attestations historiques du 28 octobre ne constituent pas cette preuve.
- État actuel de l'hébergement, budget, OAuth réel, Lighthouse actuel et qualification
  de production; les preuves antérieures restent datées et n'ont pas été réactualisées.
- Résultats complets : le journal des bonus reste une limite documentée de RES-02/HIST-02.

Les documents créatifs de l'étudiant et les déclarations historiques ne sont pas
réécrits. Aucune carte n'est fermée; aucune exigence humaine n'est marquée acquise
par l'agent. Les états partiels distinguent limites produit et preuves encore manquantes.

## Relecture du changement

- Code : l'import reste dans l'outil local, via les contrôles existants; aucune nouvelle
  dépendance ni changement du serveur. Version et provenance de la course vérifiées.
- Données : base au nom propre à l'exécution, migration puis import transactionnel,
  pas de migration nouvelle, nettoyage observé sans erreur. Guard loopback inchangé.
- QA : course complète et persistance de chaque concurrent observées; doubles et
  exclusions explicités. Le statut « prêt à livrer » porte sur ce correctif et ces
  preuves, pas sur une autorisation de recette, de merge ou de production.
