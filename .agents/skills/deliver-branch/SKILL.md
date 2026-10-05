---
name: deliver-branch
description: Pushes a verified Incision branch and opens its PR to dev, only after "deliver" in the active conversation. Also covers preparing a dev → main promotion PR on explicit order. Never merges.
---

# Deliver a branch

Role: [developer](../../roles/developer.md), after the "ready to deliver" report from `verify-task`.

## Preconditions

- "deliver" from Philippe **in the active conversation**, for this branch.
- Current branch is neither `main` nor `dev`; clean working tree.
- `HEAD` equals the SHA in the report. Otherwise go back to `verify-task`.

## Steps

1. `git push -u origin <branch>` (never `--force`).
2. Open the PR to `dev`: `gh pr create --base dev --head <branch> --title "<type(scope): description>" --body-file <file>`, with this body:

   ```markdown
   ## Summary
   <what changes and why> — Card <ID>, requirements <IDs>
   Closes #<issue number>
   ## Evidence
   - <command> → <result>
   - <criterion> → <evidence>
   ## Reviews
   <role → verdict; accepted unfixed findings>
   ## Still to do
   <limits, human actions, matrix status>
   ```

   Add screenshots when the UI changes.
3. Check the PR's CI status once and report it. A failure goes back to `implement-task` on the same branch.
4. Share the PR URL. Merging stays with Philippe.

## dev → main promotion

Only on Philippe's explicit order naming production. Open a PR `--base main --head dev` summarising the included PRs and the CI state. Do not merge it: `main` feeds production.

## Forbidden

Merging a PR, pushing to `dev` or `main`, `--force`, rewriting published history, triggering a deployment outside an authorised promotion.
