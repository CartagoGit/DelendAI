# AGENT.md — plugin `plugins/git`

> Below the `<!-- mcp-vertex:begin agent-md -->
## Purpose

- Git wrappers (PR list/view, diff, changelog, extended).

## Public API

- default
- createGitRunner
- checkRepo
- parseStatus
- parseLog
- parseBlamePorcelain
- parseWorktreeList
- gitStatus
- gitChanged
- gitDiffStat
- gitLog
- gitBlame
- gitShow
- gitWorktreeList

## Depends on

- @modelcontextprotocol/sdk
- zod
- @mcp-vertex/core

## Writes

- <host workspace>/.mcp-vertex/cache/git/

## Entry points

- ./dist/index.js
- src/index.ts (default export → IMcpPlugin)

## Tests

- plugins/git/tests/transactions/lifecycle.spec.ts
- plugins/git/tests/src/plugin-options.spec.ts
- plugins/git/tests/src/lib/git-extended.tool.spec.ts
- plugins/git/tests/src/lib/git.spec.ts

## Do not

- Do not import `@mcp-vertex/core/lib/...`; use `@mcp-vertex/core/public`.
- Do not run user-facing shell or destructive tools without `dryRunSupported: true`.
- Do not surface absolute host paths; use `workspaceRoot`-relative paths only.

## Token hotspots

_(none)_

<!-- mcp-vertex:end agent-md -->

