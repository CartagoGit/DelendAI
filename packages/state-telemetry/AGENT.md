# AGENT.md — package `packages/state-telemetry`

> Below the `<!-- delendai:begin agent-md -->
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

- packages/state-telemetry/src/lib/eta/duration-history.spec.ts
- packages/state-telemetry/src/lib/eta/eta-aggregation.spec.ts
- packages/state-telemetry/src/lib/eta/eta-engine.spec.ts
- packages/state-telemetry/src/lib/eta/feature-vector.spec.ts

## Do not

- An agent does not run `git stash`: git refuses it for agents (`delendai guard`, reference-transaction), because every worktree shares one stash and stashed work is invisible to the work model. Commit, or checkpoint to your work ref, instead.
- Do not hand-edit content between `<!-- delendai:begin -->`/`<!-- delendai:end -->` markers; regenerate via the owning `gen:*` script instead.

## Token hotspots

_(none)_

<!-- delendai:end agent-md -->

