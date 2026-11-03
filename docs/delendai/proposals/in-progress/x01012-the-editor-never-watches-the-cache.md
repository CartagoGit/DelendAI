---
id: x01012
title: "The editor never watches the cache"
kind: fix
status: in-progress
type: proposal
track: a00095-consistency
date: 2026-11-03
last-transition-id: aebdb9e9-cb24-4960-a618-8295722512d9
last-correlation-id: aebdb9e9-cb24-4960-a618-8295722512d9
last-transition-from: ready
last-transition-at: 2026-11-03T13:49:24.804Z
---

# x01012 — The editor never watches the cache

## goal

init and the startup migration exclude the delendai cache from files.watcherExclude and search.exclude in the project's .vscode/settings.json.

## why

VS Code watches a consumer project's `.cache`. Every worktree delendai adds or removes there is about 20 files, and each one is delivered to the watchers of the folder, such as Biome's LSP. A cache is derived state and nothing in it is worth an event, so it must never be watched or searched. `delendai init` already merges `.vscode/settings.json` (keeping the person's keys and comments) but said nothing about the cache. The fix extends that merge: `files.watcherExclude` and `search.exclude` get `.cache/**` when the configured cacheDir lies under `.cache`, and the cacheDir's own glob otherwise; a cacheDir outside the workspace needs none. A pattern the person already set, true or false, is never overwritten. Projects that already ran init take the same merge through a new migration (`vscodeCacheExcludeMigrator:v1`) that the CLI start-up guard runs on every entrypoint: it adds only what is missing, and creates no settings file where the person has none.

## non-goals

- Excluding the cache from `files.exclude` (the explorer tree): people open cache files on purpose.
- Writing `.gitignore` or any other editor's settings (Biome, JetBrains).
- Creating `.vscode/settings.json` through the migration where the person has none; `init` does that.
- Removing or rewriting a pattern the person set, and moving the exclusion when cacheDir later changes.

## slices

- global_gate: none

### S1 — The cache is never watched
- **Status**: pending
- **Files**: `.vscode/settings.json`, `packages/core/src/lib/workspace-migration/migrators/vscode-cache-exclude.ts`, `packages/core/src/lib/workspace-migration/migrators/vscode-cache-exclude.constant.ts`, `packages/core/src/lib/workspace-migration/migrators/vscode-cache-exclude.migrator.ts`, `packages/core/src/lib/workspace-migration/migration-registry.ts`, `packages/core/src/cli.ts`, `packages/cli/src/lib/init/init-vscode-settings.ts`, `packages/cli/src/lib/init/init-vscode-settings.spec.ts`, `packages/core/tests/src/lib/workspace-migration/migrators/vscode-cache-exclude.migrator.spec.ts`
- **Gate**: none
- acceptance:
  - "init writes files.watcherExclude and search.exclude for the cache (.cache/** under .cache, the cacheDir otherwise) into a new settings file and merges them into an existing one; a value the user set for the pattern stays; a migrator applies the same merge to projects that already have a settings file; specs cover a new file, a merge and a kept value."

## acceptance

- init writes files.watcherExclude and search.exclude for the cache (.cache/** under .cache, the cacheDir otherwise) into a new settings file and merges them into an existing one; a value the user set for the pattern stays; a migrator applies the same merge to projects that already have a settings file; specs cover a new file, a merge and a kept value.
