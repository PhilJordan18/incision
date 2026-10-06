# Incision — Dossier de design pour le code

Ce dossier est la **source de vérité visuelle** du site Incision. Avant de coder ou de modifier un écran, lis ce fichier, ouvre l'image de l'écran dans `screens/` et la maquette HTML correspondante dans `wireframes-html/`. Si le code et ce dossier ne disent pas la même chose, c'est ce dossier qui a raison.

```
incision-design/
├── README.md              ← ce fichier : règles, jetons, composants, spécification écran par écran
├── tokens.css             ← jetons (Tailwind v4 @theme) + thème clair « Aube »
├── CLAUDE.md.snippet      ← à coller dans le CLAUDE.md du dépôt
├── screens/               ← 17 images PNG, une par écran (référence visuelle)
├── wireframes-html/       ← les mêmes écrans en HTML (valeurs exactes : tailles, espacements, textes)
├── logo/                  ← logotype et icône en SVG (rouge, noir, blanc)
└── reference/             ← direction artistique complète (PDF, 27 pages)
```

Pile visée : Next.js (App Router) + React + TypeScript + Tailwind CSS v4, PostgreSQL.

---

## 1. Les 10 règles qui ne se discutent pas

1. **La nuit d'abord.** Le fond est toujours Abysse `#05070D`. Les surfaces sont Nuit `#0C1424`, les bordures Houle `#22324D`. Le thème clair « Aube » existe parce que le cahier l'exige, mais tout se conçoit d'abord en sombre.
2. **Un seul rouge qui agit.** Le rouge sert à trois choses : l'arrivée, l'action principale, l'erreur. **Une seule action primaire rouge par écran.**
3. **`#BC0404` est réservé au logo.** Il n'a que 3,0:1 sur Abysse. Bouton = `#D41F27` (texte blanc, 5,2:1). Texte ou trait rouge sur fond sombre = `#EB3B44` (5,0:1) ou `#FF8A90`.
4. **Une seule « brume Red Line » par écran** : un halo radial rouge à 15–25 % d'opacité derrière ce qui compte (logo, arrivée, rang final). Jamais deux.
5. **Les couleurs vives appartiennent aux coureurs.** Bleu `#5BD6FF` = moi. Or `#FFB347` = 1er et records. Vert `#5BE3A6` et violet `#B48CFF` = voisins. Tous les autres coureurs restent en Brume à 40 %. Ne pas utiliser ces couleurs comme décoration.
6. **Trois voix typographiques, un rôle chacune.**
   - Big Shoulders Display 800/900, MAJUSCULES : titres et gros chiffres.
   - Instrument Serif italique : **un seul mot** du titre, ou une phrase d'ambiance (chargement, compte à rebours, fin de course). Jamais dans un bouton, un menu ou un tableau.
   - Geist : toute l'interface. Geist Mono : le texte à taper et les étiquettes `[.EN CROCHETS]`.
7. **Rien ne bouge près du texte à taper.** Aucune animation, secousse ou toast dans la zone de frappe. Les effets (dépassement, bonus) vivent sur la piste.
8. **Une erreur n'est jamais que de la couleur.** Toujours une forme en plus : soulignement ondulé, contour, icône ⚠, mot.
9. **Accessible par défaut.** Cibles ≥ 44 px, `:focus-visible` = anneau `#5BD6FF` 3 px, vrais `<button>`, `<label>`, `<fieldset>`, `role="radiogroup"`, `aria-live` pour le rang et le compte à rebours, `prefers-reduced-motion` respecté.
10. **Pas d'images générées.** Seulement le logo SVG, des icônes vectorielles simples (trait 2 px, bouts arrondis) et des formes CSS/SVG (orbites pointillées, points des coureurs).

---

## 2. Jetons

Tout est dans `tokens.css`. **Aucune valeur hexadécimale dans les composants** : utilise les classes Tailwind générées (`bg-abysse`, `text-ecume`, `border-houle`, `text-ligne`, `bg-action`…).

