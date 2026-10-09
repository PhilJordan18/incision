# Déploiement — Azure App Service et Neon

Comment Incision arrive en production, et comment rétablir le service en cas de problème. Décision et compromis : [ADR-0002](adr/0002-hosting.md). Je fais chaque changement distant (Azure, Neon, paramètres GitHub) moi-même, ou je l'approuve action par action quand un agent le prépare ([AGENTS.md](../AGENTS.md#human-approvals)).

## Environnements

| | Local | Production |
|---|---|---|
| Application | `npm run dev -w @incision/web` (serveur personnalisé, port 3000) | Azure App Service, Linux, Node 24 LTS, B2, une instance |
| Base de données | PostgreSQL 17 dans Docker Compose ([SETUP.md](SETUP.md)) | Neon, forfait gratuit |
| Configuration | `.env` à la racine, copié depuis [`.env.example`](../.env.example) | paramètres d'application (App settings) d'App Service, environnement GitHub `production` |

Il n'y a pas d'environnement de préproduction (staging) : les changements sont vérifiés en local et par la CI, puis promus de `dev` vers `main`.

## Pipeline

1. Une PR est fusionnée dans `dev`; la CI s'exécute à chaque push et à chaque PR ([ci.yml](../.github/workflows/ci.yml)).
2. Je promeus `dev` vers `main` quand je décide de publier une version.
3. [deploy.yml](../.github/workflows/deploy.yml) exécute la CI, puis quatre jobs :
   - **build** (aucun secret) : refait le build du même commit et empaquette la version avec [`scripts/package-release.sh`](../scripts/package-release.sh) (build Next, sources TypeScript, dépendances de production, `build-info.json` avec le commit), conservée 30 jours comme artefact de workflow;
   - **migrate** (environnement `production`, seule l'étape qui en a besoin reçoit `DATABASE_URL_UNPOOLED`) : décompresse l'artefact de la même exécution et lance son migrateur (`packages/database/scripts/migrate.ts`) sur une connexion directe à Neon; aucun checkout, aucun npm. Un échec arrête le pipeline : **deploy attend migrate**;
   - **deploy** (environnement `production`, seul job qui détient l'identifiant de déploiement) : télécharge cet artefact et le déploie en zip; aucun checkout, aucun npm, aucun code du projet n'y est exécuté. App Service redémarre et ne fait jamais de build;
   - **smoke** (aucun secret) : réessaie pendant 6 minutes au plus, jusqu'à ce que `/api/health` indique le nouveau commit avec `"database": "up"`, puis vérifie un ping WebSocket.

Le pipeline n'est vert que si la production exécute le commit attendu, joint Neon et accepte les connexions WebSocket.

## Configuration initiale

**Azure App Service** (portail → *incision*) :

| Paramètre | Valeur |
|---|---|
| Configuration → Stack settings (onglet) → Startup command | `npm run start -w @incision/web` |
| Configuration → Health check (onglet) → Path | `/api/health/live`, activé après le premier déploiement. **Jamais `/api/health`** : il interroge Neon, et une sonde chaque minute garderait l'instance de calcul gratuite de Neon éveillée en permanence et épuiserait son quota mensuel. |
| Configuration → General settings | Always On, HTTPS only, TLS 1.3, **HTTP version 2.0** (sinon le frontal répond en HTTP/1.1 : Lighthouse estime la perte à 1,2 s sur mobile), FTP désactivé, authentification de base SCM activée (profil de publication) |
| Environment variables → App settings | `APP_URL` (le domaine par défaut en `https://`), `DATABASE_URL` (URL poolée de Neon), `SCM_DO_BUILD_DURING_DEPLOYMENT=false` et, pour l'authentification, `AUTH_URL`, `AUTH_SECRET`, `AUTH_GITHUB_ID`, `AUTH_GITHUB_SECRET`, `AUTH_DISCORD_ID`, `AUTH_DISCORD_SECRET`, `TRUSTED_PROXY_HOPS=1` (voir [Authentification](#authentification)). L'application ne lit jamais `DATABASE_URL_UNPOOLED` : une fois le secret GitHub ci-dessous en place, le retirer d'App Service. |
| Monitoring → App Service logs | Application logging : File System, rétention courte, pour que Log stream affiche la sortie de l'application |

En production, le processus refuse de démarrer quand l'une de ces variables manque ou est vide, quand `AUTH_URL` diffère de `APP_URL`, quand `AUTH_SECRET` compte moins de 32 caractères, quand `APP_URL` n'est pas en HTTPS (une URL `localhost` est permise pour les builds de production locaux), ou quand une `DATABASE_URL` distante ne fixe pas `sslmode=verify-full` (ou `require`). Utiliser `verify-full` pour Neon. **Définir les variables d'authentification avant de promouvoir CP-04 vers `main`** : sinon la nouvelle version ne démarre pas et le smoke test échoue (la précédente a déjà été remplacée).

App Service fournit `PORT`. App Service sous Linux accepte les WebSockets; le smoke test le prouve à chaque déploiement.

**GitHub** (dépôt → Settings → Environments → `production`) :

- Deployment branches : `main` seulement.
- Secret `AZURE_WEBAPP_PUBLISH_PROFILE` : contenu du profil de publication téléchargé depuis la page Overview d'App Service. Ne jamais commiter ni coller le fichier; le supprimer après `gh secret set ... --env production`. Supprimer ensuite toute copie du secret au niveau du dépôt, que les workflows de n'importe quelle branche pourraient lire.
- Variable `APP_URL` : même valeur que le paramètre d'App Service.
- Secret `DATABASE_URL_UNPOOLED` : URL **directe** de Neon (console Neon → Connect, connection pooling désactivé : le nom d'hôte n'a pas de `-pooler`) avec `sslmode=verify-full`, même base de données et même rôle que l'application, utilisée seulement par l'étape migrate. node-postgres ignore `channel_binding=require` (sans danger, mais cela n'impose rien : c'est le TLS vérifié qui protège) et lit `sslrootcert` comme un chemin de fichier; retirer donc `sslrootcert=system` des exemples libpq. Le définir avant la première promotion qui contient des migrations, en tapant la valeur à l'invite plutôt que sur la ligne de commande : `gh secret set DATABASE_URL_UNPOOLED --env production -R PhilJordan18/incision`. Sans lui, le job migrate échoue et rien n'est déployé (le corriger, puis *Re-run failed jobs*). Le garder **seulement** comme secret de l'environnement `production` : supprimer toute copie au niveau du dépôt, que les workflows de n'importe quelle branche pourraient lire. Une fois que cela fonctionne, retirer `DATABASE_URL_UNPOOLED` d'App Service (cela redémarre l'application).
- Comme migrate et deploy utilisent tous deux l'environnement `production`, chaque exécution enregistre deux déploiements; des approbateurs obligatoires (required reviewers) sur cet environnement exigeraient deux approbations par exécution.

## Migrations de la base de données

Règles pour chaque changement de schéma (voir aussi [SETUP.md](SETUP.md)) :

- Les migrations sont générées par Drizzle Kit, relues et commitées; elles ne sont appliquées que par le job migrate (production) ou par `npm run db:migrate -w @incision/database` (local). Jamais `drizzle-kit push`, jamais au démarrage de l'application.
- **Ne jamais modifier une migration déjà appliquée à distance**, et ne jamais dater une nouvelle migration avant la dernière appliquée : Drizzle lui-même les ignorerait toutes deux en silence. Avant d'appliquer quoi que ce soit, puis de nouveau après, le migrateur vérifie que les migrations de la version sont enregistrées avec le même hash; une migration modifiée ou antidatée fait donc échouer le job migrate et bloque le déploiement. Une migration appliquée qui manque dans une version qui en contient de plus récentes (historiques divergents) est refusée aussi; une version plus ancienne que la base de données (rollback) est acceptée. Changer le schéma avec une nouvelle migration.
- Le migrateur tient un verrou consultatif (advisory lock) PostgreSQL sur une seule connexion directe pendant qu'il lit son journal et applique toutes les migrations en attente **dans une seule transaction** : les exécutions concurrentes attendent (60 s au plus), et une migration qui échoue n'en laisse aucune appliquée. Les instructions SQL expirent après 120 s; une instruction qui attend plus de 10 s un verrou de table échoue au lieu de faire attendre derrière elle les requêtes de l'application.
- **Compatibles avec la version en cours d'exécution** : les migrations s'exécutent avant le nouveau code, donc l'application précédente continue de servir le trafic sur le nouveau schéma. Ajouter d'abord (colonnes nullables ou avec valeur par défaut, nouvelles tables); supprimer ou renommer seulement dans une version ultérieure, quand plus aucun code déployé n'utilise l'ancienne forme.
- Les **nouvelles valeurs d'enum** vont dans leur propre version : PostgreSQL ne peut pas utiliser une valeur ajoutée dans la même transaction (le migrateur applique toutes les migrations en attente dans une seule), donc la première valeur par défaut, contrainte CHECK ou donnée qui l'utilise arrive dans un déploiement ultérieur.
- **Un changement additif n'est pas sûr d'office** : `ALTER TABLE` prend des verrous; ajouter une clé étrangère ou une contrainte CHECK sur une grosse table devrait passer par `NOT VALID`, puis `VALIDATE` dans une migration ultérieure; `CREATE INDEX CONCURRENTLY` ne peut pas s'exécuter dans la transaction du migrateur. Les tables actuelles sont petites, mais écrire les migrations comme si elles ne l'étaient pas.
- **Reprise quand migrate échoue** (la transaction a été annulée, rien n'est enregistré, deploy a été sauté, l'application précédente continue de tourner) :
  - *Cause passagère* (connexion, réveil de Neon, délai de verrou dépassé, autre migration qui détient le verrou, secret manquant) : corriger la cause au besoin, puis *Re-run failed jobs* sur la même exécution. Le log indique le code et la raison PostgreSQL.
  - *Erreur SQL* : les migrations en attente s'exécutent dans l'ordre, donc une nouvelle migration ne peut pas réparer une migration qui échoue avant elle. Remplacer la migration en échec elle-même (elle n'a jamais été appliquée à distance) : supprimer son SQL, son snapshot et son entrée de journal **ainsi que ceux de chaque migration ultérieure** (aucune n'a été appliquée : elles partagent la transaction, et chaque snapshot contient déjà le changement en échec), corriger le schéma, relancer `npm run db:generate -w @incision/database`, puis promouvoir. Ne pas modifier le SQL généré à la main : la CI compare le schéma au snapshot, et un test de base de données compare le catalogue migré au snapshot (ensemble exact des tables, types des colonnes, nullabilité et valeurs par défaut, unicité et caractère partiel des index, actions des clés étrangères, noms des contraintes et des index; les expressions CHECK, les clés primaires et les colonnes des clés ne sont couvertes que par des tests de comportement).
  - *Erreur de données* (des lignes existantes violent une nouvelle contrainte) : retirer la migration en échec et chaque migration ultérieure comme ci-dessus, ajouter ensuite la correction des données avec `npx drizzle-kit generate --custom` (dans `packages/database`), puis régénérer le changement de schéma avec `npm run db:generate -w @incision/database`, pour que la correction s'exécute en premier. Autre possibilité : livrer la correction des données dans une version et la contrainte dans la suivante. Le SQL écrit à la main, comme `NOT VALID` puis `VALIDATE` ou un remplissage rétroactif (backfill), va aussi dans une migration personnalisée.
  - Le log d'une exécution en échec peut montrer le nom d'hôte ou le nom du rôle Neon dans l'erreur PostgreSQL ou DNS; jamais le mot de passe ni l'URL.
  - *Échec de la vérification du journal* (une migration appliquée a été modifiée, une nouvelle est datée avant la dernière appliquée, par exemple après la fusion de deux branches qui ont chacune généré une migration, ou une migration appliquée manque dans une version qui en contient de plus récentes) : la vérification s'exécute avant toute application, donc rien n'a changé. Restaurer le SQL, le snapshot et l'entrée de journal de la migration appliquée, régénérer les migrations plus récentes par-dessus le journal actuel, puis promouvoir de nouveau.
- Si une migration réussit mais que le déploiement échoue, l'application précédente continue de tourner sur le schéma additif; redéployer ou faire un revert comme dans [Rollback](#rollback).
- Migrate s'exécute automatiquement à la promotion : créer une branche de sauvegarde Neon **avant** de promouvoir une migration risquée.

## Connexions et transactions

L'application passe par l'URL poolée de Neon (PgBouncer en mode transaction; Neon publie `pool_mode=transaction` et `query_wait_timeout=120`), avec un pool de 5 connexions dont le client abandonne une requête après 5 s.

- **Aucune connexion n'est rendue au pool au milieu d'une transaction.** Une connexion est détruite au lieu d'être réutilisée dans cinq cas : une requête qui échoue côté client (délai dépassé, connexion coupée), une erreur de la connexion elle-même, une connexion rendue dans une transaction, une connexion rendue avec une requête en cours, et une connexion empruntée plus de 30 s. Fermer la connexion met fin à la session, et PostgreSQL annule la transaction dès que sa requête en cours se termine : au plus 3 s dans une transaction bornée (ci-dessous) si la fermeture arrive au serveur; sinon (coupure réseau), la limite d'inactivité termine la session, soit environ 7 s au plus. Sans cela, la requête suivante s'exécuterait dans la transaction abandonnée et pourrait la valider avec la sienne, et un BEGIN qui n'aboutit jamais garderait sa place dans le pool pour toujours.
- **Une session terminée par le serveur ne fait jamais planter le processus**, même quand la connexion est empruntée sans requête en cours : chaque connexion garde son propre écouteur d'erreurs, devient seulement inutilisable, et le pool la jette.
- **Chaque transaction de l'application borne ses attentes côté serveur**, pour elle seule (`boundedTransaction` applique `set_config(…, true)`, l'équivalent de `SET LOCAL`, le seul réglage sûr avec le pooling en mode transaction de Neon) : 2 s d'attente de verrou, 3 s par requête et 4 s d'inactivité dans une transaction, tous sous le délai de 5 s du client.
- **PgBouncer** (d'après sa documentation et son code source, à confirmer sur Neon avec le script ci-dessous) : quand un client se déconnecte alors que sa connexion au serveur n'est pas libre (transaction ouverte ou requête en cours), PgBouncer ferme cette connexion au serveur, ce qui annule la transaction; quand le serveur met fin à une session, PgBouncer déconnecte le client.
- **Effet visible** : rejoindre, créer ou quitter une salle derrière un verrou tenu plus de 2 s répond « indisponible » au bout d'environ 2 s au lieu d'attendre (environ 3 s pour une requête trop lente); Log stream montre alors `[rooms] join|create|leave failed: 55P03` (ou `57014`). Une première connexion GitHub ou Discord peut échouer de la même façon. En charge normale, un verrou de salle n'est tenu que quelques allers-retours vers Neon, bien en deçà de 2 s.
- **Log stream** :
  - `[database] client error: …` quand le serveur met fin à une session (redémarrage du calcul Neon, transaction inactive) : une ligne, parfois deux (le code `57P01` ou `25P03`, puis `Connection terminated unexpectedly`).
  - `[database] client discarded: <raison>` quand une connexion est jetée : `query failed on the client (…)`, `released inside a transaction`, `released with a query in flight` ou `held longer than 30000 ms`. Après `query failed on the client`, l'action concernée journalise souvent `Client was closed and is not queryable` : c'est l'annulation tentée sur la connexion déjà jetée, pas une seconde panne.
  - Quelques lignes après un incident réseau sont normales. Si `timeout exceeded when trying to connect` se répète alors que Neon répond, le pool est bloqué : redémarrer l'application (la santé `/api/health/live` ne touche pas la base et ne le détecte pas).

**Vérifier à travers le pooler de Neon** : `packages/database/scripts/check-pooled-transactions.ts`, lancé depuis la racine du dépôt, passe par le vrai chemin de connexion. Il vérifie :
- que les limites restent propres à leur transaction, sur la même session serveur ;
- qu'une attente de verrou (55P03) et une requête lente (57014) se terminent côté serveur ;
- qu'une transaction inactive est terminée (25P03) sans planter le processus ;
- qu'un client rendu dans sa transaction, ou coupé pendant une requête, libère ses verrous ;
- qu'après un dépassement du délai client, la requête suivante démarre une transaction neuve et que la session abandonnée se termine.

Il ne lit ni n'écrit aucune table : il prend seulement des verrous consultatifs de transaction, dans un espace de clés distinct de celui du migrateur, attend et lit des réglages. Chaque vérification a sa propre limite de temps. Je le lance sur une branche Neon, jamais sur la production sans décision explicite, en tapant l'URL poolée de la branche à l'invite plutôt que sur la ligne de commande, puis je supprime la branche :

```bash
( printf 'URL poolée : ' >&2; read -rs POOLED_CHECK_URL && export POOLED_CHECK_URL && echo >&2 && npm run db:check-pooled -w @incision/database )
```

Chaque vérification affiche `PASS` ou `FAIL` avec ce qu'elle a mesuré; le script ne lit aucun fichier `.env` et n'affiche jamais l'URL, mais un échec de connexion peut nommer l'hôte ou le rôle Neon.

**Vérification locale à travers PgBouncer** (9 octobre 2026) : `packages/database/test/pgbouncer/` lance un PostgreSQL 17.11 et un PgBouncer 1.26.0 isolés (image `edoburu/pgbouncer`, empreinte fixée dans `compose.yaml`; projet, réseau et ports à part, identifiants factices), en mode transaction avec les réglages que Neon publie. Résultats :

- le script de vérification passe 7 sur 7 à travers ce PgBouncer ;
- `test/pgbouncer.db.test.ts` (9 tests, ignorés sans ce montage) montre que :
  - les limites restent propres à leur transaction ;
  - les attentes de verrou (55P03) et les requêtes lentes (57014) se terminent côté serveur ;
  - une transaction dont le client part est annulée aussitôt, car PgBouncer ferme sa connexion au serveur ;
  - un BEGIN sans réponse libère sa place ;
  - une coupure pendant une requête libère les verrous au plus 3 s après ;
  - une session terminée par le serveur ne fait pas planter le processus ;
  - aucune connexion n'attend dans PgBouncer ensuite ;
- cas du « trou noir », où la fermeture du client n'arrive jamais : une transaction bornée est terminée par la limite d'inactivité, en 4 s environ ; sans les limites, ses verrous restent tenus, car PgBouncer n'y met pas fin avec ses réglages par défaut.

Ce montage s'approche du pooler de Neon sans l'être : Neon ne publie qu'une partie de sa configuration, et seule une vérification sur une branche Neon confirmerait son comportement exact.

```bash
docker compose -f packages/database/test/pgbouncer/compose.yaml up -d --wait
```

```bash
PGBOUNCER_TEST_URL=postgresql://incision_pgb:pgbouncer_test_only@localhost:6451/incision_pgb PGBOUNCER_DIRECT_URL=postgresql://incision_pgb:pgbouncer_test_only@localhost:5451/incision_pgb TEST_DATABASE_URL=postgresql://incision_test:incision_test_only@localhost:5433/postgres npm run test:db -w @incision/database -- test/pgbouncer.db.test.ts
```

```bash
docker compose -f packages/database/test/pgbouncer/compose.yaml down -v
```

## Authentification

Auth.js v5 avec des sessions JWT ([ADR-0003](adr/0003-authentication.md)). Seulement les **noms** des variables; les valeurs vivent dans App Service et dans le `.env` local, jamais dans le dépôt ni dans une conversation.

| Variable | Valeur en production | Notes |
|---|---|---|
| `AUTH_URL` | exactement `APP_URL`, par exemple `https://<default-domain>` | Origine seulement, sans chemin. Auth.js construit ses URL de callback à partir d'elle; elle donne aussi aux cookies les préfixes `__Secure-`/`__Host-` en HTTPS. |
| `AUTH_SECRET` | 32 octets aléatoires : `openssl rand -base64 32` | Un par environnement. Le changer déconnecte tout le monde (pas de liste de rotation au checkpoint). Socket.IO déchiffre le même cookie avec lui. |
| `AUTH_GITHUB_ID`, `AUTH_GITHUB_SECRET` | application OAuth GitHub de production | GitHub permet une seule URL de callback par application OAuth : une application pour la production, une autre pour le développement local. |
| `AUTH_DISCORD_ID`, `AUTH_DISCORD_SECRET` | application Discord | Une seule application peut lister les deux URL de redirection. |
| `TRUSTED_PROXY_HOPS` | `1` | Le frontal d'Azure ajoute l'adresse du client à `X-Forwarded-For`; seule cette dernière entrée est jugée fiable, celles qu'un client écrit sont ignorées. `0` en local. Garder `1` sauf si un autre proxy (par exemple Front Door) est ajouté : avec `0`, tous les visiteurs partagent l'adresse du frontal, donc 100 connexions échouées suspendent la connexion locale pour tout le monde; avec `2`, l'entrée écrite par un client est jugée fiable et la limite par adresse peut être contournée. |

URL de callback exactes à enregistrer :

| Fournisseur | Production | Local |
|---|---|---|
| GitHub (*Authorization callback URL*) | `https://<default-domain>/api/auth/callback/github` | `http://localhost:3000/api/auth/callback/github` |
| Discord (*OAuth2 → Redirects*) | `https://<default-domain>/api/auth/callback/discord` | `http://localhost:3000/api/auth/callback/discord` |

Permissions : GitHub ne demande **aucun scope** (profil public seulement), Discord seulement `identify`. Aucun courriel n'est demandé, stocké ni journalisé; le nom transmis par le fournisseur sert seulement à initialiser le nom d'affichage d'un nouveau compte.

**Sessions.** Une session dure **24 heures à compter de la connexion**, quelle que soit l'activité : Auth.js réémet son cookie quand `/api/auth/session` est lu (les pages et les actions ne l'écrivent jamais), mais chaque vérification compare aussi l'heure de connexion à la limite de 24 heures, donc le cookie ne peut jamais la prolonger. Il n'y a pas de « se souvenir de moi ». Chaque requête qui porte un cookie de session lit le `session_version` du compte (une requête indexée); les requêtes sans cookie de session, comme Always On et la sonde de vivacité (liveness), ne touchent jamais la base de données. **La déconnexion met fin à toutes les sessions du compte** sur tous les appareils : elle incrémente `session_version` et ferme les sockets du compte. Si la base de données est injoignable, les pages protégées et les sockets refusent la session (fail closed); le cookie reste et fonctionne de nouveau dès que Neon répond. Une déconnexion qui échoue le signale et garde la session. Le `POST /api/auth/signout` intégré d'Auth.js est refusé (405) : il effacerait le cookie même quand la révocation a échoué.

