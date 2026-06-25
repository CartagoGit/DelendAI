# Copilot / agent instructions — `@mcp-vertex/core`

This repo is a project-agnostic MCP server core + plugin loader. Full rules live in
[`AGENTS.md`](../AGENTS.md); this is the short, always-loaded version.

## Orient first, cheaply

- If the `mcp-vertex` server is loaded, call **`mcp-vertex_overview`** first — it returns
  the whole map (tools, plugins, workspace) in one low-token call. Don't crawl the
  filesystem to rediscover what `overview` already tells you.
- **Never re-read a doc whose digest hasn't changed.** `round_context` and the docs
  tools expose digests/staleness for exactly this — re-reading unchanged content is
  the #1 token waste.
- Prefer the MCP tools over raw shell: `search` (low-token grep), `docs_list`/
  `docs_read`, `memory_recall`, `git` status/diff.
- Use durable memory only for distilled reusable facts; do not persist raw logs,
  copied tool output, or per-turn exploration that will die with the current slice.

## Don't loop, don't poll

- When you need a lock another agent holds, **wait for the `lock-released`
  notification** (notification plugin) instead of polling `agent_lock status`.
- `auto_work` stops after consecutive idles by design — respect `stop: true`.
  When `auto_work` returns `stop: true`, recover by calling
  `proposals_continue_proposal { mode: "auto" }` directly (or by reading
  the cascade with `proposals_compact_status`). Do NOT re-call `auto_work`
  until you have made progress — a slice closed, a lock released, or a file
  edited. The loop detector is a safety net for actual loops, not a gate on
  polling for work; see `AGENTS.md` §"`auto_work` ↔ loop detector ↔
  idle-streak" for the full contract.

## Definition of done

- `bun run validate` (typecheck + lint + tests) is green. Never leave it red.
- Conventional Commits (`fix:`/`feat:`/`feat!:`) — versioning is automatic on `main`.
- Touched a tool? Keep its `outputSchema`.

## Invariants you must not break

Core stays agnostic · no `process.cwd()` in engines · async I/O in hot paths ·
durable writes via `withFileMutex` + `writeFileAtomic` · contain path inputs with
`resolveWorkspaceContained` · redact secrets before persisting · keep `overview`/
`auto_work` under their token budgets.

## Close every response with a canonical marker

The `@mcp-vertex/status-marker` plugin is **loaded** in this workspace
(`mcp-vertex_overview` reports it; its `ping` tool answers). The plugin is
agent-driven today: the core does **not** yet have an `onAfterRespond` hook
(that's `l105`), so the model is responsible for closing every response with
exactly one line from the canonical 8-state table.

**Mandatory behaviour for every response, with no exceptions:**

1. Pick the state that best describes the turn's outcome (`HECHO` when work is
   complete and nothing pending; `CAP` when handing off mid-turn; `RE-PIVOT`
   when the cascade changed direction; `CHECKPOINT-REQUIRED` when handing off
   to the orchestrator; `REPAIR-NEEDED` when the verifier asked for repair;
   `BLOQUEADO` on a hard blocker; `SIN PROPUESTAS LIBRES` when the catalog
   only has claimed work; `SIN PROPUESTA DE NINGUN TIPO` when nothing is
   executable at all).
2. Call `<prefix>_close { state, reason? }` (prefix is `status-marker` —
   confirm via `mcp-vertex_overview`). Never hand-format the line.
3. Paste the returned `line` as the **literal last line** of the response.
   No prose after it — not even whitespace-then-text. The line must be
   ≤120 chars (the helper truncates with `…` if needed).
4. Five states require a `reason`: `CAP`, `RE-PIVOT`, `CHECKPOINT-REQUIRED`,
   `REPAIR-NEEDED`, `BLOQUEADO`. Omitting it makes the helper insert the
   literal `<reason-missing>` token — that is **not** a valid response.
5. If unsure whether a draft response is compliant, run
   `<prefix>_validate { text: <full draft> }` first and check `ok`.

Full table and helper signature: read
[`plugins/status-marker/skills/mcp-vertex-status-marker-and-closure/SKILL.md`](../plugins/status-marker/skills/mcp-vertex-status-marker-and-closure/SKILL.md)
on first encounter or whenever the table changes.
