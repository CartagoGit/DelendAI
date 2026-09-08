# AGENT.md — package `packages/state-telemetry`

> Below the `<!-- delendai:begin agent-md -->` marker is
> generated. Edit prose ONLY outside that block — the
> regenerator will replace the block verbatim.

<!-- delendai:begin agent-md -->
## Purpose

- Work Event Bus for the @delendai state telemetry (q00020 F1). Append-only stream of work_events with SQLite primary and NDJSON fallback. NO @delendai/core dependency.

## Public API

_(none)_

## Depends on

- @delendai/state

## Writes

_(none)_

## Entry points

- ./dist/index.js

## Tests

- packages/state-telemetry/src/lib/eta/feature-vector.spec.ts
- packages/state-telemetry/src/lib/events/work-event-store.spec.ts
- packages/state-telemetry/src/lib/events/work-event.spec.ts

## Do not

- Do not run `git stash`; this repo forbids stashes (see `tools/scripts/lint/no-stashes.script.ts`) — a shared worktree can lose another agent's stashed work.
- Do not hand-edit content between `<!-- delendai:begin -->`/`<!-- delendai:end -->` markers; regenerate via the owning `gen:*` script instead.

## Token hotspots

_(none)_

<!-- delendai:end agent-md -->

