---
id: x00725
title: "Importing the proposal store reads no file"
kind: fix
status: review
type: proposal
track: trust
date: 2026-09-28
priority: P0
related: [x00712]
last-transition-id: b83b5adb-053a-4e05-ae68-91c00d54bb27
last-correlation-id: b83b5adb-053a-4e05-ae68-91c00d54bb27
last-transition-from: in-progress
---

# x00725 — Importing the proposal store reads no file

## goal

Importing `@delendai/proposals-sqlite`, or anything that imports it, reads
no file and needs no `__dirname`. The migrations are found and read when a
migration is first needed.

## why

`develop` has been red since x00712 merged, and the queue arms nothing
while it is: the web site build failed with `__dirname is not defined in ES
module scope`. `migrations.ts` resolved its directory with `__dirname` and
listed and hashed every migration file at module load. x00712 made the CLI
import the validate journal, which reaches the store's vocabulary; the site
bundles the CLI's commands, the bundler put the vocabulary in the same chunk
as the migrations, and loading that chunk ran the reads. The pull request's
CI ran only the jobs its changed files selected, and the site job was not
one of them.

## why this design

- `migrationFiles()` and `migrationChecksums()` replace the two constants,
  computed on first use and kept. The directory comes from
  `import.meta.dirname`, which bun and node both give an ES module, when a
  file is first read.
- Every consumer reads them through the functions; nothing else changes.

## non-goals

- Changing which CI jobs a pull request selects.

## architecture

- `packages/proposals-sqlite/src/lib/migrations.ts`, `vocabulary.ts`,
  `index.ts`, and the specs that read the migrations.

## Slices

- global_gate: none

### S1 — Migrations are read when needed

- **Status**: review
- **Gate**: `bun run test:sqlite && bun run site`
- **Files**:
  - `packages/proposals-sqlite/src/lib/migrations.ts`
  - `packages/proposals-sqlite/src/lib/vocabulary.ts`
  - `packages/proposals-sqlite/src/index.ts`
  - `packages/proposals-sqlite/src/lib/sqlite-driver.spec.ts`
  - `packages/proposals-sqlite/tests/src/lib/apply-candidate-run-kind.spec.ts`
  - `packages/proposals-sqlite/tests/src/lib/fts.spec.ts`
  - `packages/proposals-sqlite/tests/src/lib/migration-checksums.spec.ts`
  - `packages/proposals-sqlite/tests/src/lib/registry-fields.spec.ts`
  - `packages/proposals-sqlite/tests/src/lib/strict-tables.spec.ts`
  - `packages/proposals-sqlite/tests/src/lib/work-model/migrations.spec.ts`
  - `packages/proposals-sqlite/tests/src/lib/work-model/ref-attribution.spec.ts`

## dependency graph

None.

## acceptance

- `bun run site` builds.
- The sqlite suite passes, the pinned checksums unchanged.
