# AGENT.md — plugin `plugins/forge`

> Below the `<!-- mcp-vertex:begin agent-md -->
## Purpose

- Forge (GitHub/GitLab) wrappers — PRs, CI, issues.

## Public API

- default
- detectForgeProvider
- runForge
- listPullRequests
- showPullRequest
- getCiStatus
- listIssues
- showIssue
- createRelease
- searchCode
- buildPrBody
- commentOnPr
- createIssue
- createPr

## Depends on

- @modelcontextprotocol/sdk
- zod
- @mcp-vertex/core

## Writes

- <host workspace>/.mcp-vertex/cache/forge/

## Entry points

- ./dist/index.js
- src/index.ts (default export → IMcpPlugin)

## Tests

- plugins/forge/tests/src/lib/services/forge-search.spec.ts
- plugins/forge/tests/src/lib/services/forge.spec.ts
- plugins/forge/tests/src/lib/services/forge-release.spec.ts
- plugins/forge/tests/src/lib/services/forge-write.spec.ts

## Do not

- Do not import `@mcp-vertex/core/lib/...`; use `@mcp-vertex/core/public`.
- Do not run user-facing shell or destructive tools without `dryRunSupported: true`.
- Do not surface absolute host paths; use `workspaceRoot`-relative paths only.

## Token hotspots

_(none)_

<!-- mcp-vertex:end agent-md -->

