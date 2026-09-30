# ADR-0001 — Synchronisation des salles et des courses

- **Statut :** décision de conception retenue pour le prototype; faisabilité de l'hébergement et capacité de 50 humains à confirmer par essais.
- **Date :** 29 septembre 2026.
- **Contexte :** Next.js/React/TypeScript, PostgreSQL/Drizzle, salles de 50 humains garanties, reprise après coupure, courses en direct, HTTPS et déploiement automatique obligatoires.

## Décision de départ

Utiliser **Socket.IO sur un serveur Node persistant au même domaine que Next.js**, avec un serveur personnalisé TypeScript dans `apps/web`. Garder les règles métier dans des modules séparés (`packages/domain`, `packages/contracts`, `packages/database`). Déployer d'abord **une instance** pour le checkpoint; ne passer à plusieurs instances qu'après mesure et ajout d'un mécanisme de partage d'état/coordination adapté.

Cela fait évoluer le croquis initial à deux applications (`web` et `realtime`) vers un **monolithe modulaire**, sans perdre la frontière métier. La séparation en deux services reste possible si la charge ou l'hébergement l'exige. Ce n'est pas une obligation de la demande client.

**État du dépôt.** `apps/web` utilise encore les scripts `next dev` et `next start` du générateur : ils ne lancent aucun serveur Socket.IO. Le serveur personnalisé, son exécution TypeScript en développement et en production, le routage HTTPS et les contrats d'événements restent à implémenter et à vérifier sur l'hébergeur choisi. Un build Next.js réussi ne prouve donc pas cette architecture en fonctionnement.

## Options examinées

| Option | Atout | Coût / risque pour ce checkpoint |
|---|---|---|
| Scrutation HTTP | Facile à héberger. | Retards, trafic et reconnexion moins naturels pour les positions et les lobbies. |
| WebSocket natif | Transport léger. | À construire nous-mêmes : salons, accusés de réception, reconnexion, contrats. |
| **Socket.IO + Next dans un processus Node** | Même origine pour cookies et HTTPS, salles et reconnexion outillées, une seule livraison initiale. | Serveur Node persistant requis; le serveur personnalisé désactive certaines optimisations Next et ne se combine pas avec `output: standalone`. État mémoire limité à une instance. |
| Next et service temps réel séparés | Évolutivité et déploiements indépendants. | Deux services dès le départ, partage d'authentification, CORS/origines, supervision et coordination supplémentaires. |

La disponibilité de WebSockets sur une plateforme précise doit être vérifiée **au moment du déploiement**. Vercel documente désormais une offre WebSockets en bêta; l'argument n'est donc pas « Vercel ne supporte jamais WebSocket ». Le choix d'un hébergeur doit surtout couvrir le serveur Node personnalisé, les connexions durables, la BD et la CI/CD. Aucun fournisseur n'est encore acté par cet ADR.

## Protocole et sécurité

1. L'interface charge par HTTP les pages, l'authentification, le catalogue et l'historique. La connexion Socket.IO démarre après validation d'une session par cookie `Secure`, `HttpOnly`, `SameSite` approprié, ou d'une session invité. Un client ne s'autorise pas lui-même comme hôte en entrant dans une « room » Socket.IO.
2. Les événements entrants portent `raceId`/`lobbyId`, `clientEventId`, numéro de séquence et charge validée côté serveur. Le serveur vérifie identité, appartenance, rôle, état et révision de configuration; un événement rejoué ne modifie pas l'état deux fois.
3. Les événements sortants contiennent une `revision` monotone, un instant serveur et un état compact. Au démarrage ou à la reconnexion, le client reçoit un **snapshot autoritaire** puis les mises à jour. La récupération native de Socket.IO est une aide « best effort », pas la seule source de vérité.
4. La frappe est validée sur le serveur contre le texte/snapshot de la manche. Le client peut afficher une animation optimiste locale, mais le classement n'utilise que la progression acceptée. Le serveur limite fréquence et taille des messages, notamment pour les codes privés.
5. Le serveur agrège et diffuse le classement à fréquence bornée (cible initiale : quatre fois par seconde). Pour 50 joueurs, un message compact à toute la salle évite une diffusion par frappe × destinataire. Les cinq secondes du compte à rebours et la fin du timer viennent de l'horloge serveur.
6. PostgreSQL conserve la salle, la manche, les invitations et les résultats; la progression vivante est en mémoire, avec checkpoints durables périodiques et à la déconnexion. Après un redémarrage, le serveur ne peut reconstruire que le **dernier état durable** et doit réauthentifier les connexions. Une reprise exacte de course après panne n'est pas encore garantie : il faudra persister les états terminaux et délais nécessaires, puis mesurer la perte potentielle entre checkpoints avant de l'annoncer.

## Critères de validation

### Checkpoint 1

- Un compte crée une salle, un autre navigateur la rejoint par code, et les deux voient la liste des membres se mettre à jour sans rechargement. Vérifier aussi le refus d'un code invalide et l'interdiction pour un invité de créer une salle.
- La CI exécute les tests de création/admission, d'autorisation d'événements et de synchronisation avant le déploiement automatique.

### Itérations suivantes

- Les deux navigateurs voient les états prêt, départ, positions et résultats sans rechargement.
- Une invitation à usage unique n'admet qu'un seul membre, même sous double requête; la reconnexion n'utilise pas de nouveau cette invitation.
- Un joueur perd sa connexion puis revient dans les cinq minutes, sans reculer par rapport à son dernier checkpoint accepté; une fin de manche pendant l'absence produit un DNF.
- Un essai avec **50 humains dans la même salle** durant dix minutes vérifie absence de pertes ou doublons, cohérence des résultats et fluidité de l'interface. La matrice propose comme cibles internes quatre rafraîchissements de classement par seconde, latence visible p95 < 500 ms, écart de départ < 250 ms, résultats < 2 s. Ces chiffres demandent une mesure et ne sont pas une validation client déjà reçue.
- La CI complète progressivement les tests des machines à états, du classement et de la reconnexion. Le déploiement automatique ne se déclenche qu'après les tests réussis.

## Conséquences et sortie de secours

Cette solution minimise le nombre de pièces opérationnelles au checkpoint et garde une évolution possible. Si une instance ne tient pas la charge ou si la haute disponibilité devient requise, extraire l'adaptateur temps réel en service dédié **sans déplacer les règles pures**; ajouter alors un partage d'événements/état et un plan de reprise entre instances. Ne pas supposer que les rooms mémoire Socket.IO se répliquent toutes seules. La faisabilité exacte de cette sortie sera réévaluée avec l'hébergeur et les mesures.

## Références techniques

- [Next.js — custom server](https://nextjs.org/docs/app/guides/custom-server)
- [Socket.IO — rooms](https://socket.io/docs/v4/rooms/), [récupération d'état](https://socket.io/docs/v4/connection-state-recovery/) et [garanties de livraison](https://socket.io/docs/v4/delivery-guarantees/)
- [Vercel — WebSockets (bêta)](https://vercel.com/docs/functions/websockets)
