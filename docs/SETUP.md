# Install and run the project

This guide starts from a copy of the `incision/` repository. The Next.js application already exists in `apps/web`; the commands below prepare a local environment. They do not publish the site.

## Tools

Use Node.js 24, npm 11, Git and Docker. Start Docker Desktop for the local database. GitHub hosts the repository and runs CI on every push. Production runs on Azure App Service with Neon PostgreSQL ([ADR-0002](adr/0002-hosting.md), [deployment guide](DEPLOYMENT.md)); the budget stays **$0 out of pocket**. An editor with TypeScript support is recommended.

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

Open `http://localhost:3000` to check the initial screen. `npm run dev -w @incision/web` starts the custom server, which serves Next.js and Socket.IO on the same port and reads the root `.env`. `http://localhost:3000/api/health` reports the database state. Signing in needs the database (section 3) and the authentication variables of `.env` (section 3 bis).

**Strict TypeScript constraint.** Product code uses `.ts`/`.tsx`; the PostCSS configuration is in JSON. `tsconfig.json` disables `allowJs`. The JavaScript files of the dependencies in `node_modules` are not code written for this project.

## 3. Start local PostgreSQL

```sh
cp -n .env.example .env
docker compose up -d db
docker compose ps
npm run db:migrate -w @incision/database
```

`db:migrate` applies the versioned migrations to the database of `DATABASE_URL_UNPOOLED` (the local one by default). Database tests use a separate, disposable server that keeps its data in memory:

```sh
docker compose up -d db-test
TEST_DATABASE_URL=postgresql://incision_test:incision_test_only@localhost:5433/postgres npm run test:db -w @incision/database
```

They only accept a `localhost` server and create and drop temporary `incision_test_*` databases there; they never use `DATABASE_URL` or Neon. The provided passwords are **for local development only**. Deployment will use a separate secret at the hosting provider, never committed. If port 5432 is already in use, change the exposed port in `compose.yaml` and the local connection URL together.

## 3 bis. Sign in locally

1. In `.env`, set `AUTH_SECRET` to the output of `openssl rand -base64 32` (never reuse a production value) and keep `AUTH_URL=http://localhost:3000`.
2. Create the demo accounts: `npm run db:seed:demo -w @incision/database`, then sign in at `http://localhost:3000/sign-in` with a [demo account](../README.md#comptes-de-démonstration).
3. For GitHub and Discord, fill `AUTH_GITHUB_ID`/`AUTH_GITHUB_SECRET` with the **development** GitHub OAuth app and `AUTH_DISCORD_ID`/`AUTH_DISCORD_SECRET` with the Discord application, whose callback URLs are listed in [DEPLOYMENT.md](DEPLOYMENT.md#authentication). Without them, local credentials still work.

End-to-end tests build nothing themselves: run `npm run build` first, start `db-test`, then

```sh
npm run test:e2e -w @incision/web
```

Playwright starts the production build through the custom server on port 3200, against a disposable `incision_e2e` database on `db-test` that it drops, migrates and seeds at every run (`E2E_DATABASE_URL` overrides it, localhost only). The first run may need `npx playwright install chromium`. The OAuth tests are simulated: they stop at the provider's authorisation URL and never sign in to GitHub or Discord.

## 4. Add the application modules

`packages/domain` (pure rules) and `packages/database` (Drizzle schema, migrations, room creation) already exist; `packages/contracts` will be created with the first shared realtime events. Add dependencies with `npm install --workspace=<path>` and keep **stable versions locked by `package-lock.json`**.

To change the schema: edit `packages/database/src/schema`, run `npm run db:generate -w @incision/database`, review and commit the generated SQL, then run the database tests. CI fails if the schema and the migrations disagree. Never use `drizzle-kit push`, and never edit a migration that has been applied to a remote database. [The delivered schema](architecture/data-model.md#delivered-schema) lists what exists today.

## 5. Checkpoint checks

The target is demonstrable, not just documented:

1. Public HTTPS server, **GitHub and Discord** authentication, working PostgreSQL and migrations. Local sign-in for the Playwright tests (implemented; real OAuth sign-ins still to be proven in production).
2. Room created then joined by code, two browsers synchronised in real time.
3. `docs/ARCHITECTURE.md`: data model, state machine, realtime ADR and bot approach; complete `docs/DEMARCHE-CREATIVE.md` with human evidence for the name/logo and the applied identity.
4. CI on every push: lint, TypeScript, tests and build; automatic deployment after success.
5. Language and theme accessible on the existing pages; `docs/EXIGENCES.md` listing all official IDs, honest statuses and real tests.

Point 2 still requires implementation, and point 1 production evidence. Do not present them as achieved because these documents exist. From the root, run `npm run check:no-js`, `npm run lint`, `npm run typecheck`, `npm test` and `npm run build`; deployment follows [DEPLOYMENT.md](DEPLOYMENT.md).

## Official references

- [Next.js — `create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app)
- [npm — workspaces](https://docs.npmjs.com/cli/v11/using-npm/workspaces/)
- [Drizzle — PostgreSQL](https://orm.drizzle.team/docs/get-started/postgresql-new) and [migrations](https://orm.drizzle.team/docs/migrations)
