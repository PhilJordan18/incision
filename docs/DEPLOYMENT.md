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
| Environment variables → App settings | `APP_URL` (le domaine par défaut en `https://`), `DATABASE_URL` (URL poolée de Neon), `SCM_DO_BUILD_DURING_DEPLOYMENT=false` et, pour l'authentification, `AUTH_URL`, `AUTH_SECRET`, `AUTH_GITHUB_ID`, `AUTH_GITHUB_SECRET`, `AUTH_DISCORD_ID`, `AUTH_DISCORD_SECRET`, `TRUSTED_PROXY_HOPS=1` (voir [Authentification](#authentification)). `RACES_ENABLED` reste absente tant que je n'ouvre pas les courses (voir « Ouvrir ou fermer les courses »). Comme tout App setting, elle survit aux déploiements et aux retours arrière : je vérifie sa valeur avant chaque promotion. L'application ne lit jamais `DATABASE_URL_UNPOOLED` : une fois le secret GitHub ci-dessous en place, le retirer d'App Service. |
| Monitoring → App Service logs | Application logging : File System, rétention courte, pour que Log stream affiche la sortie de l'application |

En production, le processus refuse de démarrer quand l'une de ces variables manque ou est vide, quand `AUTH_URL` diffère de `APP_URL`, quand `AUTH_SECRET` compte moins de 32 caractères, quand `APP_URL` n'est pas en HTTPS (une URL `localhost` est permise pour les builds de production locaux), quand une `DATABASE_URL` distante ne fixe pas `sslmode=verify-full` (ou `require`), ou quand `RACE_FIXTURE_TEXTS=allowed` est posée avec un `APP_URL` qui n'est pas `localhost` (les textes de test ne servent qu'aux builds de test locaux). Utiliser `verify-full` pour Neon. **Définir les variables d'authentification avant de promouvoir CP-04 vers `main`** : sinon la nouvelle version ne démarre pas et le smoke test échoue (la précédente a déjà été remplacée).

App Service fournit `PORT`. App Service sous Linux accepte les WebSockets; le smoke test le prouve à chaque déploiement.

**GitHub** (dépôt → Settings → Environments → `production`) :

- Deployment branches : `main` seulement.
- Secret `AZURE_WEBAPP_PUBLISH_PROFILE` : contenu du profil de publication téléchargé depuis la page Overview d'App Service. Ne jamais commiter ni coller le fichier; le supprimer après `gh secret set ... --env production`. Supprimer ensuite toute copie du secret au niveau du dépôt, que les workflows de n'importe quelle branche pourraient lire.
- Variable `APP_URL` : même valeur que le paramètre d'App Service.
- Secret `DATABASE_URL_UNPOOLED` : URL **directe** de Neon (console Neon → Connect, connection pooling désactivé : le nom d'hôte n'a pas de `-pooler`) avec `sslmode=verify-full`, même base de données et même rôle que l'application, utilisée seulement par l'étape migrate. node-postgres ignore `channel_binding=require` (sans danger, mais cela n'impose rien : c'est le TLS vérifié qui protège) et lit `sslrootcert` comme un chemin de fichier; retirer donc `sslrootcert=system` des exemples libpq. Le définir avant la première promotion qui contient des migrations, en tapant la valeur à l'invite plutôt que sur la ligne de commande : `gh secret set DATABASE_URL_UNPOOLED --env production -R PhilJordan18/incision`. Sans lui, le job migrate échoue et rien n'est déployé (le corriger, puis *Re-run failed jobs*). Le garder **seulement** comme secret de l'environnement `production` : supprimer toute copie au niveau du dépôt, que les workflows de n'importe quelle branche pourraient lire. Une fois que cela fonctionne, retirer `DATABASE_URL_UNPOOLED` d'App Service (cela redémarre l'application).
- Comme migrate et deploy utilisent tous deux l'environnement `production`, chaque exécution enregistre deux déploiements; des approbateurs obligatoires (required reviewers) sur cet environnement exigeraient deux approbations par exécution.

## Activation invitée (#31)

**Procédure à préparer, pas activation effectuée.** Livrer le code et ouvrir le
parcours sont deux opérations distinctes. Toute modification de la recette partagée
ou d'une ressource distante exige l'autorisation de Philippe pour cette cible ;
ne pas exécuter cette procédure sur recette3880, ses données ou ses sauvegardes
pendant la revue. Le [rapport cumulatif](evidence/f01-1ce-guest-realtime/README.md)
identifie le SHA réellement testé et les limites de validation.

| Paramètre serveur | Valeur initiale sûre | Activation explicite |
|---|---|---|
| `GUEST_ENTRY_ENABLED` | absent ou `false` | exactement `true` |
| `GUEST_SESSION_SECRET` | vide dans l'exemple, aucune clé réelle versionnée | clé aléatoire dédiée à cet environnement, distincte d'`AUTH_SECRET`, 32 à 1 024 octets |

La clé se configure dans le mécanisme privé de l'environnement cible (App settings
pour App Service), jamais dans le build client, `NEXT_PUBLIC_`, une capture, un log
ou le dépôt. La générer séparément ; ne pas réutiliser les valeurs éphémères des
E2E. Une clé absente/invalide ne rend pas les invités utilisables même avec le flag
ouvert. Changer la clé invalide la vérification des anciens cookies : ne pas la
renouveler à chaque déploiement. Le flag et la clé ne sont pas automatiquement
provisionnés par cette livraison ; les App settings survivent aux déploiements et
retours arrière.

Après autorisation de l'environnement cible :

1. Vérifier la version livrée, ses migrations publiées et les prérequis habituels
   (base, serveur personnalisé/Socket.IO, `APP_URL` et `AUTH_URL` cohérents, HTTPS,
   proxys de confiance). Ne pas réappliquer d'anciennes migrations cloud. Ce dernier
   raccordement ne demande aucune migration nouvelle.
2. Provisionner la clé dédiée de manière privée, puis fixer explicitement
   `GUEST_ENTRY_ENABLED=true` et redémarrer le processus avec ces paramètres.
   L'enregistrement d'App settings redémarre App Service ; prévoir l'interruption
   des courses et la perte des résultats temporaires en mémoire.
