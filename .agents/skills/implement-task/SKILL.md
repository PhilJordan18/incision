---
name: implement-task
description: Implements an Incision card approved with "Go Ahead" on its own branch created from dev, in small commits, without pushing. Use only after the plan was approved in the active conversation.
---

# Implement a task

Role: [developer](../../roles/developer.md).

## Preconditions

- "Go Ahead" from Philippe **in the active conversation** for this card. Otherwise stop and go back to `scope-task`.
- Clean working tree, or existing changes identified and set aside with Philippe's agreement.

## Steps

1. Update `dev` without rewriting: `git switch dev && git pull --ff-only`. If it fails, stop and report.
2. Create the branch: `git switch -c <type>/<card>-<slug>` (types from CONTRIBUTING.md).
3. In `apps/web`, read the installed version's documentation (`node_modules/next/dist/docs/`) before using a Next.js API.
4. For each plan step:
   - write the code and its tests together, in English (UI strings go through the FR/EN dictionaries);
   - run the available quick checks (list scripts with `npm run` and `npm run -w @incision/web`);
   - review `git status` and `git diff`, then commit only that step's files: `type(scope): description` (Conventional Commits, English).
5. Add a dependency only if the card plans it; stable version locked by `package-lock.json`.
6. Migrations: `generate`, then apply to the **local** Docker database. Never `push`, never Neon.
7. Significant deviation from the plan (file, schema, dependency, behaviour): stop and report it before going on.

## Forbidden

Push, PR, commits on `main`/`dev`, editing `.env` or secrets, disabling an ESLint/TypeScript rule or a test, out-of-card changes.

## Done when

Every step is committed, the available commands pass locally, and control goes back to the architect with: SHA, list of commits, deviations from the plan, commands and results. Continue with `verify-task`.
