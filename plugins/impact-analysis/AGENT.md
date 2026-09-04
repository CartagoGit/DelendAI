# AGENT.md — plugin `plugins/impact-analysis`

> Below the `<!-- delendai:begin agent-md -->
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

- @delendai/git
- @delendai/refactor
- @delendai/search
- @delendai/test-policy
- @modelcontextprotocol/sdk
- zod
- @delendai/core

## Writes

- <host workspace>/.delendai/cache/impact-analysis/

## Entry points

- ./dist/index.js
- src/index.ts (default export → IMcpPlugin)

## Tests

- plugins/impact-analysis/tests/src/impact-analysis.tool.spec.ts
- plugins/impact-analysis/tests/src/lib/services/impact-analysis.service.spec.ts

## Do not

- Do not run `git stash`; this repo forbids stashes (see `tools/scripts/lint/no-stashes.script.ts`) — a shared worktree can lose another agent's stashed work.
- Do not hand-edit content between `<!-- delendai:begin -->`/`<!-- delendai:end -->` markers; regenerate via the owning `gen:*` script instead.
- Do not import `@delendai/core/lib/...`; use `@delendai/core/public`.
- Do not run user-facing shell or destructive tools without `dryRunSupported: true`.
- Do not surface absolute host paths; use `workspaceRoot`-relative paths only.

## Token hotspots

_(none)_

<!-- delendai:end agent-md -->

