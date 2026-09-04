# AGENT.md — plugin `plugins/diagram`

> Below the `<!-- delendai:begin agent-md -->
## Purpose

- Diagram generator (mermaid, dot) from code structure.

## Public API

- buildDependencyGraph
- renderMermaid
- buildModuleGraph
- moduleDisplayName
- renderModuleMermaid
- realDiagramDeps
- realDiagramModules
- buildDiagramGraphToolRegistrations
- buildMermaidEr
- buildProposalDfaMermaid
- buildDiagramProposalsToolRegistrations

## Depends on

- @modelcontextprotocol/sdk
- zod
- @delendai/database
- @delendai/proposals
- @delendai/core

## Writes

- <host workspace>/.delendai/cache/diagram/

## Entry points

- ./dist/index.js
- src/index.ts (default export → IMcpPlugin)

## Tests

- plugins/diagram/tests/src/lib/build-graph.spec.ts
- plugins/diagram/tests/src/lib/erd/build-proposal-dfa.spec.ts
- plugins/diagram/tests/src/lib/graph/build-module-graph.spec.ts
- plugins/diagram/tests/src/lib/tools/diagram-graph.tool.spec.ts

## Do not

- Do not run `git stash`; this repo forbids stashes (see `tools/scripts/lint/no-stashes.script.ts`) — a shared worktree can lose another agent's stashed work.
- Do not hand-edit content between `<!-- delendai:begin -->`/`<!-- delendai:end -->` markers; regenerate via the owning `gen:*` script instead.
- Do not import `@delendai/core/lib/...`; use `@delendai/core/public`.
- Do not run user-facing shell or destructive tools without `dryRunSupported: true`.
- Do not surface absolute host paths; use `workspaceRoot`-relative paths only.

## Token hotspots

_(none)_

<!-- delendai:end agent-md -->

