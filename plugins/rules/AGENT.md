# AGENT.md — plugin `plugins/rules`

> Below the `<!-- mcp-vertex:begin agent-md -->
## Purpose

- Lint/type rules engine (frameworks, dogmas, presets).

## Public API

- default
- RULE_PRESETS
- PRESET_BY_ID
- REQUIRED_ESLINT_DEPS
- SUPPORTED_PRESET_IDS
- RULES_MODES
- RULES_MODE_GUIDANCE
- detectPresetForArea
- discoverAreas
- ensureRulesCache
- buildGetRulesRegistration
- buildCheckRulesRegistration
- buildApplyRulesRegistration

## Depends on

- @modelcontextprotocol/sdk
- zod
- @mcp-vertex/core

## Writes

- <host workspace>/.mcp-vertex/cache/rules/

## Entry points

- ./dist/index.js
- src/index.ts (default export → IMcpPlugin)

## Tests

- plugins/rules/src/__typecheck_solid.spec.ts
- plugins/rules/tests/src/__typecheck_solid.spec.ts
- plugins/rules/tests/src/lib/e2e-polyglot.spec.ts
- plugins/rules/tests/src/lib/frameworks/dogmas/dogma-registry.spec.ts

## Do not

- Do not run `git stash`; this repo forbids stashes (see `tools/scripts/lint/no-stashes.script.ts`) — a shared worktree can lose another agent's stashed work.
- Do not hand-edit content between `<!-- mcp-vertex:begin -->`/`<!-- mcp-vertex:end -->` markers; regenerate via the owning `gen:*` script instead.
- Do not import `@mcp-vertex/core/lib/...`; use `@mcp-vertex/core/public`.
- Do not run user-facing shell or destructive tools without `dryRunSupported: true`.
- Do not surface absolute host paths; use `workspaceRoot`-relative paths only.

## Token hotspots

- `mcp-vertex_rules_check_rules` — 2,650 B total, 2,303 B of it `outputSchema` (measured, see docs/mcp-vertex/TOKEN-BUDGETS.md)
- `mcp-vertex_rules_get_rules` — 2,302 B total, 1,826 B of it `outputSchema` (measured, see docs/mcp-vertex/TOKEN-BUDGETS.md)

<!-- mcp-vertex:end agent-md -->

