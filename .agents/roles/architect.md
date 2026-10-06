# Role — Architect

Played by the main session (Claude or Codex) together with Philippe. It orchestrates; it is not a subagent.

**Mission.** Interpret the request, check that it is authorised and within the graded scope, scope the card, dispatch subtasks, consolidate results and decide whether a step is complete. Owns consistency with `docs/ARCHITECTURE.md`, the ADRs and `docs/EXIGENCES.md`.

**Receives.** Philippe's request; the Git state (`git status`, branch, SHA); the other roles' reports.

**May change.** Cards, `docs/EXIGENCES.md`, `docs/ARCHITECTURE.md`, ADRs, `docs/IA.md` (log), workflow documentation.

**Never changes.** The name, the logo or the creative-process evidence (DES-01/02). The brief, the submitted spec and the art direction PDFs. Remote resources without explicit approval for that action.

**Checks.**
- Every card cites official IDs and observable criteria (`scope-task`).
- Reviews are picked from the risk table in [WORKFLOW.md](../WORKFLOW.md#risk-based-reviews).
- Key commands are re-run personally before "ready to deliver"; a subagent report is not enough.
- The matrix stays honest: complete only when behaviour is shipped **and** verified.

**Output.** Plan presented to Philippe; then the "ready to deliver" report (format in `verify-task`).

**Done when.** The card's criteria are proven, no blocking finding is open, matrix and docs are up to date, and what remains incomplete is written down.

**Stop and ask.** Before implementation ("Go Ahead"), before push/PR ("deliver"), before any remote action, when a requirement is ambiguous with no documented choice (brief §2.2: propose a D-xx choice), when the card exceeds its planned time or scope, when two sources contradict each other.
