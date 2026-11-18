# Correctif du refus transitoire invité — PR #209

## Incident et périmètre

Sur `f9d1f293103a5051c837caf44ee993932fcdbf97`, la CI push
[44211029444](https://github.com/PhilJordan18/incision/actions/runs/44211029444)
réussit; la CI PR
[44211045401](https://github.com/PhilJordan18/incision/actions/runs/44211045401)
échoue avec 250 E2E réussis sur 251. Le test concerné est
`room-moderation.spec.ts`, « guest expulsion in results preserves its cookie
deadline and prevents reentry ». L'attente des résultats expire : l'hôte a
terminé, l'invité reste à 17 %.

La trace montre un accusé `UNAVAILABLE` sur le lot invité de séquence 7,
avant l'arrêt des envois. Le contrôleur invité n'avait pas perdu son rôle.
Les journaux ne permettent pas d'attribuer avec certitude cet accusé à une
branche serveur précise : une panne SQL peut aussi produire cette erreur.
Les traces brutes ne sont pas copiées ici, car elles contiennent des données
de session synthétiques.

Un défaut déterministe compatible est reproduit dans `GuestCommandGate` :
une mutation de présence change la génération du verrou logique pendant
l'autorisation SQL; le lot est refusé avant toute application, mais
`UNAVAILABLE` bloque le client jusqu'à resynchronisation. Le correctif
renvoie `RATE_LIMITED` uniquement dans ce cas pré-application. Le client
existant attend 300 ms puis retente le même lot, avec nouvelle autorisation.

## Critères et garde-fous

- Mutation concurrente terminée : premier lot non appliqué, nouvelle
  autorisation SQL, une seule application après nouvelle tentative.
- Révocation concurrente : premier lot non appliqué, nouvelle tentative
  refusée `UNAUTHORIZED`, aucune application.
- Panne SQL après application : `UNAVAILABLE` inchangé, aucune répétition
  automatique de la commande.
- Aucun changement du test E2E, des délais, des seuils, du quota de dix
  commandes par seconde, des cookies ou des règles d'expulsion.

Les deux assertions de concurrence échouent avant le correctif
(`UNAVAILABLE` au lieu de `RATE_LIMITED`, 13 autres tests réussis), puis
les 15 tests du gate et les 21 tests de frappe réussissent : **36/36**.
Le test de frappe existant vérifie le même objet lot renvoyé après 300 ms.

## Vérifications locales

Sous Node 24.13.0 : contrôle TECH-02, lint, types et build réussis. Les suites
unitaires totalisent 2 669 réussites (web 1 121, base 157, domaine 1 259,
charge 21, listes de mots 111). La première exécution complète a dépassé
le délai de 5 s du test `guest-session-limiter` sous concurrence; la suite
web complète repassée avec `--maxWorkers=2` réussit, sans changer le test
ni son délai. Une tentative antérieure en environnement restreint sous
Node 22 a été interrompue après des erreurs d'ouverture de sockets;
elle ne constitue pas une validation.

Les revues manuelles ciblées couvrent le code, la sécurité et la QA :
réautorisation avant application, absence de prolongation d'activité lors
du refus, quotas conservés, révocation prioritaire, et non-répétition après
échec SQL. Aucun constat bloquant sur ce diff; l'exécution E2E complète
reste nécessaire pour confirmer le parcours réel.

## Limites de l'environnement

Vérification dans une copie temporaire dédiée; aucune connexion aux bases
humaines. Docker est arrêté sur le Mac : SQL, intégration et E2E ne sont pas
annoncés comme exécutés localement. Les deux CI de la nouvelle tête doivent
confirmer le résultat complet. Aucun rejeu humain A–G demandé, aucun merge,
déploiement ou fermeture de carte. AUTH-02, SEC-01 et PERF-02 restent partiels;
ce correctif ne lève pas leurs autres réserves.
