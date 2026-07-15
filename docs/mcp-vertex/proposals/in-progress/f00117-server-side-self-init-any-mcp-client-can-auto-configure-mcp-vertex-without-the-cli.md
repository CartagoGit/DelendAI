---
id: f00117
title: "Server-side self-init — any MCP client can auto-configure mcp-vertex without the CLI"
kind: feat
status: in-progress
type: proposal
track: core+adoption
date: 2026-07-15
---

# f00117 — Server-side self-init — any MCP client can auto-configure mcp-vertex without the CLI

## Goal

The server configures ITSELF: a new core tool `init_config` derives a sensible mcp-vertex.config.json from the live project analysis (analyzeProject: languages, repo shape, monorepo roots → preset recommendation + plugin options like search/docs roots), dry-run by default, atomic write, never overwrites an existing config without overwrite:true. When the server boots WITHOUT a config file, the overview's recommendedNextAction points at init_config — so an agent connected from ANY host (no mcpv CLI available) closes the loop in one tool call. The CLI's `mcpv init` stays the human path; this is the agent path.

## why

User directive 2026-07-15: "que el mismo mcp fuera capaz de crear una autoconfiguración o un init propio". Today self-configuration requires the CLI (`mcpv init`, packages/cli/src/lib/init/) — an agent talking to the server over stdio from Cursor/Claude/Copilot cannot bootstrap the config; the server just boots with defaults and the config gap stays invisible unless someone runs --check.

## non-goals

- No IDE-config merging server-side — .vscode/.cursor/.mcp.json wiring stays in mcpv init (it edits files OUTSIDE the workspace contract).
- No plugin installation — the tool recommends and writes config; installing npm packages is the host's job.
- Never write at boot: the tool is always an explicit call.

## Slices

- global_gate: e2e

### S1 — Config derivation engine: analysis → recommended config (pure)
- **Status**: pending
- **Files**: `packages/core/src/lib/bootstrap/derive-config.ts`, `packages/core/tests/src/lib/bootstrap/derive-config.spec.ts`
- **Gate**: e2e
- acceptance:
  - "deriveConfig(analysis) returns {preset, plugins{options}, cacheDir, docsDir, rationale[]}: TS monorepo → standard/swarm with roots from the real workspace shape; single-package → lean; non-TS → minimal+conventions profile hint; every recommendation carries a one-line rationale."
  - "Pure function over IProjectAnalysis — no I/O; spec drives fixtures for the 4 repo shapes."

### S2 — init_config core tool (dry-run default, atomic, overwrite-guarded) + boot orientation
- **Status**: pending
- **DependsOn**: [S1]
- **Files**: `packages/core/src/lib/bootstrap/init-config-tool.ts`, `packages/core/src/lib/cli/assemble-core-tools.ts`, `packages/core/tests/src/lib/bootstrap/init-config-tool.spec.ts`
- **Gate**: e2e
- acceptance:
  - "init_config {} returns the derived config + rationale WITHOUT writing; {write:true} writes mcp-vertex.config.json via writeFileAtomic and reports the path; existing config + no overwrite:true → structured error naming the file."
  - "When no config file exists, overview's recommendedNextAction names init_config (spec asserts both presence and absence)."
  - "outputSchema declared; registered through assemble-core-tools; types:generate + catalog regen; token budgets green."

## acceptance

- deriveConfig(analysis) returns {preset, plugins{options}, cacheDir, docsDir, rationale[]}: TS monorepo → standard/swarm with roots from the real workspace shape; single-package → lean; non-TS → minimal+conventions profile hint; every recommendation carries a one-line rationale.
- Pure function over IProjectAnalysis — no I/O; spec drives fixtures for the 4 repo shapes.
- init_config {} returns the derived config + rationale WITHOUT writing; {write:true} writes mcp-vertex.config.json via writeFileAtomic and reports the path; existing config + no overwrite:true → structured error naming the file.
- When no config file exists, overview's recommendedNextAction names init_config (spec asserts both presence and absence).
- outputSchema declared; registered through assemble-core-tools; types:generate + catalog regen; token budgets green.
