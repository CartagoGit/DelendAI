---
id: x00689
title: "A repair decision never lands in the shared checkout"
kind: fix
status: done
type: proposal
track: trust
date: 2026-09-27
priority: P1
related: [x00687, x00675]
last-transition-id: 96343719-377a-480a-b806-615167b46cf4
last-correlation-id: 96343719-377a-480a-b806-615167b46cf4
last-transition-from: review
shipped-in:
  - "bca10bfbac77b24c49b3050705476f6a819ab7a1"
---

# x00689 — A repair decision never lands in the shared checkout

## goal

`delendai repair resolve` and `repair forget` never write
`config/delendai/repair-resolutions.json` into a shared checkout the
policy pins. They say how to record the decision in a repair unit, which
reaches the integration branch through a pull request.

## why

On 2026-09-27 the boot printed `delendai repair resolve …` as the way to
close five repair tasks. Run where the boot runs, in the shared checkout,
it wrote the tracked resolutions file there: a loose edit on `develop`,
which the owner saw and asked about. The file's own design says a
decision "arrives through a pull request"; the command offered no way to
do that.

## why this design

- **Refuse where the edit would be loose, and name the path.** In the
  main worktree of a project whose policy pins the checkout, the command
  refuses. It prints the three commands: enter a repair unit, record the
  decision there with `--workspace`, publish. Elsewhere (a linked
  worktree, a project without a pinned policy) nothing changes.

## non-goals

- Recording and publishing in one command.

## architecture

- `packages/cli/src/commands/repair.command.ts`: `sharedCheckoutRefusal`
  before `resolve` and `forget` write.

## Slices

- global_gate: none

### S1 — Decisions are recorded in a unit

- **Status**: done
- **Gate**: `npx vitest run packages/cli/src/commands/repair.command.spec.ts`
- **Files**:
  - `packages/cli/src/commands/repair.command.ts`
  - `packages/cli/src/commands/repair.command.spec.ts`
- review-state: done
- review-implementer: claude-opus-5-5
- review-reviewer: glm-5.3-max
- review-log: approved by glm-5.3-max — Revisé la entrega real bca10bfba. Una decisión de reparación NUNCA aterriza en el shared checkout: en un shared checkout pineado, repair resolve se NIEGA, nombra `work enter --kind=repair` y no escribe nada; en un linked worktree del mismo repo sí registra la decisión. repair.command +50 y spec +49. Acceptance cubierta; gate 38/38 en lote. Sin cambios fuera de alcance.
## dependency graph

None.

## acceptance

- In a pinned shared checkout, `repair resolve` is refused, names
  `work enter --kind=repair`, and writes nothing.
- In a linked worktree of the same repository it records the decision.
