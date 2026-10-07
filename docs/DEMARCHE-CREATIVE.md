# Creative process

This is how I found the name Incision, drew its logo and set its art direction (DES-01 to DES-03), before writing the interface. The complete file, in French, is [da_incision.pdf](da/da_incision.pdf) (final version of October 6, 2026, 27 pages); the images below are pages of it. Its code-ready translation (tokens, components, 17 screens) lives in [apps/design](../apps/design).

My process follows the real order of the work: understand the need, collect what I like, name and draw, build a system, then check that it survives the product.

## 1. Understanding the brief

During the client's presentation I noted six needs. The site must be fun, because the players are 12 to 17. A student must be able to see another one overtake them. Everyone's position must be visible, as in Mario Kart. The indicator must stay discreet, because students look at their keyboard more than at the screen. There is no maximum: whole groups of about 32 people. And the art direction must be strong and unusual; if I have a favourite series, I can bring in its elements.

From these I set five design constraints:

- **Text first.** Nothing ever sits under the text being typed.
- **Peripheral vision.** My position reads from the corner of the eye.
- **From 2 to 50 runners.** The race stays readable for a whole class (the final brief caps a room at 30 participants; the track keeps the margin).
- **A nod, not a copy.** One Piece fans recognise it; everyone else just enjoys the game.
- **Two themes, two screens.** Dark and light, desktop and tablet.

My method: I don't start from a blank page. I capture what strikes me on sites I like, I name why it works (a colour, a movement, a typeface, a composition), I turn each borrowing into a rule the product must follow, and I check every rule on a screen of the site.

## 2. Moodboard: five references

All images are my own captures (September and October 2026). Each reference gives one precise thing to Incision.

**Overworld Audio — the night that lights up.** A loading screen, then the landscape revealed at once; a single cold temperature of night blue and mist; a few points of light that guide the eye; an elegant serif next to spaced capitals. In Incision: the Abysse background where only the runners light up, Instrument Serif for mood, spaced Geist Mono for the interface, and a "the sea rises" loader.

![Reference 1: Overworld Audio](da/pages/05-reference-overworld.jpg)

**Gravity — the cosmos in orbit.** Dotted concentric orbits around the title, navigation floating like coordinates in [.BRACKETS], a condensed and massive title, psychedelic colours on deep black. In Incision: the orbits become the waiting room, the [.LABELS] mark navigation and states, Big Shoulders Display sets the titles.

![Reference 2: Gravity](da/pages/06-reference-gravity.jpg)

**One Piece — the red, and Next.js — the rigour.** From one-piece.com I keep only a frank, warm red, used across the whole banner: the manga's energy in one colour. I leave the logo, flag and illustrations, which belong to the work. From nextjs.org I keep deep black, one-pixel borders, a discreet grid and the Geist typeface, made for the interface I am going to code. In Incision: red becomes the "Red Line" (finish line, main action, the logo's incision, nothing else), with Geist for the interface and Geist Mono for the race text.

![References 3 and 4: One Piece and Next.js](da/pages/07-references-one-piece-nextjs.jpg)

**Lando Norris — the cut and the contrast.** A helmet stripe cuts the portrait in two, which is exactly the gesture of Incision; titles in two voices, a thin serif word next to a heavy grotesque; pale topographic lines like a circuit; a single fluorescent accent. In Incision: titles in two voices (one Instrument Serif word in a Big Shoulders line), pale sea currents behind the track, one accent only, the red.

![Reference 5: Lando Norris](da/pages/08-reference-lando-norris.jpg)

**The formula: "Race night"** (*Nuit de course*): dark, fast, readable, with a wink. I keep a dark and cinematic mood, a single warm accent, lights that guide and a clean interface. I leave One Piece's official visuals, heavy 3D, text over busy images and competing accents.

![Synthesis: the formula](da/pages/09-formula.jpg)

## 3. The name (DES-01)

**Names considered.** On September 21 I first looked for a word by asking Google's AI mode four increasingly precise questions; I rejected every suggestion:

| Question | Suggestions | Why I dropped them |
|---|---|---|
| Fast and efficient? | Streamlining, lean, kaizen | Accurate, but business vocabulary |
| As a system name? | StreamlineOS, OptiFlow, Catalyst | Software names, not a game |
| For a typing racer? | Kinetic, KeyStrike, Velo, Cadence | Closer to typing |
| A single word? | Pulse, Blitz, Dex, Cadence | Cadence tempted me without convincing me |

