# AGENT.md — plugin `plugins/status-marker`

> Below the `<!-- delendai:begin agent-md -->
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

- <host workspace>/.delendai/cache/status-marker/

## Entry points

- ./dist/index.js
- src/index.ts (default export → IMcpPlugin)

## Tests

- plugins/status-marker/tests/close-tools.spec.ts
- plugins/status-marker/tests/markers.spec.ts
- plugins/status-marker/tests/validate.spec.ts

## Do not

- An agent does not run `git stash`: git refuses it for agents (`delendai guard`, reference-transaction), because every worktree shares one stash and stashed work is invisible to the work model. Commit, or checkpoint to your work ref, instead.
- Do not hand-edit content between `<!-- delendai:begin -->`/`<!-- delendai:end -->` markers; regenerate via the owning `gen:*` script instead.
- Do not import `@delendai/core/lib/...`; use `@delendai/core/public`.
- Do not run user-facing shell or destructive tools without `dryRunSupported: true`.
- Do not surface absolute host paths; use `workspaceRoot`-relative paths only.

## Token hotspots

_(none)_

<!-- delendai:end agent-md -->

