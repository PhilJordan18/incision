# INCISION — 剃 / SHAVE

Plateforme de course de frappe pour les élèves de 12 à 17 ans. Le dépôt contient le squelette Next.js, l'environnement PostgreSQL local et le cadrage architectural. L'authentification, les salles temps réel et le déploiement restent à développer.

## Commencer

1. Lire [le guide d'installation et de lancement](docs/SETUP.md).
2. Consulter [la vue d'ensemble de l'architecture](docs/architecture/README.md).
3. Utiliser [le modèle de données](docs/architecture/data-model.md), [les machines à états](docs/architecture/state-machines.md) et [l'ADR temps réel](docs/adr/0001-temps-reel.md) comme contrats de conception pour le développement.
4. Suivre le [guide de contribution](CONTRIBUTING.md) pour le code, les vérifications et les commits.

## Sources et autorité

Le cahier des charges **Incision v1.1 remis au client** prime pour le périmètre fonctionnel. La direction artistique **v2** guide l'interface. La matrice détaillée sert à tracer les scénarios et critères de vérification; ses anciennes mentions de « TypeForge » ne renomment pas le produit. Une décision technique proposée ici ne transforme pas une question client ouverte en exigence confirmée.

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
