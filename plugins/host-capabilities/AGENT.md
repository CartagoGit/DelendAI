# AGENT.md — plugin `plugins/host-capabilities`

> Below the `<!-- delendai:begin agent-md -->
## Purpose

- delendai plugin plugins/host-capabilities

## Public API

_(none)_

## Depends on

_(none)_

## Writes

- <host workspace>/.delendai/cache/host-capabilities/

## Entry points

- src/index.ts (default export → IMcpPlugin)

## Tests

_(none)_

## Do not

- Do not run `git stash`; this repo forbids stashes (see `tools/scripts/lint/no-stashes.script.ts`) — a shared worktree can lose another agent's stashed work.
- Do not hand-edit content between `<!-- delendai:begin -->`/`<!-- delendai:end -->` markers; regenerate via the owning `gen:*` script instead.
- Do not import `@delendai/core/lib/...`; use `@delendai/core/public`.
- Do not run user-facing shell or destructive tools without `dryRunSupported: true`.
- Do not surface absolute host paths; use `workspaceRoot`-relative paths only.

## Token hotspots

_(none)_

<!-- delendai:end agent-md -->

