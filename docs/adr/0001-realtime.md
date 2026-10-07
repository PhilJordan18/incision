# ADR-0001 — Socket.IO et Next.js sur un serveur persistant

- Statut : **retenu pour le prototype, pas encore démontré**.
- Création : 29 septembre 2026; révision : 2 octobre 2026, après l'énoncé final.
- Exigences : TECH-05/06/07/09, SALLE-06/09, CONF-12, COURSE-03/05/06/08, PERF-02/03.

## Contexte

Next.js App Router, React, TypeScript et PostgreSQL/Drizzle; déploiement sur un serveur/VPS explicitement exigé. Mise à jour du 3 octobre : malgré la possibilité prévue dans l'énoncé, aucun serveur du cégep n'est à ma disposition, et mon budget personnel est nul. Une salle accepte de 2 à **30 participants**, bots compris, spectateurs exclus. Le décompte dure **3 secondes** et la fenêtre de reprise **30 secondes**. Ces valeurs remplacent celles de la version précédente.

Le checkpoint exige des membres de salle synchronisés entre navigateurs, pas encore la course complète. L'architecture doit néanmoins permettre une horloge qui fait autorité, des bots, des bonus et des résultats durables.

## Décision

**Un seul processus Node** exécute Next.js et Socket.IO sur le même serveur HTTP, derrière le frontal HTTPS d'Azure App Service ([ADR-0002](0002-hosting.md)). Une seule instance au départ; état de présence/course en mémoire. PostgreSQL stocke les identités, les salles, la configuration, les invitations et les résultats. Aucun service temps réel payant et aucun service séparé au checkpoint.

Les règles pures vivent dans les modules métier; Socket.IO est un adaptateur. Le serveur personnalisé est écrit en TypeScript exécuté avec `tsx`, prévu comme dépendance de production. Next compile ses pages, pas ce serveur. Les paquets TS sont consommés par `transpilePackages` dans Next et par `tsx` côté serveur; ce chemin complet doit être testé avant les fonctionnalités.

**Ne pas utiliser `output: standalone` avec ce serveur personnalisé.** `apps/web/server.ts` démarre Next.js et Socket.IO ensemble, avec `tsx` en développement et en production (`npm run dev` / `npm run start` dans `@incision/web`).

## Options envisagées

| Option | Force | Raison pour laquelle elle n'a pas été retenue au départ |
|---|---|---|
| Polling HTTP | Simple | Plus de requêtes, présence/progression retardées. |
| WebSocket natif | Léger, standard | Accusés de réception, salles, reconnexion et protocole à construire en peu de temps. |
| Socket.IO + Next dans le même processus | Même origine, salles et reconnexion disponibles, une seule livraison | Retenue; exige un serveur persistant et un prototype de démarrage. |
| Next et un service Socket.IO séparé | Déploiement/charge indépendants | Deux services, authentification partagée et exploitation supplémentaire sans besoin mesuré. |

TECH-05 exige un serveur. L'hébergement est décidé dans l'[ADR-0002](0002-hosting.md) (D-13) : Azure App Service avec une seule instance et Neon PostgreSQL, accepté par l'enseignant le 5 octobre. L'hypothèse d'instance unique de cet ADR y tient; les fichiers durables ne doivent pas dépendre du disque d'App Service.

## Contrats, autorisation et ordonnancement

- Handshake : vérifier la session du compte ou le cookie d'invité signé, ainsi que l'origine; refuser une identité expirée. L'identité est applicative, jamais `socket.id`.
- Règle d'origine (CP-02) : le handshake est refusé quand `Origin` est présent et diffère de `APP_URL`, ou quand le navigateur marque la requête `Sec-Fetch-Site: cross-site`. Un `Origin` absent (le premier GET de polling de même origine de Socket.IO, ou un client qui n'est pas un navigateur) est accepté. Le long-polling HTTP reste activé comme solution de repli pour les réseaux scolaires qui bloquent WebSocket; le polling JSONP est refusé. Les cookies de session et d'invité doivent être `SameSite=Lax` ou `Strict` (AUTH-01/02).
- Chaque commande est validée par un schéma Zod, avec un identifiant d'opération, la salle/course et la séquence selon le cas. Autorisation à **chaque action**, pas seulement à la connexion. Aucun client ne décide de son rôle ni de son groupe Socket.IO.
- Mutations durables : verrou/transaction PostgreSQL, puis accusé de réception et diffusion **après le commit**. Les opérations répétées restent idempotentes.
- Instantané à l'entrée/la reprise, puis événements avec une révision monotone. Révision manquante : resynchronisation, aucune confiance dans l'ordre du client.
- La reconnexion native de Socket.IO est utile mais pas garantie : la reprise applicative réauthentifie, vérifie bannissement/phase/délai et restaure la place existante.
- Plusieurs onglets : une seule présence logique, une seule autorité de saisie active; la perte de la dernière connexion déclenche le délai de grâce.
- Codes/invitations : limites par IP/identité, taille et fréquence bornées. Le proxy doit fournir l'IP selon une chaîne de confiance configurée.

