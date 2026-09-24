# AGENT.md — plugin `plugins/observability`

> Below the `<!-- delendai:begin agent-md -->
## Purpose

- Observability surface (metrics, errors, telemetry).

## Public API

- authHeaderFor
- dispatchFetch
- redactToken
- buildProvenanceGraph
- PROVENANCE_NODE_KINDS
- PROVENANCE_RELATION_DEFINITIONS
- listRecentErrors
- normalizeLevel
- sentryBuildListUrl
- sentryParseList
- buildObsErrorsToolRegistration
- buildObsHealthToolRegistration
- buildObsRuntimeMetricsToolRegistration
- createRuntimeMetricsRegistry

## Depends on

- zod
- @delendai/core
- @delendai/web-fetch

## Writes

- <host workspace>/.delendai/cache/observability/

## Entry points

- ./dist/index.js
- src/index.ts (default export → IMcpPlugin)

## Tests

- plugins/observability/src/index.spec.ts
- plugins/observability/src/lib/correlate/correlate-errors.spec.ts
- plugins/observability/src/lib/correlate/real-deps.spec.ts
- plugins/observability/src/lib/errors/ierror-source.spec.ts

## Do not

- An agent does not run `git stash`: git refuses it for agents (`delendai guard`, reference-transaction), because every worktree shares one stash and stashed work is invisible to the work model. Commit, or checkpoint to your work ref, instead.
- Do not hand-edit content between `<!-- delendai:begin -->`/`<!-- delendai:end -->` markers; regenerate via the owning `gen:*` script instead.
- Do not import `@delendai/core/lib/...`; use `@delendai/core/public`.
- Do not run user-facing shell or destructive tools without `dryRunSupported: true`.
- Do not surface absolute host paths; use `workspaceRoot`-relative paths only.

## Token hotspots

_(none)_

<!-- delendai:end agent-md -->

