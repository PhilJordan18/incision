# F-10.2 — Architecture verification

Date: 25 October 2026. Card: [#89](https://github.com/PhilJordan18/incision/issues/89).
Implementation baseline: `dev` at `f4600af`. Documentation branch: `docs/f-10-2-architecture`.

## Scope and acceptance evidence

The final brief, section 8 item 4 (PDF page 11), requires a data model, race state machine, realtime message flow and realtime/bots ADRs. This revision checks the delivered code instead of treating the initial design as implemented.

| Criterion | Evidence |
|---|---|
| Data model | [Architecture §3](../../ARCHITECTURE.md#3-modèle-de-données-livré), compared with identity, rooms, races and corpus schema exports. No guest, invitation, MPM-series or bonus-event tables invented. |
| Race state machine | [Architecture §4](../../ARCHITECTURE.md#4-états--salle-moteur-et-persistance), compared with domain reduction, runtime and database lifecycle. Room phases, domain termination and durable results are distinguished. |
| Realtime messages | [Architecture §5](../../ARCHITECTURE.md#5-messages-et-autorité), compared with room/race/bonus protocols and channels. HTTP room actions remain HTTP; no fictional `race:results` event. |
| Realtime ADR | [ADR-0001](../../adr/0001-realtime.md), updated for implemented sessions, snapshots, clock estimation, durable finalisation and ownership leases. |
| Bots ADR | [ADR-0005](../../adr/0005-deterministic-bots.md), compared with engine, profiles, PRNG and reducer tests. Engine delivery is separated from F-05.2 integration. |
| Voice and provenance | French first-person architecture/realtime ADR for graded documents; English technical bots ADR and this evidence record, following CONTRIBUTING. No invented student design process or production evidence. |

## Checks performed

- `npm test --workspace @incision/domain -- src/bots/engine.test.ts src/random/prng.test.ts`: **2 files, 62 tests passed**, including 800 calibration simulations. Run with Node 24 under the shared heavy-command lock; installed dependencies were reused read-only from the preceding worktree.
- Local Markdown destinations and heading anchors in the four changed documents: checked against the worktree, including new ADR and evidence links.
- Four Mermaid blocks: architect read-through against the implementation (component flow, SQL relationships and room states), plus the realtime sequence diagram. This is a source/syntax review, not a browser rendering claim.
- `git diff --check`: no whitespace errors.
- Architect review: documentation-only scope, no blocking discrepancy retained. No requirement status is upgraded by this revision.

No application source, schema, migration, dependency, CI or design file changes. Consequently no new application build, PostgreSQL reset, browser suite, remote resource operation or production qualification was performed for this card. Existing tests linked in the architecture are source references, not claims that every suite was rerun here.

## Limits and coordination

- Ordinary rooms still use the two fixed passages, mandatory correction, a two-minute limit and bonuses disabled at the baseline. Corpus selection and the final track remain separate work.
- The bot engine is delivered; admission, server scheduling and playable bot presentation are not.
- Historical local load and manual acceptance evidence do not establish Azure/Neon or current production validation.
- PRs #140 (mobile) and #141 (history) were open at the baseline and are not counted as integrated here.
- The other Codex session confirmed no overlap with #68. Claude's corpus/selection work owns the separate data-model, setup, deployment and requirements documents; those files were preserved. This card updates only the main architecture, realtime ADR, new bots ADR and this evidence record.
- The requirements matrix remains unchanged: this is the brief's documentation deliverable, not completion of the unfinished product requirements it describes.
