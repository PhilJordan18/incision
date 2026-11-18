# DA2-5 — Waiting room, second layout

Captures taken from the running app (production build, isolated local database) by
`apps/web/e2e/da2-waiting-room.spec.ts` with `DA2_EVIDENCE=1`. References:
`docs/da/v2/captures/salle-attente-*.jpg` (branch `docs/da2-1-references`).

| File | State |
|---|---|
| `dix-bots-{fr,en}-{abysse,aube}-{1440,1024,390,360}.jpg` | host, six participants, two spectators, ten bots, capacity 20; Bot 2 open with an unsaved level, Bot 7 open and clean (DA2-5b) |
| `deux-bots-…`, `sans-bot-…` | host, two bots and no bot (empty roster) |
| `complete-30-30-fr-abysse-1440.jpg` | full room, after the refused attempt to add a bot |
| `non-hote-…`, `spectateur-…` | a participant and a spectator who are not the host |
| `ecran-bas-1280x640-fr-abysse.jpg` | low screen: no quay, code and start in view |
| `couleurs-forcees-fr-1440.jpg`, `zoom-200-fr-abysse-720.jpg` | forced colours; 200 % zoom of a 1440 px screen |
| `arbre-accessibilite-{hote,non-hote}-fr.txt` | accessibility tree of `main` (names, roles, states) |
| `arbre-accessibilite-bots-{fr,en}.txt` | accessibility tree of the bots panel with an open, unsaved line (DA2-5b) |

Names are fixtures of the test database (« Participant 1 »…), not real people.