All of them were correct, but none had a story: any game could wear them.

![The first search for a word](da/pages/10-name-first-search.jpg)

**The click: looking in my own culture.** I took a minute and asked myself why not look in One Piece. In the French version of One Piece, *Incision* is the name of Soru (剃, "Shave" in English), one of the Six Powers: you strike the ground a dozen times in an instant to move faster than the eye. The double meaning is the reason for my choice: striking the ground to go faster than a human; striking the keyboard to go faster than yesterday. The name is short, works in French and English, is tied to the gesture of typing fast and accurately, is understood without knowing the work, and is a real nod for fans.

![The name Incision](da/pages/11-name-incision.jpg)

**Originality check (October 2026).** No typing game or other game uses the name. Incision Academy, a surgical training platform, uses it in the medical field: an unrelated audience and product, from which Incision, the typing race, borrows neither its look nor its purpose.

## 4. The signature track (DES-04)

Before inventing, I played the two best-known typing games and noted what gets in the way. TypeRacer has an immediate metaphor but one lane per player: at 32 students the track pushes the text off the screen, and the track sits above the text, so you leave your line to see your place. TypeRacer Turbo shows a readable rank and mini-map, but only four lanes, one word at a time, and the scenery takes over. A horizontal race works with four players; a whole class needs another shape.

![Existing typing games](da/pages/12-track-existing-games.jpg)

The click came from the way One Piece shows the Worst Generation racing to the New World: at Sabaody, Shakky explains that whatever route they take, all of them lead to the Red Line. So the Incision track is **vertical** (a narrow column beside the text, climbing to the finish), **one route per runner** in the same night sea (2 or 50 runners fit), and **everything converges** near the line, where every overtaking counts. An overtaking makes my point pulse, visible from the corner of the eye.

![The vertical track and the Red Line](da/pages/13-track-red-line.jpg)

## 5. The logo (DES-02)

**Sketch 01, abandoned.** My first version, "the cut word", was made with Claude's help: condensed heavy capitals, one diagonal cut with a line of light in the slit, a 剃 seal on red. I abandoned it and keep it as a trace: too many effects competing (cut, glow, seal, kanji), the cut disappears under 32 px, and it was an existing typeface cut in two, nothing I really drew.

![Sketch 01, abandoned](da/pages/14-logo-sketch-01-abandoned.jpg)

**A symbol instead of an effect.** I looked for a symbol, still in One Piece: Reverse Mountain, where the Red Line crosses the Grand Line and the currents of the four seas climb and meet; Nami's diagram of four arrows towards a centre; my first sketch, a circle crossed by lines (right but rigid); then the click from Naruto's Sharingan, commas turning around a pupil, which turned my straight lines into spaced curves. The red blades are the currents of the seas, all turning towards the centre; the blue point is the sea where they meet. For Incision: students who start from everywhere and converge on the same finish, like the track.

![The idea of the icon](da/pages/15-logo-icon-idea.jpg)

**From the notebook to the vector.** My pen sketches, in order, with my margin notes: Reverse Mountain seen from above; the lines becoming petals around a pupil; "Kaleidoscope?", the four routes inside the circle that did not yet work as a logo, then "normalise this shape without the circle and add more shapes"; and the final version, "more uniform", where the irregular swirl is crossed out and the blades become equal and evenly spaced. Each step removes something: the circle, the straight lines, the uneven shapes. What remains is the movement of the seas towards a single point.

![My notebook sketches](da/pages/16-logo-notebook.jpg)

**The final logo.** I redrew the notebook's swirl as a vector, with a sober, closed lettering without cut or glow: straight stems with bevelled ends, closed shapes, sharp at every size, leaving the spotlight to the icon. Two versions: red, and black/white. The icon alone is used when space runs out, and it is the favicon. Rules: red on white or on Abysse, black or white on a photo; never stretch, recolour one blade, add a shadow or a glow; clear space of at least twice the blue point's diameter.

![The final logo](da/pages/17-logo-final.jpg)

The exported files are in [apps/design/logo](../apps/design/logo); the site uses them unchanged in [apps/web/public/brand](../apps/web/public/brand), and the red icon is the favicon ([icon.svg](../apps/web/src/app/icon.svg)).