3. Vérifier `/guest`, l'admission par code dans une salle existante, deux onglets,
   refus de pseudo occupé, reconnexion, départ puis connexion à un compte sans
   transfert de résultats. Pour la course complète, conserver ses propres
   prérequis : `RACES_ENABLED=true` et corpus compatible. Ne jamais activer
   `RACE_FIXTURE_TEXTS` sur la cible distante.
4. Vérifier FR/EN, Aube/Abysse, clavier et navigateurs cibles. Le navigateur invité
   doit fournir JavaScript et Web Locks en contexte sécurisé ; leur absence ferme
   l'entrée explicitement. Un health check vert ne prouve pas ce parcours.

Pour refermer l'entrée, retirer le flag ou le fixer à `false` puis faire prendre
la configuration au processus. Cela masque le lien, ferme `/guest`, refuse les
actions d'admission/réinitialisation et le rendu invité des salles. **Ce n'est pas
un arrêt global des API d'identité ni une révocation de toutes les sessions/sockets** ;
ne pas le présenter comme un coupe-circuit de sécurité ou une purge des données.

L'activité de frappe acceptée est maintenue en mémoire et persistée par lots
(intervalle de 60 secondes), avec son horodatage d'acceptation + 24 h, jamais celui
du flush. L'arrêt normal tente de vider les écritures en attente ; un arrêt brutal
peut perdre l'activité depuis le dernier checkpoint. Les pauses du processus ou
les délais SQL ne permettent pas de promettre une fenêtre de perte strictement
limitée à 60 secondes. Après redémarrage, l'échéance SQL fait autorité ; une panne
de persistance coupe les sockets invités concernés. Le rafraîchissement du cookie
peut lire l'échéance acceptée en mémoire après validation SQL du justificatif,
sans créer d'activité. Ce fonctionnement suppose le runtime à instance unique ;
les mutations de présence utilisent une barrière locale, pas un protocole de
révocation distribué.

