# F-06.2B2 — rendered UI evidence

These are unedited screenshots from `e2e/bonus-ui.spec.ts` on implementation commit
`cf2d7f1b55ac67288a7b1a590b10bcb430aee0e2`, using the production build. They are test
evidence, not design assets or proof of production enablement. The subsequent evidence-only
commit changes no runtime, test, configuration or dependency file.

The fixture uses two browser contexts, real race pages and the real runtime/coordinator.
Admission, lease, persistence and extension words are explicit test doubles. Normal rooms
still disable bonuses; their ordinary PostgreSQL-backed race is tested separately.

- [English / Abysse, 1440 px](en-abysse-1440.png)
- [French / Aube, 390 px](fr-aube-390.png)

The test also captures both combinations at 1024 px and their other desktop/mobile widths.
All six images were inspected against screens 08/09. Both combinations pass axe at 360 px,
with reduced motion. The existing simple track and mobile keyboard restriction are separate
cards; these screenshots do not declare them complete.

## Verification record

- No-JavaScript guard, lint, typecheck: passed.
- Unit tests: web 532, database 70, domain 1018, load tool 20, word-list tool 46, all passed.
- PostgreSQL: 152 passed; 9 PgBouncer tests skipped because its configuration was absent.
- Migration drift: none.
- Build: first command stopped with the existing Next.js dependency security alert after
  compilation; one unchanged retry passed. No upgrade command or security bypass was used.
- Client word-data leakage check: passed (41 assets, 18 JavaScript chunks, 2 data files,
  2 fingerprints).
- Integration: 7/7; browser suite: 68/68, including the two new bonus scenarios.
- Local release packaging: **not attempted**, blocked by 547692 KiB available disk space.
  The existing Linux PR CI must validate packaging before merge.

The existing dependency audit reports critical Next.js and high source-map-js/zod findings.
These dependencies are unchanged by this branch. Production approval is not given.

Repository review roles (code, functional QA, UI/UX, security) were applied manually and
sequentially by Codex, not by independent agents. No blocking finding introduced by the UI
delta remained. No production, real-device IME, Safari/Firefox, enabled-normal-room or
enabled-bonus load validation is claimed. #62 and CONF-09 / BONUS-01–04 remain incomplete.
