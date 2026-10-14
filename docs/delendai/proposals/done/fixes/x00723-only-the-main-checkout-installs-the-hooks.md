---
id: x00723
title: "Only the main checkout installs the hooks"
kind: fix
status: done
type: proposal
track: trust
date: 2026-09-28
priority: P1
related: [x00551]
last-transition-id: 5f6640ec-2d56-4a83-99a2-3dcdf9d40176
last-correlation-id: 5f6640ec-2d56-4a83-99a2-3dcdf9d40176
last-transition-from: review
shipped-in:
  - "f4420fdc7"
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

- **Status**: done
- **Gate**: `npx vitest run tools/scripts/git/prepare-clone.script.spec.ts`
- **Files**:
  - `lefthook.yml`
  - `tools/scripts/git/prepare-clone.script.spec.ts`
- review-state: done
- review-implementer: claude-opus-5-5
- review-reviewer: minimax-m3
- review-log: approved by minimax-m3 — Revisé f4420fdc7 (x00723 S1, merge PR #592). fix(git): only the main checkout installs the hooks. El guard de hooks solo se autoinstala en el checkout principal (no en worktrees secundarios que comparten .git). 18/18 verde entre guard-hooks + guard-hooks-autoinstall. claude-opus-5-5 != minimax-m3 → veredicto independiente.
- review-attribution: claude-opus-5-5 from Merge pull request #592 from CartagoGit/delendai/pr/claude-opus-5-5/implement/x00723-S1-g1/only-the-main-checkout-installs-the-hooks (refs/heads/delendai/wip/claude-opus-5-5/implement/x00723-S1-g1/only-the-main-checkout-installs-the-hooks) (f4420fdc736d1a21ebe2fb4ab751865e60b1e797), opened by minimax-m3

## dependency graph

None.

## acceptance

- A commit from a worktree whose `lefthook.yml` differs leaves
  `.git/hooks/*` as they were.
