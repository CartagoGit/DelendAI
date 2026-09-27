---
id: x00567
title: "Ten exports nothing references"
kind: fix
status: review
type: proposal
track: trust
date: 2026-09-20
tags:
    - public-surface
    - budget
    - core
---

# x00567 — Ten exports nothing references

## goal

`develop` passes `lint:core-public-surface-budget` again, and it passes
because the surface got smaller, not because the budget got bigger.

## why

`develop` is red, and has been for several merges:

```
core-public-surface-budget: 1085 exports exceeds budget 1076 by 9.
```

A red integration branch is the worst kind of red. Every candidate
inherits it, so the signal that should mean *this change broke
something* means nothing, and agents learn to merge through a failure
they did not cause.

The budget exists to force a conscious trade, and its own history is a
record of those trades being made honestly: raised by one for
`announceLines`, by eight for the capability ontology, by 64 for the
workspace-migration consolidation, each with the reason written down.
Raising it a sixth time to clear a number nobody argued for would spend
that history for nothing. The precedent that actually fits is the other
one in the log — *stop publishing 22 exports nothing references*.

The ten `IStartupReport*` types are that case exactly. Every consumer in
this workspace — `packages/core/src/lib/cli/assemble.ts` and all three
startup-report specs — imports them from
`@delendai/core/lib/startup-report/model`, where they are declared. Not
one import in the repository reaches them through the public barrel. The
re-export was a second name for the same type, consumed by nobody, and it
cost ten of the budget it was being measured against.

## non-goals

- Raising the budget. The number is the point.
- Removing the *values* from `../lib/startup-report`
  (`buildStartupReport`, the renderers, the level helpers). Those are
  consumed through the barrel and stay.
- Moving or renaming the types themselves. They keep their declaration
  site and their subpath; only the duplicate publication goes.

## architecture

The `export type { ... } from '../lib/startup-report'` block leaves
`packages/core/src/public/index.ts`, replaced by a comment naming the
subpath that consumers already use, so the next reader does not re-add
it. The ten names are dropped from the `core-public-consumers` baseline
as well — a baseline listing exports that no longer exist is a baseline
drifting away from the thing it describes.

## slices

### S1 — the barrel stops publishing a second name for the same ten types

- **Status**: review
- **Files**: [`packages/core/src/public/index.ts`, `tools/scripts/lint/core-public-consumers.baseline.json`]
- **Gate**: `bun run lint:core-public-surface-budget`

## acceptance

- `lint:core-public-surface-budget` reports `1075/1076 within budget`,
  with the budget constant unchanged.
- `lint:core-public-consumers` passes, with the same advisory it reported
  before the change.
- `typecheck` reports no error at any consumer of the ten types.

## risks and mitigations

- **An adopter imported a type from the barrel.** The declaration site
  and its documented subpath are untouched, so the type is still
  reachable at `@delendai/core/lib/startup-report/model` — the same path
  every in-repo consumer already uses. Nothing is deleted, only
  un-duplicated.