## 6. Palette (DES-03)

Night first, red to act: four cold neutrals, a single warm accent, and lights reserved for the runners.

| Role | Abysse (dark, default) | Aube (light) |
|---|---|---|
| Abysse — background | `#05070D` | `#F3F5F8` |
| Nuit — surface | `#0C1424` | `#FFFFFF` |
| Houle — borders | `#22324D` | `#C9D3E1` |
| Brume — secondary text | `#8A9BB5` | `#4A5A73` |
| Écume — text | `#EEF2F7` | `#0A1020` |
| Red Line — logo only | `#BC0404` | `#BC0404` |
| Action — primary button | `#D41F27` | `#C81E25` |
| Ligne — red lines and text on Nuit | `#EB3B44` | `#C81E25` |
| Moi — me, keyboard focus | `#5BD6FF` | `#0077A8` |
| Or — first, record | `#FFB347` | `#A15C00` |
| Juste — correct, neighbour | `#5BE3A6` | `#08784A` |

Measured contrasts: Écume on Abysse 17.9:1, Brume on Abysse 7.1:1, Red Line strokes on Abysse 5.0:1, white on the button 5.2:1; in Aube, ink 17.4:1 and red 5.2:1. Rules: red means finish, main action or error; one "Red Line mist" per screen, a 15–25 % red halo behind what matters, breathing slowly; an error also carries a shape, never colour alone. The light theme, Aube, was requested by the client: same roles, darker accents to keep the contrast.

![Palette](da/pages/19-palette.jpg)

## 7. Typography (DES-03)

Three voices, one role each, all free under the SIL Open Font License. I dropped Poppins: too round, too "school app".

- **Big Shoulders Display** (800–900, capitals): condensed and massive, like Gravity's title. Titles and countdown digits.
- **Instrument Serif** (italic): Overworld's soft sentence. One key word per title, taglines, loading and end-of-race screens; never in the interface.
- **Geist and Geist Mono**: Next.js' typeface. Geist for menus and stats (16 px, line height 1.5); Geist Mono for [.LABELS] (12 px, 0.2 em spacing) and, being monospaced, for the text to type (22 px, line height 2).

![Typography](da/pages/20-typography.jpg)

## 8. Signatures and motion

Four signatures make an Incision screen recognisable even without the logo: the slowly turning swirl (loading, waiting for the start, the centre of the room; one at a time, never while typing), the Red Line mist, the dotted orbits of the waiting room, and the routes of the race. Motion follows Overworld's reveal: the swirl draws the screen in, then opens on the race; overtaking makes my point pulse twice; the Red Line lights up when I cross it; errors never shake. Transitions last 200 to 400 ms, the loader can be skipped and plays once per session, and with reduced motion everything becomes a simple fade.

![Signatures](da/pages/18-signatures.jpg)

![Motion](da/pages/21-motion.jpg)

## 9. From the file to the site

I translated the file into [apps/design](../apps/design): `tokens.css` (the only place where a colour value is written), a README with the components, 17 screen mock-ups and HTML wireframes. The site loads these tokens and the four typefaces, applies both themes without flashing, and uses my logo and favicon unchanged; an automated test refuses any colour written outside the tokens.

The art direction came before the final brief. Where they differ, the brief decides the product rules (6-character room codes, 2 to 30 participants, the 3-2-1 countdown) and the art direction decides the look. Small adaptations made while building, such as an underlined hover on the red button to keep AA contrast, are listed under D-15 in [EXIGENCES.md](EXIGENCES.md). What never moves: the name, the logo, night and red, the vertical track and Geist Mono for the race.

## 10. Sources and use of AI

Every image in the file is a real capture of mine; none was generated by AI. The ocean visual generated for versions 1 and 2 was removed in version 3 and replaced by my captures and vector drawings. One Piece (© Eiichiro Oda / Shueisha; episode 1062 © Toei Animation) and Naruto (© Masashi Kishimoto / Shueisha) are analysis references, never used in the product.

- **Google's AI mode**: word suggestions for the name, all rejected (section 3).
- **Claude**: layout of the art-direction file, principle mock-ups, the first logo sketch (abandoned, section 5), writing help and proofreading.
- **Mine**: the choice of references, the name Incision, the vertical route, the final logo (icon and lettering, drawn from my pen sketches) and every visual decision.
