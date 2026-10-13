---
id: x00889
title: "delendai keeps one home inside its cache directory, the cache sheds what nobody needs, and plugins load lazily unless eager is declared"
kind: fix
status: review
type: proposal
track: general
date: 2026-10-13
last-transition-id: bcad8670-aa1c-4090-81e7-59fa5baa358b
last-correlation-id: bcad8670-aa1c-4090-81e7-59fa5baa358b
last-transition-from: in-progress
last-transition-at: 2026-10-13T15:56:28.609Z
---

# x00889 — delendai keeps one home inside its cache directory, the cache sheds what nobody needs, and plugins load lazily unless eager is declared

## goal

Nothing delendai writes lives outside the configured cache directory, a project upgraded from an older layout has it moved there once, the cache removes what its owners no longer need by default, and every plugin, the project's own included, is loaded on demand and released when idle unless the project declares eager loading.

## why

The owner, 2026-10-13: the cache accumulates rubbish, a `delendai` folder is created outside the cache folder with things in it, and a project's plugins must load lazily — eager only when declared, otherwise on demand and out of the context again once not needed.

What the code does today:

1. **A second home.** `.delendai/` at the project root holds the migration journal (`migrations-applied.json`), the applied-configuration record (`applied-config.json`), the cache-layout record, the project profile (`project-profile.json`, written by adoption), migration backups and the commit driver's `index-lock`. The configured `cacheDir` is not the only place delendai writes.
2. **A cache that never sheds.** The start-up sweep that applies the plugins' eviction rules runs as a dry run unless the project opts in, so it reports what it would remove and removes nothing. The core owns no rules for its own files: rotated logs (`*.log.1`), `results/`, and loose files left by one-off runs at the cache root (`f00282-type-gate.log`, `r00046-gate-filesets.json`) stay forever. A kept unit's worktree keeps its installed dependencies (hardlinked, but still a full tree) while it waits.
3. **Eager by accident.** x00888 made a plugin the generated catalog cannot list cost one eager start instead of every start. The owner's rule is stricter: eager loading is only ever declared (`managedSurface.loading: "eager"`); a plugin delendai does not know is discovered, not a reason to load everything.

## non-goals

- Removing anything a plugin or a person keeps outside the cache directory on purpose.
- Changing the idle eviction policy itself (5 minutes, 8 warm plugins); it is reported and kept.

## slices

- global_gate: type

### S1 — An unknown plugin is discovered, not a reason to load everything

- **Status**: review
- **Files**:
  - `packages/core/src/lib/cli/assemble-plugins.ts`
  - `packages/core/src/lib/plugins/managed-lazy-local-catalog.service.ts`
  - `packages/core/src/lib/plugins/managed-lazy-catalog-lookup.ts`
  - `packages/core/tests/src/lib/cli/managed-lazy-local-plugin.spec.ts`
  - `packages/core/tests/src/lib/cli/core-meta-tools.spec.ts`
- **Gate**: type
- acceptance:
  - A plugin the generated catalog lacks is imported and registered once, in isolation, to learn what it offers. Its runtime is disposed and its entry recorded in the project cache; the start then serves every plugin lazily. No start falls back to eager loading unless `managedSurface.loading: "eager"` is declared.
  - A recorded plugin is not imported at start until its file changes. Lazily activated plugins are released by the idle eviction as any other.
- shipped-in: `a22f77f06e75`
- review-state: in_review
- review-implementer: claude-opus-5-5

### S2 — The cache sheds what nobody needs, by default

- **Status**: review
- **Files**:
  - `packages/core/src/lib/cli/assemble.ts`
  - `packages/core/src/lib/cache/core-eviction-rules.helper.ts`
  - `packages/core/src/lib/contracts/constants/core-eviction.constant.ts`
  - `packages/core/src/lib/plugins/config-file-schema.ts`
  - `packages/core/tests/src/lib/cache/core-eviction-rules.helper.spec.ts`
  - `packages/core/tests/src/lib/cli/assemble.eviction.spec.ts`
- **Gate**: type
- acceptance:
  - The start-up sweep applies the eviction rules. A dry run is what a project declares, not the default.
  - The core registers rules for what it owns at the cache root: rotated logs (`*.log.N`) older than 7 days and the loose files one-off proposal runs leave there (`f00282-type-gate.log`) older than 30 days. Each removal is reported once.
- shipped-in: `62f28f4907b4`
- review-state: in_review
- review-implementer: claude-opus-5-5

