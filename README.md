# INCISION — 剃 / SHAVE

Plateforme de course de frappe pour les élèves de 12 à 17 ans. Ce dossier est le **futur dépôt du produit**. À ce stade, il contient le cadrage architectural et l'environnement PostgreSQL local; l'application Next.js n'a pas encore été générée.

## Commencer

1. Lire [le guide de création du projet](docs/SETUP.md).
2. Consulter [la vue d'ensemble de l'architecture](docs/architecture/README.md).
3. Utiliser [le modèle de données](docs/architecture/data-model.md), [les machines à états](docs/architecture/state-machines.md) et [l'ADR temps réel](docs/adr/0001-temps-reel.md) comme contrats de conception pour le développement.

## Sources et autorité

Le cahier des charges **Incision v1.1 remis au client** prime pour le périmètre fonctionnel. La direction artistique **v2** guide l'interface. La matrice détaillée sert à tracer les scénarios et critères de vérification; ses anciennes mentions de « TypeForge » ne renomment pas le produit. Une décision technique proposée ici ne transforme pas une question client ouverte en exigence confirmée.

## Structure visée

```text
incision/
├── apps/web/                 Next.js, React, serveur Node et Socket.IO (à créer)
├── packages/domain/          Règles pures : salle, manche, résultats (à créer)
├── packages/contracts/       Événements et validation partagés (à créer)
├── packages/database/        Schéma Drizzle et migrations PostgreSQL (à créer)
├── docs/                     Conception et décisions
├── compose.yaml              PostgreSQL local uniquement
└── pnpm-workspace.yaml       Espace de travail
```

La séparation est **métier** : identité, salles, courses, textes et résultats possèdent chacune leurs règles, même si le premier déploiement peut utiliser un seul processus Node. Voir [ADR-0001](docs/adr/0001-temps-reel.md).