Les résultats invités temporaires sont locaux au processus et peuvent disparaître
au redémarrage ; aucun stockage distribué n'est ajouté. Une réponse de
synchronisation perdue peut raccourcir la durée du cookie par rapport à SQL. Une
panne ou un retard de traitement peut retarder la purge physique, sans prolonger
les droits expirés. La procédure et les tests isolés de [SETUP.md](SETUP.md#3-ter-activer-explicitement-le-parcours-invité-31)
ne constituent pas une preuve de recette ou de déploiement.

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
- cas du « trou noir », où la fermeture du client n'arrive jamais : une transaction bornée est terminée par la limite d'inactivité, en 4 s environ. Sans les limites, ses verrous restent tenus au moins le temps observé (7 s), en pratique jusqu'à ce que TCP abandonne la connexion (de l'ordre du quart d'heure, voire de deux heures avec les réglages par défaut du système), car PgBouncer n'y met pas fin avec ses réglages par défaut.

Ce montage s'approche du pooler de Neon sans l'être. Neon ne publie qu'une partie de sa configuration. Surtout, l'application ne s'y connecte pas directement à PgBouncer : l'hôte `-pooler` mène au proxy de Neon, qui reçoit en premier la fermeture d'une connexion, ou sa perte. Seule une vérification sur une branche Neon confirmerait son comportement exact.

```bash
docker compose -f packages/database/test/pgbouncer/compose.yaml up -d --wait
```

```bash
PGBOUNCER_TEST_URL=postgresql://incision_pgb:pgbouncer_test_only@localhost:6451/incision_pgb PGBOUNCER_DIRECT_URL=postgresql://incision_pgb:pgbouncer_test_only@localhost:5451/incision_pgb npm run test:db -w @incision/database -- test/pgbouncer.db.test.ts
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
| `TRUSTED_PROXY_HOPS` | `1` | Le frontal d'Azure ajoute l'adresse du client à `X-Forwarded-For`; seule cette dernière entrée est jugée fiable, celles qu'un client écrit sont ignorées. Les limites de connexion et de codes de salle en dépendent. `0` en local. Les tests E2E tournent avec `1` : les requêtes sans `X-Forwarded-For` gardent l'adresse TCP (le bouclage), et seule `e2e/code-limit.spec.ts` passe par un proxy de test qui joue le frontal. Garder `1` sauf si un autre proxy (par exemple Front Door) est ajouté : avec `0`, tous les visiteurs partagent l'adresse du frontal, donc 100 connexions échouées suspendent la connexion locale pour tout le monde, et 10 codes de salle ratés en une minute bloquent la recherche par code pour tout le monde; avec `2`, l'entrée écrite par un client est jugée fiable et la limite par adresse peut être contournée. |

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

Les salles par code (CP-06) n'exigent aucune nouvelle variable; leurs réglages arrivent avec les migrations `0006` et `0007` (ci-dessous). La présence vit dans la mémoire du processus, comme le registre des sessions : une seule instance App Service (ADR-0001); une mise à l'échelle horizontale répartirait les salles entre plusieurs instances.

**Limites** (en mémoire, remises à zéro par un redémarrage) : un socket peut envoyer 5 événements `room:watch` par 10 secondes, un à la fois, et au-delà il est déconnecté; un compte a au plus 2 suivis (watches) en cours sur l'ensemble de ses sockets, pour que ni un socket ni plusieurs sockets d'un même compte ne puissent épuiser le pool de 5 connexions à la base de données. Un compte peut créer, rejoindre ou quitter une salle 10 fois par minute; il peut enregistrer les réglages de sa salle 30 fois par minute, sur un budget distinct, pour qu'ajuster les réglages ne l'empêche jamais de quitter ou de fermer la salle. Une adresse peut faire au plus 10 essais de code ratés (code inconnu, salle privée ou fermée) par minute glissante; les admissions et les codes valides ne comptent pas. Les recherches par code passent par une file : au plus 1 à la fois par adresse et 2 pour tout le serveur, 30 demandes en attente par adresse et 100 au total, 5 s d'attente au plus; 10 000 adresses retenues au plus. Les diffusions font une seule lecture à la fois par salle et ignorent les salles que personne ne suit.

**Réglages des salles (F-03.1a, migrations `0006_lobby_settings` et `0007_lobby_settings_backfill`).** Aucune nouvelle variable. `0006` crée la table `lobby_settings` (une ligne par salle : révision, langue du texte, limite de temps, mode d'erreur); `0007`, une migration personnalisée appliquée dans la même transaction du migrateur, écrit une ligne pour chaque salle existante : français, 120 s et correction obligatoire. Le français est la langue par défaut du site : la langue de l'hôte de ces salles n'a jamais été enregistrée (leurs courses tiraient jusque-là le texte dans la langue de l'onglet de l'hôte); les 120 s et la correction obligatoire sont ceux de la première course. Ces migrations sont additives : la version en cours d'exécution ignore la table. Pendant le chevauchement de deux processus, une salle créée par l'ancien n'a pas de ligne : le nouveau la lit comme une salle neuve en français (révision 0) jusqu'au premier enregistrement de son hôte, qui crée la ligne.

Une salle neuve prend la langue d'interface de son créateur, 120 s et la correction obligatoire. **Ces 120 s sont provisoires** : D-19 prévoit aucune limite, qui attend la carte qui lève la restriction de CONF-01; son prérequis D-17 est en place (#168, COURSE-09). L'action qui enregistre les réglages de l'hôte (`configureRoomAction`) n'est appelée par aucune page avant F-03.1b : Next ne publie une action serveur qu'une fois référencée par une page ou un composant. Jusque-là, chaque salle garde en production les réglages de sa création. Ensuite, et jusqu'à cette carte, l'hôte ne pourra choisir qu'une limite de 30 à 120 s, avec la correction obligatoire; « aucune » est refusée, jamais remplacée par une autre limite. Un départ avec des réglages que le serveur ne lance pas encore (impossibles à enregistrer par l'action) est refusé et journalisé : `[races] start refused: room <id> has settings races do not run yet`. Un départ dont les réglages changent pendant chacun de ses deux tirages est refusé : `[races] start refused: the room settings changed during each draw`.

Revenir à une version d'avant F-03.1a se fait en redéployant l'artefact précédent ([Rollback](#rollback)), sans toucher à la base : cet artefact ignore la table, et ses courses reprennent la langue de l'onglet de l'hôte, 120 s et la correction obligatoire; les réglages enregistrés reviennent avec la version suivante. Si le code doit être annulé par un revert, le SQL, les snapshots et les entrées de journal de `0006` et `0007` restent dans le dépôt, ainsi que leur déclaration dans le schéma Drizzle (`lobbySettings` et ses deux enums, sans quoi la vérification de dérive de la CI demanderait de générer des `DROP`) : ces migrations sont appliquées, et sans elles la migration générée ensuite ferait échouer la vérification du journal (historiques divergents). Restaurer la base de données à un état antérieur à `0006` exige au contraire de redéployer un artefact antérieur à F-03.1a : son code lit `lobby_settings` à chaque snapshot de salle.

**Risques résiduels, acceptés au checkpoint :**

- Limite des codes (SALLE-10) :
  - Un seul budget par adresse, risque accepté pour l'instant : une classe derrière l'adresse de son école le partage. Dix codes ratés en une minute, par des fautes de frappe ou par un seul élève, bloquent la recherche par code pour toute la classe pendant au plus une minute; chacun garde l'accès à sa propre salle.
  - Les recherches par code d'une même adresse passent une à la fois, avec 5 s d'attente au plus, et au plus 30 attendent : au-delà d'environ 31 demandes simultanées, les suivantes reçoivent « Trop de demandes » tout de suite. En local, 30 comptes qui cliquent en même temps depuis la même adresse sont tous admis (test E2E); le temps d'une admission en production reste à mesurer (5 s d'attente gardées en attendant cette mesure). Si une classe entière arrive en même temps et que chaque admission est lente (base de données éloignée ou qui se réveille), les derniers élèves peuvent recevoir « Trop de demandes »; ils réessaient, sans rien dépenser du budget ni de leurs changements de salle.
  - Les codes valides ne dépensent rien : quelques adresses qui rouvrent sans arrêt la page d'une salle ouverte peuvent remplir la file commune (2 recherches en cours, 100 en attente), et les autres reçoivent « Trop de demandes » pendant ce temps. Ce n'est pas plus coûteux qu'un simple flot de requêtes, qui occupait déjà le pool avant cette limite : cette limite n'est pas une protection complète contre le déni de service.
  - Dix mille adresses actives à la fois remplissent la mémoire de la limite : une nouvelle adresse reçoit alors « Trop de demandes » plutôt que d'être admise sans contrôle.
  - Les compteurs vivent dans la mémoire du processus : un redémarrage ou un déploiement les remet à zéro, et deux processus qui se chevauchent un instant ont chacun leur budget.
  - L'adresse dépend du format de `X-Forwarded-For` derrière Azure, que les tests reproduisent sans le prouver : voir la vérification à deux réseaux ci-dessous.
- Les handshakes des sockets ne sont pas limités par compte (chacun lit `session_version` une fois) : de nombreux comptes, ou un flot de handshakes, partagent quand même l'unique pool de 5 connexions de la seule instance, comme le font les simples requêtes HTTP. Pendant une panne de la base, chaque page ouverte retente son handshake (refusé `UNAVAILABLE`) après 1, 2, 5 puis toutes les 10 s, à ±50 % près pour que les pages d'une classe ne frappent pas ensemble.
- Les salles fermées et les membres partis restent dans la base de données (pas encore de purge) : environ 700 octets par salle; la limite par compte borne la croissance.
- Un membre qui se déconnecte reste dans la salle, affiché hors ligne, jusqu'à son retour ou au départ de l'hôte (l'expulsion viendra avec SALLE-07).

## Courses

La première course (F-04.0, migrations `0002_races` et `0003_engine_error`, puis `0004_race_corpus` pour le corpus, qui arrivent ensemble en production) n'exige aucune nouvelle variable pour démarrer : sans `RACES_ENABLED`, elle arrive départs fermés, et `RACES_ENABLED=true` les ouvre ensuite. Depuis F-02.3b, une course exige aussi une version du corpus importée dans la base de production ([Corpus de textes](#corpus-de-textes-f-023a)).

**Ouvrir ou fermer les courses (`RACES_ENABLED`).** Seule la valeur exacte `true` permet de lancer une nouvelle course. Absente, `false` ou toute autre valeur : le serveur refuse chaque départ avant la base de données (« Les courses sont temporairement fermées sur ce site. »), pour toutes les salles et toutes les manches, mais l'application démarre normalement et les salles, les départs des membres et les résultats déjà enregistrés restent accessibles. Une valeur invalide donne un avertissement au démarrage, sans la montrer. Le Log stream dit l'état au démarrage, par l'une de ces trois lignes exactement :

- `[races] RACES_ENABLED=true: new races may start` (ouvertes) ;
- `[races] new races are closed (RACES_ENABLED is not "true"); rooms and stored results stay available` (fermées) ;
- `[races] RACES_ENABLED has an invalid value; only "true" opens races: new races are closed` (fermées, avertissement sur la sortie d'erreur).

Cette variable n'ouvre que les départs : elle ne choisit jamais les textes, et les textes de test restent refusés sur l'App Service. Son état n'apparaît ni dans `/api/health` ni dans le smoke test. **Changer cette variable dans Azure redémarre l'application** : le site est indisponible quelques instants et les sockets se reconnectent ; les courses en cours s'arrêtent comme à tout redémarrage (D-06) : des résultats déjà figés sont enregistrés si possible, sinon la course est interrompue (`server_stopped` à l'arrêt, ou `owner_lost` quand le processus suivant la trouve à l'expiration de son bail, au démarrage ou à l'ouverture de la salle) ; aucune ne continue. Ce n'est donc pas un arrêt instantané et sans coupure. Ouvrir après une période fermée n'interrompt rien, puisqu'aucune course ne peut alors tourner. La prochaine promotion se fait départs fermés ; je les ouvre ensuite explicitement, après ma recette fonctionnelle et le contrôle de fermeture en production.

**Textes de course (F-02.3b).** Chaque course tire son texte de la version active du corpus ([Corpus de textes](#corpus-de-textes-f-023a)). Le moteur (`generateRaceText`) choisit un passage retenu dans la langue du texte et le coupe selon les réglages par défaut de D-19 : cohérent, 50 mots, complexité moyenne, ponctuation, majuscules et accents, sans nombres. Chaque départ tire sa propre graine (`crypto`). La langue du texte est un réglage de la salle, distinct de l'interface (CONF-02, F-03.1a) : le départ la lit dans la salle, puis la fige avec la course. La limite de temps vient aussi de la salle (30 à 120 s pour l'instant), et la correction reste obligatoire ([Réglages des salles](#salles)). Le navigateur ne reçoit que le texte coupé de sa course, au début du décompte, jamais le corpus.

- **Ce que la course garde.** Le texte exact tapé (`text_snapshot`) et, dans `races.config_snapshot`, la langue (`language`), l'identifiant du passage (`text`), la version du corpus (`corpusVersion`), les réglages (`textSettings`) et les versions du générateur (`textVersions`). La source, l'auteur et la licence se lisent dans `race_passages` par l'identifiant du passage.
- **Lecture du corpus.** Le serveur lit la version active une fois par processus, au démarrage, sans retarder le serveur. Il vérifie ses empreintes et la garde en mémoire. Le Log stream le dit : `[races] race texts: drawn from the active corpus (D-19: coherent, 50 words, medium)`, puis `[races] corpus <version>: <n> fr, <n> en selectable passages`. **Une version importée plus tard ne sert qu'après un redémarrage de l'application.** Pendant le chevauchement de deux processus (déploiement, ou redémarrage après un import), chacun tire de sa propre version et l'enregistre avec la course ; les passages ne sont jamais supprimés, donc les courses enregistrées restent cohérentes. Tant qu'aucune version n'est active, le serveur l'écrit une fois (`[races] corpus: no active version, starts refused until one is imported (docs/DEPLOYMENT.md)`), et un départ relit la base, au plus une fois toutes les 10 s : la première version importée sert alors sans redémarrage, au plus 10 s après l'import. Une lecture en échec (`[races] corpus: load failed, starts refused until it loads: …`, écrite une fois tant que la même erreur se répète) refuse les départs ; elle est retentée par un départ suivant, au plus une fois toutes les 10 s. Ce délai borne ce que des départs peuvent faire lire à la base; depuis F-03.1a, seul l'hôte d'une salle en attente va jusqu'au tirage.
- **Refus.** Sans version active, ou quand aucun passage retenu ne sert les réglages dans la langue du texte, le départ est refusé avant toute écriture (`NO_COMPATIBLE_PASSAGE`). Aucune course n'est écrite et la salle reste en attente. Une lecture en échec donne le refus habituel (`UNAVAILABLE`). Il n'y a jamais de repli sur un texte d'une autre langue ni sur les textes de test.
- **Textes de test.** `RACE_FIXTURE_TEXTS=allowed` remplace le corpus par deux courts textes de test, qui commencent par « Texte de test : » ou « Test text: ». Seuls les builds de production locaux (E2E, intégration) passent cette variable, et le serveur l'annonce par `[races] RACE_FIXTURE_TEXTS=allowed: races run the test fixture texts, not the corpus`. Je ne pose jamais cette variable sur l'App Service *incision* : avec son `APP_URL` en `https://`, le processus refuserait de démarrer ; toute autre valeur que `allowed` l'empêche aussi.
- Les deux passages de la première course (F-04.0, Verne et Stevenson) ne sont plus dans le code (`race-texts.ts`) : la première version importée doit les contenir, avec leur source et le texte que les courses enregistrées ont tapé, sinon l'import est refusé ; une fois en base, une version suivante peut les omettre (ils sont alors retirés, jamais supprimés). Les courses déjà enregistrées gardent leur identifiant et leur texte.

Une course vit dans la mémoire du processus qui l'a lancée; chaque course enregistre ce processus et un bail de 30 s sur l'horloge de la base de données ([ADR-0004](adr/0004-race-ownership-lease.md)). Pendant une course, le processus renouvelle ce bail toutes les 10 s (une petite transaction), et toutes les 2 s tant qu'un renouvellement échoue, pendant une minute au plus; sans course, rien n'interroge la base de données périodiquement.

**Arrêt (SIGTERM).** Le processus refuse les nouveaux départs, puis termine chacune de ses courses en 5 s au plus : des résultats déjà figés ont une tentative d'enregistrement; sinon la course est interrompue (`server_stopped`); une course dont les résultats sont enregistrés n'est jamais interrompue. Il laisse ensuite 2 s aux diffusions vers les salles, ferme les sockets et sort; il sort de force après 10 s. Je suppose qu'App Service laisse au moins ces 10 s entre SIGTERM et l'arrêt forcé (environ 30 s selon des réponses publiques de Microsoft, pas la documentation officielle). À confirmer dans le Log stream après un redémarrage : `[server] SIGTERM received, closing`, puis `[races] stopped: …` s'il y avait une course. Sans ces lignes, le signal n'atteint pas node à travers la commande de démarrage, et chaque redémarrage laisse ses courses à leur bail (`owner_lost`). Si l'arrêt forcé vient plus tôt, ou si la base de données ne répond pas, les courses restent à leur bail : le processus suivant les interrompt (`owner_lost`) au démarrage, ou quand un membre rouvre la salle. Quand un processus arrête une course sans fin confirmée (bail perdu, base injoignable pendant l'enregistrement), il regarde la salle, tant que quelqu'un la suit, jusqu'à ce que la base tienne cette fin : à la fin du bail, puis environ toutes les 5 s tant que la base ne répond pas, 24 fois au plus pour chaque course ainsi arrêtée; les pages ouvertes reçoivent alors l'état de la base sans recharger (`[races] recovery on watch failed: …` à chaque essai manqué).

