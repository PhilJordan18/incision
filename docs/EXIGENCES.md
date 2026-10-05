# Matrice des exigences — énoncé final

État observé le **2 octobre 2026**, actualisé le **3 octobre** pour la DA complète, les décisions de Philippe et l'hébergement. Les **90 identifiants officiels** ci-dessous proviennent de [Web-V-Travail-de-session.pdf](Web-V-Travail-de-session.pdf). Cette matrice remplace les anciens IDs du cahier pour le suivi de réalisation, sans modifier le [cahier remis](cahier-des-charges-incision.pdf).

**Statuts :** complet = comportement livré et vérifié; partiel = une partie seulement existe; non fait = pas d'implémentation vérifiée. Une décision décrite dans l'architecture ne rend pas sa fonctionnalité complète. « — » dans les tests signifie **aucun test associé existant**, pas un test réussi. Les tests mentionnés dans les notes sont à écrire.

## Technique

| ID | Attendu résumé | Statut | Fichiers principaux existants | Tests associés | Notes et choix |
|---|---|---|---|---|---|
| TECH-01 | Next.js App Router et React, stable actuelle | partiel | apps/web/package.json; apps/web/src/app | — | Squelette installé; version stable à revérifier à la livraison. |
| TECH-02 | TS uniquement, strict, aucun any explicite | partiel | apps/web/tsconfig.json; apps/web/eslint.config.ts | — | Configurations TS/JSON; règle no-explicit-any en erreur et vérification automatisée à garantir. |
| TECH-03 | Tailwind CSS | partiel | apps/web/src/app/globals.css; apps/web/postcss.config.json | — | Intégré au gabarit, pas encore appliqué à l'interface produit. |
| TECH-04 | PostgreSQL, ORM, migrations, seed textes/comptes/historique | partiel | compose.yaml | — | BD locale prévue; Drizzle, migrations et seed non créés. |
| TECH-05 | Serveur/VPS, HTTPS public au checkpoint et à la finale | non fait | — | — | Cégep indisponible; piste VM Azure for Students à vérifier; repli PaaS soumis à accord du prof. |
| TECH-06 | Progression temps réel, transport libre | non fait | — | — | Socket.IO retenu; ADR-0001, pas de serveur implémenté. |
| TECH-07 | Schémas sur toutes les entrées serveur | non fait | — | — | Zod prévu pour HTTP, actions et événements. |
| TECH-08 | Serveur à charge ou cégep; autres services gratuits | non fait | — | — | Contrainte personnelle : 0 $ à débourser. Crédit étudiant possible, sans conversion payante; infrastructure à vérifier. |
| TECH-09 | GitHub Actions : lint, tsc sans émission, unités à chaque push | non fait | — | — | Aucun workflow; build supplémentaire et déploiement après succès prévus. |
| TECH-10 | .env.example complet, aucun secret commité | partiel | .env.example; .gitignore | — | Variables BD locales seulement; compléter avec OAuth, sessions, HTTPS et déploiement. |

## Design

| ID | Attendu résumé | Statut | Fichiers principaux existants | Tests associés | Notes et choix |
|---|---|---|---|---|---|
| DES-01 | Nom original créé par l'étudiant sans IA, démarche écrite | partiel | docs/da/da_incision.pdf | — | Incision confirmé par Philippe le 3 octobre; démarche présente pp.10–11; entrée Markdown absente. |
| DES-02 | Logo étudiant sans IA, croquis, app et favicon | partiel | docs/da/da_incision.pdf | — | Concept et déclinaisons pp.14–15; croquis de l'étudiant et export source à fournir/vérifier, app non intégrée. |
| DES-03 | DA préalable, moodboard 3–5 refs, palette, typographies | partiel | docs/da/da_incision.pdf | — | 24 pages complètes : cinq références, palette p.16, typographies p.17; entrée Markdown et adaptations ci-dessous restantes. |
| DES-04 | Design propre, piste signature, pas de gabarit générique | non fait | — | — | Intention de route verticale conservée; aucun écran produit implémenté. |
| DES-05 | Clair/sombre, défaut système, sélecteur sans flash | non fait | — | — | Les styles système du gabarit ne suffisent pas; pas d'exception mono-thème décidée. |
| DES-06 | Pages ≥360 px; message clavier physique à la place de la course mobile | non fait | — | — | Remplace l'ancienne proposition « téléphone spectateur ». |

## Identité

