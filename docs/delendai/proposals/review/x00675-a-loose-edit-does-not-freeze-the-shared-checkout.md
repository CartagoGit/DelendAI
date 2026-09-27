---
id: x00675
title: "A loose edit does not freeze the shared checkout"
kind: fix
status: review
type: proposal
track: trust
date: 2026-09-27
priority: P0
related: [x00558, x00669]
last-transition-id: cb9e384e-0857-47cd-a487-214ee1dd486e
last-correlation-id: cb9e384e-0857-47cd-a487-214ee1dd486e
last-transition-from: in-progress
shipped-in:
  - "3d45dcddee0b63f597a2565ed52b05cc4bf5fe97"
---

# x00675 — A loose edit does not freeze the shared checkout

## goal

The shared checkout is brought level with its remote even while it
carries uncommitted edits, as long as the advance changes none of the
edited paths. It is left alone, with the colliding paths named, only
when the advance would change a file that somebody is editing.

## why

On 2026-09-27 the shared checkout was 20 commits behind `origin/develop`.
Every agent running the CLI there ran tools that old: without f00644's
naming, without its guard, without review batches. Branches came out
misnamed and the maintainer saw work that could not complete. The
cause: one uncommitted three-line edit to
`packages/cli/src/commands/groups/proposals.ts`. The startup phase and
the periodic hydration both refused to fast-forward any tree with any
uncommitted edit, so a single stray edit froze the checkout for
everyone, indefinitely. None of the 20 incoming commits touched that
file.

## why this design

- **What the refusal protected is kept.** The refusal existed so an
  uncommitted edit is never lost or rewritten under an absent author.
  `git merge --ff-only` keeps every edit to a path it does not change,
  byte for byte, and refuses when it would change one. So the phase
  advances when no edited path is among the paths the advance changes.
- **The colliding case still waits.** When the advance would change an
  edited path, the tree is left exactly as found, and the note names
  the paths that collide. When the changed paths cannot be established,
  nothing moves (x00558: never advance on an unchecked precondition).
- The loose edits themselves are still announced on every tool result
  (x00669).

## non-goals

- Moving, committing or discarding anybody's uncommitted edit.

## architecture

- `packages/core/src/lib/startup-reconciler/seams.interface.ts`,
  `git-seam.ts`: `pathsChangedBetween`.
- `packages/core/src/lib/startup-reconciler/phases/verify-checkout.ts`:
  hydrate past non-overlapping edits.

## Slices

- global_gate: none

### S1 — Advance past edits the advance does not touch

- **Status**: done
- **Gate**: `npx vitest run packages/core/tests/src/lib/startup-reconciler/checkout-freshness.spec.ts packages/core/tests/src/lib/startup-reconciler/hydration-watch.spec.ts`
- **Files**:
  - `packages/core/src/lib/startup-reconciler/seams.interface.ts`
  - `packages/core/src/lib/startup-reconciler/git-seam.ts`
  - `packages/core/src/lib/startup-reconciler/phases/verify-checkout.ts`
  - `packages/core/src/lib/startup-reconciler/phases/checkout-overlap.ts`
  - `packages/core/tests/src/lib/startup-reconciler/checkout-freshness.spec.ts`
  - `packages/core/tests/src/lib/startup-reconciler/hydration-watch.spec.ts`
- review-state: done
- review-implementer: claude-opus-5-5
- review-reviewer: glm-5.3-max
- review-log: approved by glm-5.3-max — Revisé la entrega real 3d45dcdde. Un loose edit no congela el shared checkout: un checkout detrás de su remoto con una edición SIN commitear en un path que el avance NO cambia se avanza igual y la edición queda intacta; si el avance cambia ese path, el checkout se hidrata en su lugar sin perder el edit (checkout-overlap + verify-checkout en el startup-reconciler, git-seam +13). checkout-freshness.spec +48, hydration-watch.spec +25. Acceptance cubierta; gate 82/82 en lote. Sin cambios fuera de alcance.
## dependency graph

None.

## acceptance

- A checkout behind its remote, with an uncommitted edit to a path the
  advance does not change, is advanced, and the edit is unchanged.
- With an edit to a path the advance changes, it is left exactly as
  found, and the note names that path.