| Jeton | Abysse (sombre) | Aube (clair) | Rôle |
|---|---|---|---|
| `abysse` | `#05070D` | `#F3F5F8` | fond de page |
| `nuit` | `#0C1424` | `#FFFFFF` | cartes, champs, panneaux |
| `mer` | `#0B1A30` | `#E6EBF2` | fond de la piste |
| `sillage` | `#16233A` | `#E1E6EE` | séparateurs, piste vide |
| `houle` | `#22324D` | `#C9D3E1` | bordures |
| `brume` | `#8A9BB5` | `#4A5A73` | texte secondaire, étiquettes |
| `embrun` | `#C9D3E1` | `#22324D` | texte secondaire fort |
| `ecume` | `#EEF2F7` | `#0A1020` | texte principal |
| `action` | `#D41F27` | `#C81E25` | bouton primaire |
| `ligne` | `#EB3B44` | `#C81E25` | ligne d'arrivée, survol primaire |
| `redline` | `#BC0404` | `#BC0404` | logo uniquement |
| `erreur` / `erreur-fond` | `#FF8A90` / `#3A1219` | `#B3141C` / `#FCE4E6` | erreurs, DNF |
| `moi` | `#5BD6FF` | `#0077A8` | moi, focus, sélection |
| `or` | `#FFB347` | `#A15C00` | 1er, record, avertissement |
| `juste` | `#5BE3A6` | `#08784A` | caractère juste, « prêt » |
| `arcade` | `#B48CFF` | `#6A3FC8` | mode Arcade, bonus |

**Échelle typographique**

| Usage | Police | Taille | Détail |
|---|---|---|---|
| Titre héros | Big Shoulders 900 | 120 px (accueil) | interligne 0,86, majuscules |
| Titre de page | Big Shoulders 900 | 64–72 px | interligne 0,9 + 1 mot en Instrument Serif italique 400, sans majuscules |
| Titre de section | Big Shoulders 800 | 28–36 px | majuscules |
| Chiffre de stat | Big Shoulders 800 | 40–52 px | unité en 16–20 px Brume |
| Compte à rebours | Big Shoulders 900 | 300 px | |
| Ambiance | Instrument Serif 400 | 34–40 px | |
| Corps | Geist 400 | 16 px (14–15 dans les cartes) | interligne 1,5 |
| Bouton | Geist 600 | 15–16 px | |
| Étiquette | Geist Mono 500 | 11–12 px | espacement 0,2 em, majuscules, `[.CROCHETS]` |
| Texte de course | Geist Mono 400 | 26 px (22 px tablette) | interligne 2,1 |

**Espacements** : pas de 4 px (8, 12, 16, 20, 28, 40, 56). Conteneur `max-width: 1344px`, marges latérales 48 px (32 px tablette, 16 px téléphone).
**Rayons** : 6 px puces, 8 px boutons et champs, 12 px cartes et piste, cercle pour les coureurs. Boutons de navigation ronds (22 px) seulement dans l'en-tête de l'accueil.
**Mouvement** : 200–400 ms, `ease-out`. Dépassement = 2 pulsations de mon point en 600 ms. Avec `prefers-reduced-motion` ou le réglage « Réduire les animations » : fondu de 150 ms, orbite et icône figées.

---

## 3. Composants (voir `screens/16-composants.png`)

