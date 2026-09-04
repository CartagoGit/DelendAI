# AGENT.md — plugin `plugins/api`

> Below the `<!-- delendai:begin agent-md -->
## Purpose

- REST/GraphQL API surface for delendai plugins.

## Public API

- parseOpenApi
- fetchAndParseSpec
- buildRequest
- coerceValue
- buildApiCallToolRegistration
- buildApiValidateToolRegistration
- buildApiValidateToolRegistrations
- resolveResponseSchema
- validateResponse
- generateMockFromSchema
- generateOperationMock
- mockHappyPath
- mockResponseForStatus
- buildApiMockToolRegistration

## Depends on

- zod
- @delendai/core
- @delendai/web-fetch

## Writes

- <host workspace>/.delendai/cache/api/

## Entry points

- ./dist/index.js
- src/index.ts (default export → IMcpPlugin)

## Tests

- plugins/api/src/lib/mock/mock-engine.spec.ts
- plugins/api/src/lib/spec/openapi.spec.ts
- plugins/api/src/lib/tools/api-call.tool.spec.ts
- plugins/api/src/lib/tools/api-mock.tool.spec.ts

## Do not

- Do not run `git stash`; this repo forbids stashes (see `tools/scripts/lint/no-stashes.script.ts`) — a shared worktree can lose another agent's stashed work.
- Do not hand-edit content between `<!-- delendai:begin -->`/`<!-- delendai:end -->` markers; regenerate via the owning `gen:*` script instead.
- Do not import `@delendai/core/lib/...`; use `@delendai/core/public`.
- Do not run user-facing shell or destructive tools without `dryRunSupported: true`.
- Do not surface absolute host paths; use `workspaceRoot`-relative paths only.

## Token hotspots

_(none)_

<!-- delendai:end agent-md -->

