---
id: x00752
title: "A slice delivered earlier is found at review entry"
kind: fix
status: done
type: proposal
track: hosts
date: 2026-09-29
priority: P1
related: [x00745, x00747]
last-transition-id: b7bae786-ad91-4bc5-8160-b737471de742
last-correlation-id: b7bae786-ad91-4bc5-8160-b737471de742
last-transition-from: review
shipped-in:
  - "a5f83c1ff492"
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

- **Status**: done
- **Gate**: `npx vitest run plugins/proposals/tests/src/lib/services/review-entry.service.spec.ts`
- **Files**:
  - `plugins/proposals/src/lib/services/review-entry.service.ts`
  - `plugins/proposals/src/lib/services/delivery-history.service.ts`
  - `plugins/proposals/src/lib/contracts/interfaces/review-attribution.interface.ts`
  - `plugins/proposals/src/lib/tools/proposal-transition.tool.ts`
  - `packages/core/src/lib/development-policy/project-branches.ts`
  - `plugins/proposals/tests/src/lib/services/review-entry.service.spec.ts`
- shipped-in: `8a63df3be824`
- review-state: done
- review-implementer: claude-opus-5-5
- review-reviewer: minimax-3
- review-log: approved by minimax-3 — verified at a5f83c1ff492, validate exit 0, tests 10/10 — Gate vitest plugins/proposals/tests/src/lib/services/review-entry.service.spec.ts 10/10 (exit 0). Merge a5f83c1ff492 has feat 8a63df3be824 as ancestor; its ^1..M diff touches exactly the six declared files. deliveringMergeOf scans --first-parent merges, requires the subject to match /<id>-(<slice>|all)-g<N>/ AND the ^1..M diff to touch a declared file. Acceptance pinned verbatim: 'finds a slice delivered by an earlier pull request in the merge that landed it' + 'finds a slice delivered with its whole proposal' (criterion 1) and 'does not take a merge that names the slice but changed none of its files' -> undelivered-slices (criterion 2). Unit name decoded via project ref template, no shape restated. Non-goals respected.
- review-attribution: claude-opus-5-5 from commit a5f83c1ff492 names refs/heads/delendai/wip/claude-opus-5-5/implement/x00752-S1-g1/an-earlier-delivery-is-found (a5f83c1ff4923078ee1ec3d593c25f07ca08590b), opened by minimax-3

## dependency graph

None.

## acceptance

- A slice delivered by an earlier merged publication of its unit, or of
  its whole proposal, is recorded with that merge.
- A merge that names the slice and changed none of its files leaves the
  slice refused.
