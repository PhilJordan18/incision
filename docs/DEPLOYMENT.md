# Deployment — Azure App Service and Neon

How Incision reaches production and how to recover. Decision and trade-offs: [ADR-0002](adr/0002-hosting.md). Remote changes (Azure, Neon, GitHub settings) are made by Philippe or with his explicit approval for each action ([AGENTS.md](../AGENTS.md#human-approvals)).

## Environments

| | Local | Production |
|---|---|---|
| App | `npm run dev -w @incision/web` (custom server, port 3000) | Azure App Service, Linux, Node 24 LTS, B2, one instance |
| Database | Docker Compose PostgreSQL 17 ([SETUP.md](SETUP.md)) | Neon, free plan |
| Configuration | root `.env`, copied from [`.env.example`](../.env.example) | App Service app settings, GitHub environment `production` |

There is no staging environment: changes are verified locally and by CI, then promoted from `dev` to `main`.

## Pipeline

1. A PR is merged into `dev`; CI runs on every push and PR ([ci.yml](../.github/workflows/ci.yml)).
2. Philippe promotes `dev` to `main` (explicit production order).
3. [deploy.yml](../.github/workflows/deploy.yml) runs CI, then three jobs:
   - **build** (no secret): builds the same commit again and packages the release with [`scripts/package-release.sh`](../scripts/package-release.sh) (Next build, TypeScript sources, production dependencies, `build-info.json` with the commit), kept 30 days as a workflow artifact;
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
| Environment variables → App settings | `APP_URL` (the `https://` default domain), `DATABASE_URL` (Neon pooled), `SCM_DO_BUILD_DURING_DEPLOYMENT=false`. `DATABASE_URL_UNPOOLED` (Neon direct) is reserved for migrations: the app does not read it yet, and the schema card decides where migrations run. |
| Monitoring → App Service logs | Application logging: File System, short retention, so Log stream shows the app's output |

The process refuses to start in production without `APP_URL`, or without a `DATABASE_URL` that sets `sslmode=verify-full` (or `require`). Use `verify-full` for Neon.

App Service provides `PORT`. WebSockets are accepted by Linux App Service; the smoke test proves it on every deployment.

**GitHub** (repository → Settings → Environments → `production`):

- Deployment branches: `main` only.
- Secret `AZURE_WEBAPP_PUBLISH_PROFILE`: content of the publish profile downloaded from the App Service overview. Never commit or paste the file; delete it after `gh secret set ... --env production`. Then delete any repository-level copy of the secret, which every branch's workflows could read.
- Variable `APP_URL`: same value as the App Service setting.

## Checking production

```sh
npm run smoke -w @incision/web -- https://<default-domain> --database up
```

Logs: App Service → Log stream. Two endpoints, both without internal details:

- `/api/health/live`: liveness for Azure, `status` and `commit`, never touches the database.
- `/api/health`: readiness for the smoke test and humans, adds `database` (`up`, `down`, `not_configured`). Neon is queried at most once an hour while it answers and every 30 s while it does not; each new deployment probes afresh. It answers 200 while the process runs, with `status: "degraded"` when Neon does not answer.

## Rollback

- **Application, fastest:** in Actions, open the last successful *Deploy* run of a good commit and re-run its *deploy* and *smoke* jobs: they redeploy that run's artifact. GitHub only allows re-runs for 30 days, which is also the artifact retention. Do not push to `main` until the fix lands, or the bad commit is deployed again.
- **Application, always available:** revert the faulty change on `dev` (PR), then promote `dev` to `main`; the Deploy workflow ships the reverted tree.
- **Database:** migrations are forward-only and must stay compatible with the previous app version (add first, remove in a later release). Before a risky migration, create a Neon branch from the default branch (named `production` in recent Neon projects) as a backup. Neon Free can also restore within a short history window (6 hours at the time of writing); check it before relying on it.
- **Credential leak:** App Service overview → *Reset publish profile*, then update the environment secret. Rotate Neon passwords from the Neon console and update the app settings.

## Costs

B2 runs on the Azure for Students credit: check Cost Management regularly and never convert to a paid subscription. Neon stays on the free plan: its compute hours are limited per month and the compute is suspended until the next period when they run out, so nothing may query the database on a fixed schedule (health probe, keep-alive). Watch the usage page.
