---
id: x00658
title: "A checkpoint whose content is integrated is not lost"
kind: fix
status: review
type: proposal
track: trust
date: 2026-09-26
priority: P0
related: [x00551]
last-transition-id: 74e97980-b14a-4ed9-85a8-279999bcbd76
last-correlation-id: 74e97980-b14a-4ed9-85a8-279999bcbd76
last-transition-from: in-progress
---

# x00658 — A checkpoint whose content is integrated is not lost

## goal

A work ref that vanished after its content reached the integration
branch does not block every boot as possible lost work.

## why

On 2026-09-26 the host booted `DEGRADED` with nine
`integration-evidence.ref-vanished` blockers and "Mutations blocked:
true". They were nine `codex-batuta-orchestrator` work refs (a00024,
a00025, a00028 S2–S5, f00037, f00048, f00052), all gone. Their
checkpoints still exist and are not ancestors of `develop`. Every one of
them is an **empty commit**: its tree equals its parent's
(`bce54340b`), and that parent is in `develop`. The commits carried
nothing, and nothing was lost. The only evidence the phase accepted was
ancestry, so an empty checkpoint, or work that reached the integration
branch by a squash or a rewritten branch, read as a vanished ref "NOT
contained".

## why this design

Ancestry is one kind of evidence, not the definition. The phase now also
accepts **content**: every path the checkpoint changed since it forked
from the integration branch holds identical content there (one
`git diff --quiet <checkpoint> <integration> -- <paths>`).

- An empty checkpoint changes no path, so it is contained.
- The check is strict. A path the integration branch changed again after
  the squash differs, and the ref stays a blocker.

The seam method is optional, so a seam without it proves containment by
ancestry alone, as before.

## non-goals

- Why nine empty "commit via slice" checkpoints were created. That is a
  separate defect; this makes them harmless when they vanish.
- Resolving the nine repair tasks by hand. With this change they are
  recorded as integrated on the next boot.

## architecture

- `packages/core/src/lib/startup-reconciler/seams.interface.ts`:
  optional `contentContained`.
- `packages/core/src/lib/startup-reconciler/git-seam.ts`: its
  implementation.
- `packages/core/src/lib/startup-reconciler/phases/integration-evidence.ts`:
  ancestry, then content.

## Slices

- global_gate: none

### S1 — Identical content is evidence of integration

- **Status**: review
- **Gate**: `npx vitest run packages/core/tests/src/lib/startup-reconciler`
- **Files**:
  - `packages/core/src/lib/startup-reconciler/seams.interface.ts`
  - `packages/core/src/lib/startup-reconciler/git-seam.ts`
  - `packages/core/src/lib/startup-reconciler/phases/integration-evidence.ts`
  - `packages/core/tests/src/lib/startup-reconciler/integration-evidence.spec.ts`
- review-state: in_review
- review-implementer: claude-opus-5-5
## dependency graph

None.

## acceptance

- A vanished ref whose content reached the integration branch by a squash
  is recorded as integrated, and the boot is `READY`.
- The same ref, after the integration branch changed that path again,
  still degrades the boot.
- An empty checkpoint that is not an ancestor is recorded as integrated.
- The nine real checkpoints read `content: true` through the seam against
  `origin/develop` (measured 2026-09-26).
