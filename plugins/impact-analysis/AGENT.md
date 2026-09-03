# AGENT.md — plugin `plugins/impact-analysis`

> Below the `<!-- mcp-vertex:begin agent-md -->
## Purpose

- Bounded impact analysis and test selection across changed symbols, dependents and related specs.

## Public API

- default
- buildImpactAnalyzeToolRegistrations
- buildImpactAnalysisToolRegistrations
- ImpactAnalyzeOutputSchema
- runImpactAnalyze
- buildTestsForChangeToolRegistrations
- TestsForChangeOutputSchema
- runTestsForChange

## Depends on

- @mcp-vertex/git
- @mcp-vertex/refactor
- @mcp-vertex/search
- @mcp-vertex/test-policy
- @modelcontextprotocol/sdk
- zod
- @mcp-vertex/core

## Writes

- <host workspace>/.mcp-vertex/cache/impact-analysis/

## Entry points

- ./dist/index.js
- src/index.ts (default export → IMcpPlugin)

## Tests

- plugins/impact-analysis/tests/src/impact-analysis.tool.spec.ts
- plugins/impact-analysis/tests/src/lib/services/impact-analysis.service.spec.ts

## Do not

- Do not run `git stash`; this repo forbids stashes (see `tools/scripts/lint/no-stashes.script.ts`) — a shared worktree can lose another agent's stashed work.
- Do not hand-edit content between `<!-- mcp-vertex:begin -->`/`<!-- mcp-vertex:end -->` markers; regenerate via the owning `gen:*` script instead.
- Do not import `@mcp-vertex/core/lib/...`; use `@mcp-vertex/core/public`.
- Do not run user-facing shell or destructive tools without `dryRunSupported: true`.
- Do not surface absolute host paths; use `workspaceRoot`-relative paths only.

## Token hotspots

_(none)_

<!-- mcp-vertex:end agent-md -->

