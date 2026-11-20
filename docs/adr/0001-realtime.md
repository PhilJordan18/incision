# ADR-0001 — Socket.IO et Next.js sur un serveur persistant

- Statut : **retenu et implémenté**, avec les limites d'intégration décrites ci-dessous.
- Création : 29 septembre 2026; révision : 25 octobre 2026, code `dev` à `f4600af`.
- Exigences concernées : TECH-05/06/07/09, SALLE-06/09, COURSE-03/05/06/08, PERF-02/03. Cet ADR n'en déclare pas tous les critères terminés.

## Contexte

Incision utilise Next.js App Router, React, TypeScript et PostgreSQL/Drizzle. Le brief impose un serveur persistant, une course de 2 à 30 participants (bots compris, spectateurs exclus), un décompte de trois secondes et une reprise de trente secondes. Je dois synchroniser plusieurs navigateurs sans donner au client l'autorité sur les résultats.

## Décision

Je conserve **un processus Node** qui compose Next.js et Socket.IO sur le même serveur HTTP, derrière le frontal HTTPS décrit dans l'[ADR hébergement](0002-hosting.md). La présence et les courses actives sont en mémoire; PostgreSQL conserve les identités, salles, concurrents, instantanés de départ et résultats. Le [modèle livré](../ARCHITECTURE.md#3-modèle-de-données-livré) distingue ces tables des invitations, invités et séries MPM encore absents.

[server.ts](../../apps/web/server.ts) démarre le serveur personnalisé avec `tsx`, en développement comme en production. Next compile ses pages; il ne remplace pas ce point d'entrée. Les paquets métier sont consommés par Next et par le serveur Node. Je n'utilise pas `output: standalone` avec ce serveur personnalisé, conformément à la documentation Next.js.

Les règles pures restent dans [packages/domain](../../packages/domain/src); les canaux Socket.IO valident, autorisent et transmettent aux services. Je peux donc tester la course sans navigateur ni transport.

## Options envisagées

| Option | Intérêt | Décision |
|---|---|---|
| Polling HTTP applicatif | Simple à exposer | Non retenu comme protocole principal : demandes répétées et retard de présence/progression. |
| WebSocket natif | Transport standard léger | Non retenu : accusés, salles et reconnexion à construire. |
| Socket.IO et Next ensemble | Même origine, groupes serveur, accusés et reconnexion | Retenu : une seule livraison et un serveur persistant. Le repli long-polling reste activé. |
| Service temps réel séparé | Déploiement et charge indépendants | Reporté : ajoute authentification partagée et exploitation sans besoin démontré. |

## Contrats et autorisation livrés

Les contrats sont dans les protocoles [salle](../../apps/web/src/rooms/protocol.ts), [course](../../apps/web/src/races/protocol.ts) et [bonus](../../apps/web/src/races/bonus-protocol.ts), pas dans un paquet `contracts` séparé.

Le handshake extrait la session Auth.js. Un transport anonyme ne donne pas accès aux commandes privées. L'identité métier vient du compte, jamais de `socket.id` ou d'un concurrent choisi dans la requête. Le registre suit l'expiration et la révocation; les commandes contrôlent session, appartenance et permission. Un seul onglet contrôle la saisie.

