---
name: scope-task
description: Turns an Incision request into a verifiable card (official IDs, criteria, refusals, evidence, reviews), then stops to get "Go Ahead". Use before any non-trivial implementation.
---

# Scope a task

Roles: [architect](../../roles/architect.md) with the [analyst](../../roles/analyst.md). No code file changes during this skill.

## Steps

1. If the card already exists as a GitHub issue, start from it (`gh issue view <number>`). Read the Git state (`git status`, branch, `git log -1 --oneline`). Flag a dirty working tree.
2. Identify the official IDs in `docs/EXIGENCES.md` and the brief, plus the applicable D-xx choices. State checkpoint (§7.1) or final submission.
3. Explore the relevant code and documents (analyst, read-only; in parallel dba or security when the card touches data or security).
4. Write the card below. One card = one goal deliverable and verifiable in one PR; otherwise propose a split.
5. Pick the reviews from the risk table in [WORKFLOW.md](../../WORKFLOW.md#risk-based-reviews).
6. Present the card to Philippe and **stop**. With his approval, publish it as a GitHub issue (or update the existing one). Implementation starts only after "Go Ahead" in the active conversation.

## Card template

```markdown
# <CARD-ID> — <title>
IDs: <official IDs> · Choices: <D-xx or "none"> · Due: checkpoint | final
Observable goal: <what we will see working>
Out of scope: <what is not done here>
Acceptance criteria:
- [ ] <verifiable criterion>
Expected refusals and edge cases:
- <input/state> → <expected response>
Data and migrations: <tables, constraints, or "none">
Likely files: <paths>
Evidence: <commands, named tests, user flows>
Reviews: <per WORKFLOW>
Human or remote actions: <OAuth, Azure, Neon, or "none">
Risks and unknowns: <list>
Matrix: <IDs → target status>
```

## Done when

The card is presented, every criterion has planned evidence, unknowns are named and Philippe has answered.