| ID | Attendu résumé | Statut | Fichiers principaux existants | Tests associés | Notes et choix |
|---|---|---|---|---|---|
| AUTH-01 | OAuth GitHub ET Discord; identifiants locaux permis | non fait | — | — | Les deux OAuth sont requis au checkpoint; local également retenu pour TEST-03. |
| AUTH-02 | Invité avec pseudo 3–20 caractères et cookie signé | non fait | — | — | Identité distincte du socket; décisions D-04, D-07. |
| AUTH-03 | Invité sans création de salle, photo ni historique persistant | non fait | — | — | Avatar généré; aucun transfert d'historique invité au compte. D-03/D-08. |
| AUTH-04 | Photo JPEG/PNG/WebP ≤2 Mo, validation serveur, redimensionnement | non fait | — | — | Stockage persistant local envisageable, pas de service payant nécessaire. |
| AUTH-05 | Modification du pseudo d'affichage | non fait | — | — | Séparé de l'identifiant local et du sujet OAuth. |
| AUTH-06 | Profil : meilleurs/moyens MPM, précision, courses/victoires, courbe | non fait | — | — | Profil personnel d'abord; réseau social hors périmètre noté. |

## Salles

| ID | Attendu résumé | Statut | Fichiers principaux existants | Tests associés | Notes et choix |
|---|---|---|---|---|---|
| SALLE-01 | Compte crée, devient hôte participant ou spectateur | non fait | — | — | Priorité checkpoint. |
| SALLE-02 | Code unique de 6 caractères sans 0/O/1/I/L | non fait | — | — | Stocké lisible, génération aléatoire; D-01. |
| SALLE-03 | PUBLIC / CODE / PRIVATE et accès correspondants | non fait | — | — | PRIVATE refuse toujours le code seul. |
| SALLE-04 | Invitations fortes, suivi, liaison IP, reprise, révocation | non fait | — | — | 32 octets aléatoires; IP + session pour distinguer une classe sous NAT; D-02. |
| SALLE-05 | Capacité 2–30 participants, bots inclus, spectateurs exclus | non fait | — | — | Remplace 50 humains; verrou de salle à l'admission. |
| SALLE-06 | Une seule salle par personne, contrainte BD, pas de doublon onglet | non fait | — | — | Index uniques partiels par compte/session invitée; D-04. |
| SALLE-07 | Expulsion participant/spectateur, réadmission interdite | non fait | — | — | Bannissement par identité et révocation des liens; pas par IP de classe entière. |
| SALLE-08 | Succession au plus ancien humain connecté, sinon fermeture | non fait | — | — | Invité présent éligible selon interprétation D-03; aucun successeur préféré. |
| SALLE-09 | Admission seulement en attente ou aux résultats | non fait | — | — | Pas de nouveau spectateur en course; reconnexion d'un membre distincte. |
| SALLE-10 | Limiter tentatives de code par IP | non fait | — | — | Valeur initiale proposée 10/min; proxy connu, tests de dépassement. |

## Rejoindre

| ID | Attendu résumé | Statut | Fichiers principaux existants | Tests associés | Notes et choix |
|---|---|---|---|---|---|
| JOIN-01 | Champ de code dès l'accueil | non fait | — | — | Priorité checkpoint. |
| JOIN-02 | Explorateur public temps réel, données et filtres langue/complexité | non fait | — | — | Développement après la coupe par code. |
| JOIN-03 | Quickplay vers salle la plus remplie, puis la plus ancienne | non fait | — | — | D-05; si aucune : proposer création au compte, état vide à l'invité. |

## Configuration

