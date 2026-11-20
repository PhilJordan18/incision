# Recette au lecteur d'écran — salle d'attente (DA2-5a, DA2-5b, DA2-8)

Scénario à exécuter par une personne avec un vrai lecteur d'écran. **Il n'a pas encore été
exécuté** : les tests automatiques (axe, arbre d'accessibilité, attributs ARIA) ne remplacent pas
cette recette et ne doivent pas être présentés comme elle.

## Préparation

- Lecteur d'écran et navigateur : VoiceOver avec Safari (macOS), ou NVDA avec Firefox ou Chrome
  (Windows). Noter la version utilisée dans le tableau de résultats.
- Deux navigateurs (ou un navigateur et une fenêtre privée) : compte hôte et compte membre.
- L'hôte crée une salle « Sur code », le membre la rejoint. Interface en français, puis une
  seconde passe en anglais pour les étapes marquées (EN).
- Tout se fait au clavier. Ne pas regarder l'écran pour décider si une étape réussit : c'est
  l'annonce entendue qui compte.

## A. Structure de la salle (DA2-5a) — hôte

| # | Action | Annonce attendue |
|---|---|---|
| A1 | Lister les régions (rotor VoiceOver, touche D de NVDA) | Dans cet ordre : « Code de la salle », « Réglages de la course », « Visibilité de la salle », « Capacité de la salle », « Invitations », « Équipage », « Bots », « Modération de la salle ». |
| A2 | Lister les titres | « Salle d'attente » niveau 1 ; un titre de niveau 2 par région ; dans « Équipage », « Participants » et « Spectateurs » niveau 3 avec leur compte (« Spectateurs 0 / 20 »). |
| A3 | Parcourir le haut de la page | Le quai décoratif, les fanions et les insignes ne sont **pas** annoncés. |
| A4 | Tabuler depuis le titre | « Quitter la salle », « Copier le code », « Lancer la course » (avec la note des réglages en description), « Fermer la salle ». |
| A5 | Le membre rejoint pendant la lecture | Le compteur « n / capacité participants » et la ligne du membre sont lus à jour en y revenant ; aucune annonce intempestive ne coupe la lecture. |
| A6 | Même parcours côté membre | Aucun bouton d'hôte (ni « Lancer la course », ni « Fermer la salle », ni « Modifier… », ni régions « Invitations » et « Modération »). |

## B. Lignes de bots (DA2-5b) — hôte, deux bots ajoutés

| # | Action | Annonce attendue |
|---|---|---|
| B1 | Aller sur « Modifier Bot 1 » | « Modifier Bot 1, bouton, réduit » (ou « non développé »). |
| B2 | Entrée | Le focus arrive sur la liste « Niveau du bot 1 » ; son nom et sa valeur sont lus, puis « Aucune modification en attente. ». |
| B3 | Choisir un autre niveau | Annonce, sans bouger le focus : « Modification non enregistrée : … Choisis « Changer le niveau » pour enregistrer. » |
| B4 | Maj+Tab jusqu'au premier bouton de la ligne | « Annuler : Bot 1, bouton, développé ». |
| B5 | Activer « Annuler » | Le focus reste sur le bouton, relu « Modifier Bot 1, réduit » ; plus de liste. |
| B6 | Rouvrir, changer, « Changer le niveau » | « Modification en cours… » puis « Niveau du bot enregistré. » ; le focus revient sur « Modifier Bot 1 ». |
| B7 | Ouvrir Bot 1 et Bot 2 avec un brouillon chacun ; le membre quitte puis rejoint | Les deux listes gardent leur valeur ; aucune ligne ne se referme. |
| B8 | Depuis un second onglet de l'hôte, retirer un bot, puis dans le premier « Changer le niveau » sur une ligne | Le refus est annoncé comme alerte (« ⚠ La salle a changé… » ou « Ce bot ne fait plus partie… ») et le focus arrive sur « Recharger la salle ». |
| B9 | (EN) Refaire B1 à B5 | "Edit Bot 1", "Cancel: Bot 1", "Unsaved change: …", "No unsaved changes." |

## C. Formulaire des réglages (DA2-8) — hôte

| # | Action | Annonce attendue |
|---|---|---|
| C1 | Activer « Modifier les réglages » | Le focus arrive sur « Langue du texte » ; le groupe « Texte » est annoncé à l'entrée. |
| C2 | Tabuler dans tout le formulaire | À chaque changement de groupe, son nom : « Texte », « Options du texte », « Durée », « Mode de frappe », « Mode de jeu ». Chaque champ est lu avec son étiquette et son aide. |
| C3 | Changer la langue | Le champ est relu avec « Non enregistré, Enregistré : Français » ; le compte « 1 modification en attente. » est annoncé sans déplacer le focus. |
| C4 | Mettre 9 dans « Nombre de mots » | Champ annoncé « non valide » avec « Choisis de 10 à 200 mots. » ; « Enregistrer les réglages » est annoncé indisponible. |
| C5 | Décocher « Aucune limite », mettre 29 | « Durée maximale (secondes) », non valide, « Choisis « Aucune limite » ou une durée entière de 30 à 600 secondes. » (lu avec le champ, sans alerte pendant la frappe). |
| C6 | Corriger (50 et 45), « Enregistrer les réglages » | « Enregistrement… » puis « Réglages enregistrés. » ; le focus revient sur « Modifier les réglages » ; le résumé relu donne les nouvelles valeurs. |
| C7 | Rouvrir, changer une valeur ; depuis un second onglet de l'hôte enregistrer autre chose | Alerte « Les réglages ont changé dans un autre onglet. Ton brouillon est conservé… » ; les champs sont annoncés indisponibles avec leurs valeurs ; « Recharger les réglages » est atteignable. |
| C8 | « Type de texte » : Mots aléatoires, complexité Facile, exclure `aeiouybcdfglmnprst`, décocher Ponctuation, Majuscules, Accents ; enregistrer | Alerte « Ces réglages de texte ne peuvent pas produire de texte. … » et le focus arrive sur le champ concerné (« Complexité »), annoncé non valide. |
| C9 | Échap dans le formulaire | Le formulaire se ferme, le focus revient sur « Modifier les réglages ». |
| C10 | Côté membre, lire la région « Réglages de la course » pendant que l'hôte enregistre | Le résumé à jour est lu ; aucun bouton. |
| C11 | (EN) Refaire C1 à C5 | "Text", "Duration", "Typing mode", "Game mode"; "Unsaved, Saved: …"; "1 pending change." |

## Résultats

| Date | Lecteur d'écran et navigateur | Étapes réussies | Écarts (numéro d'étape, annonce entendue) |
|---|---|---|---|
| | | | |

Un écart n'est pas forcément un défaut du site : certains lecteurs d'écran n'annoncent pas
`aria-expanded` ou relisent autrement les descriptions. Noter l'annonce exacte.
