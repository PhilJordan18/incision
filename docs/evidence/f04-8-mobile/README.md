# F-04.8 — physical-keyboard guidance (DES-06 / D-20)

Verified locally on October 25, 2026, from `dev` at `f4600af` (including #133,
#136 and #137). Runtime and new tests: `28cb42c`. Final test-only adjustment:
`ddfbdde` preserves the older 360 px results checks after typing at 768 px.
The following documentation commit changes no application, test or dependency code.

Below 768 px the text and typing field are replaced by translated physical-keyboard
advice. The track, presence/reconnection controls and confirmed abandonment remain.
Resizing never changes the server role or abandons a runner. Acknowledged typing is
preserved when the field returns. Both admission forms default to spectator on narrow
screens; a deliberate checkbox choice survives resizing. Without JavaScript or before
hydration, the default is conservatively spectator. There is no hardware detection.

## Verification

The shared heavy-work lock serialized installation, build and browser runs. Browser
runs used port 3976 and only the disposable local `incision_e2e_mobile56` PostgreSQL
database. An occupied port 3871 was left untouched.

- `npm run check:no-js`, `npm run lint`, `npm run typecheck`: passed.
- `npm test`: 1,776 passed (web 550, database 119, domain 1,040, load 20, word lists 47).
- `npm run build`: passed with Next.js 16.4.3.
- `npm run test:e2e --workspace @incision/web -- mobile-keyboard.spec.ts bonus-ui.spec.ts`:
  8/8 passed, six mobile scenarios and two existing bonus regressions.
- `npm run test:e2e --workspace @incision/web -- race.spec.ts --grep 'player who leaves|player gives up|next round|host closes the room from the results'`:
  4/4 passed, including the final `ddfbdde` test adjustment.

The mobile tests cover server-rendered defaults, 767/768 px, create/join submission,
explicit keyboard choices, spectator access, preserved server-confirmed progress,
absence of hidden typing, restoration at 768 px, and keyboard cancel/confirmation of
abandonment with focus returned to the outcome. Creation, admission and the narrow
race pass axe and horizontal-overflow checks in FR/EN × Abysse/Aube at 360 px.
The existing bonus scenarios additionally exercise reduced motion and resuming
bonus typing after a narrow viewport. Bonus assertions were retained; the static
bonus layout unit test explicitly selects a wide viewport.

## Visual evidence and reviews

Unedited browser captures from the local production build, using marked race text fixtures:

- [EN / Abysse / 1440 px](en-abysse-1440.png)
- [FR / Abysse / 1024 px](fr-abysse-1024.png)
- [FR / Aube / 390 px](fr-aube-390.png)

The mobile spec captures all four language/theme combinations at all three widths.
Representative captures above, plus EN/Aube mobile, were inspected against screens
05, 08, 13 and 14 and the design checklist. Existing fonts, tokens, layout and simple
track are retained. Unlike screen 13's example, the guidance does not call an existing
runner a spectator. D-20 uses viewport width, not the old tablet mockup's keyboard
detection. The message occupies the former typing panel; existing metrics stay above it.
No design, name or logo assets changed. The final visual track remains a separate card.

Code-reviewer and UI/UX roles were applied sequentially by Codex, not independent
agents. No blocking or major finding remains. Review covered subscription cleanup,
hydration snapshot, explicit choice preservation, unmounted input handlers, confirmed
abandonment focus, immutable race state and preservation of the merged bonus/clock/
locale changes. No new server input or trust boundary was introduced.

Other Codex released the views and test files and reserved #67 separately. Claude A's
FR/EN dictionaries and corpus/server files were left untouched; this card adds its own
small dictionary namespace.

This is local Chromium evidence, not production or physical-device/Safari/Firefox
qualification. The full browser suite was not rerun. Neon, deployments, CI, dependencies
and integrations were not modified. The issue stays open in Review until human merge.

## CI follow-up

On `3e7666d`, push CI [40187107647](https://github.com/PhilJordan18/incision/actions/runs/40187107647)
passed the full 75-test browser suite. PR CI
[40187110936](https://github.com/PhilJordan18/incision/actions/runs/40187110936)
passed 74/75: the existing departure/results test scanned a temporarily missing document
title during `router.refresh()`. Its retained trace shows `Room 4A656M · Incision`
restored immediately after axe's partial scan. All six new mobile tests passed in both runs.

The follow-up changes only that test's synchronization: it requires the expected room
title and a complete axe pass within five seconds. No accessibility rule is excluded,
no application code changes, and no CI setting changes.
