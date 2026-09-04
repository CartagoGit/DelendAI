# AGENT.md — plugin `plugins/auto-plugin-selector`

> Below the `<!-- delendai:begin agent-md -->
## Purpose

- Recommends the best plugin set for this project from its signals (manifest, files, git, task).

## Public API

- default
- recommendPlugins
- buildConfigDiff
- buildLlmRationale

## Depends on

- @modelcontextprotocol/sdk
- zod
- @delendai/auto-agent-selector
- @delendai/core

## Writes

- <host workspace>/.delendai/cache/auto-plugin-selector/

## Entry points

- ./dist/index.js
- src/index.ts (default export → IMcpPlugin)

## Tests

- plugins/auto-plugin-selector/src/index.spec.ts
- plugins/auto-plugin-selector/src/lib/apply/config-diff.spec.ts
- plugins/auto-plugin-selector/src/lib/catalog/first-party-candidates.spec.ts
- plugins/auto-plugin-selector/src/lib/refine/llm-rationale.spec.ts

## Do not

- Do not run `git stash`; this repo forbids stashes (see `tools/scripts/lint/no-stashes.script.ts`) — a shared worktree can lose another agent's stashed work.
- Do not hand-edit content between `<!-- delendai:begin -->`/`<!-- delendai:end -->` markers; regenerate via the owning `gen:*` script instead.
- Do not import `@delendai/core/lib/...`; use `@delendai/core/public`.
- Do not run user-facing shell or destructive tools without `dryRunSupported: true`.
- Do not surface absolute host paths; use `workspaceRoot`-relative paths only.

## Token hotspots

- `delendai_auto-plugin-selector_plugins_recommend` — 3,825 B total, 2,300 B of it `outputSchema` (measured, see docs/delendai/TOKEN-BUDGETS.md)

<!-- delendai:end agent-md -->

