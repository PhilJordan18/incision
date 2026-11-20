# Integration guide for C1

Technical guidance, in English. Read with the [plan](plan.md). The mock-ups in `maquettes/` are the visual reference; this page says how to read them and what they must not be taken to mean.

## Reading the mock-ups

- Open `maquettes/<name>.html` in a browser at the width in its name (or look at `captures/<name>.jpg`). Each file is static HTML with inline SVG and reads `jetons-lecture.css` and `base.css` beside it.
- Shapes, spacing, order and wording come from the mock-up. Layout heights, data, behaviour and the header come from the app.
- The mock-ups' class names and CSS are drawing code, not a structure to copy. In the app, use the existing components, `components/ui/styles.ts` and the Tailwind classes generated from `apps/design/tokens.css`. Never a hexadecimal colour, never an import of `jetons-lecture.css`.
- Names, speeds, ranks and codes in the mock-ups are examples. The app shows only real data, and shows nothing where it has none.
- The header's FR / EN links are drawn 22 px high. Do not reproduce that: the app's header is unchanged.
- Words drawn inside a scene (« ARRIVÉE », « JALON 25 % », « SANS BONUS »…) are interface text: they go through the FR/EN dictionaries, reusing existing keys where one exists. A scene is `aria-hidden`; the same information is in the text beside it.

## The vocabulary

| Piece | Rule |
|---|---|
| Ship | Hull, mast, one sail. Triangle sail = human, square sail = bot. The sail takes the runner's colour. Mine keeps the two rings; the leader keeps the `or` ring. |
| Pennant | The same two shapes, small, beside a name. Same colour as that runner's route. In lists it replaces the line swatch. A spectator has an eye, not a pennant. |
| Route | Unchanged: the runner's colour, solid, dashed or dotted. Two routes must stay distinguishable by dash. |
| Red coast | A flat land (`erreur-fond`) with a `ligne` edge, at the finish. In Aube: `color-mix()` of 20 % `ligne` in `nuit`. Never a halo. One per screen. |
| Glass compass | One static drawing on the track, away from the text sheet. |
| Wave marks | Short strokes as drawn, behind a page title or in a panel corner. Never behind text to read or type. |
| Quay | A strip of moored hulls: at most eight, then « +N au mouillage ». Removed on a low screen. |
| Panel title | One style for every panel title, as drawn in the waiting room. |

Everything in this table is decorative: `aria-hidden`, no motion of its own, `pointer-events: none`. In forced colours each shape takes a system colour and a border, and every state it accompanies is also said by a word or a sign.

## New strings

New keys only; existing keys are neither renamed nor reused for another meaning. French as approved; English as drawn where a mock-up shows it, otherwise proposed in the pull request and listed in its report.

| Where | French | English |
|---|---|---|
| Home | « Carte de route », « Escale 01 » … « Escale 04 », « Départ », « Prêt à lever l'ancre ? » | proposed in the pull request |
| Bot line | « Modifier », « Annuler » | "Edit", "Cancel" |
| Crew | « Participants », « Spectateurs », « {n} / 20 » | "Participants", "Spectators", "{n} / 20" |
| Unsaved mark | « Non enregistré » | "Unsaved" |
| Quay | « +{n} au mouillage » | "+{n} at anchor" |
| Settings form | legends of the four groups; saved-value mark | proposed in the pull request |

The titles and bodies of the four escales are the existing guide (`i18n/journey.ts`), unchanged.

## Waiting room states to keep

The bot row already handles a draft, a pending save, a stale revision and a disconnected room. The open state is added beside them, not instead of them. The settings panel already keeps a draft across updates and detects a conflict (`room-settings-state.ts`): the rework changes the presentation and the placement of errors, not those rules.

## What a lot delivers

1. A branch from `origin/feat/da2-0-nautical-primitives` (or from `origin/dev` for the primitives themselves), small commits, Conventional Commits in English.
2. Repository checks: `npm run check:no-js`, `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`, and the e2e specs it touches, on an isolated local database.
3. Captures from the app in `docs/evidence/da2-<card>-<slug>/`, beside the reference they compare to.
4. A report in the pull request: exact SHA, files touched, tests actually run, skips, limits, changes needed in files it does not own, matrix lines concerned.

No merge, no deployment, no card closing, no remote resource.
