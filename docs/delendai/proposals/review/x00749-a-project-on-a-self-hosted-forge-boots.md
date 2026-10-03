---
id: x00749
title: "A project on a self-hosted forge boots"
kind: fix
status: review
type: proposal
track: hosts
date: 2026-09-29
priority: P0
related: [q00022]
last-transition-id: a6712ed6-b789-421a-ae3f-2706476aa7f2
last-correlation-id: a6712ed6-b789-421a-ae3f-2706476aa7f2
last-transition-from: in-progress
---

# x00749 — A project on a self-hosted forge boots

## goal

The server starts in a project whose remote is on any forge: a
self-hosted Gitea or GitLab, Bitbucket, or any other host.

## why

On 2026-09-29 the server exited at boot in a consumer project whose remote
is `ssh://git@<self-hosted host>:2224/<group>/<team>/<app>.git`:

    boot failed: SQLiteError: CHECK constraint failed:
    forge IN ('github', 'gitlab', 'gitea', 'local')

Two sources disagreed on what a forge is. The startup seam names a forge
by its remote: a short name for `github.com`, `gitlab.com` and
`bitbucket.org`, and the hostname for every other host. That is
deliberate, because a hostname is stable and tells two self-hosted
instances apart. The `repositories` table (0015, rebuilt STRICT by 0020)
accepted only four names. Any project off github.com and gitlab.com
could not start, Bitbucket included, although the seam names it.

## why this design

- The seam stays the one place that names a forge. The table checks only
  what every forge name has: non-empty and lowercase.
- 0024 rebuilds `repositories` the way 0020 did (foreign keys off, rows,
  ids and the AUTOINCREMENT counter kept). The references to it from other
  tables are untouched.

## non-goals

- Forge-specific behaviour (pull requests, CI) for self-hosted forges.

## architecture

- `packages/proposals-sqlite/src/lib/migrations/0024_any_forge_host.sql`,
  `schema.ts`.

## Slices

- global_gate: none

### S1 — The repositories table takes any forge

- **Status**: done
- **Gate**: `bun test packages/proposals-sqlite/tests/src/lib/any-forge-host.spec.ts`
- **Files**:
  - `packages/proposals-sqlite/src/lib/migrations/0024_any_forge_host.sql`
  - `packages/proposals-sqlite/src/lib/schema.ts`
  - `packages/proposals-sqlite/src/lib/sqlite-driver.spec.ts`
  - `packages/proposals-sqlite/tests/src/lib/any-forge-host.spec.ts`
  - `packages/proposals-sqlite/tests/src/lib/migration-checksums.spec.ts`
- shipped-in: `195d1a537e0e`
- review-state: done
- review-implementer: claude-opus-5-5
- review-reviewer: minimax-3
- review-log: approved by minimax-3 — Revisé 195d1a537e0e. La migración 0024 deja de enumerar forges y pasa a aceptar cualquier forge no vacío en minúsculas, preservando filas e sqlite_sequence al reconstruir repositories. Corrí bun test sobre sqlite-driver + migration-checksums + any-forge-host: 24/24 verde; cubre host self-hosted, bitbucket y rechazo de forge vacío o con mayúsculas.
- review-attribution: claude-opus-5-5 from Merge pull request #637 from CartagoGit/delendai/pr/claude-opus-5-5/implement/x00749-S1-g1/a-self-hosted-forge-boots (refs/heads/delendai/wip/claude-opus-5-5/implement/x00749-S1-g1/a-self-hosted-forge-boots) (195d1a537e0e3032259237b71f2b3967929fb896), opened by minimax-3

## dependency graph

None.

## acceptance

- A fresh database registers `forge.example.org` and `bitbucket`, and
  refuses an empty or uppercase forge.
- A database from before 0024 keeps its repository rows, ids and counter,
  and passes `PRAGMA foreign_key_check` after it.
