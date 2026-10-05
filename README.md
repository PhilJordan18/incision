# INCISION — 剃 / SHAVE

Plateforme de course de frappe pour les élèves de 12 à 17 ans. Le dépôt contient le squelette Next.js, l'environnement PostgreSQL local et le cadrage architectural. L'authentification, les salles temps réel et le déploiement restent à développer.

## Commencer

1. Lire [le guide d'installation et de lancement](docs/SETUP.md).
2. Consulter [l'architecture alignée sur l'énoncé final](docs/ARCHITECTURE.md) et [le plan du checkpoint](docs/architecture/verification.md).
3. Utiliser [le modèle de données](docs/architecture/data-model.md), [les machines à états](docs/architecture/state-machines.md) et [l'ADR temps réel](docs/adr/0001-temps-reel.md) comme contrats de conception pour le développement.
4. Suivre le [guide de contribution](CONTRIBUTING.md) pour le code, les vérifications et les commits.

## Sources et autorité

1. [Énoncé final du travail de session](docs/Web-V-Travail-de-session.pdf) : contraintes et périmètre noté prioritaires.
2. [Matrice officielle des 90 exigences](docs/EXIGENCES.md) : statuts, preuves et choix d'interprétation, avec écarts explicités.
3. [Cahier des charges remis](docs/cahier-des-charges-incision.pdf) : historique conservé, sans appliquer ses règles devenues incompatibles.
4. [Direction artistique V3 complète](docs/da/da_incision.pdf) : 24 pages vérifiées le 3 octobre; ambiance « nuit de course », piste verticale, palette et typographies de référence. Le nom **Incision** est confirmé par Philippe. L'entrée `docs/DEMARCHE-CREATIVE.md` et les preuves de croquis restent à compléter.

La DA reste créative, mais doit respecter les exigences DES : nom/logo créés par l'étudiant, responsive, lisibilité et accessibilité. Une décision technique n'est ni une exigence supplémentaire du prof ni une fonctionnalité déjà livrée.

## Structure du dépôt et modules prévus

```text
incision/
├── apps/web/                 Next.js et React (créés); temps réel à développer
├── packages/domain/          Règles pures : salle, manche, résultats (à créer)
├── packages/contracts/       Événements et validation partagés (à créer)
├── packages/database/        Schéma Drizzle et migrations PostgreSQL (à créer)
├── docs/                     Conception et décisions
├── compose.yaml              PostgreSQL local uniquement
├── package.json              Workspaces npm
└── package-lock.json         Dépendances verrouillées
```

La séparation est **métier** : identité, salles, courses, textes et résultats possèdent chacune leurs règles, même si le premier déploiement peut utiliser un seul processus Node. Voir [ADR-0001](docs/adr/0001-temps-reel.md).
