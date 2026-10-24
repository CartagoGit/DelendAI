# AGENT.md — plugin `plugins/logs`

> Below the `<!-- delendai:begin agent-md -->
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

- <host workspace>/.delendai/cache/logs/

## Entry points

- ./dist/index.js
- src/index.ts (default export → IMcpPlugin)

## Tests

- plugins/logs/src/lib/services/error-sink-adapter.spec.ts
- plugins/logs/tests/correlate.spec.ts
- plugins/logs/tests/incidents-search.spec.ts
- plugins/logs/tests/index.spec.ts

## Do not

- An agent does not run `git stash`: git refuses it for agents (`delendai guard`, reference-transaction), because every worktree shares one stash and stashed work is invisible to the work model. Commit, or checkpoint to your work ref, instead.
- Do not hand-edit content between `<!-- delendai:begin -->`/`<!-- delendai:end -->` markers; regenerate via the owning `gen:*` script instead.
- Do not import `@delendai/core/lib/...`; use `@delendai/core/public`.
- Do not run user-facing shell or destructive tools without `dryRunSupported: true`.
- Do not surface absolute host paths; use `workspaceRoot`-relative paths only.

## Token hotspots

_(none)_

<!-- delendai:end agent-md -->