## Fréquence et autorité de la course

Horloge serveur pour le départ, le chronomètre, le délai de grâce, les bonus et l'arrivée. Lots de saisie séquencés, limités au départ à 10 messages/s/joueur; le serveur valide le contenu et rejette les sauts/vitesses impossibles. Cette vérification n'est pas une garantie contre toute automatisation.

Projection compacte de la salle diffusée au départ à 4 Hz, avec interpolation côté interface. Pas de paquet pour chaque frappe envoyé à chaque joueur. Les bots sont calculés côté serveur et suivent les mêmes règles. Limites de spectateurs distinctes de la capacité en participants si l'exploitation l'exige; documenter toute limite ajoutée.

Les séries MPM sont échantillonnées en mémoire (cible 1 Hz + fin), puis persistées avec les résultats, les erreurs agrégées et les événements de bonus. Pas de SQL par frappe. Un plantage du processus peut faire perdre une manche active : au redémarrage, la signaler comme interrompue, sans créer de faux résultats. La reprise de 30 secondes concerne la connexion du navigateur, pas une garantie de haute disponibilité du serveur.

## Prototype obligatoire et preuves

1. Installation propre sous Node 24; démarrage en développement, rechargement, puis build et démarrage en production du serveur personnalisé. Vérifier les imports des paquets partagés.
2. HTTPS public et Socket.IO à travers le proxy; maintien de la connexion (keep-alive) et resynchronisation après une déconnexion.
3. Compte GitHub, puis compte Discord; connexion locale pour Playwright. Le même validateur de session protège HTTP et Socket.IO.
4. Deux navigateurs indépendants créent/rejoignent une salle par code et voient les membres/permissions sans recharger.
5. Tests : code invalide, création par un invité refusée, double onglet, deux admissions concurrentes, renvoi d'une commande, session expirée.
6. CI à chaque push; déploiement de main après succès; route de santé, migrations et smoke test en production.

Après le checkpoint : course à 30 participants, bots et humains simulés, puis vérification humaine de la fluidité; tests à 29 999/30 000/30 001 ms; résultats cohérents malgré des paquets rejoués. Cibles internes supplémentaires à mesurer : latence visible p95 <500 ms et résultats disponibles en <2 s. Ce sont des objectifs d'ingénierie, pas des seuils supplémentaires attribués à l'enseignant.

## Limites et évolution

Un redémarrage coupe les sockets; les salles durables se rechargent, mais une course n'est pas restaurée frappe par frappe. Prévoir des annonces, un arrêt contrôlé et des déploiements en dehors des démonstrations. Passer à plusieurs instances exigerait la coordination du moteur de course, le partage des présences/événements et une reprise durable; ajouter simplement un adaptateur de salles ne rend pas l'état métier distribué.

## Sources techniques

- [Next.js : serveur personnalisé](https://nextjs.org/docs/app/guides/custom-server)
- [Socket.IO : rooms](https://socket.io/docs/v4/rooms/), [récupération](https://socket.io/docs/v4/connection-state-recovery/), [garanties de livraison](https://socket.io/docs/v4/delivery-guarantees/)

## Historique

La révision du 2 octobre remplace 50 humains / reprise de 5 min / décompte de 5 s, retire l'hypothèse d'une salle hébergée par le système et aligne les invitations sur la liaison IP + session. La décision du monolithe modulaire est conservée.
