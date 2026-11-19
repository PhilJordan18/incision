# Validations de Philippe — 18 novembre 2026

Recette locale `http://localhost:3887`, commit `ecb279fefb87d190bc9aab1c2aaa660fd2b88ff4`.
Source : déclarations explicites dans le chat actif et captures jointes, pas des tests exécutés par l’agent.

- **Accents natifs Safari** : `a` maintenu → `2` → `â`, puis `e` maintenu → `1` → `é`. Philippe demande de clore ce point. `ê` absent du texte, donc non testé directement; aucune validation directe de `è` inventée.
- **T1 / CONF-01, D-17** : course sans limite acceptée. La capture `unlimited-finish.png` montre Alice arrivée à **11:29,4**, et le bot arrivé à 5:43,8. Elle confirme une durée supérieure à dix minutes; elle ne détaille pas chaque frappe intermédiaire.
- **T2 / SALLE-03, JOIN-02** : public → sur code déjà validé par Philippe le 17 novembre au soir, confirmé le 18. Le SHA exact de cette séance antérieure n’est pas fourni; ne pas l’attribuer à une exécution nouvelle.
- **T3 / SALLE-07** : refus de réentrée validé. Les captures montrent l’avis d’expulsion puis le message générique trompeur lors de la réentrée. La réserve concerne le message, pas l’efficacité du bannissement. Le nouveau message n’est pas encore une validation humaine du futur code.
- **T4 / JOIN-03** : absence de salle disponible, création seulement sur demande et réglages par défaut acceptés par « Tout est valide » en réponse au protocole T1–T5. Aucune capture spécifique de cet état vide n’est attribuée.
- **T5 / AUTH-06, D-12/D-24** : statistiques et records par mode acceptés dans la même déclaration. Les captures ne montrent pas les quatre combinaisons; la preuve reste le témoignage, complété par les tests techniques existants.
- **AUTH-01 / OAuth** : Philippe confirme que GitHub et Discord fonctionnent depuis le checkpoint 1. Les preuves du 7 octobre, y compris le correctif Discord, sont conservées. Ce n’est plus une recette fonctionnelle manquante. Aucun nouvel accès aux fournisseurs ni contrôle de déploiement distant revendiqué.

## Corpus

Philippe accepte les passages présentés sauf les numéros **7 et 8** :
`en-kipling-just-so-cat-opening` et `en-twain-life-mississippi-ch09-face-water`.
Les deux étaient déjà `spare`, donc jamais tirés. Il accepte les autres cas présentés,
y compris les réserves éditoriales signalées; aucune relecture personnelle de chaque
source n’est inventée. La sélection du reste du corpus reste déléguée selon D-21.
La version suivante conserve les 120 autres entrées et toutes les versions historiques.
Cette décision n’autorise pas un import de production.

## Autorisation et limites

« Go, corrige le message d’expulsion et termine la finalisation du corpus et d’OAuth
avec toutes les validations reçues puis envoit ton rapport au chat “Structurer le projet Typeracer”. »
Autorisation d’implémentation et de transmission reçue dans le chat actif.
Aucun `deliver`, merge ou ordre de production. A–G restent attribués à leurs versions.
