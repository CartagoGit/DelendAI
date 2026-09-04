# AGENT.md — plugin `plugins/forge`

> Below the `<!-- delendai:begin agent-md -->
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
- @delendai/core

## Writes

- <host workspace>/.delendai/cache/forge/

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
- Do not hand-edit content between `<!-- delendai:begin -->`/`<!-- delendai:end -->` markers; regenerate via the owning `gen:*` script instead.
- Do not import `@delendai/core/lib/...`; use `@delendai/core/public`.
- Do not run user-facing shell or destructive tools without `dryRunSupported: true`.
- Do not surface absolute host paths; use `workspaceRoot`-relative paths only.

## Token hotspots

_(none)_

<!-- delendai:end agent-md -->

