---
id: x00752
title: "A slice delivered earlier is found at review entry"
kind: fix
status: review
type: proposal
track: hosts
date: 2026-09-29
priority: P1
related: [x00745, x00747]
last-transition-id: 3ba41f3e-6ac9-476a-9e5b-47138821fc1e
last-correlation-id: 3ba41f3e-6ac9-476a-9e5b-47138821fc1e
last-transition-from: in-progress
---

# x00752 — A slice delivered earlier is found at review entry

## goal

A proposal delivered over several pull requests enters review without a
person recording where each earlier slice landed.

## why

On 2026-09-29 f00645 could not enter review. Its five slices were
delivered by five pull requests (#521 for S1 with the whole proposal, #625,
#633, #643 and the last one). The entry check (x00745) looked for each
slice's delivering commit only on the branch being handed over, which
holds the last slice alone. S1, S2 and S5 were refused as "undelivered"
although their merges were in `develop`, and the only way forward was to
write three `shipped-in` lines by hand. Every proposal delivered slice by
slice would stop at the same step.

## why this design

- A slice with no commit on the branch is looked up on the integration
  branch's first-parent line. Its delivery is the merge whose message names
  the slice's unit, or the whole proposal's, and whose change (`M^1..M`)
  touches the slice's declared files. That merge is recorded as
  `shipped-in`, the delivery review attribution already accepts (x00744).
- The unit a merge names is decoded with the project's own ref template,
  through the integration history the review queue already reads
  (`readIntegrationHistory`, `findWorkRefMention`); nothing restates the
  shape. `projectBranches` now also returns the template and publication
  prefix, so the tool and the CLI script get the shape from one place.
- A merge that names the slice but changed none of its files is not taken:
  the slice is refused as before.

## non-goals

None.

## architecture

- `plugins/proposals/src/lib/services/review-entry.service.ts`,
  `delivery-history.service.ts`; `proposal-transition.tool.ts` passes the
  shape; `packages/core/src/lib/development-policy/project-branches.ts`.

## Slices

- global_gate: none

### S1 — The merge that landed a slice is its delivery

- **Status**: review
- **Gate**: `npx vitest run plugins/proposals/tests/src/lib/services/review-entry.service.spec.ts`
- **Files**:
  - `plugins/proposals/src/lib/services/review-entry.service.ts`
  - `plugins/proposals/src/lib/services/delivery-history.service.ts`
  - `plugins/proposals/src/lib/contracts/interfaces/review-attribution.interface.ts`
  - `plugins/proposals/src/lib/tools/proposal-transition.tool.ts`
  - `packages/core/src/lib/development-policy/project-branches.ts`
  - `plugins/proposals/tests/src/lib/services/review-entry.service.spec.ts`
- shipped-in: `8a63df3be824`

## dependency graph

None.

## acceptance

- A slice delivered by an earlier merged publication of its unit, or of
  its whole proposal, is recorded with that merge.
- A merge that names the slice and changed none of its files leaves the
  slice refused.
