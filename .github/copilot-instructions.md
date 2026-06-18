# Copilot / agent instructions — `@mcp-vertex/core`

This repo is a project-agnostic MCP server core + plugin loader. Full rules live in
[`AGENTS.md`](../AGENTS.md); this is the short, always-loaded version.

## Orient first, cheaply

- If the `mcp-vertex` server is loaded, call **`mcpvertex_overview`** first — it returns
  the whole map (tools, plugins, workspace) in one low-token call. Don't crawl the
  filesystem to rediscover what `overview` already tells you.
- **Never re-read a doc whose digest hasn't changed.** `round_context` and the docs
  tools expose digests/staleness for exactly this — re-reading unchanged content is
  the #1 token waste.
- Prefer the MCP tools over raw shell: `search` (low-token grep), `docs_list`/
  `docs_read`, `memory_recall`, `git` status/diff.

## Don't loop, don't poll

- When you need a lock another agent holds, **wait for the `lock-released`
  notification** (notification plugin) instead of polling `agent_lock status`.
- `auto_work` stops after consecutive idles by design — respect `stop: true`.

## Definition of done

- `bun run validate` (typecheck + lint + tests) is green. Never leave it red.
- Conventional Commits (`fix:`/`feat:`/`feat!:`) — versioning is automatic on `main`.
- Touched a tool? Keep its `outputSchema`. Touched site copy? Add ALL translations.

## Invariants you must not break

Core stays agnostic · no `process.cwd()` in engines · async I/O in hot paths ·
durable writes via `withFileMutex` + `writeFileAtomic` · contain path inputs with
`resolveWorkspaceContained` · redact secrets before persisting · keep `overview`/
`auto_work` under their token budgets.
