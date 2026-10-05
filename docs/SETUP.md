# Install and run the project

This guide starts from a copy of the `incision/` repository. The Next.js application already exists in `apps/web`; the commands below prepare a local environment. They do not publish the site.

## Tools

Use Node.js 24, npm 11, Git and Docker. Start Docker Desktop for the local database. GitHub hosts the repository; CI/CD and the HTTPS server are still to be configured. On October 3, Philippe confirmed that the cégep does not provide a server and that the budget is **$0 out of pocket**. First option: a VM under Azure for Students, if eligibility and credit are confirmed, without converting to a paid plan. See [the hosting plan](architecture/verification.md#hébergement-sans-dépense). An editor with TypeScript support is recommended.

## 1. Go to the repository root

On this machine, from the Terminal:

```sh
cd ~/Projects/incision
```

On another machine, first clone the GitHub repository and enter its folder. Never commit `.env`; the file is ignored by Git.

## 2. Install the dependencies and run Next.js

```sh
npm ci
npm run dev -w @incision/web
```

Open `http://localhost:3000` to check the initial screen. React, Next.js, TypeScript, Tailwind CSS and the App Router are installed. The realtime server and authentication are **not implemented yet**.

**Strict TypeScript constraint.** Product code uses `.ts`/`.tsx`; the PostCSS configuration is in JSON. `tsconfig.json` disables `allowJs`. The JavaScript files of the dependencies in `node_modules` are not code written for this project.

## 3. Start local PostgreSQL

```sh
cp -n .env.example .env
docker compose up -d db
docker compose ps
```

The provided password is **for local development only**. Deployment will use a separate secret at the hosting provider, never committed. If port 5432 is already in use, change the exposed port in `compose.yaml` and the local connection URL together.

## 4. Add the application modules

Then create `packages/domain`, `packages/contracts` and `packages/database`, each with its own TypeScript `package.json`. Install `drizzle-orm` and `pg` in the database module, then `drizzle-kit` and `@types/pg` as development dependencies. Choose **stable versions locked by `package-lock.json`**, checked at installation time, and test migrations before applying them to a remote database.

The first schema must follow the [checkpoint slice of the data model](architecture/data-model.md#coupe-de-données-pour-le-checkpoint-1). Generate versioned migrations with Drizzle Kit (`generate`, then `migrate`); do not use `push` as a production mechanism. For this checkpoint, implement room creation/admission before the Socket.IO synchronisation of members; the full round state machine must not delay this minimal proof. The current `next dev` and `next start` scripts do not start Socket.IO: they will have to be adapted when the custom server is added.

## 5. Checkpoint checks

The target is demonstrable, not just documented:

1. Public HTTPS server, **GitHub and Discord** authentication, working PostgreSQL and migrations. Local sign-in also planned for Playwright tests.
2. Room created then joined by code, two browsers synchronised in real time.
3. `docs/ARCHITECTURE.md`: data model, state machine, realtime ADR and bot approach; complete `docs/DEMARCHE-CREATIVE.md` with human evidence for the name/logo and the applied identity.
4. CI on every push: lint, TypeScript, tests and build; automatic deployment after success.
5. Language and theme accessible on the existing pages; `docs/EXIGENCES.md` listing all official IDs, honest statuses and real tests.

Points 1, 2 and 4 still require implementation and external configuration. Do not present them as achieved because these documents exist. For the current skeleton, run `npm run lint -w @incision/web` and `npm run build -w @incision/web`.

## Official references

- [Next.js — `create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app)
- [npm — workspaces](https://docs.npmjs.com/cli/v11/using-npm/workspaces/)
- [Drizzle — PostgreSQL](https://orm.drizzle.team/docs/get-started/postgresql-new) and [migrations](https://orm.drizzle.team/docs/migrations)
