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

- plugins/forge/src/lib/contracts/constants/forge-read.constant.spec.ts
- plugins/forge/src/lib/contracts/constants/forge-release.constant.spec.ts
- plugins/forge/src/lib/contracts/constants/forge-write.constant.spec.ts
- plugins/forge/src/lib/detect.spec.ts

## Do not

- Do not run `git stash`; this repo forbids stashes (see `tools/scripts/lint/no-stashes.script.ts`) — a shared worktree can lose another agent's stashed work.
- Do not hand-edit content between `<!-- mcp-vertex:begin -->`/`<!-- mcp-vertex:end -->` markers; regenerate via the owning `gen:*` script instead.
- Do not import `@mcp-vertex/core/lib/...`; use `@mcp-vertex/core/public`.
- Do not run user-facing shell or destructive tools without `dryRunSupported: true`.
- Do not surface absolute host paths; use `workspaceRoot`-relative paths only.

## Token hotspots

_(none)_

<!-- mcp-vertex:end agent-md -->

