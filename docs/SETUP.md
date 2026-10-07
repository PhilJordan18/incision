# Installer et lancer le projet

Ce guide part d'une copie du dépôt `incision/`. L'application Next.js existe déjà dans `apps/web`; les commandes ci-dessous préparent un environnement local. Elles ne publient pas le site.

## Outils

Utiliser Node.js 24, npm 11, Git et Docker. Démarrer Docker Desktop pour la base de données locale. GitHub héberge le dépôt et exécute la CI à chaque push. La production tourne sur Azure App Service avec Neon PostgreSQL ([ADR-0002](adr/0002-hosting.md), [guide de déploiement](DEPLOYMENT.md)); le budget reste à **0 $ de dépense personnelle**. Un éditeur qui prend en charge TypeScript est recommandé.

## 1. Aller à la racine du dépôt

Sur cette machine, depuis le Terminal :

```sh
cd ~/Projects/incision
```

Sur une autre machine, cloner d'abord le dépôt GitHub et entrer dans son dossier. Ne jamais commiter `.env`; le fichier est ignoré par Git.

## 2. Installer les dépendances et lancer Next.js

```sh
npm ci
npm run dev -w @incision/web
```

Ouvrir `http://localhost:3000` pour vérifier l'écran initial. `npm run dev -w @incision/web` démarre le serveur personnalisé, qui sert Next.js et Socket.IO sur le même port et lit le `.env` à la racine. `http://localhost:3000/api/health` indique l'état de la base de données. La connexion exige la base de données (section 3) et les variables d'authentification de `.env` (section 3 bis).

**Contrainte TypeScript stricte.** Le code du produit utilise `.ts`/`.tsx`; la configuration PostCSS est en JSON. `tsconfig.json` désactive `allowJs`. Les fichiers JavaScript des dépendances dans `node_modules` ne sont pas du code écrit pour ce projet.

## 3. Démarrer PostgreSQL en local

```sh
cp -n .env.example .env
docker compose up -d db
docker compose ps
npm run db:migrate -w @incision/database
```

`db:migrate` applique les migrations versionnées à la base de données de `DATABASE_URL_UNPOOLED` (la base locale par défaut). Les tests de base de données utilisent un serveur distinct et jetable qui garde ses données en mémoire :

```sh
docker compose up -d db-test
TEST_DATABASE_URL=postgresql://incision_test:incision_test_only@localhost:5433/postgres npm run test:db -w @incision/database
```

Ils n'acceptent qu'un serveur `localhost` et y créent puis suppriment des bases temporaires `incision_test_*`; ils n'utilisent jamais `DATABASE_URL` ni Neon. Les mots de passe fournis servent **au développement local seulement**. Le déploiement utilisera un secret distinct chez l'hébergeur, jamais commité. Si le port 5432 est déjà utilisé, changer ensemble le port exposé dans `compose.yaml` et l'URL de connexion locale.

## 3 bis. Se connecter en local

1. Dans `.env`, donner à `AUTH_SECRET` la sortie de `openssl rand -base64 32` (ne jamais réutiliser une valeur de production) et garder `AUTH_URL=http://localhost:3000`.
2. Créer les comptes de démonstration : `npm run db:seed:demo -w @incision/database`, puis se connecter à `http://localhost:3000/sign-in` avec un [compte de démonstration](../README.md#comptes-de-démonstration).
3. Pour GitHub et Discord, remplir `AUTH_GITHUB_ID`/`AUTH_GITHUB_SECRET` avec l'application OAuth GitHub de **développement** et `AUTH_DISCORD_ID`/`AUTH_DISCORD_SECRET` avec l'application Discord, dont les URL de callback sont listées dans [DEPLOYMENT.md](DEPLOYMENT.md#authentification). Sans elles, les identifiants locaux fonctionnent quand même.

Les tests de bout en bout ne font aucun build eux-mêmes : lancer d'abord `npm run build`, démarrer `db-test`, puis

```sh
npm run test:e2e -w @incision/web
```

Playwright démarre le build de production par le serveur personnalisé sur le port 3200, avec une base jetable `incision_e2e` sur `db-test` qu'il supprime, migre et alimente avec le seed à chaque exécution (`E2E_DATABASE_URL` la remplace, localhost seulement). La première exécution peut exiger `npx playwright install chromium`. Les tests OAuth sont simulés : ils s'arrêtent à l'URL d'autorisation du fournisseur et ne se connectent jamais à GitHub ni à Discord.

## 4. Ajouter les modules de l'application

`packages/domain` (règles pures) et `packages/database` (schéma Drizzle, migrations, création de salle) existent déjà; `packages/contracts` sera créé avec les premiers événements temps réel partagés. Ajouter les dépendances avec `npm install --workspace=<path>` et garder des **versions stables verrouillées par `package-lock.json`**.

Pour changer le schéma : modifier `packages/database/src/schema`, lancer `npm run db:generate -w @incision/database`, relire et commiter le SQL généré, puis lancer les tests de base de données. La CI échoue si le schéma et les migrations ne concordent pas. Ne jamais utiliser `drizzle-kit push`, et ne jamais modifier une migration déjà appliquée à une base de données distante. [Le schéma livré](architecture/data-model.md#delivered-schema) liste ce qui existe aujourd'hui.

## 5. Vérifications du checkpoint

La cible est démontrable, pas seulement documentée :

1. Serveur HTTPS public, authentification **GitHub et Discord**, PostgreSQL et migrations fonctionnels. Connexion locale pour les tests Playwright. En production depuis le 7 octobre; les vraies connexions GitHub et locales y sont prouvées, Discord est vérifié après le correctif de son émetteur.
2. Salle créée puis rejointe par code, deux navigateurs synchronisés en temps réel.
3. `docs/ARCHITECTURE.md` : modèle de données, machine à états, ADR temps réel et approche des bots; `docs/DEMARCHE-CREATIVE.md` complet, avec des preuves humaines pour le nom/logo et l'identité appliquée.
4. CI à chaque push : lint, TypeScript, tests et build; déploiement automatique après succès.
5. Langue et thème accessibles sur les pages existantes; `docs/EXIGENCES.md` qui liste tous les identifiants officiels, avec des statuts honnêtes et de vrais tests.

Chaque point se vérifie sur le site ou dans le dépôt, pas seulement dans ces documents; ma recette du 7 octobre et ses résultats sont dans `docs/EXIGENCES.md`. À la racine, lancer `npm run check:no-js`, `npm run lint`, `npm run typecheck`, `npm test` et `npm run build`; le déploiement suit [DEPLOYMENT.md](DEPLOYMENT.md).

## Références officielles

- [Next.js — `create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app)
- [npm — workspaces](https://docs.npmjs.com/cli/v11/using-npm/workspaces/)
- [Drizzle — PostgreSQL](https://orm.drizzle.team/docs/get-started/postgresql-new) et [migrations](https://orm.drizzle.team/docs/migrations)
