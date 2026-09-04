# AGENT.md — plugin `plugins/logs`

> Below the `<!-- mcp-vertex:begin agent-md -->
## Purpose

- Structured logs reader (tail, query, redact).

## Public API

- default
- createLogStore
- isErrorOutcome
- LOG_OUTCOMES
- normalizeEvent
- outcomeForKind
- serializeRedactedEvent
- incidentTypeForKind
- INCIDENT_TYPE_PATTERN
- isValidIncidentType
- KIND_TO_INCIDENT_TYPE
- LOG_SEVERITIES
- severityForOutcome
- correlateEvents

## Depends on

- @modelcontextprotocol/sdk
- zod
- @delendai/core

## Writes

- <host workspace>/.mcp-vertex/cache/logs/

## Entry points

- ./dist/index.js
- src/index.ts (default export → IMcpPlugin)

## Tests

- plugins/logs/src/lib/services/error-sink-adapter.spec.ts
- plugins/logs/tests/correlate.spec.ts
- plugins/logs/tests/incidents-search.spec.ts
- plugins/logs/tests/index.spec.ts

## Do not

- Do not run `git stash`; this repo forbids stashes (see `tools/scripts/lint/no-stashes.script.ts`) — a shared worktree can lose another agent's stashed work.
- Do not hand-edit content between `<!-- mcp-vertex:begin -->`/`<!-- mcp-vertex:end -->` markers; regenerate via the owning `gen:*` script instead.
- Do not import `@delendai/core/lib/...`; use `@delendai/core/public`.
- Do not run user-facing shell or destructive tools without `dryRunSupported: true`.
- Do not surface absolute host paths; use `workspaceRoot`-relative paths only.

## Token hotspots

_(none)_

<!-- mcp-vertex:end agent-md -->

