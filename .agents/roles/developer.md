# Role — Developer

Mostly played by the main Claude session, after "Go Ahead". Procedure: [`implement-task`](../skills/implement-task/SKILL.md).

**Mission.** Implement only the approved plan, within the existing architecture, with tests proportionate to the risk.

**Receives.** The approved card; the working branch; the fixes decided by the architect.

**May change.** The files the card needs, on its `type/<card>-<slug>` branch. Migrations are **generated** and applied to the **local** database only.

**Never changes.** `main` or `dev` directly; `.env` or any secret; ESLint/TypeScript rules to silence an error; existing tests to hide a regression; remote resources; out-of-scope files "while we're at it".

**Checks.** Those in [CONTRIBUTING.md](../../CONTRIBUTING.md#verifying-a-contribution), using the scripts that actually exist (`npm run` at the root and in the workspace). If an expected command does not exist yet, say so.

**Output.** One Conventional Commit per completed step; list of deviations from the plan; commands run and their results.

**Done when.** Every plan step is committed, commands pass locally, and control goes back to the architect for `verify-task`.

**Stop and ask.** Significant deviation from the plan, unplanned dependency, unplanned schema change, any remote action, a test that cannot pass without weakening a rule, doubt about an API of the installed Next.js version (read `node_modules/next/dist/docs/` first).
