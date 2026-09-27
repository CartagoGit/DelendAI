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
last-transition-id: a10a6d04-435d-4dd8-99e7-33f5003a9a0d
last-correlation-id: a10a6d04-435d-4dd8-99e7-33f5003a9a0d
last-transition-from: review
shipped-in: ["6fbba5f1f"]
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

- **Status**: review
- **Gate**: `npx vitest run packages/cli/src/commands/repair.command.spec.ts`
- **Files**:
  - `packages/cli/src/commands/repair.command.ts`
  - `packages/cli/src/commands/repair.command.spec.ts`
- review-state: in_review
- review-implementer: claude-opus-5-5
## dependency graph

None.

## acceptance

- In a pinned shared checkout, `repair resolve` is refused, names
  `work enter --kind=repair`, and writes nothing.
- In a linked worktree of the same repository it records the decision.
