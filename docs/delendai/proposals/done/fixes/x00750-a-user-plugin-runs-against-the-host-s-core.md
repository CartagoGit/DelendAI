---
id: x00750
title: "A user plugin runs against the host's core"
kind: fix
status: done
type: proposal
track: hosts
date: 2026-09-29
priority: P1
related: [x00749]
last-transition-id: eda91fc3-647b-43fd-8608-a3ee6a566d93
last-correlation-id: eda91fc3-647b-43fd-8608-a3ee6a566d93
last-transition-from: review
shipped-in:
  - "465d3287e9df"
---

# x00750 — A user plugin runs against the host's core

## goal

A plugin a project keeps in its own tree loads when the project has no
`@delendai/*` package installed, and runs against the core that loads it.

## why

On 2026-09-29 a consumer project ran the server from a delendai checkout
with its own plugin declared as `plugins.<id>.path`. The plugin imports
`@delendai/core/public` for `definePlugin`. Resolved from the plugin's
file, that needs `@delendai/core` in the project's `node_modules`. The
packages are not published, and the project's `link:` entry pointed at a
path that does not exist. The optional dependency was skipped without a
word, and the plugin failed with "Cannot find package '@delendai/core'".

A copy installed in the project would still be a second core beside the
host's own. A plugin belongs to the host that loads it.

## why this design

- Under Bun, the files of a user plugin's package (up to its
  `package.json`) are loaded with their `@delendai/*` imports pointed at
  what the host itself resolves. Bun's runtime plugins cannot redirect a
  bare specifier in `onResolve`, measured on Bun 1.4.2, so the import is
  rewritten in `onLoad`, and only in import, re-export and require
  positions.
- The package's own dependencies (`node_modules`) and every other file
  load as written. A specifier the host cannot resolve stays as written.
- Under Node nothing changes: package resolution applies, as for a
  published install.

## non-goals

- Resolving any other package for a user plugin. Its own dependencies are
  the project's.

## architecture

- `packages/core/src/lib/plugins/host-packages.helper.ts` (new), called by
  `nodeDynamicImport` in `load-plugins.ts` for a path or `file:` specifier.

## Slices

- global_gate: none

### S1 — A user plugin's host imports resolve to the host

- **Status**: done
- **Gate**: `npx vitest run packages/core/tests/src/lib/plugins/host-packages.helper.spec.ts`
- **Files**:
  - `packages/core/src/lib/plugins/host-packages.helper.ts`
  - `packages/core/src/lib/plugins/load-plugins.ts`
  - `packages/core/tests/src/lib/plugins/host-packages.helper.spec.ts`
- shipped-in: `465d3287e9df`
- review-state: done
- review-implementer: claude-opus-5-5
- review-reviewer: qwen3-flash
- review-log: approved by qwen3-flash — Gate = vitest host-packages.helper.spec.ts on delivery commit 465d3287e9df. 6/6 tests green in unit worktree; the helper rewrites @delendai/* bare specifiers in import/re-export/require positions, leaves the plugin's own node_modules and unknown specifiers untouched. Consumer's plugin that used to fail 'Cannot find package @delendai/core' now resolves via the host (nodeDynamicImport path/file: branch in load-plugins.ts). Non-goals respected: no changes to other package resolution.
- review-attribution: claude-opus-5-5 from Merge pull request #638 from CartagoGit/delendai/pr/claude-opus-5-5/implement/x00750-all-g1/a-user-plugin-gets-the-host-core (refs/heads/delendai/wip/claude-opus-5-5/implement/x00750-all-g1/a-user-plugin-gets-the-host-core) (465d3287e9df4e7eb43767cf5ac91f0ecb3d0865), opened by qwen3-flash

## dependency graph

None.

## acceptance

- The consumer's plugin, which failed with "Cannot find package
  '@delendai/core'", loads through `nodeDynamicImport` and exposes its
  `register`.
- Every import form of a known `@delendai/*` specifier is rewritten, and
  unknown packages, other packages and plain strings are not.
- Files under the plugin's `node_modules` load unchanged.
