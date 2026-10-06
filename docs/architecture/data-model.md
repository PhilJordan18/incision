# Modèle de données PostgreSQL

Modèle conceptuel aligné le 2 octobre 2026, **non migré**. Source : énoncé final et choix explicites dans [EXIGENCES.md](../EXIGENCES.md). Le diagramme principal est dans [ARCHITECTURE.md](../ARCHITECTURE.md). Identifiants internes UUID, dates UTC serveur, migrations Drizzle versionnées.

## Tables cibles

| Table | Champs structurants | Invariants |
|---|---|---|
| `accounts` | id, login?, login_canonical?, display_name, password_hash?, avatar_key?, dates | Identifiant local unique, distinct du pseudo modifiable. Compte OAuth sans mot de passe permis. Pas de courriel conservé selon le cahier; pas de récupération par courriel. |
| `oauth_identities` | account_id, provider, provider_subject | Couple fournisseur + sujet unique; GitHub et Discord. Pas de fusion automatique par pseudo. Les jetons fournisseur ne sont pas conservés s'ils ne servent qu'à la connexion. |
| `guest_sessions` | id, secret_digest, expires_at | Cookie signé prouvant une identité invitée; aucune photo téléversée, aucun historique personnel. Le pseudo appartient à la présence en salle. |
| `lobbies` | id, code, visibility, capacity, host_member_id, phase, created_at, closed_at?, revision | Code 6 caractères non ambigus unique; visibilité PUBLIC / CODE / PRIVATE. Capacité 2..30 participants, bots inclus, spectateurs exclus. Hôte humain actif de cette salle. |
| `lobby_settings` | lobby_id, revision, max_duration_ms?, language, text_kind, word_count, complexity, options, error_mode, bonuses_enabled, bonus_activation | Une configuration par salle. Timer nul ou 30 000..600 000 ms. Options validées par schéma; version figée au départ. Activation manuelle par défaut, automatique facultative. |
| `lobby_members` | id, lobby_id, account_id?, guest_session_id?, bot_level?, role, display_name, display_name_canonical, joined_at, left_at? | Exactement un sujet : compte / invité / bot. Bot parmi cinq niveaux, rôle participant. Un humain est participant ou spectateur. Déconnexion temporaire ≠ départ. |
| `lobby_invitations` | id, lobby_id, token_digest, bound_member_id?, bound_ip_digest?, bound_at?, revoked_at? | Jeton aléatoire de 32 octets. Premier usage lie l'IP et la session humaine; réutilisation par cette identité/IP permise. Révocation sur expulsion, invalidation à fermeture. |
| `lobby_bans` | lobby_id, account_id? ou guest_session_id?, created_at | Empêche toute réadmission de cette identité dans cette salle, par code, lien ou accès direct. Pas de bannissement global par IP d'une classe entière. |
| `texts` | id, content, language, word_count, complexity, rights_reference | Corpus réel en base, provenance vérifiable. Dictionnaires versionnés/seedés pour le mode aléatoire. Pas de texte utilisateur obligatoire. |
| `races` | id, lobby_id, round_no, state, config_snapshot, text_snapshot, seed, rules_version, countdown_at, started_at?, ended_at?, interruption_reason? | Manche historique distincte de la salle; unique (lobby_id, round_no). Snapshot du texte généré même sans text_id de corpus. |
| `race_entrants` | id, race_id, member_id?, account_id?, kind, name_snapshot, avatar_snapshot, target_snapshot, effective_target_chars | Identités figées au départ, sans spectateurs; member_id nullable après purge de salle. account_id permet l'historique du compte. Invité archivé sous un libellé anonymisé sans guest_session_id. |
| `race_results` | entrant_id, outcome, elapsed_ms, progress_chars, target_chars, correct_inputs, total_inputs, errors, net_mpm, gross_mpm, accuracy, rank, abandonment_reason? | Un résultat final par entrant. Statuts FINISHED / TIMED_OUT / ABANDONED; une expiration réseau est un motif d'abandon, pas une quatrième catégorie de classement. |
| `race_mpm_samples` | entrant_id, elapsed_ms, net_mpm, gross_mpm | Série temporelle persistée pour restituer le graphique collectif; clé (entrant_id, elapsed_ms). Échantillonnage proposé : 1 Hz + échantillon final. |
| `race_key_errors` | entrant_id, expected_key, error_count | Agrégats pour la carte thermique du joueur; pas de journal brut durable de toutes ses touches. Accès personnel. |
| `race_bonus_events` | id, race_id, checkpoint, recipient_id, target_id?, type, granted_at, activated_at?, payload | Attribution idempotente par course/jalon/bénéficiaire; au plus 3 bonus par entrant. Changements de cible et effets temporaires rejouables. |

Le schéma d'authentification dépend du prototype Auth.js. Avec des sessions JWT, une table `auth_sessions` n'est **pas** une obligation conceptuelle; ne pas mélanger les deux stratégies. Le cookie invité reste distinct et signé. Aucune migration ne sera déclarée conforme avant exécution sur PostgreSQL.

## Unicité, identité et concurrence

