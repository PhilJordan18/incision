# INCISION — 剃 / SHAVE

Plateforme de course de frappe pour les élèves de 12 à 17 ans.

**Production :** https://incision-cmd7bxg2cacvdeby.canadacentral-01.azurewebsites.net

Le dépôt contient le serveur personnalisé Next.js + Socket.IO, sa CI et son pipeline de déploiement sur Azure, le schéma PostgreSQL avec migrations versionnées, l'authentification (GitHub, Discord, comptes locaux), ma direction artistique appliquée en français et en anglais avec thèmes clair et sombre, et les salles rejointes par code avec présence en direct. La course elle-même est la prochaine étape.

## Pour commencer

1. Lire [le guide d'installation et de lancement](docs/SETUP.md).
2. Consulter [l'architecture alignée sur l'énoncé final](docs/ARCHITECTURE.md) et [le plan de livraison jusqu'à la remise finale](docs/architecture/verification.md).
3. Utiliser [le modèle de données](docs/architecture/data-model.md), [les machines à états](docs/architecture/state-machines.md) et [l'ADR temps réel](docs/adr/0001-realtime.md) comme contrats de conception pour le développement.
4. Suivre le [guide de contribution](CONTRIBUTING.md) pour le code, les vérifications et les commits.
5. Déployer et exploiter la production avec [le guide de déploiement](docs/DEPLOYMENT.md).

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

## Structure du dépôt et modules prévus

```text
incision/
├── apps/web/                 Next.js, React et Socket.IO (créé); la course reste à développer
├── apps/design/              Ma source de vérité visuelle : jetons, écrans, wireframes, logos
├── packages/domain/          Règles pures : code de salle, identifiants, noms d'affichage (d'autres à venir)
├── packages/contracts/       Événements et validation partagés (à créer)
├── packages/database/        Schéma Drizzle, migrations, création de salle, migrateur
├── docs/                     Conception et décisions
├── compose.yaml              PostgreSQL local seulement
├── package.json              Workspaces npm
└── package-lock.json         Dépendances verrouillées
```

Le découpage se fait par **domaine métier** : identité, salles, courses, textes et résultats possèdent chacun leurs règles, même si le premier déploiement peut utiliser un seul processus Node. Voir [ADR-0001](docs/adr/0001-realtime.md).