**Limites des courses** (en mémoire) : au plus 10 lots de frappe par seconde et par joueur (tous ses onglets ensemble), un seul onglet qui tape par coureur, 5 départs par 10 secondes par socket et par compte, 3 demandes de prise de main par 10 secondes par socket et 5 par compte, 5 « Je suis là » ou abandons par 10 secondes par socket et par compte. Socket.IO envoie un ping toutes les 10 s et coupe une connexion restée muette 5 s de plus : une coupure réseau silencieuse est vue en 15 s environ, et le délai de reprise de 30 s d'un coureur part de là (D-06). En contrepartie, une connexion muette plus de 5 s (réseau instable, onglet suspendu par un téléphone) est coupée et se reconnecte : surveiller dans le Log stream le nombre de déconnexions « ping timeout » après la mise en production. Un message entrant Socket.IO de plus de 32 Ko coupe la connexion : un lot légitime fait quelques Ko, et le plus gros lot que le schéma accepte (caractères de 3 octets) environ 29 Ko.

**Au démarrage**, le processus lance une seule transaction de reprise, sans retarder le serveur : elle interrompt, sans résultat, les courses dont le bail a expiré (un processus précédent arrêté pendant une course) et remet leur salle en attente. Une course dont le bail court encore, par exemple pendant le chevauchement de deux processus lors d'un déploiement, n'est jamais interrompue. La reprise n'attend jamais une salle ou une course qu'une autre transaction tient : elle la laisse pour plus tard. Si la base de données ne répond pas, ou si des courses restent pour plus tard, elle réessaie après 5, 15 puis 45 s, puis abandonne. Chaque démarrage du processus réveille donc Neon une fois; sans course en cours, rien d'autre n'interroge la base de données périodiquement.

