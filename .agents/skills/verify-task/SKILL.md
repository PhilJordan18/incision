---
name: verify-task
description: Verifies an implemented Incision card on an exact SHA (commands, risk-based reviews in parallel, consolidation, fixes, matrix update) and produces the "ready to deliver" report without pushing.
---

# Verify a task

Role: [architect](../../roles/architect.md), who consolidates and decides.

## Steps

1. Pin the target: branch and SHA (`git rev-parse --short HEAD`), clean working tree.
2. Run the repository's available commands (at least those in [CONTRIBUTING.md](../../../CONTRIBUTING.md#verifying-a-contribution)); record each command and its result. A missing command is reported, never invented.
3. Pick the reviews from the risk table in [WORKFLOW.md](../../WORKFLOW.md#risk-based-reviews).
4. Run the reviews on **the same SHA**:
   - Claude Code: subagents in parallel, each given the card, the SHA, the `dev...<SHA>` diff and its scope;
   - Codex or no subagents: roles applied one after another, without changing files during a review.
5. Read every report. Classify the findings; reject, with a reason, those that are wrong or out of the card's scope.
6. Fixes: the developer applies them sequentially, in new commits. Then re-run the affected commands and reviews.
7. Update `docs/EXIGENCES.md` (honest status, files, real tests) and the affected documentation. Notable agent mistake: add an entry to the `docs/IA.md` log.
8. Re-run the key commands yourself on the final SHA, produce the report and **stop**.

## "Ready to deliver" report

```text
Card: <ID> — <title>     Branch: <name>     SHA: <short>
Commits: <list>
Commands: <command> → <result>
Reviews: <role> → <verdict>   (unfixed findings and why)
Criteria: <criterion> → <evidence> → OK | KO | not checked
Matrix: <IDs> → <status>
Still incomplete / risks: <list>
Human actions: <list or "none">
Reply "deliver" to push the branch and open the PR to dev.
```

## Done when

No blocking finding is open, the report is presented with the final SHA, and "deliver" is awaited.