| Composant | Spécification |
|---|---|
| **Bouton primaire** | `bg-action text-white`, h 52–56 px, px 22–26 px, rayon 8, Geist 600. Survol `bg-ligne`. Un seul par écran. |
| **Bouton secondaire** | transparent, bordure 1 px Écume, texte Écume, Geist 600. |
| **Bouton discret** | transparent, bordure Houle, texte Embrun, Geist 500. Ex. « Abandonner », « Quitter la salle ». |
| **Bouton basculé** (`aria-pressed`) | bordure + texte `juste`, fond `juste` à 12 %, préfixe ✓. Ex. « Je suis prêt ». |
| **Désactivé** | fond Sillage, texte `#6B7C96`, sans bordure. |
| **Champ** | h 48–64 px, fond Abysse ou Nuit, bordure Houle. Focus : bordure `moi` + halo 3 px `moi` à 20 %. Erreur : bordure 2 px `erreur` + message ⚠ sous le champ, `aria-invalid`, `aria-describedby`. |
| **Code de salle** | Geist Mono, 5 caractères, espacement 0,2–0,24 em, majuscules forcées. |
| **Sélecteur segmenté** | conteneur bordé Houle, padding 4 px ; option active fond Écume texte Abysse. `role="radiogroup"` + `role="radio"`. |
| **Puce / filtre** | h 40 px, bordure Houle ; active : bordure `moi`, fond `moi` 8–12 %, préfixe ✓. |
| **Carte** | fond Nuit, bordure Houle, rayon 12, padding 20–24 px. Carte mise en avant : bordure `ligne` + brume rouge en haut à gauche. |
| **Tuile de stat** | étiquette Geist Mono 11 px Brume + chiffre Big Shoulders 800. Variante record : bordure et étiquette `or`, fond `or` 8 %. |
| **Étiquette d'état** | Geist Mono 11 px entre crochets : `[.EN ATTENTE]` juste, `[.EN COURSE]` or/ligne, `[.ARCADE]` arcade. |
| **Badges** | `HÔTE` Geist Mono 10 px `ligne` ; `DNF` fond `erreur-fond`, texte `erreur`. |
| **Toast** | coin haut droit, 4 s, fond Abysse, bordure de la couleur du sens (✓ juste, → moi, ! erreur). Jamais au-dessus du texte de course. |
| **Tableau** | en-têtes Geist Mono 11 px Brume ; lignes séparées par Sillage ; chiffres en Geist Mono alignés à droite ; ma ligne surlignée `moi` à 10 %. Conteneur `overflow-x: auto`. |
| **En-tête** | logo (icône 30–40 px + logotype blanc) à gauche ; nav `JOUER · STATISTIQUES · PROFIL` en Geist Mono 13 px espacée 0,16–0,22 em ; page active soulignée 2 px `ligne` (`aria-current="page"`). |

**Piste de course (élément signature)** — panneau vertical (ou horizontal sur tablette), fond `mer`, brume rouge en haut, **ligne d'arrivée** = trait `ligne` de 5–6 px légèrement incliné. Coureurs = cercles :

- moi : 10–11 px `moi` + 2 anneaux concentriques (60 % et 25 %) ;
- 1er : 9 px `or` ; 2e et 3e : 8 px Écume 80 % ;
- voisins directs : 8 px `juste` / `arcade` ;
- les autres : 4–5 px Brume à 40 %, sans nom ;
- **bot = carré arrondi** (pas un cercle) ;
- noms affichés seulement pour le top 3, moi et mes 2 voisins ; le reste se résume en « + N COUREURS ».

**Texte de course** — classes `.course-*` dans `tokens.css` :

- juste : Écume + soulignement 3 px `juste` ;
- erreur (frappe libre) : fond `erreur-fond`, texte `erreur`, soulignement ondulé — reste visible ;
- erreur (frappe bloquée) : même chose + contour 2 px, champ en erreur, message « corrige le « o » encadré pour avancer » ;
- curseur : barre verticale 2 px Écume ;
- à venir : Brume ; retiré par un bonus Arcade : `#4A5A73` barré.

**Logo** — `logo/ico-red.svg` (icône : 4 pales rouges autour du point bleu) + `logo/wm-white.svg` (logotype) sur fond sombre ; `wm-black.svg` sur Aube. Ne jamais recolorer, étirer, ombrer ou mettre l'icône dans un cadre. Icône seule dans les en-têtes compacts (course, salle).

---

## 4. Écrans