### S3 — Everything delendai keeps is inside the cache directory

- **Status**: review
- **Files**:
  - `packages/core/src/lib/contracts/constants/delendai-records.constant.ts`
  - `packages/core/src/lib/shared/delendai-records.ts`
  - `packages/core/src/lib/workspace-migration/legacy-records-relocation.service.ts`
  - `packages/core/src/lib/workspace-migration/legacy-migration.service.ts`
  - `packages/core/src/lib/workspace-migration/migration-journal-path.constant.ts`
  - `packages/core/src/lib/workspace-migration/migration-registry.ts`
  - `packages/core/src/lib/workspace-migration/config-transitions.service.ts`
  - `packages/core/src/lib/workspace-migration/migrators/cache-and-docs.migrator.ts`
  - `packages/core/src/lib/workspace-migration/transaction/migration-manifest.ts`
  - `packages/core/src/lib/workspace-migration/transaction/rollback.ts`
  - `packages/core/src/lib/contracts/constants/config-transition.constant.ts`
  - `packages/core/src/lib/cache/boot-eviction-throttle.service.ts`
  - `packages/core/src/lib/cache/file-lifecycle-state-store.service.ts`
  - `packages/core/src/lib/adopt/adopt-project.tool.ts`
  - `packages/core/src/lib/adopt/project-profile.service.ts`
  - `packages/core/src/lib/contracts/interfaces/project-profile.interface.ts`
  - `packages/core/src/lib/development-policy/adoption-record.ts`
  - `packages/core/src/lib/scan/dip-violation.ts`
  - `packages/core/src/runtime/index.ts`
  - `plugins/commit-policy/src/lib/services/commit-driver.ts`
  - `tools/scripts/lint/check-ephemeral-paths.script.ts`
  - `packages/core/tests/src/lib/workspace-migration/legacy-records-relocation.service.spec.ts`
  - `packages/core/tests/src/lib/workspace-migration/legacy-migration.service.spec.ts`
  - `packages/core/tests/src/lib/workspace-migration/legacy-migration-manager.spec.ts`
  - `packages/core/tests/src/lib/workspace-migration/config-transitions.service.spec.ts`
  - `packages/core/tests/src/lib/cache/migrations/cache-layout-history.spec.ts`
  - `packages/core/tests/src/lib/cache/file-lifecycle-state-store.service.spec.ts`
  - `packages/core/tests/src/lib/adopt/project-profile.spec.ts`
  - `packages/core/tests/src/lib/scan/dip-violation.spec.ts`
- **Gate**: type
- acceptance:
  - The journal, the applied-configuration record, the cache-layout record, the project profile, migration backups and locks are written under the configured cache directory. A project that has `.delendai/` has it moved there once, and the folder removed when empty.
  - A change of `cacheDir` is still detected: the last cache directory is remembered where no cache move can lose it (the clone's git directory), not in a folder of the project tree.
  - The relocation runs at every start before the journal is read (the owner's rule: every layout change ships its migration): each file of `.delendai/` is moved to `<cacheDir>/records/`, a file already there wins, and `.delendai/` is removed once empty; a cache-dir move whose destination holds only `records/` still completes.
- shipped-in: `62f28f4907b4`
- review-state: in_review
- review-implementer: claude-opus-5-5

### S4 — A kept unit does not keep its dependencies while it waits

- **Status**: review
- **Files**:
  - `packages/core/src/lib/work-units/idle-unit-dependencies.service.ts`
  - `packages/core/src/lib/work-units/work-unit-reap.service.ts`
  - `packages/core/src/lib/work-units/work-unit-enter.service.ts`
  - `packages/core/src/lib/contracts/interfaces/unit-dependencies.interface.ts`
  - `packages/core/tests/src/lib/work-units/idle-unit-dependencies.service.spec.ts`
- **Gate**: type
- acceptance:
  - `work reap --apply` removes `node_modules` from every kept unit whose owner is not live (idle or abandoned past the lease window) and reports each under `dependencies`; without `--apply` it only reports. Entering an existing unit installs its dependencies again (x00888 S6), so its work is untouched.
- shipped-in: `0bffe320eaa4`
- review-state: in_review
- review-implementer: claude-opus-5-5

## acceptance

- A project's root has no `.delendai/` after a start; everything delendai keeps is under its cache directory.
- A start with an unknown plugin serves the whole surface lazily, and the summary says so.
- A start removes what the eviction rules say is no longer needed, and says what it removed.
