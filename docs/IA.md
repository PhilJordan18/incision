# Utilisation de l'IA

Livrable final prévu par l'énoncé (§8). Le journal détaillé des erreurs de mes agents, avec ses preuves, est en annexe : [annexes/ia-journal.md](annexes/ia-journal.md).

## Mon utilisation de l’IA dans le projet

Pour ce projet (comme dans tous mes projets d’ailleurs), j’ai utilisé main dans la main Codex et Claude Code. Au départ, Codex servait plus souvent au cadrage, à la logique et à l’architecture, et Claude était la plupart du temps l’exécutant principal. Fais que le flow initial était ainsi :

Je réfléchis à un moyen d’implémentation → Je brainstorm avec Codex → On recoupe les idées → Plan précis → Passation à Claude pour l’exécution.

En parallèle, le cours d’Écosystème abordait les processus agentiques. Fait que j’ai commencé petit à petit à collecter de quoi pour préparer le projet : des skills, des agents et des instructions utilisables par les deux outils. Une fois l’énoncé final reçu, on a rédigé les issues GitHub à partir de la matrice des requis. Le cours de Projet d’intégration m’a appris les protocoles qu’on peut inculquer aux agents : le plan d’implémentation, les validations humaines, par exemple un ordre express pour pousser une branche, et le merge qui reste de mon côté. L’idée était de suivre ce qui était demandé, réalisé et testé, pas juste prendre ce que les agents me donnent, et de faire aussi mes recettes, avec des captures et des retours sur le site.

### Un flow qui a évolué pendant le projet

La séparation entre Codex et Claude était utile, mais elle a aussi créé un trop-plein. Il faut lire les rapports d’un côté, transmettre les informations de l’autre, puis relire pour bien corroborer les infos et garder le contexte. À force, ça devient éprouvant : je ne gérais pas juste le projet, je gérais aussi le passage d’information entre les deux outils, et l’accumulation des rapports rendait difficile de savoir simplement où on en est. Quand un agent disait « terminé », il fallait encore comprendre : le code écrit, les tests passés, la branche poussée, ou la modification vraiment intégrée ?

C’est une des raisons pour lesquelles Codex a commencé à entrer davantage dans le dev. Au lieu que tout passe par moi d’un outil à l’autre, il avançait sur ses propres lots (invités, bots, courbes des résultats, réglages de salle, qualification) pour que le truc puisse avancer. Ça répartissait le travail, mais ça demandait de faire attention aux modifications en parallèle et de vérifier que les parties fonctionnaient ensemble.

### Ce que les contraintes de ma machine m’ont appris

Avec mon Mac en fin de vie, j’ai appris plein de trucs aussi : mieux utiliser le harnais, régler l’autocompact à 300k sur Claude et faire du développement sur le cloud pour épargner ma machine, puis récupérer les rapports et les modifications pour les vérifier. Ça m’a fait comprendre que ces outils ne se limitent pas à écrire un bon prompt : il y a aussi le contexte qu’on fournit, les limites qu’on pose, les autorisations, les ressources et la reprise quand une session s’arrête ou perd son contexte.

## Agents et fichiers d'instructions

- **Outils** : Claude Code (exécutant principal; sous-agents de revue de code, QA fonctionnelle, sécurité, base de données, UI/UX et déploiement; sessions parallèles, puis dans le cloud) et Codex (cadrage, architecture, revues, puis lots de développement). J'approuve chaque plan, je relis et fusionne chaque pull request, et je décide de chaque étape vers la production. Claude a aussi proposé les textes de course selon mes critères; je les ai acceptés sans relire chaque source (D-21, détail en annexe).
- **Hors du code** : le mode IA de Google pour des noms, tous écartés; Claude pour la mise en page du dossier de DA et des maquettes de principe. Le nom, le logo final et les décisions visuelles sont de moi ([DEMARCHE-CREATIVE.md](DEMARCHE-CREATIVE.md), section 10).
- **Instructions commitées** : [AGENTS.md](../AGENTS.md), [CLAUDE.md](../CLAUDE.md), [apps/web/AGENTS.md](../apps/web/AGENTS.md), [.agents/](../.agents/) (flux, rôles, skills) et [.claude/](../.claude/) (adaptateurs et permissions).

