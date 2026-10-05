# Livraison et preuves — checkpoint 1 puis finale

Mise à jour du **3 octobre 2026**, selon les précisions de Philippe : remise du checkpoint **mercredi 7 octobre**, heure non précisée; objectif interne maintenu au **lundi 5 octobre**. Mardi et mercredi servent de marge de vérification, pas à ajouter des fonctionnalités. Remise finale : **13 novembre 2026**. Aucun serveur fourni par le cégep; budget **0 $ à débourser**.

## Ce qui existe réellement

Squelette Next.js, TypeScript/Tailwind, workspaces npm, PostgreSQL local par Compose, règles de contribution et conception. **Pas encore** d'authentification, migrations Drizzle, serveur Socket.IO, tests métier, GitHub Actions ou URL HTTPS vérifiée. Les documents ajoutés ne remplacent pas ces preuves.

| Ligne notée au checkpoint | Situation observée | Condition de clôture |
|---|---|---|
| Cahier des charges — 20 | Remis par Philippe; copie conservée. | Ne pas refaire le document déjà remis; appliquer les nouvelles règles au code. |
| Démarche / DA — 20 | DA V3 complète, 24 pages lues; nom Incision confirmé, cinq références, palette, typographies et maquettes présentes. | DEMARCHE-CREATIVE.md, preuves de croquis humains, logo exportable et application dans l'app; adapter les exemples de règles devenus anciens. |
| Architecture — 20 | ARCHITECTURE.md, modèle, états, ADR et approche bots alignés. | Relire contre la première migration et le prototype réel, diagrammes lisibles. |
| Production — 20 | Non démontrée. | Serveur HTTPS, GitHub ET Discord fonctionnels, PostgreSQL et migrations réelles. |
| Salle par code / temps réel — 10 | Non implémentée. | Création, admission et présence synchronisées dans deux navigateurs. |
| CI, langue, thème, qualité, matrice — 10 | Matrice initiale des 90 IDs créée; autres éléments absents/incomplets. | Workflow exécuté, vrais tests, sélecteurs fonctionnels, statuts honnêtes. |

## Chemin critique immédiat

Ces lots sont des unités de travail vérifiables, pas des promesses de durée. Ils peuvent être réalisés dans une même journée disponible; ne pas attendre une date pour commencer le suivant.

### CP-01 — Démontrer l'exécution et la livraison

- Vérifier l'admissibilité Azure for Students et le crédit, puis la VM, l'adresse HTTPS, les volumes et le coût couvert jusqu'à correction. Repli gratuit soumis à validation TECH-05 si nécessaire. Aucun secret dans une carte, aucune conversion payante.
- Aligner Node 24, types Node, npm et scripts racine lint/typecheck/test/build.
- Installer Zod/Vitest, créer quelques tests de règles réelles (code, capacité, autorisation), GitHub Actions sur chaque push/PR.
- Faire tourner Next + Socket.IO en dev **et production**, derrière HTTPS; PostgreSQL persistant. Conserver un test de fumée, vérifier redémarrage.
- Déploiement automatique depuis main après vérifications; rollback applicatif sans effacer la BD. Ne pas provisionner de service payant sans budget approuvé.

**Sortie :** URL HTTPS et CI verte; transport et base joignables. Une page publiée seule ne termine pas le checkpoint.

### CP-02 — Identité et premières migrations

- Prototype de bibliothèque d'authentification : GitHub, Discord, compte local haché; session reconnue côté temps réel. Ne pas consacrer un jour à une authentification maison.
- Migrations Drizzle : comptes/identités, salles/membres et contraintes d'unicité. Seed de comptes de test isolés, aucune donnée d'élève.
- Refus visiteur/invité sur création et actions réservées; protections des callbacks et origines.
- Prévoir les deux applications OAuth et leurs URL de retour, localhost puis HTTPS.

**Sortie :** les deux connexions OAuth marchent sur le site public; identifiants locaux utilisables pour les tests. TECH-04 reste partiel si corpus/historique du seed final ne sont pas encore possibles.

### CP-03 — Tranche salle de bout en bout

- Compte crée une salle sur code, choisit participant/spectateur; code à six caractères.
- Second navigateur rejoint, membres synchronisés, départ visible. Schémas et autorisation côté serveur.
- Contrainte une salle par identité, double onglet sans doublon, capacité bornée et code invalide refusé.
- Test Playwright avec deux contextes et comptes locaux; test SQL de concurrence. Version invitée si incluse, test du cookie signé.
- Un prototype sur code utilise la visibilité CODE, jamais une salle PRIVATE acceptant un code par erreur.

**Sortie :** démonstration reproductible à deux navigateurs en production; chemins de refus vérifiés.

### CP-04 — Identité visuelle, langue, thème et remise

À faire progressivement avec CP-02/03, pas seulement à la dernière heure :

- Appliquer logo fourni par Philippe, favicon, palette et typographies validées; ne pas générer nom ou logo.
- Tous les écrans existants FR/EN, défaut navigateur, choix persistant; deux thèmes, défaut système, sans flash; contrôle à 360 px et au clavier.
- Ajouter DEMARCHE-CREATIVE.md avec les preuves réelles du dossier complet.
- Compléter fichiers/tests/statuts de la matrice; ajuster le diagramme au schéma exécuté.
- Relire le dépôt cloné proprement, URL publique et droits de lecture du prof. Fournir le fichier de remise contenant liens GitHub et site selon sa consigne.

**Sortie :** checklist ci-dessous satisfaite; pas d'ajout d'une fonctionnalité finale au détriment d'un critère checkpoint.

## Acceptation avant de remettre

