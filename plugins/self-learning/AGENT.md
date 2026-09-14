# AGENT.md — plugin `plugins/self-learning`

> Below the `<!-- delendai:begin agent-md -->
## Purpose

- Per-project learning store: accumulates observations the runtime already writes and answers what this project has taught us.

## Public API

- default
- appendObservations
- parseObservation
- queryObservations
- readObservations
- collectFromTestJournal
- observationsFromJournalLine
- OBSERVATION_KINDS
- buildObservationsToolRegistration
- buildLessonsToolRegistration
- adviseFor
- deriveLessons
- DEFAULT_MINIMUM_SUPPORT
- DEFAULT_RECENCY_WINDOW_MS

## Depends on

- @modelcontextprotocol/sdk
- zod
- @delendai/core

## Writes

- <host workspace>/.delendai/cache/self-learning/

## Entry points

- ./dist/index.js
- src/index.ts (default export → IMcpPlugin)

## Tests

- plugins/self-learning/tests/src/lib/lessons/derive-lessons.spec.ts
- plugins/self-learning/tests/src/lib/store/observation-store.spec.ts
- plugins/self-learning/tests/src/lib/tools/observations.tool.spec.ts
- plugins/self-learning/tests/src/plugin-wiring.spec.ts

## Do not

- Do not run `git stash`; this repo forbids stashes (see `tools/scripts/lint/no-stashes.script.ts`) — a shared worktree can lose another agent's stashed work.
- Do not hand-edit content between `<!-- delendai:begin -->`/`<!-- delendai:end -->` markers; regenerate via the owning `gen:*` script instead.
- Do not import `@delendai/core/lib/...`; use `@delendai/core/public`.
- Do not run user-facing shell or destructive tools without `dryRunSupported: true`.
- Do not surface absolute host paths; use `workspaceRoot`-relative paths only.

## Token hotspots

_(none)_

<!-- delendai:end agent-md -->

