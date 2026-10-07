# AGENT.md — plugin `plugins/prompts-pack`

> Below the `<!-- delendai:begin agent-md -->
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

- @delendai/core
- zod

## Writes

- <host workspace>/.delendai/cache/prompts-pack/

## Entry points

- ./dist/index.js
- src/index.ts (default export → IMcpPlugin)

## Tests

- plugins/prompts-pack/src/prompts/prompts.spec.ts

## Do not

- An agent does not run `git stash`: git refuses it for agents (`delendai guard`, reference-transaction), because every worktree shares one stash and stashed work is invisible to the work model. Commit, or checkpoint to your work ref, instead.
- Do not hand-edit content between `<!-- delendai:begin -->`/`<!-- delendai:end -->` markers; regenerate via the owning `gen:*` script instead.
- Do not import `@delendai/core/lib/...`; use `@delendai/core/public`.
- Do not run user-facing shell or destructive tools without `dryRunSupported: true`.
- Do not surface absolute host paths; use `workspaceRoot`-relative paths only.

## Token hotspots

_(none)_

<!-- delendai:end agent-md -->