| ID | Attendu résumé | Statut | Fichiers principaux existants | Tests associés | Notes et choix |
|---|---|---|---|---|---|
| CONF-01 | Aucun timer ou 30 secondes à 10 minutes | non fait | — | — | Estimation automatique ancienne non requise et différée. |
| CONF-02 | Texte FR/EN indépendant de l'interface | non fait | — | — | Deux paramètres distincts. |
| CONF-03 | Corpus cohérent en BD ou mots aléatoires du dictionnaire | non fait | — | — | Provenance des corpus/dictionnaires à fournir. |
| CONF-04 | Nombre de mots configurable | non fait | — | — | D-10 : découpe aux frontières de mots; borne de sécurité documentée avant implémentation. |
| CONF-05 | Trois complexités aux critères mesurables | non fait | — | — | D-10 définit les critères initiaux. |
| CONF-06 | Ponctuation, nombres, majuscules, accents FR | non fait | — | — | Transformation déterministe avant snapshot; tester toutes combinaisons supportées. |
| CONF-07 | Caractères inclus/exclus en aléatoire; décision pour cohérent | non fait | — | — | Désactivé en cohérent; refuser une combinaison aléatoire impossible, D-10. |
| CONF-08 | Correction obligatoire ou libre | non fait | — | — | Même validateur serveur, règles de compteurs explicites D-09. |
| CONF-09 | Bonus activés ou non | non fait | — | — | Aucun bonus attribué si désactivés. |
| CONF-10 | Ajouter/retirer bots, choisir niveau | non fait | — | — | Cinq profils et capacité commune. |
| CONF-11 | Visibilité et capacité configurables | non fait | — | — | Ne pas accepter une capacité inférieure aux participants présents. |
| CONF-12 | Configuration synchronisée pour tous | non fait | — | — | Révision monotone, snapshot et autorisation hôte. |

## Course

| ID | Attendu résumé | Statut | Fichiers principaux existants | Tests associés | Notes et choix |
|---|---|---|---|---|---|
| COURSE-01 | États explicites et machine documentée | partiel | docs/ARCHITECTURE.md; docs/architecture/state-machines.md | — | Diagramme présent; moteur non implémenté. |
| COURSE-02 | Départ hôte : au moins 2 participants dont 1 humain | non fait | — | — | Bots comptés, spectateurs non; pas de statut prêt obligatoire ajouté. |
| COURSE-03 | Décompte synchronisé 3,2,1; texte révélé à son début | non fait | — | — | Remplace l'ancien décompte de 5 secondes. |
| COURSE-04 | Saisie, feedback, MPM/précision directs, collage désactivé | non fait | — | — | Collage bloqué côté UI, validation/anti-sauts côté serveur. |
| COURSE-05 | Piste avatars/noms/MPM, joueur local, spectateurs, ~4 MAJ/s | non fait | — | — | Interpolation; piste verticale de la DA. |
| COURSE-06 | Serveur autoritaire sur temps/progrès/rang/bonus | non fait | — | — | Lots séquencés et limites plausibles; aucune garantie anti-triche absolue. |
| COURSE-07 | Abandon avec confirmation | non fait | — | — | Terminal pour la manche. |
| COURSE-08 | Reprise sous 30 secondes sinon abandon | non fait | — | — | D-06, tests aux frontières et course finie avant reprise. |
| COURSE-09 | Fin quand tous terminés/abandonnés ou timer atteint | non fait | — | — | Finalisation idempotente. |
| COURSE-10 | Finisseurs par arrivée, temps écoulé par progrès, abandons ensuite | non fait | — | — | MPM ne classe plus les finisseurs; D-09. |
| COURSE-11 | Résultats : relancer/configurer/fermer; autres restent/partent | non fait | — | — | Salle persistante, manches distinctes. |

## Bots et bonus

| ID | Attendu résumé | Statut | Fichiers principaux existants | Tests associés | Notes et choix |
|---|---|---|---|---|---|
| BOT-01 | Cinq niveaux avec paramètres documentés | non fait | — | — | Profils initiaux décrits dans ARCHITECTURE, moteur absent. |
| BOT-02 | Vitesse variable, hésitations et difficulté | non fait | — | — | Simulation à graine; aucune cadence constante. |
| BOT-03 | Erreurs, coût de correction, respect du mode | non fait | — | — | Même moteur métier que les humains. |
| BOT-04 | Identification visuelle et application bonus/malus | non fait | — | — | Pas de privilège de score pour un bot. |
| BOT-05 | Déterminisme par graine et tests unitaires | non fait | — | — | Seed et horloge injectées, tests de répétabilité prévus. |
| BONUS-01 | Attribution aux retardataires aux seuils 25/50/75 %, max 3 | non fait | — | — | D-11 : derniers ex æquo ou écart strictement >25 points. |
| BONUS-02 | Au moins 3 types, aide et ralentissement | non fait | — | — | Proposition -3 mots, +3 mots et brouillard 3 s; D-11. |
| BONUS-03 | Annonce visuelle activation et cible | non fait | — | — | Pas uniquement une annonce sonore. |
| BONUS-04 | Progression/MPM cohérents si longueur modifiée | non fait | — | — | Cible effective, seules frappes réelles comptées; D-09/D-11. |

## Résultats et historique