**Log stream** : une ligne `[races] boot recovery: … left for later` à chaque tentative, même quand il n'y a rien à reprendre; `[races] boot recovery failed: …, retrying` ou `…, giving up` en cas d'échec. Pendant les courses, notamment : `[races] stopped: n finalised, n interrupted, n left to their lease` à l'arrêt (s'il y avait au moins une course); `[races] lease renewal of <course> failed: …` au premier renouvellement manqué; `[races] ownership of <course> lost: …` quand un processus perd une course; `[races] write for <course> failed (attempt n): …` pour une écriture retentée; `[races] neither the results nor the interruption of <course> could be confirmed`; `[races] the engine failed on <course>: …` (course interrompue avec `engine_error`); `[races] start failed: …`; `[races] recovery on watch failed: …`. L'erreur y est décrite brièvement : le code SQL et les noms de contrainte ou de table, ou le message d'une erreur de connexion, qui peut nommer l'hôte ou le rôle Neon; jamais l'URL de connexion, les paramètres de la requête, un nom d'affichage ni le texte de la course.

**Restaurer la base de données** à un état antérieur à `0002` exige aussi de redéployer un artefact antérieur à `0002` : le code de cette version lit la nouvelle colonne `lobbies.current_race_id`, et quitter une salle échouerait. Un état entre `0002` et `0003` n'existe pas en production (les deux arrivent ensemble); s'il existait, une interruption `engine_error` y serait refusée et la course reviendrait à son bail.

**Retour à une version sans courses** (l'artefact de production d'avant F-04.0) : le schéma reste en `0003`, que cette version supporte. Les courses en cours au moment du retour sont interrompues (`server_stopped`) si SIGTERM arrive à temps; sinon leur salle reste en décompte ou en course, sans rien pour la reprendre, car l'ancienne version n'a ni reprise au démarrage ni reprise à l'ouverture. Les nouveaux membres y sont refusés (SALLE-09), les membres peuvent partir, et le départ de l'hôte ferme la salle. Une salle restée aux résultats ne revient pas en attente, sauf par sa fermeture. La version suivante avec courses interrompt ces courses au démarrage (`owner_lost`), sans inventer de résultat (D-06).

## Comptes de démonstration

