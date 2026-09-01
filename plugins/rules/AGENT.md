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

- plugins/rules/tests/src/__typecheck_solid.spec.ts
- plugins/rules/tests/src/lib/plugin.spec.ts
- plugins/rules/tests/src/lib/rules.spec.ts
- plugins/rules/tests/src/lib/e2e-polyglot.spec.ts

## Do not

- Do not import `@mcp-vertex/core/lib/...`; use `@mcp-vertex/core/public`.
- Do not run user-facing shell or destructive tools without `dryRunSupported: true`.
- Do not surface absolute host paths; use `workspaceRoot`-relative paths only.

## Token hotspots

_(none)_

<!-- mcp-vertex:end agent-md -->

