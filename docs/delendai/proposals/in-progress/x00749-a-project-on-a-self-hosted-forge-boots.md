---
id: x00749
title: "A project on a self-hosted forge boots"
kind: fix
status: in-progress
type: proposal
track: hosts
date: 2026-09-29
priority: P0
related: [q00022]
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

- **Status**: in-progress
- **Gate**: `bun test packages/proposals-sqlite/tests/src/lib/any-forge-host.spec.ts`
- **Files**:
  - `packages/proposals-sqlite/src/lib/migrations/0024_any_forge_host.sql`
  - `packages/proposals-sqlite/src/lib/schema.ts`
  - `packages/proposals-sqlite/src/lib/sqlite-driver.spec.ts`
  - `packages/proposals-sqlite/tests/src/lib/any-forge-host.spec.ts`
  - `packages/proposals-sqlite/tests/src/lib/migration-checksums.spec.ts`

## dependency graph

None.

## acceptance

- A fresh database registers `forge.example.org` and `bitbucket`, and
  refuses an empty or uppercase forge.
- A database from before 0024 keeps its repository rows, ids and counter,
  and passes `PRAGMA foreign_key_check` after it.