- [ ] Le prof ouvre l'URL HTTPS hors de notre session locale.
- [ ] GitHub et Discord se connectent réellement; annulation/erreur sont gérées.
- [ ] Une migration reconstruit la base; les données persistent après redémarrage.
- [ ] A crée, B rejoint par code, les deux voient les mêmes membres sans rafraîchir.
- [ ] Double onglet, code invalide et création non authentifiée n'altèrent pas la salle.
- [ ] Le dernier push a exécuté lint, tsc --noEmit, tests; le déploiement publié correspond au commit attendu.
- [ ] Langue et thème fonctionnent sur toutes les pages existantes; logo final visible et favicon remplacé.
- [ ] DEMARCHE-CREATIVE complet, ARCHITECTURE avec diagrammes/ADR/bots, EXIGENCES avec 90 IDs et preuves sincères.
- [ ] Aucun secret commité; démo, accès professeur et procédure de lancement vérifiés.

## Trajectoire jusqu'au 13 novembre

| Fenêtre cible | Résultat testable | Périmètre |
|---|---|---|
| Maintenant → lundi 5 octobre | Fondations publiques utilisables | CP-01 à CP-04. La disponibilité serveur/OAuth est le risque principal. |
| 6–7 octobre | Vérification et remise mercredi | Tampon, tests de production, liens de remise; pas de fonctionnalité supplémentaire prioritaire. |
| 8–11 octobre | Salles complètes et textes | Trois visibilités, invitations IP/session, exclusions/succession, explorateur/quickplay, corpus/dictionnaires et configuration. |
| 12–18 octobre | Première vraie course de bout en bout | États, 3 s, frappe/correction, autorité serveur, abandon/reprise 30 s, fin/classement. |
| 19–25 octobre | Résultats durables et bots | Séries MPM, carte thermique, profil/historique, cinq bots déterministes et tests. |
| 26 octobre–1 novembre | Bonus et finition fonctionnelle | Trois bonus, seuils/idempotence, cibles variables, réglages restants, ADR bots. |
| 2–8 novembre | Durcissement | Charge 30, Lighthouse, accessibilité, mobile, sécurité, E2E, erreurs et exploitation. |
| 9–12 novembre | Gel et répétition de remise | Dépôt propre, seed complet, README/captures, matrice vérifiée, IA.md avec trois cas réels, démo/URL et sauvegarde. |
| 13 novembre | Remise | Tampon réservé aux incidents, aucune fonction ambitieuse planifiée ce jour-là. |

Les dates sont un **plan de travail**, pas de nouvelles échéances du prof. Avancer les lots dès qu'ils passent leurs critères; garder de la marge compte tenu des cours et du travail de Philippe.

## Processus léger

Une carte courte par tranche : objectif, IDs officiels, données/permissions, critères observables, cas de refus et preuves. Branche depuis dev; revue/test puis fusion dev; release main quand stable. Les revues architecture, sécurité, données et UX interviennent selon le risque, sans sept agents obligatoires en série.

Conserver la vision portfolio dans la qualité du moteur, les tests reproductibles et la piste distinctive. Différer réseau social, classe d'enseignant, MFA, infrastructure distribuée et autres extensions jusqu'à couverture du périmètre noté.

## Hébergement sans dépense

Recherche du 3 octobre, aucune inscription ou ressource distante créée.

1. **Piste prioritaire : Azure for Students.** Offre de 100 USD de crédit utilisable sur 12 mois, sans carte, pour étudiants admissibles de 18 ans et plus, à temps plein, dans un établissement admissible. Le courriel scolaire doit être vérifié. Ce n'est pas un serveur gratuit illimité : estimer VM, disque, IP et trafic jusqu'après la correction. Garder l'abonnement étudiant et sa limite : crédit épuisé = service désactivé; ne pas convertir en Pay-As-You-Go. Proposition technique : VM Linux, application conteneurisée, PostgreSQL sur volume et reverse proxy HTTPS. Configuration précise seulement après vérification de l'offre disponible. [Offre et conditions Microsoft](https://azure.microsoft.com/en-us/pricing/offers/ms-azr-0170p).
2. **Repli : Render Free pour Next/Socket.IO + Neon Free pour PostgreSQL.** Serveur applicatif compatible WebSocket, mais pas VPS administré : accord du prof nécessaire pour TECH-05. Render dort après 15 minutes sans trafic, redémarre en environ une minute, a un disque éphémère et des quotas; aucune preuve de performance à 30 joueurs avant test. Pas d'images persistantes sur son disque. Sans moyen de paiement, les dépassements prévus par la documentation entraînent des suspensions plutôt qu'une extension facturée. Ne pas choisir Render Postgres Free pour la finale : il expire après 30 jours. Neon Free évite cet essai BD de 30 jours, mais ses quotas doivent être suivis. [Render Free](https://render.com/docs/free), [WebSocket](https://render.com/docs/websocket), [Neon Free](https://neon.com/blog/neon-free-plan-1-gb-per-project).
3. **Oracle Always Free n'est pas la piste prioritaire.** Carte requise avec possibilité de retenue temporaire, disponibilité des VM non garantie : mauvais pari si aucune avance n'est possible et livraison lundi. [FAQ Oracle](https://www.oracle.com/cloud/free/faq/).

Ne pas acheter de domaine : rechercher un nom DNS fourni ou une solution DNS gratuite compatible avec HTTPS et les callbacks OAuth. Aucun keep-alive artificiel pour contourner la mise en veille d'un forfait. Tant qu'accès, budget couvert et déploiement ne sont pas vérifiés, TECH-05/08 restent non faits.
