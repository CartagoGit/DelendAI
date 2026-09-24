# AGENT.md — plugin `plugins/git`

> Below the `<!-- delendai:begin agent-md -->
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
- @delendai/core

## Writes

- <host workspace>/.delendai/cache/git/

## Entry points

- ./dist/index.js
- src/index.ts (default export → IMcpPlugin)

## Tests

- plugins/git/tests/release-finalize/e2e.spec.ts
- plugins/git/tests/release-finalize/index.spec.ts
- plugins/git/tests/release-pr/index.spec.ts
- plugins/git/tests/release/r2.spec.ts

## Do not

- An agent does not run `git stash`: git refuses it for agents (`delendai guard`, reference-transaction), because every worktree shares one stash and stashed work is invisible to the work model. Commit, or checkpoint to your work ref, instead.
- Do not hand-edit content between `<!-- delendai:begin -->`/`<!-- delendai:end -->` markers; regenerate via the owning `gen:*` script instead.
- Do not import `@delendai/core/lib/...`; use `@delendai/core/public`.
- Do not run user-facing shell or destructive tools without `dryRunSupported: true`.
- Do not surface absolute host paths; use `workspaceRoot`-relative paths only.

## Token hotspots

_(none)_

<!-- delendai:end agent-md -->