**Limites de fréquence** (en mémoire, une instance, comptées avant toute vérification de mot de passe pour que des tentatives parallèles ne puissent pas passer entre les mailles) : par tranche de 15 minutes, 5 connexions locales échouées par nom d'utilisateur et par adresse, 50 par nom d'utilisateur toutes adresses confondues, 100 échecs et 200 tentatives vérifiées (réussies comprises) par adresse (une classe entière peut partager une seule adresse d'école); au plus 3 vérifications de connexion s'exécutent à la fois, 2 par adresse, pour qu'une seule adresse ne puisse pas monopoliser le serveur; de nombreuses adresses réunies peuvent quand même faire répondre « indisponible » à la connexion locale pendant un moment (environ 14 s par adresse supplémentaire), alors que GitHub et Discord, non touchés, servent de solution de repli. Une panne de base de données ne compte pour rien. Une pause refuse aussi le bon mot de passe. Comme les comptes de démonstration sont publics, un inconnu peut en suspendre un pendant 15 minutes avec 50 échecs depuis diverses adresses : le jour de la démonstration, privilégier GitHub ou Discord, ou garder le second compte de démonstration en réserve. Un redémarrage remet les compteurs à zéro.

**Vérifier les vraies connexions OAuth** (à la main; les tests automatisés s'arrêtent à la page d'autorisation du fournisseur) : en local avec les applications de développement, puis en production après le déploiement — se connecter avec GitHub, se déconnecter, se connecter avec Discord, se déconnecter; vérifier que `/account` affiche un nom d'affichage, que `/api/auth/session` ne renvoie que `user.id` et `expires`, et que Log stream ne montre aucun courriel, jeton ni profil. Annuler une fois sur l'écran de consentement de chaque fournisseur : la page de connexion doit afficher le message traduit qui indique une connexion annulée ou échouée.

## Salles

Les salles par code (CP-06) n'exigent aucune nouvelle variable ni migration. La présence vit dans la mémoire du processus, comme le registre des sessions : une seule instance App Service (ADR-0001); une mise à l'échelle horizontale répartirait les salles entre plusieurs instances.

**Limites** (en mémoire, remises à zéro par un redémarrage) : un socket peut envoyer 5 événements `room:watch` par 10 secondes, un à la fois, et au-delà il est déconnecté; un compte a au plus 2 suivis (watches) en cours sur l'ensemble de ses sockets, pour que ni un socket ni plusieurs sockets d'un même compte ne puissent épuiser le pool de 5 connexions à la base de données. Un compte peut créer, rejoindre ou quitter une salle 10 fois par minute. Les diffusions font une seule lecture à la fois par salle et ignorent les salles que personne ne suit.

**Risques résiduels, acceptés au checkpoint :**

- Deviner des codes (SALLE-10 non réalisée) : un compte connecté peut essayer des codes; les salles privées répondent exactement comme des codes inconnus. Avec 31⁶ codes et une vingtaine de salles ouvertes, tomber sur une salle demande des millions de requêtes.
- Les handshakes des sockets ne sont pas limités par compte (chacun lit `session_version` une fois) : de nombreux comptes, ou un flot de handshakes, partagent quand même l'unique pool de 5 connexions de la seule instance, comme le font les simples requêtes HTTP.
- Les salles fermées et les membres partis restent dans la base de données (pas encore de purge) : environ 700 octets par salle; la limite par compte borne la croissance.
- Un membre qui se déconnecte reste dans la salle, affiché hors ligne, jusqu'à son retour ou au départ de l'hôte (l'expulsion viendra avec SALLE-07).

## Comptes de démonstration

Deux comptes locaux fictifs, listés avec leurs mots de passe dans le [README](../README.md#comptes-de-démonstration), servent aux démonstrations et aux tests Playwright. Leurs mots de passe sont volontairement publics et ne servent nulle part ailleurs; ce ne sont pas des secrets techniques. Le seed (`packages/database/src/identity/demo-accounts.ts`) crée seulement les comptes manquants et ne modifie jamais un compte existant (un compte qui porte un nom d'utilisateur de démonstration avec un mot de passe différent est signalé comme un conflit). Il ne s'exécute jamais au démarrage de l'application.

- En local : `npm run db:seed:demo -w @incision/database` (utilise `DATABASE_URL_UNPOOLED` du `.env`; refuse une base de données distante sans `--remote`).
- CI : l'exécution E2E alimente sa propre base jetable avec le seed.
- **En production, seulement quand je le décide :** Actions → *Seed demo accounts* → *Run workflow* sur `main`, en tapant `seed production demo accounts`. Le workflow exécute la version du dernier déploiement réussi (exécution *Deploy* verte la plus récente, artefacts conservés 30 jours), comme le job migrate, avec `DATABASE_URL_UNPOOLED` de l'environnement `production`, et journalise `created`, `unchanged` ou `conflict` pour chaque nom d'utilisateur. Le lancer après un Deploy vert, jamais pendant qu'un Deploy s'exécute; une confirmation mal tapée fait sauter le job (exécution verte, rien n'est inséré) : vérifier que le job s'est exécuté et a journalisé ses résultats. Le log public d'une exécution en échec peut montrer le nom d'hôte Neon, jamais le mot de passe.

## Première promotion (CP-02 à CP-06 ensemble)

La première promotion `dev` → `main` déploie d'un coup le pipeline, le schéma (migrations `0000` et `0001`), l'authentification, le design et les salles, et il n'existe aucun artefact Deploy antérieur vers lequel revenir. Dans l'ordre :

1. Applications OAuth : les URL de callback de production ci-dessus, sur le domaine par défaut exact.
2. App Service : commande de démarrage et chaque paramètre d'application de [Configuration initiale](#configuration-initiale) et d'[Authentification](#authentification), aucun vide, `AUTH_SECRET` nouvellement généré pour la production.
3. Environnement GitHub `production` : secrets `AZURE_WEBAPP_PUBLISH_PROFILE` et `DATABASE_URL_UNPOOLED`, variable `APP_URL` égale à l'`APP_URL` d'App Service (le smoke test l'utilise comme Origin du socket).
4. Neon : aucune table Incision pour l'instant (`0000` les crée); en option, une branche de sauvegarde.
5. Promouvoir, puis suivre l'exécution : ci (avec E2E) → build → migrate (`2 migration(s) applied`) → deploy → smoke.
6. Si smoke échoue parce que l'application refuse de démarrer (Log stream : `Invalid server environment: <NAME>: …`), définir la variable nommée (l'enregistrement redémarre l'application), puis *Re-run failed jobs* : seul smoke s'exécute de nouveau. Une valeur présente mais erronée (secret OAuth, callback) n'arrête pas l'application : l'étape 7 la détecte.
7. Vraies connexions GitHub et Discord, et une annulation sur chacun, comme dans [Authentification](#authentification).
8. Seed de démonstration seulement sur approbation explicite ([Comptes de démonstration](#comptes-de-démonstration)).

Le Health check sur `/api/health/live` échoue jusqu'à ce premier déploiement : c'est sans conséquence, il ne bloque pas le déploiement zip.

## Vérifier la production

```sh
npm run smoke -w @incision/web -- https://<default-domain> --database up
```

Logs : App Service → Log stream. Deux endpoints, tous deux sans détails internes :

- `/api/health/live` : vivacité (liveness) pour Azure, `status` et `commit`, ne touche jamais la base de données.
- `/api/health` : disponibilité (readiness) pour le smoke test et les humains, ajoute `database` (`up`, `down`, `not_configured`). Neon est interrogé au plus une fois par heure tant qu'il répond, et toutes les 30 s tant qu'il ne répond pas; chaque nouveau déploiement refait la vérification. Il répond 200 tant que le processus tourne, avec `status: "degraded"` sauf si la base de données est `up`.

## Rollback

- **Application, le plus rapide :** dans Actions, ouvrir la dernière exécution *Deploy* réussie d'un bon commit et relancer ses jobs *deploy* et *smoke* : ils redéploient l'artefact de cette exécution. GitHub ne permet de relancer une exécution que pendant 30 jours, ce qui correspond aussi à la durée de conservation des artefacts. Relancer deploy ne relance pas migrate : la base de données reste sur le schéma le plus récent; ne revenir donc qu'à une version dont le code fonctionne encore avec ce schéma (jamais au-delà d'une migration qui a supprimé quelque chose). Ne rien pousser sur `main` avant que le correctif soit arrivé, sinon le mauvais commit est redéployé.
- **Application, toujours possible :** faire un revert du changement fautif sur `dev` (PR), puis promouvoir `dev` vers `main`; le workflow Deploy livre l'arbre après le revert. Ne jamais faire de revert d'un commit qui contient une migration déjà appliquée : faire plutôt évoluer le schéma vers l'avant.
- **Base de données :** les migrations vont seulement vers l'avant et doivent rester compatibles avec la version précédente de l'application (ajouter d'abord, supprimer dans une version ultérieure). Avant une migration risquée, créer une branche Neon à partir de la branche par défaut (nommée `production` dans les projets Neon récents) comme sauvegarde. Neon Free peut aussi restaurer à l'intérieur d'une courte fenêtre d'historique (6 heures au moment d'écrire ces lignes); la vérifier avant de s'y fier.
- **Fuite d'identifiants :** Overview d'App Service → *Reset publish profile*, puis mettre à jour le secret de l'environnement. Renouveler les mots de passe Neon depuis la console Neon et mettre à jour les paramètres d'application.

## Coûts

B2 tourne sur le crédit Azure for Students : consulter Cost Management régulièrement et ne jamais convertir en abonnement payant. Neon reste sur le forfait gratuit : ses heures de calcul sont limitées par mois et, une fois qu'elles sont épuisées, le calcul est suspendu jusqu'à la période suivante; rien ne doit donc interroger la base de données à intervalle fixe (sonde de santé, keep-alive). Surveiller la page d'utilisation.