Deux comptes locaux fictifs, listés avec leurs mots de passe dans le [README](../README.md#comptes-de-démonstration), servent aux démonstrations et aux tests Playwright. Leurs mots de passe sont volontairement publics et ne servent nulle part ailleurs; ce ne sont pas des secrets techniques. Le seed (`packages/database/src/identity/demo-accounts.ts`) crée seulement les comptes manquants et ne modifie jamais un compte existant (un compte qui porte un nom d'utilisateur de démonstration avec un mot de passe différent est signalé comme un conflit). Il ne s'exécute jamais au démarrage de l'application.

- En local : `npm run db:seed:demo -w @incision/database` (utilise `DATABASE_URL_UNPOOLED` du `.env`; refuse une base de données distante sans `--remote`).
- CI : l'exécution E2E alimente sa propre base jetable avec le seed.
- **En production, seulement quand je le décide :** Actions → *Seed demo accounts* → *Run workflow* sur `main`, en tapant `seed production demo accounts`. Le workflow exécute la version du dernier déploiement réussi (exécution *Deploy* verte la plus récente, artefacts conservés 30 jours), comme le job migrate, avec `DATABASE_URL_UNPOOLED` de l'environnement `production`, et journalise `created`, `unchanged` ou `conflict` pour chaque nom d'utilisateur. Le lancer après un Deploy vert, jamais pendant qu'un Deploy s'exécute; une confirmation mal tapée fait sauter le job (exécution verte, rien n'est inséré) : vérifier que le job s'est exécuté et a journalisé ses résultats. Le log public d'une exécution en échec peut montrer le nom d'hôte Neon, jamais le mot de passe.

## Corpus de textes (F-02.3a)

Le corpus du mode cohérent (CONF-03, D-21) est stocké dans PostgreSQL, en trois tables ajoutées par la migration `0004_race_corpus` (détail dans [data-model.md](architecture/data-model.md#delivered-schema)) :

- les **versions** du corpus ;
- les **passages**, réduits à leur identité : langue, texte tapé, version de normalisation, texte source exact, source et adaptations ;
- ce que **chaque version dit de chaque passage** : retenu (tiré au sort) ou en réserve, étiquette de complexité, mesures, note éditoriale et dates de contrôle.

Une nouvelle mesure ou une nouvelle vérification fait donc une nouvelle version du même passage ; un autre texte, une autre source ou une nouvelle version de normalisation fait un autre passage, sous un nouvel identifiant (ma décision du 21 octobre). Les passages déjà enregistrés restent, et les courses gardent les leurs. Ces tables n'acceptent que des ajouts : un identifiant ou une version ne désigne jamais un autre contenu, et rien n'est modifié, supprimé ni vidé (`TRUNCATE`). Seul l'indicateur `active` d'une version change, et une seule version est active à la fois.

- **Entrée de l'import :** `packages/database/corpus/<version>/fr.json` et `en.json`, écrits par la session B, avec le registre de la version (`registre.md` : sources, adaptations, réserves, cas remontés et décisions), qui remplace la page de revue (sélection déléguée, D-21). Un seul auteur par fichier. Chaque version est acceptée par moi avant tout import en production. Le format est défini par `packages/database/src/corpus/format.ts` ; `packages/database/test/fixtures/corpus-contract/` en donne un exemple. Chaque fichier est un fichier ordinaire (ni lien ni périphérique), écrit exactement comme `JSON.stringify(valeur, null, 2)` suivi d'un saut de ligne, ce qui refuse une clé en double, et pèse au plus 4 Mo. L'application n'importe jamais ces fichiers, et l'archive de version ne les contient pas : `scripts/package-release.sh` ne copie que `src`, `drizzle` et `scripts` de chaque paquet. Le futur import en production recevra ces données séparément.
- **Contrôles avant toute écriture** (`packages/database/src/corpus/check.ts`) :
  - format strict (Zod) : champ inconnu refusé ; licence, révision ou numéro d'eBook ; dates ; URL en https qui s'analyse, gardée telle quelle ;
  - chaînes prises telles quelles, jamais rognées ; refusées si elles ont des espaces en bordure, des caractères de contrôle (sauf les sauts de ligne et tabulations du texte source), des caractères invisibles de mise en forme (direction, largeur nulle, BOM, trait d'union conditionnel) ou des demi-paires de substitution ;
  - texte tapé égal à `normalizePassage(sourceText)` en version 2, et d'au plus `MAX_PASSAGE_LENGTH` caractères ;
  - nombre de mots compté selon D-10, au moins 10 ; identifiants uniques ;
  - mesures M1 à M4 fournies par B, non recalculées, finies et bornées : M1 entre 0 exclu et 8 lettres par mot ; M2 et M3 en pourcentage ; M4 entre 0 et 100 pour 100 mots ;
  - provenance des mesures (`measuredWith`) identique dans toute la version, prise avec la même version de normalisation que le corpus ;
  - l'étiquette de complexité reste éditoriale ;
  - pour chaque langue, au moins un passage retenu doit servir les réglages par défaut de D-19 (cohérent, 50 mots, moyen, ponctuation, majuscules et accents, sans nombres) : le moteur en tire réellement un texte. Sinon, refus explicite ; jamais de repli sur des textes de test.
  - Un refus nomme le fichier et, s'il y en a un, le passage fautif (seulement par un identifiant bien formé) ; le script l'affiche en JSON, pour qu'aucun caractère de contrôle d'un fichier n'atteigne le terminal.
- **Import atomique** (`packages/database/src/corpus/import.ts`) :
  - La version, ses passages, ce qu'elle en dit et l'activation sont écrits dans une seule transaction en READ COMMITTED, ou rien ne l'est ; la version active avant reste alors active.
  - Deux imports simultanés passent l'un après l'autre (verrou consultatif). La même version deux fois donne un import et un import sans effet ; deux versions différentes donnent deux imports complets, dans l'ordre, jamais un mélange, et la dernière importée est active.
  - Réimporter une version identique est sans effet et ne la réactive jamais : pour revenir en arrière, il faut importer une nouvelle version.
  - Une version ou un passage déjà enregistré avec un autre contenu est refusé.
  - Les deux passages de livraison de F-04.0 (Verne, Stevenson) et tout passage que nomment des courses enregistrées doivent être dans la version ou déjà en base ; un passage importé pour la première fois sous un identifiant que nomment des courses doit être le texte qu'elles ont tapé.
- **Retrait :** un passage absent de la version active n'est plus tiré, après le redémarrage qui suit l'import, mais il reste en base tel quel ; les courses enregistrées gardent leur texte (`text_snapshot`) et l'identifiant de leur passage.
- **Lecture de la version active** (`load.ts`, lue par le serveur depuis F-02.3b) : les empreintes des passages et la somme de contrôle de la version sont recalculées depuis la base ; un écart (une ligne ajoutée hors import, une donnée changée déclencheurs désactivés) fait échouer la lecture au lieu de servir le passage. Ce sont des contrôles d'intégrité sans clé, pas une preuve d'origine : avant l'import en production, le rôle de l'application devra n'avoir que la lecture sur ces tables, l'import passant par un autre rôle. Ce sont des actions Neon, cadrées avec l'import en production et autorisées une par une.
- **En local :** `npm run db:import:corpus -w @incision/database -- --version <version>` (avec `--folder <dossier>` pour un autre dossier que `corpus/`) importe dans la base de `DATABASE_URL_UNPOOLED` du `.env` et refuse toute base distante. Cette garde évite une erreur ; ce n'est pas une frontière de sécurité (un tunnel vers localhost passerait). Le script affiche le résultat : importée ou inchangée, active ou non, passages retenus et en réserve par langue, passages qui servent les réglages par défaut, nouveaux, conservés et retirés. La fixture du contrat ne s'importe que dans des bases de test jetables.
- **Contrôle de fuite :** après `npm run build`, `npm run db:check-corpus-leak -w @incision/database` vérifie qu'aucun passage n'apparaît dans le build (tout `.next` sauf son cache) ni dans `public/`. Un passage sans morceau ASCII assez long pour être cherché fait échouer le contrôle. Avec `--archive <zip>`, il vérifie aussi que l'archive de version ne contient ni le corpus ni les fichiers de test, ni aucun passage dans son `.next`, son `public/` et les sources qu'elle embarque (`packages/*/src`, `apps/web/src`). Aucune exception depuis F-02.3b : le serveur tire chaque texte de la base, et aucune source ne contient de passage. Contrôle local, hors CI pour l'instant.
- **Pas encore automatisé, cadré à part :** l'import en production (un workflow manuel sur approbation, qui recevrait les fichiers séparément de l'archive) et tout changement des fichiers de CI partagés. Aucun import distant sans mon autorisation explicite, version par version.
- **Ordre en production :** migrate (`0004`), puis import de la version acceptée, puis démarrage ou redémarrage de l'application (elle lit la version active au démarrage), puis ouverture des courses. **Tant que l'import en production n'existe pas, une promotion qui contient F-02.3b laisse tout départ refusé en production** (`NO_COMPATIBLE_PASSAGE`), même avec `RACES_ENABLED=true`. Une nouvelle version suit le même ordre : import, puis redémarrage.
- **Recalcul des mesures plus tard :** la liste de mots revue (#42) ne suffit pas. Il faudra les mêmes entrées que B : les fréquences wordfreq françaises et anglaises en version 3.1.1 (`wordfreq-3.1.1-large`), le seuil Zipf des mots courants (4), le nombre de mots mesurés (`MEASURED_WORDS`, 200, consigné dans `measuredWith`) et la version de normalisation, versionnés et disponibles pour l'import, plus une tolérance convenue avec B.

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

**Après la promotion qui livre la limite des codes (SALLE-10)**, vérifier à la main, depuis deux réseaux :

1. Réseau A (par exemple un téléphone en données cellulaires), connecté : ouvrir 10 codes de salle inconnus; le onzième affiche « Trop d'essais ».
2. Depuis le réseau A encore, la même requête avec des en-têtes `X-Forwarded-For` et `x-incision-client-address` inventés reste refusée.
3. Un second appareil sur le réseau A, connecté avec l'autre compte de démonstration : un code inconnu affiche aussi « Trop d'essais » (le budget est partagé par le réseau).
4. Réseau B (par exemple le Wi-Fi de la maison) : un code inconnu affiche toujours « Code introuvable ».

Si le réseau B est bloqué par les échecs du réseau A, toutes les requêtes partagent une seule adresse : redéployer l'artefact précédent (section Rollback, aucune migration en jeu) et corriger le nombre de proxys de confiance. Si, à l'étape 2, la requête aux en-têtes inventés n'est plus refusée, des en-têtes écrits par le client changent l'adresse comptée et la limite se contourne : corriger `TRUSTED_PROXY_HOPS` dans les paramètres d'App Service; un rollback n'y change rien.

**Promotion qui livre la première course : prérequis, départs fermés, import, puis ouverture.** La validation des textes (étape 1) est notée dans la PR de promotion `dev` → `main`.

Prérequis avant d'ouvrir les courses en production, chacun sur mon autorisation :

- la version du corpus à importer est acceptée, avec la provenance, les conditions de réutilisation et les critères éditoriaux de ses passages (son registre) ;
- l'import en production existe (carte à part, pas encore cadrée) ;
- les rôles Neon sont séparés : l'application ne fait que lire les tables du corpus, et l'import et les migrations passent par un autre rôle. Aujourd'hui, `DATABASE_URL_UNPOOLED` (migrate) utilise le même rôle que l'application, propriétaire des tables. La séparation demande donc un rôle de plus, un changement de secret et plusieurs actions Neon.

Promouvoir avant ces prérequis est sans danger : les courses arrivent fermées. Ouvertes sans corpus, chaque départ serait refusé (`NO_COMPATIBLE_PASSAGE`) sans rien écrire. La recette des courses en production attend alors l'import. Le health check et le smoke test restent verts dans les deux cas, car ils ne lisent pas le corpus.

1. Avant la promotion : `RACE_FIXTURE_TEXTS` et `RACES_ENABLED` sont absentes des App settings.
2. Promouvoir. Le job migrate applique les migrations jusqu'à `0004`.
3. Le Log stream (ouvert avant le déploiement : ces lignes ne s'écrivent qu'au démarrage) montre `[races] race texts: drawn from the active corpus (D-19: coherent, 50 words, medium)`, `[races] corpus: no active version, starts refused until one is imported (docs/DEPLOYMENT.md)` et la ligne « closed » ci-dessus. Un départ essayé par l'hôte, un second compte présent (le bouton exige deux participants), affiche « Les courses sont temporairement fermées… », et `select count(*) from races` reste à 0.
4. Import de la version acceptée, par le processus d'import en production, puis redémarrage de l'application. Le Log stream montre `[races] corpus <version>: <n> fr, <n> en selectable passages`.
5. Après ma recette fonctionnelle et ce contrôle de fermeture, j'ouvre : `RACES_ENABLED=true` dans les App settings (redémarrage), et le Log stream montre la ligne « open » et de nouveau `[races] corpus <version>: …`.
6. Après la première course, une requête en lecture seule sur Neon, `select config_snapshot->>'corpusVersion' as version, config_snapshot->>'text' as text, count(*) from races group by 1, 2`, ne rend que des passages de la version importée, jamais `fixture`.

Une panne de base de données sur la page d'une salle affiche l'état « Avarie » avec une réponse 200 : elle apparaît dans le Log stream (`[rooms] room page failed`), pas dans les erreurs 5xx d'App Service.

Logs : App Service → Log stream. Deux endpoints, tous deux sans détails internes :

- `/api/health/live` : vivacité (liveness) pour Azure, `status` et `commit`, ne touche jamais la base de données.
- `/api/health` : disponibilité (readiness) pour le smoke test et les humains, ajoute `database` (`up`, `down`, `not_configured`). Neon est interrogé au plus une fois par heure tant qu'il répond, et toutes les 30 s tant qu'il ne répond pas; chaque nouveau déploiement refait la vérification. Il répond 200 tant que le processus tourne, avec `status: "degraded"` sauf si la base de données est `up`.

## Rollback

- **Application, le plus rapide :** dans Actions, ouvrir la dernière exécution *Deploy* réussie d'un bon commit et relancer ses jobs *deploy* et *smoke* : ils redéploient l'artefact de cette exécution. GitHub ne permet de relancer une exécution que pendant 30 jours, ce qui correspond aussi à la durée de conservation des artefacts. Relancer deploy ne relance pas migrate : la base de données reste sur le schéma le plus récent; ne revenir donc qu'à une version dont le code fonctionne encore avec ce schéma (jamais au-delà d'une migration qui a supprimé quelque chose). Ne rien pousser sur `main` avant que le correctif soit arrivé, sinon le mauvais commit est redéployé.
- **Application, toujours possible :** faire un revert du changement fautif sur `dev` (PR), puis promouvoir `dev` vers `main`; le workflow Deploy livre l'arbre après le revert. Ne jamais faire de revert d'un commit qui contient une migration déjà appliquée : faire plutôt évoluer le schéma vers l'avant.
- **Fermer les courses :** dans les App settings, retirer `RACES_ENABLED` ou lui donner `false`. L'application redémarre : les courses en cours sont interrompues (D-06), les salles et les résultats restent. C'est le premier levier, et le seul immédiat, y compris pour retirer d'urgence un passage du corpus (sinon : import d'une nouvelle version, puis redémarrage). Si le code lui-même est en cause :
  - **Revenir aux deux passages dans le code (avant F-02.3b) :** faire un revert du commit de fusion de la PR de F-02.3b, en entier (`git revert -m 1`), sans migration en jeu. Un revert partiel laisse la version d'avant sans ses textes, ou fait échouer le contrôle de fuite local.
  - **Retirer les courses :** d'abord ce revert de F-02.3b, puis le changement `RACES_ENABLED` : son commit de fusion, si sa PR ne porte que ce changement (`git revert -m 1`), sinon tous ses commits, du plus récent jusqu'à « run the two public-domain passages by default » compris. Un revert partiel donne des conflits. Puis promouvoir : la version d'avant refuse tout départ en production, tant que `RACE_FIXTURE_TEXTS` reste absente, sans migration en jeu.
- **Base de données :** les migrations vont seulement vers l'avant et doivent rester compatibles avec la version précédente de l'application (ajouter d'abord, supprimer dans une version ultérieure). Avant une migration risquée, créer une branche Neon à partir de la branche par défaut (nommée `production` dans les projets Neon récents) comme sauvegarde. Neon Free peut aussi restaurer à l'intérieur d'une courte fenêtre d'historique (6 heures au moment d'écrire ces lignes); la vérifier avant de s'y fier. **Après toute restauration, redémarrer l'application** : elle garde en mémoire la version du corpus lue au démarrage, et elle continuerait à tirer des passages que la base restaurée n'a peut-être plus. Les imports suivants seraient alors refusés.
- **Fuite d'identifiants :** Overview d'App Service → *Reset publish profile*, puis mettre à jour le secret de l'environnement. Renouveler les mots de passe Neon depuis la console Neon et mettre à jour les paramètres d'application.

## Coûts

B2 tourne sur le crédit Azure for Students : consulter Cost Management régulièrement et ne jamais convertir en abonnement payant. Neon reste sur le forfait gratuit : ses heures de calcul sont limitées par mois et, une fois qu'elles sont épuisées, le calcul est suspendu jusqu'à la période suivante; rien ne doit donc interroger la base de données à intervalle fixe (sonde de santé, keep-alive). La reprise des courses réveille Neon à chaque démarrage du processus : une application qui redémarre en boucle plus souvent que toutes les 5 minutes garderait le calcul éveillé. Surveiller la page d'utilisation.

Où lire les chiffres :

- **Crédit Azure** : portail Azure → Education → *Student offer details* (crédit disponible et date d'expiration). Le portail Azure Sponsorships ne connaît pas cette souscription.
- **Prévision Azure** : Cost Management → Cost analysis, portée Azure for Students, vue *AccumulatedCosts*, période étendue jusqu'à la date voulue; le survol de la courbe donne le coût cumulé prévu à une date.
- **Neon** : console Neon → Projects (usage de l'organisation depuis le début de la période) et Billing (limites du forfait). Les métriques peuvent avoir une heure de retard.

Relevé du 19 octobre 2026 (F-00.2) :

| Service | Mesure | Valeur | Limite |
|---|---|---|---|
| Azure | Coût réel d'octobre (App Service, Canada Central) | 16,06 $ | — |
| Azure | Coût cumulé prévu au 15 décembre | 80,41 $ | crédit de 142 $ |
| Azure | Coût cumulé prévu au 31 décembre | 98,34 $ | crédit de 142 $ |
| Azure | Crédit restant | 126 $, expiration le 3 octobre 2027 | — |
| Neon | Calcul depuis le 5 octobre | 0,95 CU-h | 100 h par mois |
| Neon | Stockage | 0,03 Go | 1 Go |
| Neon | Historique, transfert réseau | 0 Go | — |

La prévision prolonge le rythme actuel (environ 1,15 $ par jour, cohérent avec B2) : il resterait 61,59 $ de crédit au 15 décembre et 43,66 $ au 31 décembre. Je garde B2 jusqu'au test de charge (F-08.1), puis je réévalue; B1 coûterait environ la moitié. Le health check vise `/api/health/live`, qui n'interroge pas Neon.
