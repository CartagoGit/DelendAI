# AGENT.md — plugin `plugins/quality`

> Below the `<!-- delendai:begin agent-md -->
## Purpose

- Quality gates: coverage, complexity, lint, type-check orchestration.

## Public API

- default
- createCommandRunner
- runScope
- resolveScopes
- deriveScopedValidationScopes
- resolveScopedValidationDecision
- runAllScopes
- evaluateCommandPolicy
- commandBinary
- buildQualityToolRegistrations

## Depends on

- @modelcontextprotocol/sdk
- zod
- @delendai/core

## Writes

- <host workspace>/.delendai/cache/quality/

## Entry points

- ./dist/index.js
- src/index.ts (default export → IMcpPlugin)

## Tests

- plugins/quality/tests/src/lib/command-policy.spec.ts
- plugins/quality/tests/src/lib/complexity.spec.ts
- plugins/quality/tests/src/lib/coverage.spec.ts
- plugins/quality/tests/src/lib/quality-complexity.tool.spec.ts

## Do not

- Do not run `git stash`; this repo forbids stashes (see `tools/scripts/lint/no-stashes.script.ts`) — a shared worktree can lose another agent's stashed work.
- Do not hand-edit content between `<!-- delendai:begin -->`/`<!-- delendai:end -->` markers; regenerate via the owning `gen:*` script instead.
- Do not import `@delendai/core/lib/...`; use `@delendai/core/public`.
- Do not run user-facing shell or destructive tools without `dryRunSupported: true`.
- Do not surface absolute host paths; use `workspaceRoot`-relative paths only.

## Token hotspots

_(none)_

<!-- delendai:end agent-md -->