- `UNIQUE(account_id) WHERE left_at IS NULL` et `UNIQUE(guest_session_id) WHERE left_at IS NULL` sur les membres : **une salle active par identité**, y compris spectateur (SALLE-06). Les NULL des bots ne créent pas de collision.
- Un second onglet retrouve le même membre. Une reconnexion pendant la grâce réutilise sa ligne; après un vrai départ, une réadmission autorisée crée une nouvelle présence et donc une nouvelle ancienneté.
- `UNIQUE(lobby_id, display_name_canonical) WHERE left_at IS NULL` : désambiguïsation locale des pseudos. Le compte ne change pas silencieusement son pseudo global pour une collision locale.
- Canonisation proposée : trim, NFKC, minuscules; accents conservés. Valider longueur et caractères de contrôle après normalisation; ne pas assimiler toutes les écritures visuellement proches. Le pseudo invité compte 3..20 caractères Unicode selon la convention de segmentation documentée.
- `UNIQUE(code)` avec alphabet `23456789ABCDEFGHJKMNPQRSTUVWXYZ`. Code stocké lisible : ce n'est pas un secret d'authentification; la protection repose sur visibilité, permissions et limitation par IP. Une salle PRIVATE refuse le code.
- La capacité ne peut pas être garantie par un simple CHECK inter-lignes : verrouiller la salle, compter ses participants actifs, puis insérer/changer de rôle dans la même transaction.
- L'hôte doit référencer un membre de **la même salle**, humain et actif. Contrainte composite ou validation transactionnelle; créer salle, membre créateur et lien d'hôte atomiquement.
- Les onglets ne sont pas des participants supplémentaires. On ne peut garantir l'unicité d'une personne anonyme ayant effacé son cookie ou changé de navigateur : le périmètre de SALLE-06 est l'identité prouvée.

## Invitations et IP

Le jeton d'invitation est haché en base. L'IP est normalisée puis représentée par une empreinte HMAC contextualisée par salle; sa valeur brute n'est pas exposée dans la liste des invitations. Seuls les en-têtes d'un reverse proxy connu sont fiables.

L'IP seule ne prouve pas l'identité : plusieurs élèves peuvent partager la même IP publique. On lie donc également le lien au membre/session du premier usage. Même IP + autre cookie n'admet pas un second invité. Un changement d'IP est refusé, conformément à SALLE-04, même s'il gêne une reconnexion Wi-Fi/mobile. Cette contrainte et la gestion d'un cookie perdu doivent être expliquées à l'utilisateur.

## Transactions critiques

1. **Créer / rejoindre / changer de salle** : identité, visibilité, bannissement, phase et capacité vérifiés; contraintes d'unicité globales. Un changement proposé est confirmé avant de quitter la salle actuelle. Les verrous de deux salles sont pris dans un ordre stable.
2. **Consommer une invitation** : verrouiller invitation/salle, lier IP + membre une seule fois et admettre atomiquement; une répétition valide retourne le même membre.
3. **Expulser / partir** : marquer left_at, ajouter le bannissement si expulsion, révoquer les liens associés, puis sélectionner l'hôte suivant ou fermer. Diffuser après commit.
4. **Démarrer** : hôte autorisé, phase EN_ATTENTE, au moins deux participants dont un humain présent; figer configuration/texte/entrants et démarrer le décompte. Un double clic ne crée pas deux courses.
5. **Terminer** : finalisation idempotente des résultats, séries, erreurs et bonus; passer aux résultats dans la même transaction. Les tentatives répétées n'ajoutent ni victoires ni échantillons en double.

## Calculs et historique

Appliquer l'annexe A : MPM net = (caractères correctement tapés / 5) / minutes; brut = (caractères tapés / 5) / minutes; précision = corrects / total × 100; progression = caractères validés / cible effective. Espaces compris. Ne pas multiplier une seconde fois le MPM net par la précision.

Le temps est celui du serveur depuis le départ, pas seulement le temps connecté. Distinguer compteurs de saisie et avancement dans le texte. Suppression, correction, accents composés et mode libre nécessitent des tests de référence; décisions détaillées dans EXIGENCES. Aucun bonus ne crédite de frappes jamais effectuées.

Classement : FINISHED par arrivée, puis TIMED_OUT par progression, puis ABANDONED par progression figée. Le profil et l'historique appartiennent au compte; pas de recherche de profils publics imposée. Les snapshots anonymisés des invités/bots ne permettent pas de consulter un historique personnel d'invité.

## Rétention et exploitation proposées

- Sessions invitées : expiration après 24 h d'inactivité, prolongée uniquement par activité authentifiée; purge après expiration et fin de présence. Fermer/purger les salles vides, invitations/IP et bans au plus tard 24 h après fermeture.
- Conserver les snapshots anonymisés utiles aux résultats des comptes; ne pas conserver les liens vers l'identité invitée. Ne pas promouvoir un ancien historique invité à la création d'un compte.
- Pour les comptes, rétention pendant le projet jusqu'à la correction; politique après correction à décider avant usage scolaire réel. Ce choix technique n'est pas une certification juridique.
- Progression vivante en mémoire, pas d'écriture à chaque touche. Connexion perdue : état conservé pendant la grâce; résultat/séries écrits en fin de course. Une panne du processus n'a pas de reprise exacte garantie dans cette version : marquer la course interrompue et ne pas inventer ses résultats.
- Index : membres actifs, OAuth, code, exploration publique (phase/visibilité/dates), courses par salle, entrants par compte/course et séries par entrant/temps. Pagination d'historique; chargements groupés évitant N+1.

## Coupe de données pour le checkpoint 1

Comptes, identités GitHub/Discord, sessions invitées si livrées, salles, configuration minimale et membres : ces éléments constituent la première migration. Contraintes d'unicité globale, appartenance et capacité dès l'admission, pas une correction tardive. OAuth **n'est plus reporté**.

Un seed initial permet une démonstration reproductible avec comptes locaux non réels. Corpus puis historique de démonstration sont ajoutés avec les tables de jeu; TECH-04 reste partiel tant que le seed complet demandé n'existe pas. Ne pas créer les tables du jeu uniquement pour remplir le diagramme.
