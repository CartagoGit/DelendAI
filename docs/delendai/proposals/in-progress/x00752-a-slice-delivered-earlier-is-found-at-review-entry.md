---
id: x00752
title: "A slice delivered earlier is found at review entry"
kind: fix
status: in-progress
type: proposal
track: hosts
date: 2026-09-29
priority: P1
related: [x00745, x00747]
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
  branch's first-parent line. Its delivery is the merge whose subject names
  the slice's publication (`…/<id>-<slice>-g<n>/…`), or the whole
  proposal's (`<id>-all-g<n>`), and whose change (`M^1..M`) touches the
  slice's declared files. That merge is recorded as `shipped-in`, the
  delivery review attribution already accepts (x00744).
- A merge that names the slice but changed none of its files is not taken:
  the slice is refused as before.

## non-goals

None.

## architecture

- `plugins/proposals/src/lib/services/review-entry.service.ts`.

## Slices

- global_gate: none

### S1 — The merge that landed a slice is its delivery

- **Status**: in-progress
- **Gate**: `npx vitest run plugins/proposals/tests/src/lib/services/review-entry.service.spec.ts`
- **Files**:
  - `plugins/proposals/src/lib/services/review-entry.service.ts`
  - `plugins/proposals/tests/src/lib/services/review-entry.service.spec.ts`

## dependency graph

None.

## acceptance

- A slice delivered by an earlier merged publication of its unit, or of
  its whole proposal, is recorded with that merge.
- A merge that names the slice and changed none of its files leaves the
  slice refused.
