# AI usage

Final deliverable of the brief (§8): agents and tools, instruction files, three situations where AI was wrong, and a short reflection. This file is filled progressively; the final write-up is due with the final submission.

## Agents and instruction files

- Claude Code (main session: architect and developer; review subagents) and Codex (card framing and reviews), driven by Philippe.
- Shared instructions: [AGENTS.md](../AGENTS.md), [CLAUDE.md](../CLAUDE.md), [.agents/](../.agents/) (workflow, roles, skills), [.claude/](../.claude/) (Claude adapters and permission guardrails).

## Log

Agent mistakes detected during development: what happened, how it was detected, how it was fixed.

| Date | Mistake | Detection | Fix |
|---|---|---|---|
| 2026-10-05 | Claude wrote YAML front matter for the subagents with unquoted French descriptions containing ": ", which YAML parses as nested keys. | Validation script parsing every front matter before committing. | Descriptions quoted; validation kept in the review routine. |
| 2026-10-05 | Claude's first custom server refused every Socket.IO handshake without an `Origin` header, which blocks a browser's normal same-origin polling request. Its own smoke test hid it (WebSocket only, forced Origin). | Code-review subagent probing the handshake from a real browser page. | Missing Origin accepted unless Fetch Metadata says cross-site; integration test with a default Socket.IO client. |
| 2026-10-05 | Claude documented `/api/health` (which queries Neon) as the Azure health-check path; a probe every minute would have kept Neon's free compute awake and exhausted its monthly quota, taking production down mid-month. | Code-review, deployment and security subagents, independently. | Separate `/api/health/live` without database access for Azure; readiness probe cached. |
| 2026-10-05 | Claude's database test fixtures used room codes containing `L` and `O` (`DUPL23`, `MOVE23`), letters the room-code alphabet excludes. | The `lobbies_code_format` check constraint rejected them when the tests ran on PostgreSQL. | Fixtures corrected; the failure confirmed the constraint matches the domain rule. |