| ID | Attendu résumé | Statut | Fichiers principaux existants | Tests associés | Notes et choix |
|---|---|---|---|---|---|
| RES-01 | Podium des trois premiers | non fait | — | — | Afficher seulement les places existantes si deux participants. |
| RES-02 | Tableau complet MPM/brut/précision/erreurs/temps/statut/bonus | non fait | — | — | Trois statuts officiels, champs conservés dans les résultats. |
| RES-03 | Courbe MPM de tous et carte des touches manquées personnelles | non fait | — | — | Séries et erreurs agrégées prévues, pas calculées depuis un score final seul. |
| RES-04 | Indicateur de record personnel | non fait | — | — | D-12 : records finis, segments avec/sans bonus et mode d'erreur. |
| RES-05 | Résultats humains connectés persistés, séries MPM comprises | non fait | — | — | D-08 : snapshots des autres pour restituer la course complète. |
| HIST-01 | Historique personnel paginé des courses terminées | non fait | — | — | Index compte/course, pas de liste non bornée. |
| HIST-02 | Réaffichage complet d'une page de résultats | non fait | — | — | Snapshot immuable indépendant du lobby courant. |

## Langues, tests, performance, accessibilité et sécurité

| ID | Attendu résumé | Statut | Fichiers principaux existants | Tests associés | Notes et choix |
|---|---|---|---|---|---|
| I18N-01 | Toute l'UI FR/EN, erreurs/vides/métadonnées compris | non fait | — | — | Pas de chaînes métier en dur. |
| I18N-02 | Sélecteur partout, choix conservé, défaut navigateur | non fait | — | — | Requis sur les pages existantes dès le checkpoint. |
| I18N-03 | Dates et nombres selon locale | non fait | — | — | Utiliser Intl et tests FR/EN. |
| TEST-01 | Tests unitaires des règles | non fait | — | — | Vitest prévu; zéro test métier existant. |
| TEST-02 | E2E Playwright | non fait | — | — | Deux contextes navigateur indépendants pour la salle. |
| TEST-03 | E2E via nom d'utilisateur/mot de passe | non fait | — | — | Seed isolé; ne pas automatiser la connexion aux sites OAuth. |
| PERF-01 | Lighthouse ≥90 dans chaque catégorie sur l'accueil | non fait | — | — | Mesure production à conserver; pas de score présumé. |
| PERF-02 | Trafic de progression limité, pas de SQL par frappe | non fait | — | — | Proposition 10 envois/s/joueur, lots, mémoire serveur. |
| PERF-03 | Piste fluide à capacité maximale | non fait | — | — | Test 30 participants; quota spectateurs séparé si nécessaire et documenté. |
| A11Y-01 | Contraste WCAG AA dans les deux thèmes | non fait | — | — | Vérifier les tokens réels, pas seulement le moodboard. |
| A11Y-02 | HTML sémantique actions/liens/titres/zones/tableaux | non fait | — | — | Revue de chaque écran produit. |
| A11Y-03 | Alternatives d'images, labels de champs | non fait | — | — | Icônes décoratives distinguées du contenu. |
| A11Y-04 | Parcours clavier et focus visible | non fait | — | — | Test de parcours et dialogues. |
| SEC-01 | Autorisation serveur de toute action hôte | non fait | — | — | À vérifier à chaque commande, pas uniquement au handshake socket. |
| SEC-02 | Upload : taille et type réel serveur | non fait | — | — | Décodage/réencodage, pas confiance en extension ou MIME annoncé. |
| SEC-03 | Hash de mot de passe adapté, aucun clair stocké/journalisé | non fait | — | — | scrypt retenu; paramètres et protections login à vérifier à l'implémentation. |

## Écarts avec le cahier remis

| Ancien choix | Nouvelle règle prioritaire |
|---|---|
| Charge de référence 50 humains | Capacité produit 2..30 participants; bots compris, spectateurs exclus (SALLE-05). Une charge supérieure reste un test interne éventuel, pas une nouvelle capacité promise. |
| Reprise jusqu'à 5 minutes; décompte 5 secondes | 30 secondes et 3 secondes (COURSE-08/03). |
| Finisseurs classés au MPM net | Finisseurs classés au temps d'arrivée (COURSE-10); formules de l'annexe A. |
| Quatre bots | Cinq niveaux et déterminisme par seed (BOT-01/05). |
| Invité avec photo et historique récupérable | Avatar généré, aucun historique personnel persistant (AUTH-03). |
| Privé accessible par code; spectateur admis pendant course | Trois visibilités; privé par lien seulement; admissions hors course uniquement. |
| Invitation simplement consommée | Liaison au premier usage à une IP; reprise par le titulaire; révocation et fermeture (SALLE-04). |
| Successeur choisi ou hôte système | Plus ancien humain connecté, sinon fermeture (SALLE-08); quickplay propose la création au compte (JOIN-03). |
| Téléphone spectateur | Message conseillant le clavier physique à la place de la course mobile (DES-06). |
| OAuth reporté après checkpoint | GitHub et Discord requis par AUTH-01 et §7.1. |

