# F-09.5 / #82 — explicit character reference layouts

Source: Philippe's November 12 mandate E, authorised implementation/delivery. Independent base dev e663a2ea93d918163d88e0d82f4f94bdc6441863.

Offer explicit classic French AZERTY, US QWERTY, Canadian French and Canadian multilingual standard references. These are arrangements of expected characters, not measured physical keys. Counts, case, accents and out-of-reference characters remain exact and private. No continuous thermal scale, keyboard detection, account preference persistence, schema or typing-engine change. #82 remains partial: its broader profile persistence and QWERTZ are outside this mandate.

Reference: installed xkeyboard-config symbols fr/basic, us/basic, ca/fr and ca/multix, unmodified printable base characters. Dead-key positions are omitted because they are not expected text characters; composed/shifted characters remain in the exact outside-reference list. No keyboard asset copied. Both Canadian variants are offered explicitly, avoiding an invented single CA mapping. No new product choice is needed to select between them.

Only the results-only KeyHeatmap is extracted from components/races/race-charts.tsx into a new results component; the speed plot and runtime race view remain unchanged. All layout strings are in a new dedicated dictionary. Existing personal-data projection and access checks unchanged. Read-only security review required. No shared global styles or dictionaries, no Claude typing/activity/race-layout files.

Tests: count conservation and distinct variants, local render/legacy/zero/privacy regressions, E2E FR/EN/themes/390/1024/1440/keyboard/axe, full suite and root gates. Default FR reference for French UI, US for English; explicit selection lives only in the current view and resets on reload. The initial reference and exact table remain server-rendered without JavaScript.