Chaque ligne renvoie à l'image (`screens/`) et à la maquette HTML (`wireframes-html/`) du même nom.

| # | Écran | Route suggérée | Points clés à respecter |
|---|---|---|---|
| 00 | Index et parcours | — | Parcours : Accueil → Connexion/Invité → Jouer → Créer → Salle → Rebours → Course → Résultats → Stats/Profil. |
| 01 | Accueil | `/` | Titre « Tape. Dépasse. *arrive.* », bouton rouge « Trouver une salle », champ code + « Rejoindre », lien invité. À droite : orbites pointillées, Red Line, routes lumineuses ; chaque lumière = une salle publique cliquable (≥ 44 px). 3 cartes : publique / privée / invitation. Sélecteurs FR/EN et thème dans l'en-tête. |
| 02 | Connexion / inscription | `/connexion` | Onglets Connexion/Inscription, GitHub et Discord, pseudo + mot de passe, « Se souvenir de moi pendant 30 jours ». **Aucun courriel.** Panneau gauche : grande icône en rotation lente + phrase serif. |
| 03 | Entrer comme invité | `/invite` | Pseudo 3–20 caractères, 8 avatars (+ import), note : stats de session seulement, un invité ne crée pas de salle. |
| 04 | Jouer | `/jouer` | 3 cartes (matchmaking rouge, code, créer). Filtres en puces. Tableau des salles publiques en temps réel : `[.EN ATTENTE]` → Rejoindre, `[.EN COURSE]` → Regarder. Max **50 joueurs** par salle. |
| 05 | Créer une salle | `/salle/nouvelle` | Fieldsets numérotés 01 Accès · 02 Règles (Entraînement/Évaluation/Arcade, frappe libre/bloquée, durée auto, « je participe ») · 03 Texte (source, langue, longueur, puces accents/ponctuation/chiffres/spéciaux, aperçu) · 04 Bots (Mousse ≈ 20, Matelot ≈ 40, Capitaine ≈ 65, Empereur ≈ 95 WPM). Récapitulatif collant à droite + « Ouvrir la salle ». |
| 06 | Salle d'attente | `/salle/[code]` | Orbite : un joueur prêt glisse vers l'anneau intérieur ; compteur « 4 / 9 PRÊTS ». Code + copier, lien d'invitation unique, liste avec HÔTE et « Transférer l'hôte », puces de réglages + Modifier. « Je suis prêt » (basculé) ; « Lancer la course » visible seulement chez l'hôte, actif dès 2 prêts (bot compris). |
| 07 | Compte à rebours | (état de la salle) | Chiffre géant 300 px dans un anneau de progression `ligne`, icône en filigrane, phrase serif, aperçu du texte estompé, suite 5 4 3 2 1 PARTEZ (PARTEZ en rouge). Saisie active seulement à « Partez ». `role="timer"`, `aria-live="assertive"`. |
| 08 | Course, frappe libre | (état de la salle) | 4 tuiles TEMPS / VITESSE / PRÉCISION / RANG (rang en `moi`), barre de progression, texte Geist Mono 26 px, champ « TA FRAPPE » 64 px focus `moi`, légende. Piste verticale à droite + toast de dépassement **sur la piste**. |
| 09 | Course Arcade, frappe bloquée | (état de la salle) | Bandeau bonus violet (icône + nom + « BONUS · 5 S »), mots retirés barrés, caractère bloqué encadré, message d'erreur sous le champ. Anneau violet pointillé autour de mon point. Panneau « Bonus de l'hôte » visible seulement chez l'hôte : Courant favorable → dernier tiers, Vent contraire → premier tiers, Brume → premier tiers ; 5 s, non cumulable. |
| 10 | Résultats | (état de la salle) | Rang géant « 5e » + « sur 32 », badge record or, 4 tuiles (WPM net, brut, précision, temps), « Prochaine manche » (rouge) + lien stats. Classement : finisseurs au WPM net, puis DNF par progression ; ma ligne surlignée ; bots exclus des records. Retour auto à la salle (compte à rebours affiché). |
| 11 | Statistiques | `/statistiques` | Titre « Journal de *bord* ». Onglets Entraînement / Évaluation / Arcade — **les modes ne se mélangent jamais**. Tuiles (moyenne, record or, précision, meilleur rang), courbe de progression (`moi`, précision en pointillés, ★ record), touches difficiles (barres), carte du clavier AZERTY/QWERTY (Sillage → or → erreur, % au survol/focus), historique + export CSV. |
| 12 | Profil et préférences | `/profil` | Avatar modifiable, pseudo, comptes liés GitHub/Discord. Visibilité Privée / Résumée / Publique. Affichage : thème Abysse/Aube/Système, langue FR/EN, disposition du clavier, réduire les animations. Son : musique et effets **désactivés par défaut**, volume. « Supprimer mon compte » en lien rouge discret, « Enregistrer » rouge. |
| 13 | Téléphone (390 px) | toutes les routes de course | **Spectateur seulement** : bandeau « Mode spectateur — il faut un clavier physique ». 3 tuiles, piste verticale, « Suivre un coureur ». Marges 16 px. |
| 14 | Tablette (1024 px) | course | Clavier physique détecté → course autorisée. Piste **horizontale** compacte (arrivée à droite) au-dessus du texte ; texte 22 px ; `inputmode="none"`, pas d'autocorrection ni de majuscule automatique. Sans clavier → mode spectateur. |
| 15 | États système | — | Chargement (icône qui tourne, figée si animations réduites), reconnexion (place gardée ≤ 5 min, barre or), salle pleine (50/50), code introuvable, mer calme (vide), inactivité 60 s (+15 s puis DNF), DNF, erreur serveur, toasts. Chaque état : quoi, pourquoi, quoi faire. |
| 16 | Composants et jetons | — | Référence de tout ce qui précède. |