Conservés sans élargissement : TypeScript/Next/React/Tailwind, PostgreSQL/Drizzle, validation serveur, CI, déploiement automatique convenu, inspiration visuelle et piste verticale. Différés : timer estimé, texte saisi par l'hôte, profils publics, récupération d'historique invité, annulation volontaire en course, autres extras non notés. Aucune refonte du cahier déjà évalué.

## Choix d'interprétation — §2.2 de l'énoncé

Ces décisions sont des choix du projet, pas des phrases attribuées au prof. Elles seront testées avec leurs fonctionnalités; une clarification du prof les remplacera explicitement.

- **D-01 — Codes.** Uniques même parmi les salles conservées; génération cryptographique et retry sur collision. Alphabet non ambigu, entrée normalisée en majuscules. Limite initiale 10 essais/IP/minute, messages ne divulguant pas les salles privées.
- **D-02 — Invitations.** Jeton 256 bits, digest en BD; premier usage lié à l'IP et au membre/session. Cela empêche deux élèves sous la même IP de partager une invitation. Reconnexion par même identité et IP; une autre IP est refusée conformément au texte. Liens valides tant que la salle est ouverte et non révoqués, pas d'expiration arbitraire à 24 h pendant la salle.
- **D-03 — Succession.** « Humain connecté » désigne une présence réseau active, compte ou invité. AUTH-03 interdit à l'invité de créer, pas d'hériter. Le plus ancien humain devient hôte; sinon fermeture. Point à clarifier avec le prof si son intention était « compte authentifié »; aucune dépendance du prototype n'exige d'attendre cette réponse.
- **D-04 — Identité.** Un compte ou une session invitée ne peut occuper qu'une salle; index uniques partiels en BD. Un cookie effacé ne permet pas de reconnaître une personne anonyme. Multi-onglet = même membre, pas capacité supplémentaire. Pseudo invité 3..20 caractères Unicode, normalisé NFKC/trim; canonisation locale en minuscules, accents conservés. Pas de modification du pseudo global pour une collision locale.
- **D-05 — Quickplay.** « Proche de sa capacité » = moins de places participants libres, puis salle la plus ancienne, puis ID stable. Revalider phase/capacité au moment d'admettre; réessayer une autre candidate en cas de concurrence. Ne pas créer de salle automatiquement sans action du compte.
- **D-06 — Reprise.** Grâce de 30 secondes après perte du dernier socket; reprise acceptée jusqu'à l'échéance incluse. Si la course finit au timer avant l'expiration, statut temps écoulé; sinon abandon au délai. À égalité exacte des échéances, le timer de course prime. Coupure de l'hôte : même grâce, puis succession. Panne complète du processus : course interrompue, pas de promesse de reprise exacte ni de faux résultats.
- **D-07 — Sessions et rétention.** Invité : expiration après 24 h d'inactivité, suppression après fin de présence; données de salle/invitations/bans purgées au plus tard 24 h après fermeture. Session de compte : durée courte proposée de 24 h, gérée par la bibliothèque; pas de « remember me » prioritaire. Politique post-correction à arrêter avant usage réel en école.
- **D-08 — Invités et graphiques.** Pas de profil ni historique personnel invité. Pour HIST-02/RES-03, les résultats enregistrés pour un compte conservent les séries de tous les entrants; l'invité est anonymisé, sans lien vers son cookie, et n'est pas recherchable. La carte thermique reste personnelle. Un invité voit ses résultats en mémoire tant que la salle les présente, sans historique ultérieur.
- **D-09 — Mesure.** Compter les caractères saisis (espaces inclus), pas les touches de navigation/suppression. Une mauvaise insertion compte comme erreur même corrigée; une nouvelle insertion correcte compte comme frappe correcte. Utiliser la même segmentation Unicode normalisée pour cible, saisie et compteurs. En mode libre, un caractère erroné accepté fait avancer l'offset validé par le serveur sans augmenter les frappes correctes; c'est cette position validée qui détermine progression/fin, la précision pénalisant les erreurs. En correction obligatoire, pas d'avancement au-delà de l'erreur. Zéro frappe/temps nul : afficher zéro, jamais NaN/Infinity. Départage de rang exact : précision puis ID stable, après les trois groupes imposés et leur critère principal.
- **D-10 — Textes.** Caractères inclus/exclus désactivés en cohérent; transformations ponctuation/nombres/casse/accents appliquées avant snapshot. Nombre de mots compté par tokens séparés par espaces après normalisation; choisir/découper un passage au nombre demandé, refuser s'il n'existe pas de contenu compatible. Aléatoire : exclure les caractères interdits, garantir les caractères demandés dans le résultat, refuser la configuration impossible. Critères initiaux hors options : facile, mots ≤5 lettres et vocabulaire courant; moyen ≤9 lettres et vocabulaire courant/étendu; difficile autorise mots >9 lettres et vocabulaire rare. Les listes de fréquence, bornes de longueur et métriques exactes seront versionnées avec le corpus, avant de déclarer CONF-05 complet.
- **D-11 — Bonus.** À chaque premier franchissement du meneur de 25/50/75 %, évaluer les entrants actifs : derniers ex æquo ou à plus de 25 points de progression derrière. Au plus une attribution par entrant/jalon, trois au total; pas de bonus si personne n'est réellement derrière. Activation manuelle par défaut, option automatique héritée du cahier. Trois effets proposés : retirer jusqu'à 3 mots non commencés à soi; ajouter 3 mots au meneur actif; brouillard des mots à venir du meneur pendant 3 secondes. Effets interdits sur un résultat terminal, aucun mot déjà saisi supprimé, un texte garde au moins sa partie en cours; une activation devenue sans cible valide est refusée. Bots soumis aux mêmes règles. Franchissements mémorisés pour éviter les doublons après recul de progression; sélecteur pseudo-aléatoire à graine, effets temporaires non cumulés au-delà de leur durée initiale.
- **D-12 — Records.** Record personnel de MPM sur courses terminées, séparé avec/sans bonus et par mode d'erreur pour ne pas comparer des conditions incompatibles. Agrégats du profil explicitement étiquetés; pas de classement scolaire ni de jugement automatisé sur un élève.

