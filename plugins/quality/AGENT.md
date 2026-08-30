# AGENT.md — plugin `plugins/quality`

> Below the `<!-- mcp-vertex:begin agent-md -->
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
- @mcp-vertex/core

## Writes

- <host workspace>/.mcp-vertex/cache/quality/

## Entry points

- ./dist/index.js
- src/index.ts (default export → IMcpPlugin)

## Tests

- plugins/quality/tests/src/lib/run-all.spec.ts
- plugins/quality/tests/src/lib/runner.spec.ts
- plugins/quality/tests/src/lib/command-policy.spec.ts
- plugins/quality/tests/src/lib/quality-complexity.tool.spec.ts

## Do not

- Do not import `@mcp-vertex/core/lib/...`; use `@mcp-vertex/core/public`.
- Do not run user-facing shell or destructive tools without `dryRunSupported: true`.
- Do not surface absolute host paths; use `workspaceRoot`-relative paths only.

## Token hotspots

_(none)_

<!-- mcp-vertex:end agent-md -->

