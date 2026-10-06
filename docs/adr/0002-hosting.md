# ADR-0002 — Azure App Service and Neon for hosting

- Status: **accepted**, October 5, 2026. Validated by the teacher for TECH-05 on October 5 (message relayed by Philippe).
- Requirements: TECH-05, TECH-08, TECH-10; constrains AUTH-04, SALLE-04, SALLE-10.
- Supersedes the hosting options of [ADR-0001](0001-realtime.md) and of the [checkpoint plan](../architecture/verification.md#hosting-without-spending) (Ubuntu VM first, Render fallback).

## Context

TECH-05 asks for a server with public HTTPS, working at the checkpoint and at the final submission. The cégep provides no server and Philippe's budget is $0 out of pocket; an Azure for Students credit is available. TECH-08 requires every other external service to be on a free plan, and grading must cost the teacher nothing. ADR-0001 needs one persistent Node process running Next.js and Socket.IO together.

## Decision

- **Application:** Azure App Service, Linux, Node 24 LTS, Basic B2 plan, **one instance**, Always On, HTTPS only (minimum TLS 1.3), FTP disabled. Region Canada Central. The default `*.azurewebsites.net` domain and its managed certificate provide HTTPS; no domain is bought.
- **Database:** Neon PostgreSQL, free plan. The app uses the pooled URL (`DATABASE_URL`); migrations use the direct URL (`DATABASE_URL_UNPOOLED`). TLS is required.
- **Delivery:** GitHub Actions builds once on `main`, packages the release (`scripts/package-release.sh`) and deploys it as a zip under the GitHub environment `production`, restricted to `main`. App Service does not rebuild. A smoke test checks the deployed commit, the database and a WebSocket round trip. Procedure: [DEPLOYMENT.md](../DEPLOYMENT.md).
- **Process:** `npm run start -w @incision/web` starts the TypeScript custom server with `tsx` (no `output: standalone`, ADR-0001).

## Alternatives

| Option | Strength | Why not selected |
|---|---|---|
| Ubuntu VM on the same credit | Literally a VPS, persistent disk | OS administration (updates, firewall, TLS renewal) competes with the checkpoint for time. Remains the fallback if a constraint appears. |
| Render Free + Neon | No cost at all | Sleeps after 15 minutes and restarts in about a minute; ephemeral disk. |
| Oracle Always Free | Free VM | Card required, availability not guaranteed. |

## Consequences

- No server to administer; platform updates are Microsoft's. The teacher accepted this managed server for TECH-05.
- **Single instance**: presence and race state stay in memory (ADR-0001). Scaling out would need sticky sessions and a Socket.IO adapter; not planned.
- **Files**: only `/home` persists on App Service and the deployment wipes `wwwroot`. Profile photos (AUTH-04) must be stored in PostgreSQL or under `/home`, decided in their card.
- **Client IP**: requests reach Node through Azure's front end. Per-IP rules (SALLE-04, SALLE-10) must read the client address from the forwarded headers through a trusted chain, never from a header taken at face value.
- **Costs**: B2 consumes the student credit; check it in Cost Management. Neon's free-plan quotas (storage, compute hours, connections) must be watched; the pool is capped at 5 connections per process. Neon's compute only sleeps after a few idle minutes, so the Azure health check uses `/api/health/live`, which never queries the database; a per-minute database probe would exhaust the monthly compute quota and suspend production. For the same reason, Always On's periodic request to `/` and any page reached without a user action must not query the database on every hit.
- **Secrets**: the deployment credential is an environment secret of `production`; app secrets are App Service settings. Nothing secret is committed.
