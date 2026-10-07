# INCISION — 剃 / SHAVE

Typing race platform for students aged 12 to 17. The repository contains the custom Next.js + Socket.IO server, its CI and Azure deployment pipeline, the PostgreSQL schema with versioned migrations, authentication (GitHub, Discord, local accounts) and the architectural framing. Realtime rooms and the race itself are still to be developed.

## Getting started

1. Read [the installation and launch guide](docs/SETUP.md).
2. Consult [the architecture aligned with the final brief](docs/ARCHITECTURE.md) and [the checkpoint plan](docs/architecture/verification.md).
3. Use [the data model](docs/architecture/data-model.md), [the state machines](docs/architecture/state-machines.md) and [the realtime ADR](docs/adr/0001-realtime.md) as design contracts for development.
4. Follow the [contribution guide](CONTRIBUTING.md) for code, checks and commits.
5. Deploy and operate production with [the deployment guide](docs/DEPLOYMENT.md).

## Demo accounts

Fictitious local accounts for demonstrations and the end-to-end tests, without any privilege. These passwords are **public on purpose** and used nowhere else; they are not technical secrets (those live only in Azure, GitHub and local `.env` files).

| Username | Password | Display name |
|---|---|---|
| `demo-alice` | `brume-alice-4817` | Alice (demo) |
| `demo-bruno` | `brume-bruno-2096` | Bruno (demo) |

They exist wherever the seed ran: locally after `npm run db:seed:demo -w @incision/database`, in the E2E database, and in production only once Philippe has approved and run the seed workflow ([DEPLOYMENT.md](docs/DEPLOYMENT.md#demo-accounts)). Signing out with one of them ends all its sessions, including other people's demonstrations.

## Sources and authority

1. [Final brief of the term project](docs/Web-V-Travail-de-session.pdf): constraints and graded scope, which take priority.
2. [Official requirements matrix of the 90 requirements](docs/EXIGENCES.md): statuses, evidence and interpretation choices, with deviations made explicit.
3. [Submitted specification](docs/cahier-des-charges-incision.pdf): history kept, without applying its rules that have become incompatible.
4. [Art direction](docs/da/da_incision.pdf), final version of October 6 (27 pages): "race night" mood, vertical track, palette, typefaces, logo process and sketches. Its code-ready translation, [`apps/design/`](apps/design/README.md), is the visual source of truth (tokens, components, reference screens, logos). The name **Incision** and the logo are Philippe's. The `docs/DEMARCHE-CREATIVE.md` entry is still to be completed.

The art direction stays creative, but must meet the DES requirements: name/logo created by the student, responsive, readability and accessibility. A technical decision is neither an additional teacher requirement nor an already delivered feature.

## Repository structure and planned modules

```text
incision/
├── apps/web/                 Next.js and React (created); realtime to be developed
├── apps/design/              Visual source of truth by Philippe: tokens, screens, wireframes, logos
├── packages/domain/          Pure rules: room code, logins, display names (more to come)
├── packages/contracts/       Shared events and validation (to be created)
├── packages/database/        Drizzle schema, migrations, room creation, migrator
├── docs/                     Design and decisions
├── compose.yaml              Local PostgreSQL only
├── package.json              npm workspaces
└── package-lock.json         Locked dependencies
```

The separation is by **business domain**: identity, rooms, races, texts and results each own their rules, even if the first deployment may use a single Node process. See [ADR-0001](docs/adr/0001-realtime.md).
