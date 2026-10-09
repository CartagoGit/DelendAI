# AGENT.md — package `packages/roadmap-sqlite`

> Below the `<!-- delendai:begin agent-md -->
## Purpose

- SQLite driver for the roadmap timeline: the same append-only contract as the markdown timeline, kept in a database under the plugin cache directory.

## Public API

- migrateRoadmapDatabase
- readUserVersion
- resolveTimelineDatabasePath
- SqliteTimelineStore

## Depends on

- @delendai/roadmap

## Writes

_(none)_

## Entry points

- ./dist/index.js

## Tests

- packages/roadmap-sqlite/tests/src/lib/sqlite-timeline.store.spec.ts

## Do not

- An agent does not run `git stash`: git refuses it for agents (`delendai guard`, reference-transaction), because every worktree shares one stash and stashed work is invisible to the work model. Commit, or checkpoint to your work ref, instead.
- Do not hand-edit content between `<!-- delendai:begin -->`/`<!-- delendai:end -->` markers; regenerate via the owning `gen:*` script instead.

## Token hotspots

_(none)_

<!-- delendai:end agent-md -->

