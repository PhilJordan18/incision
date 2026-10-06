# ADR-0001 — Socket.IO et Next.js sur un serveur persistant

- Statut : **retenu pour le prototype, non encore démontré**.
- Création : 29 septembre 2026; révision : 2 octobre 2026 après l'énoncé final.
- Exigences : TECH-05/06/07/09, SALLE-06/09, CONF-12, COURSE-03/05/06/08, PERF-02/03.

## Contexte

Next.js App Router, React, TypeScript et PostgreSQL/Drizzle; déploiement sur serveur/VPS expressément imposé. Mise à jour du 3 octobre : malgré la possibilité écrite dans l'énoncé, Philippe confirme qu'aucun serveur du cégep n'est disponible; budget personnel nul. Une salle accepte 2 à **30 participants**, bots inclus, spectateurs exclus. Le décompte dure **3 secondes** et la reprise **30 secondes**. Ces valeurs remplacent celles de la version précédente.

Le checkpoint nécessite les membres de salle synchronisés entre navigateurs, pas encore toute la course. L'architecture doit néanmoins permettre une horloge autoritaire, les bots, les bonus et des résultats durables.

## Décision

Un **processus Node** lance Next.js et Socket.IO sur le même serveur HTTP, derrière le reverse proxy HTTPS. Une instance initialement; état de présence/course en mémoire. PostgreSQL stocke identités, salles, configuration, invitations et résultats. Pas de service temps réel payant ni de service séparé au checkpoint.

Les règles pures vivent dans les modules métier; Socket.IO est un adaptateur. Le serveur personnalisé utilise TypeScript exécuté avec `tsx`, prévu en dépendance de production. Next compile ses pages, pas ce serveur. Consommation des packages TS par `transpilePackages` dans Next, par `tsx` côté serveur; ce chemin complet est à tester avant les fonctionnalités.

**Ne pas utiliser `output: standalone` avec ce serveur personnalisé.** Les scripts actuels `next dev` / `next start` ne démarrent aucun Socket.IO : une compilation Next réussie ne prouve pas la faisabilité du montage.

## Alternatives

| Option | Atout | Motif de non-sélection initiale |
|---|---|---|
| Polling HTTP | Simple | Multiplication des requêtes et retard de présence/progression. |
| WebSocket natif | Léger, standard | Accusés, rooms, reconnexion et protocole à bâtir dans un délai court. |
| Socket.IO + Next même processus | Même origine, rooms et reconnexion disponibles, une livraison | Retenu; exige un serveur persistant et un prototype de démarrage. |
| Next et service Socket.IO distinct | Déploiement/charge indépendants | Deux services, authentification partagée et exploitation supplémentaires sans besoin mesuré. |

TECH-05 demande un serveur. La piste prioritaire devient une VM sous crédit Azure for Students, sous réserve d'admissibilité, de crédit et de capacité disponibles. Aucun passage à une offre payante n'est autorisé. Si cette piste échoue, Render Free + Neon Free constitue un repli technique, pas un VPS administré : obtenir l'accord du prof sur TECH-05 avant de le déclarer conforme. L'architecture reste portable entre ces environnements; le stockage local durable n'est possible que sur la VM, pas sur Render Free. Voir [limites et vérifications](../architecture/verification.md#hébergement-sans-dépense).

## Contrats, autorisation et ordre

- Handshake : vérifier session de compte ou cookie invité signé et origine; refuser une identité expirée. L'identité est applicative, jamais `socket.id`.
- Chaque commande est validée par schéma Zod, avec identifiant d'opération, salle/course et séquence selon le cas. Autorisation à **chaque action**, pas seulement à la connexion. Aucun client ne décide de son rôle ou de son groupe Socket.IO.
- Mutations durables : verrou/transaction PostgreSQL, puis accusé et diffusion **après commit**. Les opérations répétées restent idempotentes.
- Snapshot à l'entrée/reprise, puis événements avec révision monotone. Révision manquante : resynchronisation, pas confiance dans l'ordre du client.
- Reconnexion native Socket.IO utile mais non garantie : la reprise applicative réauthentifie, contrôle bannissement/phase/délai et restaure la place existante.
- Plusieurs onglets : une seule présence logique, une seule autorité de saisie active; la dernière connexion perdue déclenche la grâce.
- Codes/invitations : limites par IP/identité, taille et fréquence bornées. Le proxy doit fournir l'IP selon une chaîne de confiance configurée.

## Fréquence et autorité de course

Horloge serveur pour début, timer, grâce, bonus et arrivée. Lots de saisie séquencés limités initialement à 10 messages/s/joueur; le serveur valide le contenu et rejette les sauts/vitesses impossibles. Ce contrôle n'est pas une garantie contre toute automatisation.

Projection compacte de la salle diffusée initialement à 4 Hz, interpolation côté UI. Pas de paquet de toutes les frappes vers tous les joueurs. Les bots sont calculés côté serveur et suivent les mêmes règles. Limites des spectateurs séparées de la capacité des participants si l'exploitation le nécessite; documenter toute limite ajoutée.

Les séries MPM sont échantillonnées en mémoire (cible 1 Hz + fin), puis persistées avec les résultats, erreurs agrégées et événements de bonus. Pas de SQL par frappe. Une panne de processus peut perdre une manche active : au redémarrage, la signaler interrompue, sans créer de faux résultats. La reprise de 30 secondes concerne la connexion du navigateur, pas une garantie de haute disponibilité serveur.

## Prototype obligatoire et preuves

1. Installation propre Node 24; démarrage dev, rechargement et build puis démarrage production du serveur personnalisé. Vérifier les imports des packages partagés.
2. HTTPS public et Socket.IO via le proxy; maintien de connexion et resynchronisation après coupure.
3. Compte GitHub puis compte Discord; connexion locale pour Playwright. Le même validateur de session protège HTTP et Socket.IO.
4. Deux navigateurs indépendants créent/rejoignent une salle par code et observent membres/permissions sans recharger.
5. Tests : code invalide, invité créateur refusé, double onglet, deux admissions concurrentes, réémission d'une commande, session expirée.
6. CI sur chaque push; déploiement de main après succès; endpoint de santé, migrations et test de fumée de production.

Après checkpoint : course avec 30 participants, bots et humains simulés, puis vérification humaine de fluidité; tests à 29 999/30 000/30 001 ms; résultats cohérents malgré paquets rejoués. Cibles internes supplémentaires à mesurer : latence visible p95 <500 ms et disponibilité des résultats <2 s. Ce sont des objectifs d'ingénierie, pas des seuils supplémentaires attribués au prof.

## Limites et évolution

Un redémarrage coupe les sockets; les salles durables se rechargent mais pas une course à la frappe près. Prévoir annonces, arrêt contrôlé et déploiements hors démonstration. Une montée à plusieurs instances demanderait coordination du moteur de course, partage des présences/événements et reprise durable; ajouter simplement un adaptateur de rooms ne rend pas l'état métier distribué.

## Sources techniques

- [Next.js : custom server](https://nextjs.org/docs/app/guides/custom-server)
- [Socket.IO : rooms](https://socket.io/docs/v4/rooms/), [recovery](https://socket.io/docs/v4/connection-state-recovery/), [garanties de livraison](https://socket.io/docs/v4/delivery-guarantees/)

## Historique

La révision du 2 octobre remplace 50 humains / reprise 5 min / décompte 5 s, retire l'hypothèse de salle à hôte système et aligne les invitations sur liaison IP + session. La décision de monolithe modulaire est conservée.
