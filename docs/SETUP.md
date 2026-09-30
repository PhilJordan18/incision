# Installer et lancer le projet

Ce guide part d'une copie du dépôt `incision/`. L'application Next.js existe déjà dans `apps/web`; les commandes ci-dessous préparent un environnement local. Elles ne publient pas le site.

## Outils

Utiliser Node.js 24, npm 11, Git et Docker. Démarrer Docker Desktop pour la base locale. GitHub héberge le dépôt; la CI/CD et l'hébergeur HTTPS restent à configurer. Un éditeur avec support TypeScript est recommandé.

## 1. Se placer à la racine du dépôt

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

Ouvrir `http://localhost:3000` pour vérifier l'écran initial. React, Next.js, TypeScript, Tailwind CSS et l'App Router sont installés. Le serveur temps réel et l'authentification ne sont **pas encore implémentés**.

**Contrainte TypeScript stricte.** Le code produit utilise `.ts`/`.tsx`; la configuration PostCSS est en JSON. `tsconfig.json` désactive `allowJs`. Les fichiers JavaScript des dépendances dans `node_modules` ne sont pas du code rédigé pour ce projet.

## 3. Démarrer PostgreSQL local

```sh
cp -n .env.example .env
docker compose up -d db
docker compose ps
```

Le mot de passe fourni est **uniquement pour le développement local**. Le déploiement utilisera un secret distinct chez l'hébergeur, jamais commité. Si le port 5432 est occupé, modifier le port exposé dans `compose.yaml` et l'URL locale de connexion de concert.

## 4. Ajouter les modules de l'application

Créer ensuite `packages/domain`, `packages/contracts` et `packages/database` avec leurs propres `package.json` TypeScript. Installer `drizzle-orm` et `pg` dans le module de base de données, puis `drizzle-kit` et `@types/pg` comme dépendances de développement. Choisir des versions **stables verrouillées par `package-lock.json`** et tester les migrations avant de les appliquer à une base distante. Au 29 septembre 2026, les versions stables repérées sont `drizzle-orm@0.45.3` et `drizzle-kit@0.31.11`; la documentation d'installation affiche aussi des versions RC, que nous ne retenons pas pour le checkpoint.

Le premier schéma doit suivre la [coupe checkpoint du modèle de données](architecture/data-model.md#coupe-de-données-pour-le-checkpoint-1). Générer des migrations versionnées avec Drizzle Kit (`generate`, puis `migrate`); ne pas utiliser `push` comme mécanisme de production. Pour ce checkpoint, implémenter la création/admission de salle avant la synchronisation Socket.IO des membres; la machine complète de manche ne doit pas retarder cette preuve minimale. Les scripts `next dev` et `next start` actuels ne lancent pas Socket.IO : ils devront être adaptés lorsque le serveur personnalisé sera ajouté.

## 5. Vérifications du checkpoint

La cible est démontrable, pas seulement documentée :

1. HTTPS public, authentification et PostgreSQL fonctionnels.
2. Salle créée puis rejointe par code, deux navigateurs synchronisés en temps réel.
3. Modèle de données, machines à états et ADR présents dans le dépôt.
4. CI à chaque push : lint, TypeScript, tests et build; déploiement automatique après succès.
5. Langue et thème accessibles dans l'interface initiale; matrice des exigences reliée aux tests.

Les points 1, 2 et 4 demandent encore une implémentation et une configuration externe. Ne pas les présenter comme acquis parce que ces documents existent. Pour le squelette actuel, lancer `npm run lint -w @incision/web` et `npm run build -w @incision/web`.

## Références officielles

- [Next.js — `create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app)
- [npm — workspaces](https://docs.npmjs.com/cli/v11/using-npm/workspaces/)
- [Drizzle — PostgreSQL](https://orm.drizzle.team/docs/get-started/postgresql-new) et [migrations](https://orm.drizzle.team/docs/migrations)
