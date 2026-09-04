# AGENT.md — plugin `plugins/status-marker`

> Below the `<!-- mcp-vertex:begin agent-md -->
## Purpose

- Status marker + closure canonical line.

## Public API

- CLOSE_MARKER_STATES
- CLOSE_SEPARATOR
- EMOJI_TO_STATE
- formatCloseMarker
- formatLxAppCloseMarker
- MAX_LINE_LEN
- MARKERS
- REASON_MISSING_TOKEN
- splitLastLine
- validateCloseMarker
- validateResponseClose
- default

## Depends on

- @modelcontextprotocol/sdk
- zod
- @delendai/core

## Writes

- <host workspace>/.mcp-vertex/cache/status-marker/

## Entry points

- ./dist/index.js
- src/index.ts (default export → IMcpPlugin)

## Tests

- plugins/status-marker/tests/close-tools.spec.ts
- plugins/status-marker/tests/markers.spec.ts
- plugins/status-marker/tests/validate.spec.ts

## Do not

- Do not run `git stash`; this repo forbids stashes (see `tools/scripts/lint/no-stashes.script.ts`) — a shared worktree can lose another agent's stashed work.
- Do not hand-edit content between `<!-- mcp-vertex:begin -->`/`<!-- mcp-vertex:end -->` markers; regenerate via the owning `gen:*` script instead.
- Do not import `@delendai/core/lib/...`; use `@delendai/core/public`.
- Do not run user-facing shell or destructive tools without `dryRunSupported: true`.
- Do not surface absolute host paths; use `workspaceRoot`-relative paths only.

## Token hotspots

_(none)_

<!-- mcp-vertex:end agent-md -->

