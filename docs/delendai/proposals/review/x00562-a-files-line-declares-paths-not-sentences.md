---
id: x00562
title: "A Files line declares paths, not sentences"
kind: fix
status: review
type: proposal
track: trust
date: 2026-09-20
tags:
    - proposals
    - wip-engine
    - checkpoints
---

# x00562 — A Files line declares paths, not sentences

## goal

Every automatic checkpoint that a slice's declared scope should allow,
happens. A `Files:` line written by a person is read as the paths it
names, and a glob it legitimately declares is resolved rather than
refused.

## why

Taken from a live MCP server's log, over one session on 2026-09-20.
**Every** automatic slice checkpoint failed, and no work ref moved:

```
WIP_CHECKPOINT_FAILED: unclaimable paths:
  getOverviewModel(): Promise<IDashboardOverview> (path contains pathspec magic or control characters),
  getAllModels(): Promise<IDashboardAllModels>` (single call returning all 8 models…) (…),
  docs/proposals/ready/** (path contains pathspec magic or control characters),
  plugins/conventions/src/lib/tools/*.tool.ts (path contains pathspec magic or control characters)
```

Two separate defects produce that list, and both are upstream of the
validator — which is doing exactly its job.

**Prose is read as a path.** `expandDeclaredFiles` takes every
backtick-delimited span in a `Files:` line. A person writes:

```
- **Files**: `packages/cli/package.json` (NEW; `private: true`;
  `bin: { "delendai": "./dist/index.js" }`)
```

so `private: true` became a claimed path, and one unclaimable entry
fails the WHOLE scope — nothing is written and the work ref does not
move.

**A legitimate glob is refused.** A slice declares
`plugins/conventions/tests/**`. That is pathspec MAGIC, and a scope
engine whose promise is "only these paths" is right never to hand magic
to git — but refusing it outright means such a slice can never be
checkpointed at all.

The cost is not the failed call. It is that a session of work produced
no durable checkpoint, while the log said the same thing forty times and
everything looked busy.

## non-goals

- **No looser validator.** `validateScopePaths` keeps rejecting magic,
  absolute paths, traversal and `.git`. Everything this proposal
  produces is validated by it, unchanged.
- **No filesystem in the parser.** `expandDeclaredFiles` stays pure: a
  proposal declares files that do not exist yet, and that is normal.

## slices

### S1 — The parser keeps the paths and drops the commentary

- **Status**: done — a backticked span is kept only when it looks like a
  path: a separator or a file extension, and none of the punctuation
  prose carries (spaces, quotes, brackets, colons). Every string in the
  spec is copied from the live log.
- **Files**: `plugins/proposals/src/lib/proposals/expand-declared-files.ts`,
  `plugins/proposals/tests/src/lib/proposals/expand-declared-files-prose.spec.ts`
- **Gate**: `npx vitest run plugins/proposals/tests/src/lib/proposals/expand-declared-files-prose.spec.ts`

### S2 — A declared glob is resolved, not refused

- **Status**: done — the checkpoint expands `*`/`**` against the working
  tree into concrete relative paths BEFORE validation, so the engine
  still never hands magic to git and a slice that declares `dir/**` can
  finally be checkpointed. A glob that resolves to nothing still fails,
  rather than quietly claiming everything.
- **Files**: `packages/core/src/lib/wip-engine/scope.ts`,
  `packages/core/src/lib/wip-engine/checkpoint.ts`,
  `packages/core/tests/src/lib/wip-engine/checkpoint.spec.ts`
- **Gate**: `npx vitest run packages/core/tests/src/lib/wip-engine/checkpoint.spec.ts`

## acceptance

- A `Files:` line carrying annotations in backticks yields only the
  paths, and the slice checkpoints.
- A slice declaring `dir/**` checkpoints exactly the files under `dir`,
  and nothing else in the tree is captured.
- A glob that matches nothing fails the checkpoint with "no paths
  claimed", never with a silent success.
