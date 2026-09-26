---
id: x00657
title: "A CI checkout is not the shared checkout"
kind: fix
status: in-progress
type: proposal
track: trust
date: 2026-09-26
priority: P0
related: [x00653, x00649]
---

# x00657 — A CI checkout is not the shared checkout

## goal

The integration branch's certification is green again, and the guard
from x00653 keeps refusing writes into the shared checkout agents use.

## why

x00653 (#465) refuses a `caller-checkout` tool whose root is the shared
checkout sitting on the integration branch. On a push to `develop`, CI
checks `develop` out by name, so `verify-runtime` ran on the
integration branch. Its own calls of `fs_write` and `scaffold` were
refused, their error failed the tools' output schema, and every
certification of `develop` after #465 was red (ce61b70d4 → 16cbb78b3).
A pull request's CI checks out a detached merge ref, which is why #465's
own checks were green.

Reproduced 2026-09-26 in a clone on a branch named `develop`, with this
change: `bun run verify:tools` reports `fs_write` and `scaffold`
`✗ failed` without `CI`, and `✓ ok` with `CI=true`.

## why this design

A CI job's checkout is a throwaway copy nobody shares. Nothing written
there is anybody's uncommitted work, which is the only thing the guard
protects. So `integrationCheckoutRefusal` stands down when `CI=true`,
the variable CI providers set. The environment is injectable, so the
rule is specified without one.

`CI=true` alone is a weak signal, as an external audit (2026-09-26)
pointed out. Agent runtimes export it to switch off interactive prompts,
and an agent driving the shared checkout with it set would write there
unrefused, which is the failure x00653 exists to stop. So the guard
stands down only when no agent marker is set as well. Core keeps those
markers in one list, `AGENT_ENVIRONMENT_MARKERS`: the declared agent id,
`AI_AGENT` and `CLAUDECODE`. A process an agent drives is never the
throwaway copy. CI providers are not listed: a provider's variable is
as easy to export, and a list would limit a project on any other
provider.

## non-goals

- Changing where the guard applies outside CI.

## Slices

- global_gate: none

### S1 — The guard stands down in a CI job's checkout

- **Status**: review
- **Gate**: `npx vitest run packages/core/tests/src/lib/development-policy/project-branches.spec.ts packages/core/tests/src/lib/shared/bind-write-root.spec.ts`
- **Files**:
  - `packages/core/src/lib/development-policy/project-branches.ts`
  - `packages/core/tests/src/lib/development-policy/project-branches.spec.ts`

## dependency graph

None.

## acceptance

- With `CI=true` the shared checkout on the integration branch is not
  refused; without it, it still is.
- With `CI=true` and an agent marker (`AI_AGENT`, `CLAUDECODE` or the
  declared agent id) it is still refused.
- `verify:tools` on a clone sitting on `develop` passes `fs_write` and
  `scaffold` with `CI=true`.

## notes

**Finding recorded for x00649.**
While `develop` was red, the queue's repair path armed and merged #466,
#467 and #468. Each had a green full run on its own branch, which
x00649 takes as proof that landing it makes `develop` green. That proof
holds for checks that depend only on the tree. This failure depended on
the branch the checkout is on, so a full run on a candidate's branch
could not see it. Checks that depend on the branch name are outside what
x00649 can prove. This change removes the one such check; the limit
itself is recorded here.
