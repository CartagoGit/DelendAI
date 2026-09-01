# AGENT.md — plugin `plugins/refactor`

> Below the `<!-- mcp-vertex:begin agent-md -->
## Purpose

- Refactor primitives (symbols, definition, references, rename, codemod).

## Public API

- buildNavEngine
- parseSourceFile
- buildRefactorNavToolRegistrations
- planRename
- buildRefactorRenameToolRegistrations

## Depends on

- @mcp-vertex/core
- typescript

## Writes

- <host workspace>/.mcp-vertex/cache/refactor/

## Entry points

- ./dist/index.js
- src/index.ts (default export → IMcpPlugin)

## Tests

_(none)_

## Do not

- Do not import `@mcp-vertex/core/lib/...`; use `@mcp-vertex/core/public`.
- Do not run user-facing shell or destructive tools without `dryRunSupported: true`.
- Do not surface absolute host paths; use `workspaceRoot`-relative paths only.

## Token hotspots

_(none)_

<!-- mcp-vertex:end agent-md -->

