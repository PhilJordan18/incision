@AGENTS.md

## Claude Code specifics

- The main session plays the architect and the developer. Review roles are subagents (`.claude/agents/`): thin adapters over the `.agents/roles/` briefs, without write tools. Run them in parallel on the same SHA.
- `.claude/skills` is a symlink to `.agents/skills`: single source shared with Codex.
- `.claude/settings.json` denies force-push, PR merge, `drizzle-kit push`, `reset --hard` and reading `.env`; it asks for confirmation before push, PR creation, `az` and migrations.
- New rules go in `AGENTS.md` or `.agents/`, not here.
