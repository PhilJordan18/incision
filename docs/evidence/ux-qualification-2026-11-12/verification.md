# Vérifications exécutées — qualification

Source des tests et de l’application : `a9072ee2cb49a91b176b88ac0720401b3d94f58b`, base `e663a2ea93d918163d88e0d82f4f94bdc6441863`. Le diff final des chemins `apps`, `packages`, `tools` est identique à ce SHA après le déplacement du correctif de focus vers le lot bots. Les commits suivants de cette branche apportent les documents; la CI doit être contrôlée sur leur SHA exact.

| Commande | Résultat réellement obtenu |
|---|---|
| `npm run check:no-js` | Réussi |
| `npm run lint` | Réussi |
| `npm run typecheck` | Réussi |
| `npm test` | 2 654 réussis, aucun ignoré : 1 106 web, 157 unités database, 1 259 domaine, 21 charge, 111 listes de mots |
| `npm run build` | Build de production réussi |
| `TEST_DATABASE_URL=<PostgreSQL cloud localhost:55433/postgres> npm run test:db -w @incision/database` | 433 réussis, **9 ignorés PgBouncer**, 40 fichiers réussis/1 ignoré; 237,10 s. Bases temporaires synthétiques créées par le harnais. Aucune URL PgBouncer configurée, aucune preuve Neon. |
| `E2E_DATABASE_URL=<base cloud incision_e2e_ux_qualification_target_20261112> E2E_PORT=3604 npm run test:e2e -w @incision/web -- e2e/result-navigation-presence.spec.ts e2e/host-network-succession.spec.ts e2e/host-succession.spec.ts` | **11 réussis**, 4,1 min; aucun ignoré/retry. Les deux nouveaux cas terminent en 40,5 s et 42,2 s. |

La première tentative navigateur avait échoué avant tout test : copie neuve sans build `.next`. Le build a été exécuté puis les mêmes scénarios ont été relancés; cette erreur de préparation est conservée dans `target-unbuilt.txt`. Les textes de ces courses sont les fixtures du harnais, **pas une nouvelle qualification du corpus versionné**. Les preuves antérieures d’installation/corpus/charge ne sont pas présentées comme réexécutées ici.

## Ce que démontre le diagnostic

- Départ volontaire : tests existants en décompte/course/résultats, succession et fermeture sans humain connecté.
- Perte de connexions : test existant multi-onglet, retour pendant la grâce, succession après la dernière connexion, invité spectateur éligible.
- Consultation des résultats : nouvelle course humain/bot réellement finie; ouverture de la fiche privée, maintien initial de la phase `results` et de l’hôte; puis fermeture sans successeur ou succession avec un humain connecté. Les deux résultats restent en base et la fiche reste consultable.
- Ce n’est pas une nouvelle règle ni un TTL arbitraire. La fermeture historique EPTAPZ reste sans cause réseau précisément journalisée. Une clarification près du lien de résultats est proposée séparément pour coordination avec Claude; aucun composant de course modifié.

## Revues séquentielles du diff final

Rôles appliqués par Codex dans la même session, **pas une revue indépendante**.

| Rôle | Conclusion et limite |
|---|---|
| Code / QA | Tests de présence fondés sur un vrai serveur, moteur et SQL synthétiques; pas de durée de produit modifiée. Le poll suit la règle officielle existante de 30 s; le délai de test permet son observation. Aucune nouvelle écriture serveur. |
| Architecte / documentation | Sources et dates séparées; 90 IDs officiels conservés; RES-02/HIST-02 réconciliés avec le témoignage du 11 novembre reçu le 12. Nouvelle recette UX encore à confirmer. Documents historiques/captures non réécrits. |
| Sécurité / données | Aucune nouvelle route, permission, migration ou donnée durable invitée. Les assertions SQL synthétiques ne sont pas une inspection de recette. Anonymisation visuelle et purge physique ne sont pas assimilées. |
| Coordination | Fichiers de course/typing/styles/rappel réservés à Claude intacts. Seule cette branche modifie EXIGENCES et RECETTE-FINALE. Pas de dépendance de code entre les quatre branches. |

## Limites explicites

Suite E2E complète, intégration à deux processus, cohérence migrations et paquet de livraison : les résultats **CI `push` et `pull_request` sur la tête livrée** sont à consigner dans la PR et le rapport final, pas déduits des 11 tests ciblés locaux. Aucun run en attente n’est vert. Les neuf tests PgBouncer ignorés sont distincts des tests PostgreSQL directs réussis. Pas de nouvelle exécution locale du test de charge, sauvegarde-restauration ou OAuth réel, ces systèmes n’étant pas modifiés ici.

GraphQL Projects retourne `Forbidden`; les colonnes du board ne sont pas annoncées mises à jour. Les issues peuvent recevoir la synthèse et les liens sans changement d’état. Aucun merge, fermeture de carte, déploiement ni accès au Mac/recette. La réflexion personnelle de Philippe reste à rédiger par lui.
