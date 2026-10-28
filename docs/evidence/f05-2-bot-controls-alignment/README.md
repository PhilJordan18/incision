# F-05.2 — Align bot removal controls

Requested by Philippe during the 28 October 2026 human recipe: Remove sat above the
level selector and Change level button. Verified product/test commit: `4be3b8a`.

The outer wrapping control row now uses `items-end`, matching its nested level form.
This is the only application change. Existing 52 px controls, spacing, labels, actions,
disabled states, colors and focus styles remain unchanged. Narrow layouts keep their
existing vertical wrap without document overflow.

## Isolation and scope

Branch `codex/fix-59-bot-controls-alignment` was created from `dev` `fbf7196`, with the
three #176 prerequisites replayed locally while the human merges were pending. The
panel source is identical between #176 and the integrated #179 head `af08dce`.
Only the fix commit and these new proofs should be carried onto updated dev for delivery.
The screenshots show the #176 waiting-room baseline, not a new verification of #178's
race-start behavior. No published PR branch or shared recipe was modified.

For delivery, `codex/fix-59-bot-controls-delivery` starts from updated `dev` `25f0614`
after the human merges of #176/#177. Only the correction and its proof commits were
ported (`b1d7c90`, `7f6cf9a`); no prerequisite replay is included in this PR.
On this updated base, the no-JS guard, web lint/types, 22 focused unit tests and root
production build pass again. The three browser scenarios pass in 51.3 s; the adjacent
captures were regenerated on this base. The delivery PR records the final root checks.

## Verification

- `npm run check:no-js`: pass.
- Web lint and type check: pass.
- `bot-actions.test.ts` + `bot-form.test.ts`: 22/22 pass.
- `npm run build`: pass.
- `room-bots.spec.ts`: 3/3 pass in 33.5 s, using port 3894 and the dedicated disposable
  database `incision_e2e_bot_alignment_20261028`. The shared recipe on 3880 is untouched.
- Browser geometry checks verify equal button height, minimum 44 px targets, and matching
  select/button bottom edges at 1440/1024 px. FR/EN, Abysse/Aube, 1440/1024/390/360 px:
  axe passes, no document horizontal overflow. Tab visits selector, Change level, Remove
  in order; existing add/change/remove and focus recovery scenarios still pass.

## Sequential reviews

Code review: no blocker. One layout utility changes no form, event or server semantics.
UI review: no blocker. Compared screen 06 and the reported screenshot with new captures
at 1440/1024/390 px; desktop controls now share their edges, mobile controls wrap, tokens
and native labels/focus remain in use. Sixteen browser captures accompany this report.
No global browser battery or production check was run for this small visual correction.
