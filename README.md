# INCISION — 剃 / SHAVE

Typing race platform for students aged 12 to 17. The repository contains the custom Next.js + Socket.IO server, its CI and Azure deployment pipeline, the PostgreSQL schema with versioned migrations, and the architectural framing. Authentication, realtime rooms and the race itself are still to be developed.

## Getting started

1. Read [the installation and launch guide](docs/SETUP.md).
2. Consult [the architecture aligned with the final brief](docs/ARCHITECTURE.md) and [the checkpoint plan](docs/architecture/verification.md).
3. Use [the data model](docs/architecture/data-model.md), [the state machines](docs/architecture/state-machines.md) and [the realtime ADR](docs/adr/0001-realtime.md) as design contracts for development.
4. Follow the [contribution guide](CONTRIBUTING.md) for code, checks and commits.
5. Deploy and operate production with [the deployment guide](docs/DEPLOYMENT.md).

## Sources and authority

1. [Final brief of the term project](docs/Web-V-Travail-de-session.pdf): constraints and graded scope, which take priority.
2. [Official requirements matrix of the 90 requirements](docs/EXIGENCES.md): statuses, evidence and interpretation choices, with deviations made explicit.
3. [Submitted specification](docs/cahier-des-charges-incision.pdf): history kept, without applying its rules that have become incompatible.
4. [Complete art direction V3](docs/da/da_incision.pdf): 24 pages checked on October 3; "race night" mood, vertical track, reference palette and typefaces. The name **Incision** is confirmed by Philippe. The `docs/DEMARCHE-CREATIVE.md` entry and the sketch evidence are still to be completed.

The art direction stays creative, but must meet the DES requirements: name/logo created by the student, responsive, readability and accessibility. A technical decision is neither an additional teacher requirement nor an already delivered feature.

## Repository structure and planned modules

```text
incision/
├── apps/web/                 Next.js and React (created); realtime to be developed
├── packages/domain/          Pure rules: room code, logins, display names (more to come)
├── packages/contracts/       Shared events and validation (to be created)
├── packages/database/        Drizzle schema, migrations, room creation, migrator
├── docs/                     Design and decisions
├── compose.yaml              Local PostgreSQL only
├── package.json              npm workspaces
└── package-lock.json         Locked dependencies
```

The separation is by **business domain**: identity, rooms, races, texts and results each own their rules, even if the first deployment may use a single Node process. See [ADR-0001](docs/adr/0001-realtime.md).
