---
id: x00723
title: "Only the main checkout installs the hooks"
kind: fix
status: review
type: proposal
track: trust
date: 2026-09-28
priority: P1
related: [x00551]
last-transition-id: d504cc60-3fc8-4cff-a5ee-4293f8c209dc
last-correlation-id: d504cc60-3fc8-4cff-a5ee-4293f8c209dc
last-transition-from: in-progress
---

# x00723 — Only the main checkout installs the hooks

## goal

The git hooks every worktree of the clone shares are installed by
`prepare`, in the main checkout, and by nothing else.

## why

`prepare` already refuses to set anything up from a linked worktree (#382).
The hooks were rewritten anyway: on 2026-09-28, at 02:21, `.git/hooks/*`
started naming the lefthook binary inside a reviewer's worktree
(`.cache/delendai/.worktrees/minimax-m3-batch-all/node_modules/...`). lefthook
reinstalls the hooks by itself whenever a hook runs from a checkout whose
`lefthook.yml` differs from the one the hooks were installed from, and it
writes that checkout's binary path. Every commit in the clone then ran its
hooks from an agent's worktree, and removing that worktree would have left
them to lefthook's fallbacks.

## why this design

- `no_auto_install: true` in `lefthook.yml` turns that reinstall off. The
  hooks change only when `prepare` runs in the main checkout.
- A spec pins it, next to the one that pins `prepare`'s own steps.

## non-goals

- Reinstalling this clone's hooks; the owner's next `bun install` in the main
  checkout does it.

## architecture

- `lefthook.yml`, `tools/scripts/git/prepare-clone.script.spec.ts`.

## Slices

- global_gate: none

### S1 — lefthook installs nothing by itself

- **Status**: review
- **Gate**: `npx vitest run tools/scripts/git/prepare-clone.script.spec.ts`
- **Files**:
  - `lefthook.yml`
  - `tools/scripts/git/prepare-clone.script.spec.ts`

## dependency graph

None.

## acceptance

- A commit from a worktree whose `lefthook.yml` differs leaves
  `.git/hooks/*` as they were.