## Trois situations où l'IA s'est trompée

1. **7 octobre — plafond caché de 10 minutes (Claude).** Claude m'a recommandé un plafond caché quand l'hôte choisit « aucun » temps maximal; je l'ai d'abord validé, alors que CONF-01 dit « aucun ». La revue de Codex l'a relevé avant l'implémentation, et D-17 a été réécrit.
2. **12 octobre — une correction qui en casse une autre (Claude).** Sur la génération des textes, une correction de revue a laissé des guillemets et des parenthèses orphelins; les confirmations suivantes ont trouvé un traitement quadratique, puis une normalisation non idempotente. Les revues rejouées l'ont vu, pas les vérifications finales; chaque correctif a un test qui échoue sans lui.
3. **La préparation de la production (Codex).** Un exemple qui m’a vraiment frustré, c’est quand Codex est resté bloqué toute une nuit sur la préparation de la production. De mon côté, j’ai vu mes crédits diminuer sans avoir le résultat attendu. J’ai dû reprendre moi-même la création de la branche de sauvegarde Neon, la configuration de la connexion, les migrations et l’import du corpus avec les commandes fournies. Fait que l’agent était censé me faire gagner du temps, mais je me suis retrouvé à superviser longtemps puis à finir les opérations moi-même. Ça m’a appris qu’il faut aussi fixer une limite : quand l’agent ne progresse plus, il doit expliquer précisément ce qui bloque et passer la main rapidement.

L'annexe compte 43 erreurs (23 de Claude, 16 de Codex, 4 sans agent nommé) : 41 corrections intégrées à `dev`, puis portées en production par la promotion #221 le 20 novembre, et 2 changements de méthode. Les PR #212, #216 et #220 sont désormais fusionnées.

## Ma réflexion personnelle

Je pense que l’utilisation des outils IA apporte un plus, notamment d’un point de vue performance. Je n’ai qu’à regarder le code pour me rendre compte que je n’aurais pas pu coupler une telle qualité de code à une vitesse d’exécution pareille, même si ça ne veut pas dire que tout ce que les agents font est automatiquement correct.

Mais malgré le gain évident en efficacité, le travail reste vraiment lourd : il y a tant de choses que je dois gérer, contrôler. Avant, j’étais serein par rapport à mes projets du moment que je les avais faits. Mais en faisant Incision, je suis devenu un peu « insécure » ? Ou plutôt, j’étais en état d’alerte, genre si on me demande : « Comment tu fais pour gérer le live pour les salles et les courses ? »

Ça pousse à souvent aller vérifier le code, aller vérifier le code. Est-ce que je comprends ce qui a été implémenté, ou est-ce que je comprends surtout l’explication que l’agent m’en a donnée ? Ce n’est pas tout à fait la même chose.

Je me dis qu’avec les agents, on code moins (ou plus du tout), mais on passe maintenant plus de temps à les monitorer. Fait que, le long du cours, ce n’était plus vraiment seulement un défi technique, mais plutôt d’évaluer si on peut livrer un produit à un client dans les délais fixés, en gardant le contrôle sur ce qui est livré.

J’ai pris des décisions, fait des tests, demandé des corrections et tenté de reprendre des inspirations qui me parlent pour la DA ou autre. Mais il y a vraiment un décalage entre ce projet et moi : avoir dirigé sa réalisation ne me donne pas le même sentiment que d’avoir écrit moi-même chaque partie. Au final, je ne remets pas en question le gain que ces outils apportent. Par contre, produire plus vite et s’approprier ce qu’on produit sont deux choses différentes. Le défi est aussi là : profiter de leur efficacité sans perdre ma compréhension du projet ni ma capacité à expliquer et à assumer les choix qui ont été faits.
