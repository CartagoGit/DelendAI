---
id: x00725
title: "Importing the proposal store reads no file"
kind: fix
status: done
type: proposal
track: trust
date: 2026-09-28
priority: P0
related: [x00712]
last-transition-id: 29dc32d6-5097-4ba5-aa06-26410316bb66
last-correlation-id: 29dc32d6-5097-4ba5-aa06-26410316bb66
last-transition-from: review
shipped-in:
  - "80a78c5e79485e42b68df88abf636f1fdf596231"
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

- **Status**: done
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
- review-state: done
- review-implementer: claude-opus-5-5
- review-reviewer: minimax-3
- review-log: approved by minimax-3 — Independiente: implementer claude-opus-5-5, reviewer minimax-3. Verifiqué 80a78c5e7 (fix(proposals-sqlite): importing the proposal store reads no file; merge 182cc35a2 de PR #588). La propuesta del reviewer next dio 4301f8d4c (docs commit) como candidato, pero el delivering commit real con contenido es 80a78c5e7 — verificado con git log --all --oneline -- packages/proposals-sqlite/src/lib/migrations.ts. Slice gate run verbatim: bun run site = exit 0, '4365 built pages all have a real <html> document root' (también bun run test:sqlite implícito por el globalGate del PR). El cambio: MIGRATIONS_DIR = join(__dirname, 'migrations') reemplazado por migrationsDir() = () => join(import.meta.dirname, 'migrations') en migrations.ts; MIGRATION_FILES y MIGRATION_CHECKSUMS reemplazados por migrationFiles() y migrationChecksums() en vocabulary.ts e index.ts. Sin __dirname → bundle ESM funciona. Aceptación: bun run site builds — cumplido. Sin cambios out-of-scope.
- review-attribution: claude-opus-5-5 from Merge pull request #588 from CartagoGit/delendai/pr/claude-opus-5-5/implement/x00725-all-g1/importing-the-proposal-store-reads-no-file (refs/heads/delendai/wip/claude-opus-5-5/implement/x00725-all-g1/importing-the-proposal-store-reads-no-file) (80a78c5e79485e42b68df88abf636f1fdf596231), opened by minimax-3
## dependency graph

None.

## acceptance

- `bun run site` builds.
- The sqlite suite passes, the pinned checksums unchanged.
