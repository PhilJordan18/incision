# Agent workflow

Complements [AGENTS.md](../AGENTS.md) (rules and human approvals) and [CONTRIBUTING.md](../CONTRIBUTING.md) (code, checks, Git). When in doubt, those two files prevail.

## Card lifecycle

| Step | Meaning | Who | Output | Gate |
|---|---|---|---|---|
| Analyse | Map the request to official IDs, code and risks, without changing files | architect + analyst | card (`scope-task`) | automatic |
| Approve the plan | Philippe accepts scope, criteria and evidence | **Philippe** | "Go Ahead" | human |
| Develop | Branch `type/<card>-<slug>` from an up-to-date `dev`; small commits | developer (`implement-task`) | local commits | automatic |
| Test | Repository commands + risk-based reviews on one exact SHA | architect (`verify-task`) | consolidated reports | automatic |
| Prepare delivery | No blocking finding left; key commands re-run by the architect | architect | "ready to deliver" report, then **stop** | human |
| Deliver | Push the branch + open a PR to `dev` (`deliver-branch`) | developer | PR URL | "deliver" |
| Merge | PR merged into `dev` after CI | **Philippe** | updated `dev` | human |
| Deploy to production | `dev` → `main`; deployment follows `main` | **Philippe** | verified HTTPS URL | explicit order |

No staging environment for the checkpoint: verify locally (Docker PostgreSQL), then in production. A Neon development branch can serve as a remote test database if Philippe creates one.

Branches use the [CONTRIBUTING.md](../CONTRIBUTING.md#git-and-commits) types (`feat`, `fix`, `docs`, `test`, `refactor`, `chore`, `ci`, `build`), e.g. `feat/cp02-oauth-login`.

## Risk-based reviews

| Change | Required reviews |
|---|---|
| Documentation only | architect read-through |
| User interface | code-reviewer + ui-ux |
| Business rule, realtime | code-reviewer + functional-qa |
| Authentication, authorisation, upload, personal data, secrets | + security (mandatory) |
| Schema, migration, queries | + dba |
| CI, deployment, environment variables | + deployment + security |

## Parallel work

| Can run in parallel | Always sequential |
|---|---|
| Read-only scoping: analyst, dba, security | Implementation and fixes of a single card |
| Post-implementation reviews, all on **the same SHA** | Applying migrations, merges, deployment |
| Two code cards only with disjoint files, one worktree each, and Philippe's approval | Any write to a file already changed by another agent |

Review agents never change code: they report. Only the architect consolidates findings and decides on fixes, which the developer applies. After a fix, re-run the affected commands and reviews. A subagent saying "done" is not evidence: the architect reads the findings and re-runs the key commands.

## Standard report

```text
## <role> — <card> @ <short SHA>
Verdict: OK | Changes needed | Blocked
Checked: <command> → <result>  (one line per command or user flow)
Findings:
- [blocking|major|minor] <file:line> — <problem> — <evidence> — <recommendation>
Not checked: <what could not be checked and why>
Human decision: <precise question, or "none">
```

`blocking` prevents delivery; `major` is fixed within the card unless decided otherwise; `minor` is optional. Never copy a secret value into a report.

## Claude Code and Codex

| Capability | Shared | Claude Code | Codex |
|---|---|---|---|
| Rules | `AGENTS.md` | imported by `CLAUDE.md` | read natively |
| Skills | `.agents/skills/*/SKILL.md` | through the `.claude/skills` symlink | read natively |
| Roles | `.agents/roles/*.md` | subagents in `.claude/agents/*.md`, without write tools, runnable in parallel | role applied manually, sequentially |
| Technical guardrails | GitHub protections (to configure) | `.claude/settings.json`: deny and ask rules | Codex approval mode |

**Fallback without orchestration** (Codex, or any session without subagents): apply the roles one after another in the same session, without changing files during a review role. Example: "Role code-reviewer: read `.agents/roles/code-reviewer.md`, review `dev...HEAD` at SHA `<sha>`, return the standard report." Run Codex with `--sandbox workspace-write --ask-for-approval on-request` so that a push or network access requires approval.

When a capability is missing (hook, subagent, browser), the agent says so under "Not checked" instead of pretending it ran.

## AI log

`docs/IA.md` (final submission) requires three real situations where AI got it wrong. When a review or Philippe catches a significant agent mistake, the architect adds a dated entry to the "Log" section of `docs/IA.md` (create the section if missing): mistake, how it was detected, how it was fixed.
