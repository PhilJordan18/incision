# Deployment — Azure App Service and Neon

How Incision reaches production and how to recover. Decision and trade-offs: [ADR-0002](adr/0002-hosting.md). I make every remote change (Azure, Neon, GitHub settings) myself, or approve it action by action when an agent prepares it ([AGENTS.md](../AGENTS.md#human-approvals)).

## Environments

| | Local | Production |
|---|---|---|
| App | `npm run dev -w @incision/web` (custom server, port 3000) | Azure App Service, Linux, Node 24 LTS, B2, one instance |
| Database | Docker Compose PostgreSQL 17 ([SETUP.md](SETUP.md)) | Neon, free plan |
| Configuration | root `.env`, copied from [`.env.example`](../.env.example) | App Service app settings, GitHub environment `production` |

There is no staging environment: changes are verified locally and by CI, then promoted from `dev` to `main`.

## Pipeline

1. A PR is merged into `dev`; CI runs on every push and PR ([ci.yml](../.github/workflows/ci.yml)).
2. I promote `dev` to `main` when I decide to release.
3. [deploy.yml](../.github/workflows/deploy.yml) runs CI, then four jobs:
   - **build** (no secret): builds the same commit again and packages the release with [`scripts/package-release.sh`](../scripts/package-release.sh) (Next build, TypeScript sources, production dependencies, `build-info.json` with the commit), kept 30 days as a workflow artifact;
   - **migrate** (environment `production`, only the step that needs it receives `DATABASE_URL_UNPOOLED`): unpacks the same run's artifact and runs its migrator (`packages/database/scripts/migrate.ts`) on a direct Neon connection; no checkout, no npm. A failure stops the pipeline: **deploy waits for migrate**;
   - **deploy** (environment `production`, the only job holding the deployment credential): downloads that artifact and zip-deploys it; no checkout, no npm, no project code runs there. App Service restarts and never builds;
   - **smoke** (no secret): retries for up to 6 minutes until `/api/health` reports the new commit with `"database": "up"`, then checks a WebSocket ping.

The pipeline is green only if production runs the expected commit, reaches Neon and accepts WebSocket connections.

## One-time configuration

**Azure App Service** (portal → *incision*):

| Setting | Value |
|---|---|
| Configuration → Stack settings (tab) → Startup command | `npm run start -w @incision/web` |
| Configuration → Health check (tab) → Path | `/api/health/live`, enabled after the first deployment. **Never `/api/health`**: it queries Neon, and a probe every minute would keep Neon's free compute awake around the clock and exhaust its monthly quota. |
| Configuration → General settings | Always On, HTTPS only, TLS 1.3, FTP disabled, SCM basic auth enabled (publish profile) |
| Environment variables → App settings | `APP_URL` (the `https://` default domain), `DATABASE_URL` (Neon pooled), `SCM_DO_BUILD_DURING_DEPLOYMENT=false`, and for authentication `AUTH_URL`, `AUTH_SECRET`, `AUTH_GITHUB_ID`, `AUTH_GITHUB_SECRET`, `AUTH_DISCORD_ID`, `AUTH_DISCORD_SECRET`, `TRUSTED_PROXY_HOPS=1` (see [Authentication](#authentication)). The app never reads `DATABASE_URL_UNPOOLED`: once the GitHub secret below exists, remove it from App Service. |
| Monitoring → App Service logs | Application logging: File System, short retention, so Log stream shows the app's output |

The process refuses to start in production when one of these variables is missing or empty, when `AUTH_URL` differs from `APP_URL`, when `AUTH_SECRET` has fewer than 32 characters, when `APP_URL` is not HTTPS (a `localhost` URL is allowed for local production builds), or when a remote `DATABASE_URL` does not set `sslmode=verify-full` (or `require`). Use `verify-full` for Neon. **Set the authentication variables before promoting CP-04 to `main`**: otherwise the new release does not start and the smoke test fails (the previous one has already been replaced).

App Service provides `PORT`. WebSockets are accepted by Linux App Service; the smoke test proves it on every deployment.

**GitHub** (repository → Settings → Environments → `production`):

- Deployment branches: `main` only.
- Secret `AZURE_WEBAPP_PUBLISH_PROFILE`: content of the publish profile downloaded from the App Service overview. Never commit or paste the file; delete it after `gh secret set ... --env production`. Then delete any repository-level copy of the secret, which every branch's workflows could read.
- Variable `APP_URL`: same value as the App Service setting.
- Secret `DATABASE_URL_UNPOOLED`: Neon **direct** URL (Neon console → Connect, connection pooling off: the host has no `-pooler`) with `sslmode=verify-full`, same database and role as the app, used only by the migrate step. node-postgres ignores `channel_binding=require` (harmless, but it enforces nothing: verified TLS is the protection) and reads `sslrootcert` as a file path, so drop `sslrootcert=system` from libpq examples. Set it before the first promotion that contains migrations, typing the value at the prompt rather than on the command line: `gh secret set DATABASE_URL_UNPOOLED --env production -R PhilJordan18/incision`. Without it the migrate job fails and nothing is deployed (fix it, then *Re-run failed jobs*). Keep it **only** as a `production` environment secret: delete any repository-level copy, which workflows on every branch could read. Once it works, remove `DATABASE_URL_UNPOOLED` from App Service (this restarts the app).
- Because migrate and deploy both use the `production` environment, each run records two deployments; required reviewers on that environment would mean two approvals per run.

## Database migrations

Rules for every schema change (see also [SETUP.md](SETUP.md)):

- Migrations are generated by Drizzle Kit, reviewed and committed; they are applied only by the migrate job (production) or `npm run db:migrate -w @incision/database` (local). Never `drizzle-kit push`, never at application start-up.
- **Never edit a migration already applied remotely**, and never date a new one before the last applied one: Drizzle itself would skip both silently. Before applying anything, and again after, the migrator checks that the release's migrations are recorded with the same hash, so an edited or back-dated migration fails the migrate job and blocks the deployment. An applied migration missing from a release that has newer ones (diverged histories) is refused too; a release older than the database (rollback) is accepted. Change the schema with a new migration.
- The migrator holds a PostgreSQL advisory lock on one direct connection while it reads its journal and applies all pending migrations **in one transaction**: concurrent runs wait (60 s at most), and a failing migration leaves none applied. Statements time out after 120 s; a statement waiting more than 10 s for a table lock fails instead of queueing application queries behind it.
- **Compatible with the running version**: migrations run before the new code, so the previous application keeps serving traffic on the new schema. Add first (nullable or defaulted columns, new tables); remove or rename only in a later release, after no deployed code uses the old shape.
- **New enum values** go in their own release: PostgreSQL cannot use a value added in the same transaction (the migrator applies all pending migrations in one), so the first default, check or data using it comes in a later deployment.
- **Additive is not automatically safe**: `ALTER TABLE` takes locks; adding a foreign key or check on a large table should use `NOT VALID` then `VALIDATE` in a later migration; `CREATE INDEX CONCURRENTLY` cannot run inside the migrator's transaction. Today's tables are small, but write migrations as if they were not.
- **Recovery when migrate fails** (the transaction rolled back, nothing is recorded, deploy was skipped, the previous app keeps running):
  - *Transient cause* (connection, Neon waking up, lock timeout, another migration holding the lock, missing secret): fix the cause if needed, then *Re-run failed jobs* on the same run. The log shows the PostgreSQL code and reason.
  - *SQL error*: pending migrations run in order, so a new migration cannot fix one that fails before it. Replace the failed migration itself (it was never applied remotely): delete its SQL, snapshot and journal entry **and those of every later migration** (none was applied: they share the transaction, and each snapshot already contains the failed change), fix the schema, run `npm run db:generate -w @incision/database` again, then promote. Do not edit generated SQL by hand: CI compares the schema with the snapshot, and a database test compares the migrated catalog with it (exact table set, column types, nullability and defaults, index uniqueness and partiality, foreign-key actions, constraint and index names; check expressions, primary keys and key columns are covered by behaviour tests only).
  - *Data error* (existing rows violate a new constraint): remove the failed migration and every later one as above, then add the data fix with `npx drizzle-kit generate --custom` (in `packages/database`), then regenerate the schema change with `npm run db:generate -w @incision/database`, so the fix runs first. Alternatively ship the data fix in one release and the constraint in the next. Hand-written SQL, such as `NOT VALID` then `VALIDATE` or a backfill, also goes in a custom migration.
  - A failed run's log can show the Neon host or role name in the PostgreSQL or DNS error; never the password or the URL.
  - *Journal check failure* (an applied migration was edited, a new one is dated before the last applied one, e.g. after merging two branches that each generated a migration, or an applied migration is missing from a release that has newer ones): the check runs before anything is applied, so nothing changed. Restore the applied migration's SQL, snapshot and journal entry, regenerate the newer migrations on top of the current journal, then promote again.
- If a migration succeeds but the deployment fails, the previous app keeps running on the additive schema; redeploy or revert as in [Rollback](#rollback).
- Migrate runs automatically on promotion: create a Neon backup branch **before** promoting a risky migration.

## Authentication

Auth.js v5 with JWT sessions ([ADR-0003](adr/0003-authentication.md)). Variable **names** only; values live in App Service and in the local `.env`, never in the repository or a chat.

| Variable | Production value | Notes |
|---|---|---|
| `AUTH_URL` | exactly `APP_URL`, e.g. `https://<default-domain>` | Origin only, no path. Auth.js builds its callback URLs from it; it also makes the cookies `__Secure-`/`__Host-` over HTTPS. |
| `AUTH_SECRET` | 32 random bytes: `openssl rand -base64 32` | One per environment. Changing it signs everybody out (no rotation list at the checkpoint). Socket.IO decrypts the same cookie with it. |
| `AUTH_GITHUB_ID`, `AUTH_GITHUB_SECRET` | production GitHub OAuth app | GitHub allows one callback URL per OAuth app: one app for production, another for local development. |
| `AUTH_DISCORD_ID`, `AUTH_DISCORD_SECRET` | Discord application | One application can list both redirect URLs. |
| `TRUSTED_PROXY_HOPS` | `1` | Azure's front end appends the client address to `X-Forwarded-For`; only that last entry is trusted, the ones a client writes are ignored. `0` locally. Keep `1` unless another proxy (e.g. Front Door) is added: with `0` every visitor shares the front end's address, so 100 failed sign-ins pause local sign-in for everyone; with `2` a client's own entry is trusted and the per-address limit can be bypassed. |

Exact callback URLs to register:

| Provider | Production | Local |
|---|---|---|
| GitHub (*Authorization callback URL*) | `https://<default-domain>/api/auth/callback/github` | `http://localhost:3000/api/auth/callback/github` |
| Discord (*OAuth2 → Redirects*) | `https://<default-domain>/api/auth/callback/discord` | `http://localhost:3000/api/auth/callback/discord` |

Permissions: GitHub requests **no scope** (public profile only), Discord only `identify`. No email is requested, stored or logged; the provider's name only seeds the display name of a new account.

**Sessions.** A session lasts **24 hours from sign-in**, whatever the activity: Auth.js re-issues its cookie when `/api/auth/session` is read (pages and actions never write it), but every check also compares the sign-in time with the 24-hour limit, so the cookie can never extend it. There is no "remember me". Each request carrying a session cookie reads the account's `session_version` (one indexed query); requests without a session cookie, such as Always On and the liveness probe, never touch the database. **Sign-out ends every session of the account** on every device: it increments `session_version` and closes the account's sockets. If the database cannot be reached, protected pages and sockets refuse the session (fail closed); the cookie stays and works again once Neon answers. A failed sign-out says so and keeps the session. Auth.js' built-in `POST /api/auth/signout` is refused (405): it would clear the cookie even when the revocation failed.

**Rate limits** (in memory, one instance, counted before any password check so parallel attempts cannot slip through): per 15 minutes, 5 failed local sign-ins per login and address, 50 per login from anywhere, 100 failures and 200 checked attempts (successful ones included) per address (a whole class may share one school address); at most 3 sign-in checks run at once, 2 per address, so that one address cannot occupy the server; many addresses together still can make local sign-in answer "unavailable" for a while (about 14 s per extra address), with GitHub and Discord unaffected as the fallback. A database failure counts as nothing. A pause also refuses the right password. Because the demo accounts are public, a stranger can pause one for 15 minutes with 50 failures from various addresses: on demonstration day, prefer GitHub or Discord or keep the second demo account in reserve. A restart resets the counters.

**Verifying real OAuth sign-ins** (manual; the automated tests stop at the provider's authorisation page): locally with the development apps, then in production after deployment — sign in with GitHub, sign out, sign in with Discord, sign out; check that `/account` shows a display name, that `/api/auth/session` returns only `user.id` and `expires`, and that the Log stream shows no email, token or profile. Cancel once on each provider's consent screen: the sign-in page must show the translated "cancelled or failed" message.

## Rooms

Rooms by code (CP-06) need no new variable or migration. Presence lives in the process memory, like the session registry: one App Service instance (ADR-0001); scaling out would split rooms between instances.

**Limits** (in memory, reset by a restart): a socket may send 5 `room:watch` events per 10 seconds, one at a time, and beyond that it is disconnected; an account has at most 2 watches in progress across all its sockets, so neither one socket nor many sockets of one account can drain the 5-connection database pool. An account may create, join or leave a room 10 times per minute. Broadcasts read a room once at a time and skip rooms nobody follows.

**Residual risks, accepted at the checkpoint:**

- Code guessing (SALLE-10 not built): a signed-in account can try codes; private rooms answer exactly like unknown codes. With 31⁶ codes and about twenty open rooms, a hit takes millions of requests.
- Socket handshakes are not limited per account (each reads `session_version` once): many accounts, or a flood of handshakes, still share the one 5-connection pool of the single instance, like plain HTTP requests do.
- Closed rooms and departed members stay in the database (no purge yet): about 700 bytes per room; the per-account limit bounds the growth.
- A member who signs out stays in the room, shown offline, until they come back or the host leaves (kicking comes with SALLE-07).

## Demo accounts

Two fictitious local accounts, listed with their passwords in the [README](../README.md#demo-accounts), serve demonstrations and the Playwright tests. Their passwords are public on purpose and used nowhere else; they are not technical secrets. The seed (`packages/database/src/identity/demo-accounts.ts`) only creates missing accounts and never modifies an existing one (an account with a demo login whose password differs is reported as a conflict). It never runs at application start-up.

- Local: `npm run db:seed:demo -w @incision/database` (uses `DATABASE_URL_UNPOOLED` from `.env`; refuses a remote database without `--remote`).
- CI: the E2E run seeds its own disposable database.
- **Production, only when I decide to:** Actions → *Seed demo accounts* → *Run workflow* on `main`, typing `seed production demo accounts`. It runs the last successful deployment's release (most recent green *Deploy* run, artifacts kept 30 days), like the migrate job, with `DATABASE_URL_UNPOOLED` from the `production` environment, and logs `created`, `unchanged` or `conflict` for each login. Run it after a green Deploy, never while one runs; a mistyped confirmation skips the job (green run, nothing seeded): check that the job ran and logged its results. A failed run's public log can show the Neon host name, never the password.

## First promotion (CP-02 to CP-06 together)

The first `dev` → `main` promotion deploys the pipeline, the schema (migrations `0000` and `0001`), authentication, the design and rooms at once, and there is no earlier Deploy artifact to roll back to. In order:

1. OAuth apps: the production callback URLs above, on the exact default domain.
2. App Service: startup command and every app setting of [One-time configuration](#one-time-configuration) and [Authentication](#authentication), none empty, `AUTH_SECRET` newly generated for production.
3. GitHub environment `production`: secrets `AZURE_WEBAPP_PUBLISH_PROFILE` and `DATABASE_URL_UNPOOLED`, variable `APP_URL` equal to App Service's `APP_URL` (the smoke test uses it as the socket's Origin).
4. Neon: no Incision table yet (`0000` creates them); optionally a backup branch.
5. Promote, then watch the run: ci (with E2E) → build → migrate (`2 migration(s) applied`) → deploy → smoke.
6. If smoke fails because the app refuses to start (Log stream: `Invalid server environment: <NAME>: …`), set the named variable (saving restarts the app), then *Re-run failed jobs*: only smoke runs again. A wrong but present value (OAuth secret, callback) does not stop the app: step 7 catches it.
7. Real GitHub and Discord sign-ins and a cancellation on each, as in [Authentication](#authentication).
8. Demo seed only on explicit approval ([Demo accounts](#demo-accounts)).

The Health check on `/api/health/live` fails until this first deployment: harmless, it does not block the zip deploy.

## Checking production

```sh
npm run smoke -w @incision/web -- https://<default-domain> --database up
```

Logs: App Service → Log stream. Two endpoints, both without internal details:

- `/api/health/live`: liveness for Azure, `status` and `commit`, never touches the database.
- `/api/health`: readiness for the smoke test and humans, adds `database` (`up`, `down`, `not_configured`). Neon is queried at most once an hour while it answers and every 30 s while it does not; each new deployment probes afresh. It answers 200 while the process runs, with `status: "degraded"` unless the database is `up`.

## Rollback

- **Application, fastest:** in Actions, open the last successful *Deploy* run of a good commit and re-run its *deploy* and *smoke* jobs: they redeploy that run's artifact. GitHub only allows re-runs for 30 days, which is also the artifact retention. Re-running deploy does not re-run migrate: the database stays on the newest schema, so only roll back to a release whose code still works on it (never past a migration that removed something). Do not push to `main` until the fix lands, or the bad commit is deployed again.
- **Application, always available:** revert the faulty change on `dev` (PR), then promote `dev` to `main`; the Deploy workflow ships the reverted tree. Never revert a commit that contains an already applied migration: change the schema forward instead.
- **Database:** migrations are forward-only and must stay compatible with the previous app version (add first, remove in a later release). Before a risky migration, create a Neon branch from the default branch (named `production` in recent Neon projects) as a backup. Neon Free can also restore within a short history window (6 hours at the time of writing); check it before relying on it.
- **Credential leak:** App Service overview → *Reset publish profile*, then update the environment secret. Rotate Neon passwords from the Neon console and update the app settings.

## Costs

B2 runs on the Azure for Students credit: check Cost Management regularly and never convert to a paid subscription. Neon stays on the free plan: its compute hours are limited per month and the compute is suspended until the next period when they run out, so nothing may query the database on a fixed schedule (health probe, keep-alive). Watch the usage page.