Le [contrôle d'origine](../../apps/web/src/server/realtime/origin.ts) refuse un `Origin` différent de `APP_URL` et `Sec-Fetch-Site: cross-site`. Une origine absente reste acceptée, notamment pour un client non navigateur; elle ne dispense pas d'authentification. Le polling JSONP est refusé. Zod et les limiteurs bornent les entrées.

Les actions de création/admission/fermeture sont HTTP. Après une transaction réussie, les services diffusent la projection révisée de la salle. `room:watch` restitue un instantané autorisé. Les [diagramme et table de messages](../ARCHITECTURE.md#5-messages-et-autorité) décrivent les noms réellement utilisés; il n'existe pas d'événement `race:results`.

## Livraison et reprise

Socket.IO garantit l'ordre des événements reçus, mais sa livraison par défaut est « au plus une fois ». La reconnexion du transport ne garantit donc ni la réception d'un résultat ni la restauration de l'état métier. La récupération native optionnelle de Socket.IO n'est pas notre mécanisme de reprise.

Je m'appuie sur les séquences des lots, la version du texte, les révisions de salle et les instantanés applicatifs. Le navigateur peut retransmettre un lot sans doubler la progression et corrige sa prédiction à partir de l'état serveur. Après reconnexion, il reprend un abonnement autorisé; le domaine contrôle la fenêtre de trente secondes depuis la déconnexion détectée. Le battement de dix secondes et son attente de cinq secondes ajoutent un délai de détection en cas de coupure silencieuse.

## Horloge et fréquence

Le serveur décide du départ, de l'arrivée et des échéances. Le [client d'horloge](../../apps/web/src/races/clock-sync.ts) utilise `system:ping`, estime le demi-aller-retour et retient le meilleur échantillon récent, puis avance avec une horloge monotone. Avant un échantillon exploitable, il utilise l'heure serveur reçue. L'asymétrie du réseau limite la précision visuelle; ce calcul n'autorise jamais une frappe hors délai.

Le domaine borne les lots à 64 événements et dix lots par seconde; le client garde un seul lot en vol. La progression publique périodique est diffusée au plus quatre fois par seconde, avec des messages pouvant être volatiles; l'abonnement reçoit aussi un instantané direct. Les données privées sont envoyées au concurrent concerné. La validation de plausibilité n'est pas une preuve d'absence d'automatisation.

## Durabilité et pannes

Il n'y a pas de SQL par touche. En fin de manche, le runtime fige les résultats, annonce `race:confirming`, puis attend la transaction de finalisation. La salle ne passe en résultats qu'après confirmation durable. Une réponse perdue après commit peut être reconnue comme `alreadyDone`.

L'[ADR-0004](0004-race-ownership-lease.md) détaille le bail SQL et la génération du propriétaire : ils empêchent un ancien processus de continuer à écrire après récupération de sa course. Une panne conduit à une interruption sans faux classement, pas à une restauration frappe par frappe. La reprise réseau de trente secondes n'est pas une garantie de haute disponibilité.

## Preuves et limites

Le serveur personnalisé, les canaux, le runtime et la persistance sont implémentés. Les sources et vérifications de cette révision sont consignées dans la [note F-10.2](../evidence/f10-2-architecture/README.md). La charge locale enregistrée dans [l'évidence F-09](../../tools/load/evidence/2026-10-20-local.json) ne prouve ni la fluidité de la piste finale, ni un déploiement Azure, ni les bots ou bonus activés.

Les salles ordinaires utilisent encore deux textes fixes, la correction obligatoire, une limite de deux minutes et les bonus désactivés. Le moteur de bots est livré mais son pilotage dans les salles reste à faire ([ADR-0005](0005-deterministic-bots.md)). Les séries MPM et journaux détaillés de bonus ne sont pas persistés. Je n'attribue pas à ces éléments les garanties des parcours humains déjà raccordés.

Une évolution multi-instance exigerait un partage explicite de la présence et de l'état des courses. Un adaptateur de groupes Socket.IO ne suffit pas. Cette révision ne change ni l'hébergement ni les intégrations et n'apporte aucune nouvelle preuve de production.

## Sources techniques

- [Next.js : serveur personnalisé](https://nextjs.org/docs/app/guides/custom-server)
- [Socket.IO : groupes serveur](https://socket.io/docs/v4/rooms/)
- [Socket.IO : garanties de livraison](https://socket.io/docs/v4/delivery-guarantees/)
- [Socket.IO : récupération optionnelle](https://socket.io/docs/v4/connection-state-recovery/)

## Historique

La révision du 2 octobre remplaçait 50 humains, cinq minutes de reprise et cinq secondes de décompte par les valeurs du brief final. Celle du 25 octobre conserve le monolithe modulaire, décrit le code effectivement livré et retire les projections présentées comme acquises : invités, invitations, séries MPM et bots en salle.
