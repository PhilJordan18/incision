# Réconciliation après intégration — 17 novembre 2026

## Référence et limites

Base : `dev 5619c6e1167c198cf668c11b0fd8bcb092626303`, après les fusions
humaines de #204, #205, #201, #203, #202 et #206.
Cette tranche est documentaire. Aucun code, service, volume, compte, ancienne
recette ou donnée de production n’a été modifié. Le dossier de travail principal,
ses fichiers non suivis et les piles Aegis/HackSorel sont préservés.

## Preuves vérifiées

- [CI post-merge](https://github.com/PhilJordan18/incision/actions/runs/44153734667),
  tâche 134288748601 : succès. Journaux lus : 1 120 + 157 + 1 259 + 21 + 111 =
  **2 668 unitaires**, **433 SQL**, **11 intégration**, **251 E2E** réussis.
  **9 tests PgBouncer ignorés**, pas réputés réussis.
- [Recette humaine A–G](../human-2026-11-17/README.md) : déclarations de Philippe
  et captures, acceptées les 16–17 novembre; Safari et Brave pour G.
  La campagne du 11 novembre reste conservée.
- [Champ et trajets](../f04-3d-typing-pad-routes/README.md) : preuves historiques
  des modes, collage/glisser, focus, spectateurs, 30/50 marqueurs simulés,
  langues, thèmes, axe et mouvements réduits. La recette C lève l’attente
  d’acceptation de la disposition et des couleurs; ce n’est pas une charge réelle.
- [Bouton de création](../account-empty-room-2026-11-17/README.md) et
  [correctif Next.js](../next-security-2026-11-17/README.md) : preuves distinctes
  de la recette initiale, désormais intégrés; leur régression est couverte par
  la CI intégrée. Aucun déploiement déduit de leur fusion.

## Cartes et matrice

Clôture justifiée des cartes #51 (frappe), #53 (piste) et #59 (bots) :
leurs critères techniques documentés sont intégrés, les contrôles CI réussissent
et la recette B/C/D/G est reçue. Les commentaires de clôture gardent les limites
des tests synthétiques et de la production.

CONF-08, CONF-10, COURSE-04, COURSE-05 et BOT-04 passent à **complet**.
Cela ne ferme pas automatiquement leurs cartes parentes ni les campagnes de
charge, de sécurité ou de déploiement. Les autres statuts partiels restent à
réconcilier critère par critère : ils ne représentent pas tous du code manquant.

#82 reste ouverte : quatre dispositions locales sont livrées et acceptées,
mais sa demande plus large inclut QWERTZ et une préférence de profil.
Ces options ne deviennent pas des obligations du sujet par leur présence au board.
#102 reste ouverte : preuve du pooler local distincte de Neon non vérifié.
Les cartes de remise, IA personnelle, portfolio et démonstration ne sont pas
fermées par des tests logiciels.

## Reste avant de revendiquer 100 %

1. Terminer le rapprochement des autres cartes ouvertes avec leurs critères
   officiels et les preuves existantes : distinguer une note périmée d’un vrai
   manque. Ne pas convertir chaque réserve historique en nouvelle exigence.
2. Lever les réserves de qualification encore documentées : charge maximale
   avec la piste actuelle, parcours invités en charge et effets Arcade;
   contrôler la campagne de sécurité/autorisation et les mesures SQL associées.
   Les anciennes mesures ne prouvent pas les nouvelles variantes.
3. Recette delta seulement là où les preuves manquent : course illimitée active
   au-delà de dix minutes, réentrée après bannissement, quickplay vide,
   visibilité public → code et agrégats/records par mode. Évaluer d’abord les
   tests existants; demander une confirmation humaine uniquement si nécessaire.
4. Confirmer les exceptions éditoriales du corpus pour la production et les
   documents personnels de remise (démarche créative, bilan IA, portfolio,
   démonstration et dépôt Léa) avec Philippe; ne pas inventer son travail.
5. Préparer ensuite une promotion dev → main sur un SHA figé, avec autorisation
   explicite de production. Contrôles OAuth réel, Neon/pooler, HTTPS,
   déploiement et Lighthouse de la version publiée sont distincts de la CI.
   Toute action sur ces ressources demande son autorisation propre.

## Version finale et améliorations

La version fonctionnelle peut rester la candidate de remise. Les travaux UI
futurs se font à part et ne doivent pas retarder ou remplacer cette référence
sans nouvelle recette. Rappel d’activité actuel conservé; pas de modale requise.
Curseur-boussole, son marin, refonte pirate globale et heatmap thermique restent
des améliorations séparées, pas des critères artificiels de complétude.

## Vérification de cette tranche

Relecture architecte documentaire : références immuables, séparation des preuves
humaines/automatisées/production et absence de changement de règle.
Contrôles : diff sans erreurs d’espacement, liens locaux ajoutés résolus,
identifiants et doublons de la matrice contrôlés. Aucun build local relancé pour
ces seuls fichiers Markdown (CONTRIBUTING). Aucun push ou merge dans cette tranche;
publication documentaire en attente de « deliver ».
