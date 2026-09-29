# Matrice de vérification de l'architecture

Ce document relie les livrables du **troisième volet (20 points)** aux démonstrations que l'équipe devra produire. Les autres lignes de la grille du checkpoint — HTTPS, authentification, salle temps réel, CI/CD, langue/thème — exigent de l'application en marche; cette documentation seule ne les valide pas.

| Objet évalué | Preuve de conception présente | Preuve à produire pendant l'implémentation |
|---|---|---|
| Modèle de données | [Entités, relations, contraintes et transactions](data-model.md). | Schéma Drizzle, migrations versionnées, tests de contraintes et d'invitation concurrente. |
| Machine à états | [Salle, manche, entrant, connexion et hôte](state-machines.md). | Tests de chaque transition autorisée/interdite; tests du compte à rebours et des DNF. |
| ADR temps réel | [ADR-0001](../adr/0001-temps-reel.md) avec alternatives, décision, risques et critères. | Prototype Socket.IO à deux navigateurs, reprise, mesures à 50 humains, décision d'hébergement confirmée. |
| Traçabilité | Cahier v1.1 et matrice ancienne distingués dans [la vue d'ensemble](README.md). | Reporter les IDs de la matrice dans les tickets/tests lors du développement; marquer les divergences résolues. |

### Correspondance avec le cahier remis

| Exigences | Décision architecturale |
|---|---|
| `ID-01…08` | `accounts`, identités OAuth, sessions et confidentialité; identité invitée séparée. |
| `SAL-01…10` | Salle persistante, membres, invitations, succession et matchmaking; accès par code ou lien. |
| `RAC-01…10` | Manche figée, entrant, connexion orthogonale, résultats et classements. |
| `TXT-01…05` | Texte de catalogue ou privé avec provenance et copie immuable dans la manche. |
| `BOT-01…03`, `BON-01…04` | Sujet bot sans rôle d'hôte; bonus journalisés et limités à Arcade. |
| `STA-01…05` | Résultats historiques, compteurs bruts et confidentialité des statistiques. |
| `EXP-01…04`, `LIV-01…08` | Interface bilingue et deux thèmes; TypeScript, PostgreSQL, HTTPS, temps réel, tests et livraison à vérifier séparément. |

## Scénarios à automatiser progressivement

Au checkpoint 1, viser d'abord la création/rejoindre par code et la synchronisation de base (scénario 1, partie code), plus les tests unitaires des états déjà implémentés. Les autres scénarios couvrent les prochaines itérations du projet; ils ne sont pas tous requis en démonstration dans six jours.

1. Un compte crée une salle privée; un invité la rejoint par **code**; un second invité entre par **lien unique**; la réutilisation du lien échoue.
2. Un humain et un bot prêts démarrent une manche; deux humains non prêts ne la démarrent pas; l'hôte peut rester spectateur.
3. Le départ verrouille la configuration pendant cinq secondes; un nouvel arrivant voit la manche mais ne devient pas coureur.
4. Si Arcade est livré, le mode `STANDARD` refuse les bonus. Le mode `ARCADE` garde ses résultats et ses règles séparés; activation manuelle par défaut, automatique sur choix de l'hôte.
5. Une annulation confirmée laisse la salle ouverte et ne crée aucun résultat; un abandon écrit un DNF avec progression conservée.
6. Le départ volontaire de l'hôte choisit le successeur prévu ou, à défaut, le compte présent le plus ancien; une coupure courte ne transfère pas immédiatement le rôle.
7. Un joueur revient avant cinq minutes; un joueur absent jusqu'à la fin obtient `DNF_DISCONNECTED`; un joueur connecté au timer obtient `DNF_TIMEOUT`.
8. Le classement des finisseurs dépend du WPM net; les DNF viennent ensuite et se départagent par progression en Standard. La règle Arcade à cible variable reste à confirmer. Les résultats officiels ne changent pas selon l'ordre d'arrivée des messages du client.
9. Cinquante connexions humaines participent à une salle pendant dix minutes; la mesure vérifie latence et cohérence, en tenant compte du fait que « 50 » est une garantie de charge et non un plafond produit.

## État réel au 29 septembre 2026

- Documents d'architecture : créés.
- Application Next.js, schéma Drizzle, migrations et tests : **pas encore créés**.
- Déploiement HTTPS, authentification, salle temps réel, CI/CD : **pas encore démontrés**.
