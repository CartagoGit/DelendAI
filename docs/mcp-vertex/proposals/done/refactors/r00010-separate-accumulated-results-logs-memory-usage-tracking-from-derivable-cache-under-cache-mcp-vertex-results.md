---
id: r00010
title: "separate accumulated results (logs, memory, usage-tracking) from derivable cache under .cache/mcp-vertex/results/"
kind: refactor
status: done
type: proposal
track: core
date: 2026-07-16
---

# r00010 — separate accumulated results (logs, memory, usage-tracking) from derivable cache under .cache/mcp-vertex/results/

## Goal

User-flagged 2026-07-17: `.cache/mcp-vertex/` mixes two genuinely different things under one "cache" label. Inventoried every subdir on disk: 8 of 11 (bootstrap, drift, rules, proposals/index.json, verify, state, <plugin>/exec/, .worktrees/) are legitimately derivable/regenerable — safe to delete, matching the XDG Base Directory Specification's $XDG_CACHE_HOME. Exactly 3 (logs, memory, usage-tracking) are NOT — they accumulate real, non-regenerable records: the operational event log, the agent's memory store, and accrued spend/usage history. Deleting those is not "clearing a cache," it's losing information — closer to $XDG_STATE_HOME.

Chose the lowest-blast-radius fix (confirmed with the user over 3 options): nest the three record-keeping plugins under a `results/` sub-namespace INSIDE the same single already-.gitignore'd `.cache/` root, rather than introducing a whole new top-level ignored directory + config schema field. Added a declarative `cacheNamespace?: 'results'` field to the `IMcpPlugin` contract; `assemble.ts`'s `buildContext` nests `pluginCacheDir` under `<cacheDir>/results/<name>` when a plugin opts in, `<cacheDir>/<name>` unchanged otherwise (zero behavior change for the other ~20 plugins). Set it on `logs`, `memory`, `usage-tracking`. Migrated the actual on-disk directories. Updated `check-stray-cache-files.script.ts`'s sanctioned layout (its own architecture-doc comment + allowlists) and every piece of user-facing documentation that named the old paths (both plugin READMEs, `docs/mcp-vertex/LOGS.md`, the `logs` plugin's own runtime knowledge-entry text, and all 12 language translations of the memory plugin's tutorial). Verified live end-to-end with a freshly-spawned server: `status`/`overview` boot clean, a real `server-started` log line landed in `results/logs/`, `memory save`/`list`/`forget` round-tripped through `results/memory/`, and `usage-tracking report` (once its plugin is loaded) read `results/usage-tracking/`.

## why

User directive, verbatim: "hicimos lo de la carpeta .cache justamente para cosas que sean cacheables, pero si crees que esos archivos son de resultados, lo mismo deberiamos poner otra carpeta... y que todos esos archivos ahi, inclusive los de logs, porque no son cache". Confirmed via AskUserQuestion which of three concrete options to take before touching anything.

## non-goals

- No new top-level .gitignore entry or mcp-vertex.config.json schema field — explicitly the option NOT chosen; results/ lives inside the existing single .cache/ ignore.
- No change to the other ~20 plugins' cache layout — cacheNamespace is opt-in per plugin, default behavior (<cacheDir>/<name>) is unchanged.
- No retroactive migration tooling for existing adopters' on-disk .cache/mcp-vertex/{logs,memory,usage-tracking} — those directories are gitignored/local-only by definition (every adopter's own machine), and the plugins simply start writing to the new nested path on next boot; this repo's own local data was moved manually as part of this change.

## Slices

- global_gate: e2e

### S1 — cacheNamespace opt-in + migrate logs/memory/usage-tracking + docs + gate
- **Status**: done
- **Files**: `packages/core/src/lib/plugins/plugin-contract.ts`, `packages/core/src/lib/plugins/load-plugins.ts`, `packages/core/src/lib/cli/assemble.ts`, `packages/core/tests/src/lib/plugins/load-plugins.spec.ts`, `plugins/logs/src/index.ts`, `plugins/logs/README.md`, `plugins/memory/src/index.ts`, `plugins/memory/README.md`, `plugins/memory/tutorials/*/saving-and-recalling.md`, `plugins/usage-tracking/src/index.ts`, `docs/mcp-vertex/LOGS.md`, `tools/scripts/lint/check-stray-cache-files.script.ts`, `tools/scripts/lint/check-stray-cache-files.script.spec.ts`
- **Gate**: e2e
- acceptance:
  - "IMcpPlugin gains an optional cacheNamespace: 'results' field; assemble.ts's buildContext nests pluginCacheDir under <cacheDir>/<namespace>/<name> only when a plugin declares it, unchanged for every other plugin; load-plugins.ts threads plugin.cacheNamespace through."
  - "logs, memory and usage-tracking declare cacheNamespace: 'results'; their on-disk directories physically migrated from <cacheDir>/<name> to <cacheDir>/results/<name>."
  - "check-stray-cache-files.script.ts's SANCTIONED_TOP_LEVEL/SANCTIONED_SUBPATH_PREFIXES and its own architecture-doc comment updated to the new layout; its spec updated + a new case added."
  - "New regression spec (load-plugins.spec.ts) locks in that a plugin-declared cacheNamespace nests pluginCacheDir; typecheck clean."
  - "Every user-facing doc naming the old paths corrected: both plugin READMEs, docs/mcp-vertex/LOGS.md, the logs plugin's own runtime knowledge text, all 12 language memory tutorials."
  - "Verified live against a freshly-spawned server: a real server-started event landed in results/logs/; memory save/list/forget round-tripped through results/memory/; usage-tracking report (plugin explicitly loaded) read results/usage-tracking/. Full bun run test: 548/548 files, 4588/4588 tests green; bun run typecheck clean."

## acceptance

- IMcpPlugin gains an optional cacheNamespace: 'results' field; assemble.ts's buildContext nests pluginCacheDir under <cacheDir>/<namespace>/<name> only when a plugin declares it, unchanged for every other plugin; load-plugins.ts threads plugin.cacheNamespace through.
- logs, memory and usage-tracking declare cacheNamespace: 'results'; their on-disk directories physically migrated from <cacheDir>/<name> to <cacheDir>/results/<name>.
- check-stray-cache-files.script.ts's SANCTIONED_TOP_LEVEL/SANCTIONED_SUBPATH_PREFIXES and its own architecture-doc comment updated to the new layout; its spec updated + a new case added.
- New regression spec (load-plugins.spec.ts) locks in that a plugin-declared cacheNamespace nests pluginCacheDir; typecheck clean.
- Every user-facing doc naming the old paths corrected: both plugin READMEs, docs/mcp-vertex/LOGS.md, the logs plugin's own runtime knowledge text, all 12 language memory tutorials.
- Verified live against a freshly-spawned server: a real server-started event landed in results/logs/; memory save/list/forget round-tripped through results/memory/; usage-tracking report (plugin explicitly loaded) read results/usage-tracking/. Full bun run test: 548/548 files, 4588/4588 tests green; bun run typecheck clean.
