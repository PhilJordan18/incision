# Créer et lancer le projet

Ce guide part du dossier `incision/` qui contient déjà les documents d'architecture. Les commandes ci-dessous **créent le projet local**; elles ne créent ni dépôt GitHub, ni site public, ni déploiement.

## Outils

Sur cette machine, Node.js 24, pnpm 11, Git et Docker sont déjà installés. Il faut démarrer Docker Desktop pour la base locale. GitHub servira au dépôt et aux actions de CI/CD; l'hébergeur HTTPS reste à sélectionner. Un éditeur avec TypeScript et un outil de dessin de schéma ne sont pas obligatoires pour lancer l'application.

## 1. Initialiser le dépôt

Dans le terminal :

```sh
cd '/Users/philippemonfouayi/Documents/Codex/2026-09-22/il-a-chang-le-planning-mais/incision'
git init -b main
```

Avant le premier commit, vérifier qu'aucun fichier personnel ou secret n'est ajouté. Le fichier `.env` est ignoré par Git.

## 2. Générer l'application Next.js

```sh
pnpm create next-app@latest apps/web --ts --tailwind --eslint --app --src-dir --use-pnpm --disable-git --skip-install
```

Le projet utilisera React via Next.js, TypeScript, Tailwind CSS et l'App Router. Dans `apps/web/package.json`, remplacer ensuite le nom généré par `@incision/web`. Puis, depuis la racine :

```sh
pnpm install
pnpm --filter @incision/web dev
```

Ouvrir `http://localhost:3000` pour vérifier l'écran initial. Le serveur temps réel et l'authentification ne sont **pas encore implémentés** à ce stade.

**Contrainte TypeScript stricte.** Selon la version du générateur, certains fichiers de configuration peuvent être créés en `.mjs` ou `.js`. Il faudra convertir ces configurations en `.ts` ou en JSON lorsque le projet aura été généré, puis exécuter explicitement le lint, la vérification TypeScript et le build. Ne pas se contenter de renommer l'extension. Les fichiers issus de dépendances dans `node_modules` ne sont pas du code produit.

## 3. Démarrer PostgreSQL local

```sh
cp .env.example .env
docker compose up -d db
docker compose ps
```

Le mot de passe fourni est **uniquement pour le développement local**. Le déploiement utilisera un secret distinct chez l'hébergeur, jamais commité. Si le port 5432 est occupé, modifier le port exposé dans `compose.yaml` et l'URL locale de connexion de concert.

## 4. Ajouter les modules de l'application

Créer ensuite `packages/domain`, `packages/contracts` et `packages/database` avec leurs propres `package.json` TypeScript. Installer `drizzle-orm` et `pg` dans le module de base de données, puis `drizzle-kit` et `@types/pg` comme dépendances de développement. Choisir des versions **stables verrouillées par `pnpm-lock.yaml`** et tester les migrations avant de les appliquer à une base distante. Au 29 septembre 2026, les versions stables repérées sont `drizzle-orm@0.45.3` et `drizzle-kit@0.31.11`; la documentation d'installation affiche aussi des versions RC, que nous ne retenons pas pour le checkpoint.

Le premier schéma doit suivre [le modèle de données](architecture/data-model.md). Générer des migrations versionnées avec Drizzle Kit (`generate`, puis `migrate`); ne pas utiliser `push` comme mécanisme de production. Ajouter le serveur Socket.IO et les contrats d'événements seulement après la validation des cycles de vie de la salle et de la manche.

## 5. Vérifications du checkpoint

La cible est démontrable, pas seulement documentée :

1. HTTPS public, authentification et PostgreSQL fonctionnels.
2. Salle créée puis rejointe par code, deux navigateurs synchronisés en temps réel.
3. Modèle de données, machines à états et ADR présents dans le dépôt.
4. CI à chaque push : lint, TypeScript, tests et build; déploiement automatique après succès.
5. Langue et thème accessibles dans l'interface initiale; matrice des exigences reliée aux tests.

Les points 1, 2 et 4 demandent encore une implémentation et une configuration externe. Ne pas les présenter comme acquis parce que ces documents existent.

## Références officielles

- [Next.js — `create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app)
- [pnpm — workspaces](https://pnpm.io/workspaces)
- [Drizzle — PostgreSQL](https://orm.drizzle.team/docs/get-started/postgresql-new) et [migrations](https://orm.drizzle.team/docs/migrations)
