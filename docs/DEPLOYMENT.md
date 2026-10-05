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
3. [deploy.yml](../.github/workflows/deploy.yml) runs CI again, builds once, packages the release with [`scripts/package-release.sh`](../scripts/package-release.sh) (Next build, TypeScript sources, production dependencies, `build-info.json` with the commit) and zip-deploys it to App Service, which restarts.
4. The smoke test waits until `/api/health` reports the new commit with `"database": "up"`, then checks a WebSocket ping.

The pipeline is green only if production runs the expected commit, reaches Neon and accepts WebSocket connections.

## One-time configuration

**Azure App Service** (portal → *incision*):

| Setting | Value |
|---|---|
| Configuration → Stack settings → Startup command | `npm run start -w @incision/web` |
| Configuration → Health check → Path | `/api/health` |
| Configuration → General settings | Always On, HTTPS only, TLS 1.3, FTP disabled, SCM basic auth enabled (publish profile) |
| Environment variables → App settings | `APP_URL` (the `https://` default domain), `DATABASE_URL` (Neon pooled), `DATABASE_URL_UNPOOLED` (Neon direct), `SCM_DO_BUILD_DURING_DEPLOYMENT=false` |

App Service provides `PORT`. WebSockets are accepted by Linux App Service; the smoke test proves it on every deployment.

**GitHub** (repository → Settings → Environments → `production`):

- Deployment branches: `main` only.
- Secret `AZURE_WEBAPP_PUBLISH_PROFILE`: content of the publish profile downloaded from the App Service overview. Never commit or paste the file; delete it after `gh secret set ... --env production`.
- Variable `APP_URL`: same value as the App Service setting.

## Checking production

```sh
npm run smoke -w @incision/web -- https://<default-domain> --database up
```

Logs: App Service → Log stream. `/api/health` returns `status`, `commit` and `database` (`up`, `down`, `not_configured`) and never internal details. It answers 200 while the process runs, so a Neon cold start does not get the only instance restarted.

## Rollback

- **Application:** in Actions, open the last successful *Deploy* run of a good commit and choose *Re-run all jobs*; it redeploys that run's commit. Then fix forward on `dev` and promote again.
- **Database:** migrations are forward-only and must stay compatible with the previous app version (add first, remove in a later release). Before a risky migration, create a Neon branch from `main` as a backup. Neon can also restore within the free plan's history window; check its current length before relying on it.
- **Credential leak:** App Service overview → *Reset publish profile*, then update the environment secret. Rotate Neon passwords from the Neon console and update the app settings.

## Costs

B2 runs on the Azure for Students credit: check Cost Management regularly and never convert to a paid subscription. Neon stays on the free plan; watch its usage page.
