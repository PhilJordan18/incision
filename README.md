# INCISION — 剃 / SHAVE

Plateforme de course de frappe pour les élèves de 12 à 17 ans.

**Production :** https://incision-cmd7bxg2cacvdeby.canadacentral-01.azurewebsites.net

Le dépôt contient le serveur personnalisé Next.js + Socket.IO, sa CI et son pipeline de déploiement sur Azure, le schéma PostgreSQL avec migrations versionnées, l'authentification (GitHub, Discord, comptes locaux), ma direction artistique appliquée en français et en anglais avec thèmes clair et sombre, et les salles rejointes par code avec présence en direct. Le code de `dev` comprend les courses autoritaires, les bots, le mode Arcade, les résultats et leur journal des bonus, ainsi que l’historique privé. La présence du code ne certifie pas son activation en production; les réserves humaines et distantes restent dans la matrice.

## Pour commencer

1. Lire [le guide d'installation et de lancement](docs/SETUP.md).
2. Consulter [l'architecture alignée sur l'énoncé final](docs/ARCHITECTURE.md) et [le plan de livraison jusqu'à la remise finale](docs/architecture/verification.md).
3. Utiliser [le modèle de données](docs/architecture/data-model.md), [les machines à états](docs/architecture/state-machines.md) et [l'ADR temps réel](docs/adr/0001-realtime.md) comme contrats de conception pour le développement.
4. Suivre le [guide de contribution](CONTRIBUTING.md) pour le code, les vérifications et les commits.
5. Déployer et exploiter la production avec [le guide de déploiement](docs/DEPLOYMENT.md).

## Technologies et vérifications locales

Node.js 24, npm 11, Next.js 16.4.3, React 19.3, TypeScript strict, Tailwind CSS 4,
Socket.IO, PostgreSQL 17 et Drizzle. Les versions exactes sont verrouillées dans
`package-lock.json`.

Depuis une copie neuve, suivre [SETUP.md](docs/SETUP.md) : dépendances, `.env`
privé, PostgreSQL, migrations, comptes puis corpus `2026-10-25.4`, avant le serveur.
[`.env.example`](.env.example) décrit les variables; les clés locales sont générées
pour cette copie, jamais reprises d’un autre environnement. Le seed d’historique
synthétique est une étape facultative distincte.

```sh
npm run check:no-js
npm run lint
npm run typecheck
npm test
npm run build
# Serveur db-test isolé démarré selon SETUP.md :
TEST_DATABASE_URL=postgresql://incision_test:incision_test_only@localhost:5433/postgres npm run test:db -w @incision/database
npm run test:integration -w @incision/web
npm run test:e2e -w @incision/web
```

Les tests SQL créent leurs bases temporaires; les suites intégration et E2E
recréent leurs propres bases `incision_e2e*`. Ne jamais les viser sur une base à
conserver. Les tests PgBouncer exigent une configuration distincte : un skip
n’est pas une validation du pooler.

## Captures du produit

Captures automatisées sur données synthétiques, issues de la qualification du
6 novembre; elles ne sont pas une nouvelle recette humaine ni des captures de production.

![Journal des bonus en français, thème clair](docs/evidence/bonus-journal-2026-11-06/journal-fr-aube-390.png)

[Autres captures FR/EN, clair/sombre et largeurs](docs/evidence/bonus-journal-2026-11-06/README.md).

La [qualification intégrée](docs/evidence/integrated-2026-11-08/README.md) et la
[recette humaine ciblée restante](docs/RECETTE-FINALE.md) précisent les preuves et limites de remise.

## Comptes de démonstration

Comptes locaux fictifs pour les démonstrations et les tests de bout en bout, sans aucun privilège. Ces mots de passe sont **volontairement publics** et ne servent nulle part ailleurs; ce ne sont pas des secrets techniques (ceux-ci se trouvent seulement dans Azure, GitHub et les fichiers `.env` locaux).

| Nom d'utilisateur | Mot de passe | Nom d'affichage |
|---|---|---|
| `demo-alice` | `brume-alice-4817` | Alice (demo) |
| `demo-bruno` | `brume-bruno-2096` | Bruno (demo) |

Ils existent partout où le seed a été exécuté : en local après `npm run db:seed:demo -w @incision/database`, dans la base de données E2E, et en production une fois que j'exécute le workflow de seed ([DEPLOYMENT.md](docs/DEPLOYMENT.md#comptes-de-démonstration)). Se déconnecter avec l'un d'eux met fin à toutes ses sessions, y compris aux démonstrations d'autres personnes.

## Sources et autorité

1. [Énoncé final du travail de session](docs/Web-V-Travail-de-session.pdf) : contraintes et périmètre évalué, qui priment.
2. [Matrice officielle des 90 exigences](docs/EXIGENCES.md) : statuts, preuves et choix d'interprétation, avec les écarts rendus explicites.
3. [Cahier des charges remis](docs/cahier-des-charges-incision.pdf) : historique conservé, sans appliquer ses règles devenues incompatibles.
4. [Direction artistique](docs/da/da_incision.pdf), version finale du 6 octobre (27 pages) : ambiance « Nuit de course », piste verticale, palette, typographies, démarche du logo et croquis. Sa traduction prête pour le code, [`apps/design/`](apps/design/README.md), est la source de vérité visuelle (jetons, composants, écrans de référence, logos). Le nom **Incision** et le logo sont mon propre travail; la façon dont je les ai trouvés et dessinés est décrite dans [la démarche créative](docs/DEMARCHE-CREATIVE.md).

La direction artistique reste créative, mais doit respecter les exigences DES : nom/logo créés par l'étudiant, responsive, lisibilité et accessibilité. Une décision technique n'est ni une exigence supplémentaire de l'enseignant ni une fonctionnalité déjà livrée.

## Structure du dépôt

```text
incision/
├── apps/web/                 Next.js, React et Socket.IO; salles, course, résultats et historique
├── apps/design/              Ma source de vérité visuelle : jetons, écrans, wireframes, logos
├── packages/domain/          Règles pures : textes, course, bots, bonus et mesures
├── packages/database/        Schéma Drizzle, migrations, transactions, corpus et résultats
├── docs/                     Conception et décisions
├── compose.yaml              PostgreSQL local seulement
├── package.json              Workspaces npm
└── package-lock.json         Dépendances verrouillées
```

Le découpage se fait par **domaine métier** : identité, salles, courses, textes et résultats possèdent chacun leurs règles, même si le premier déploiement peut utiliser un seul processus Node. Voir [ADR-0001](docs/adr/0001-realtime.md).
