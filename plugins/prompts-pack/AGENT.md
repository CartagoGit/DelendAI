# AGENT.md — plugin `plugins/prompts-pack`

> Below the `<!-- mcp-vertex:begin agent-md -->
## Purpose

- Project-aware MCP prompts (explain-this-code, write-tests-for, review-this-diff, etc.).

## Public API

- buildGenerateDocstringsPrompt
- buildExplainThisCodePrompt
- buildOptimizeThisPrompt
- buildReviewThisDiffPrompt
- buildSecurityAuditThisFilePrompt
- buildWriteTestsForPrompt

## Depends on

- @mcp-vertex/core

## Writes

- <host workspace>/.mcp-vertex/cache/prompts-pack/

## Entry points

- ./dist/index.js
- src/index.ts (default export → IMcpPlugin)

## Tests

- plugins/prompts-pack/src/prompts/prompts.spec.ts

## Do not

- Do not run `git stash`; this repo forbids stashes (see `tools/scripts/lint/no-stashes.script.ts`) — a shared worktree can lose another agent's stashed work.
- Do not hand-edit content between `<!-- mcp-vertex:begin -->`/`<!-- mcp-vertex:end -->` markers; regenerate via the owning `gen:*` script instead.
- Do not import `@mcp-vertex/core/lib/...`; use `@mcp-vertex/core/public`.
- Do not run user-facing shell or destructive tools without `dryRunSupported: true`.
- Do not surface absolute host paths; use `workspaceRoot`-relative paths only.

## Token hotspots

_(none)_

<!-- mcp-vertex:end agent-md -->