## Vigilances non résolues par du code

1. **DA V3 complète reçue :** 24 pages lues le 3 octobre. La direction choisie reste intacte. Adapter dans le produit les anciens exemples : 50/32 → maximum 30 participants; 5→1 → 3→1 pour chiffres et sons; exemple de code B7K4P → six caractères. Les orbites « prêts » restent une idée visuelle, pas une condition de départ supplémentaire imposée. Les autres coureurs estompés doivent rester identifiables/consultables; le thème système reste le défaut technique. DEMARCHE-CREATIVE.md, croquis humains, exports logo et sources sonores encore à compléter. Le PDF n'est pas modifié.
2. **Nom confirmé :** Philippe maintient **Incision** le 3 octobre, distingue son produit d'Incision Academy et ne souhaite pas de renommage. Décision actée; ne plus traiter ce sujet comme un blocage de développement. La recherche déjà consignée reste une trace, pas une validation de DES-01 par l'enseignant ni une conclusion juridique.
3. **Hébergement :** Philippe confirme l'absence de serveur du cégep et de budget personnel. Priorité de recherche : Azure for Students, sans carte ni conversion payante; admissibilité et crédit non vérifiés. Repli Render Free + Neon Free si accepté pour TECH-05. Aucune dépense ni ressource distante créée; [comparaison et limites](architecture/verification.md#hosting-without-spending).
4. **OAuth :** créer/configurer les applications GitHub et Discord et leurs retours localhost/production. Ne jamais déposer leurs secrets dans les cartes ni le dépôt.

## Entretien de la matrice

Chaque carte cite les IDs officiels, un résultat observable, les refus attendus et ses tests. À la fusion, remplacer les fichiers projetés par les vrais chemins et les « — » par les tests réellement exécutés. La conception seule ne valide pas les fonctionnalités. Les quatre documents finaux obligatoires sont ARCHITECTURE, EXIGENCES, DEMARCHE-CREATIVE et IA; les deux derniers ne sont pas encore complets/créés.
