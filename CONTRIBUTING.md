# Contribuer à Incision

Ce guide s'applique aux contributions humaines et aux agents de développement. Il décrit **comment** travailler; l'[énoncé final et la matrice](README.md#sources-et-autorité) définissent **quoi** construire. Les ambiguïtés se résolvent par des choix raisonnables explicitement consignés dans `docs/EXIGENCES.md` (§2.2 de l'énoncé), pas par des exigences attribuées au client.

## Avant de coder

1. Relire la carte de la fonctionnalité et les exigences qu'elle trace. Si la carte n'existe pas encore, documenter au minimum le besoin, sa source, les critères d'acceptation et les cas limites avant une implémentation importante.
2. Consulter l'[architecture](docs/ARCHITECTURE.md) et les ADR concernés. Ajouter un ADR lorsqu'une décision durable change les contrats, la persistance ou l'exploitation du système.
3. Limiter le changement à un objectif vérifiable. Ne pas ajouter de fonctions « au cas où » ni de besoins absents du cahier.
4. Dans `apps/web`, suivre aussi [les consignes Next.js locales](apps/web/AGENTS.md), notamment la lecture de la documentation de la version installée avant de modifier son code.

## Code et architecture

- Écrire le code produit en TypeScript (`.ts`/`.tsx`), avec `strict` activé. Les configurations peuvent être en JSON. Ne pas introduire de code JavaScript produit ni désactiver les vérifications pour contourner une erreur.
- Une fonction doit avoir une responsabilité claire et un nom qui annonce son résultat ou son effet. Extraire une fonction quand cela clarifie une règle, facilite un test ou élimine une duplication réelle; ne pas découper mécaniquement chaque ligne.
- Viser au plus **trois paramètres positionnels**. Au-delà, revoir la responsabilité de la fonction; utiliser un objet nommé lorsque les arguments forment une seule intention. Ne pas créer un objet fourre-tout pour masquer trop de dépendances.
- Préférer des types explicites aux frontières (requêtes, événements, accès aux données, valeurs retournées publiques). Traiter les données externes comme `unknown` jusqu'à validation par schéma. Aucun `any` explicite : règle ESLint en erreur (TECH-02). Pas de suppression TypeScript sans justification locale; aucune assertion pour contourner une validation absente.
- Garder les règles métier indépendantes de React, de la base de données et du transport temps réel. Les contrôleurs, composants et adaptateurs appellent ces règles; ils ne les recopient pas.
- Préférer des noms descriptifs, des sorties anticipées et une gestion explicite des erreurs aux conditions imbriquées, booléens opaques et fonctions à effets cachés. Commenter le **pourquoi** d'une décision non évidente, pas traduire le code en prose.
- Dans React, garder le rendu pur, ne pas muter les props ou l'état, et dériver les valeurs calculables plutôt que les dupliquer dans un autre état. Utiliser un effet pour synchroniser un système externe, pas pour recalculer ce que le rendu peut calculer. Déstructurer les props lorsqu'elles sont utilisées individuellement; ne pas le faire par automatisme si cela réduit la lisibilité.
- Séparer les composants serveur et client selon leurs besoins réels. Réserver le code client aux interactions et APIs du navigateur; ne jamais exposer un secret serveur dans un composant client.
- Pour PostgreSQL, versionner les migrations, expliciter les transactions couvrant plusieurs écritures liées, et examiner le nombre de requêtes lorsqu'une liste ou un lobby peut contenir de nombreux participants. Ne pas effectuer de changement direct en production sans procédure de migration et retour arrière.

Ces règles visent la lisibilité et la correction. Une exception argumentée et testée vaut mieux qu'une conformité artificielle à un chiffre.

## Vérification d'une contribution

- Ajouter ou mettre à jour les tests proportionnellement au risque : règle métier, cas limite, contrat d'API/événement, ou parcours d'acceptation concerné. Ne pas présenter une fonctionnalité comme testée si aucun test correspondant n'existe.
- Depuis la racine, exécuter au minimum `npm run lint -w @incision/web` et `npm run build -w @incision/web` pour les changements applicatifs. Lancer les suites de tests pertinentes lorsqu'elles seront ajoutées au dépôt. Un changement documentaire seul ne nécessite pas un build complet.
- Vérifier les états d'erreur, la reconnexion et la concurrence pour les parcours temps réel. Tester la navigation clavier, la lisibilité et la traduction des interfaces modifiées.
- Ne jamais commiter `.env`, de secrets ou de données réelles d'élèves. Pour une modification d'authentification, d'autorisation, de partage de résultats ou de données personnelles, demander une revue de sécurité avant intégration.
- Mettre à jour la carte, la matrice et la documentation lorsque le comportement livré ou une décision d'architecture change. Indiquer honnêtement ce qui reste non implémenté.

## Git et commits

Créer les branches de travail depuis `dev` (`feat/…`, `fix/…`, `docs/…`). Les changements vérifiés sont intégrés à `dev`; une livraison stable passe ensuite de `dev` à `main`. Ne pas développer directement sur ces deux branches, ni réécrire leur historique publié. La CI s'exécute sur chaque push et PR; seul `main` publié après contrôles alimente automatiquement la production. Ces protections et workflows sont à configurer, pas supposés actifs.

Faire des commits ciblés au format **Conventional Commits** : `type(portée): description courte`. Types usuels : `feat` (fonctionnalité), `fix` (correction), `docs`, `test`, `refactor` (sans changement de comportement), `perf`, `chore`, `build` et `ci`. La portée est facultative, mais utile : `auth`, `rooms`, `db`, `web`, `docs`.

Exemples :

```text
feat(rooms): permettre de rejoindre une salle par code
fix(auth): refuser une session expirée
docs: préciser les critères d'acceptation des invités
chore(config): aligner les outils sur npm et TypeScript
```

Un commit doit décrire ce qu'il contient réellement. Vérifier `git status` et le diff avant de commiter; ne pas inclure des modifications étrangères à la tâche. Un changement incompatible de contrat doit être signalé explicitement dans la description du commit ou de la revue.

## Références techniques

- [React : structurer l'état](https://react.dev/learn/choosing-the-state-structure) et [garder les composants purs](https://react.dev/learn/keeping-components-pure)
- [TypeScript : mode strict](https://www.typescriptlang.org/tsconfig/strict) et [rétrécissement des types](https://www.typescriptlang.org/docs/handbook/2/narrowing)