**Comportement responsive (toutes pages)** : mises en page en `flex-wrap` / `grid auto-fit` ; la colonne secondaire (piste, récapitulatif, panneau) passe sous la principale quand la largeur manque ; tableaux dans un conteneur à défilement horizontal ; aucune barre de défilement horizontale sur la page.

---

## 5. Ton des textes

- Français, tutoiement, phrases courtes. Vocabulaire marin léger (traversée, équipage, mer calme, avarie) **dans les titres et les états**, jamais dans les libellés de boutons qui doivent rester explicites (« Créer une salle », pas « Hisser les voiles »).
- Libellés de bouton = verbe à l'infinitif + objet.
- Chiffres : espace insécable avant `%` (`96 %`), `WPM` en majuscules, durées `2:28` ou `2 min 40`.

## 6. À ne pas faire

- Pas de dégradés arc-en-ciel, de néon, d'ombres portées lourdes ou de glassmorphism.
- Pas de rouge pour décorer ; pas deux boutons rouges côte à côte.
- Pas de Poppins, Inter ou police système en titre.
- Pas d'Instrument Serif dans l'interface fonctionnelle.
- Pas d'animation dans la zone de frappe ; pas de secousse sur erreur.
- Pas de couleur comme seule information (erreur, rang, état).
- Pas de nouvelle couleur sans l'ajouter d'abord à `tokens.css` et à ce tableau.

## 7. Vérification avant de livrer un écran

- [ ] Comparé côte à côte avec `screens/NN-*.png` à 1440 px, puis à 1024 et 390 px.
- [ ] Aucune couleur en dur hors `tokens.css`.
- [ ] Une seule action rouge, une seule brume rouge.
- [ ] Focus clavier visible partout ; parcours complet au clavier.
- [ ] Contrastes ≥ 4,5:1 pour le texte (≥ 3:1 pour les gros chiffres et les bordures de champs).
- [ ] Testé en Aube et avec « Réduire les animations ».
