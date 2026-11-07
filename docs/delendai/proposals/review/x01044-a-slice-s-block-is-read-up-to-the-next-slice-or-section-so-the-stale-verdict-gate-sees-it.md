---
id: x01044
title: "A slice's block is read up to the next slice or section, so the stale-verdict gate sees it"
kind: fix
status: review
type: proposal
track: a00095-consistency
date: 2026-11-07
last-transition-id: 79072a64-5ed5-47ed-a123-ba7d6510c098
last-correlation-id: 79072a64-5ed5-47ed-a123-ba7d6510c098
last-transition-from: in-progress
last-transition-at: 2026-11-07T15:36:27.470Z
---

# x01044 — A slice's block is read up to the next slice or section, so the stale-verdict gate sees it

## goal

The close gate that refuses a verdict about an earlier revision reads each slice's whole block, so it sees the approvals it checks.

## why

Found while delivering f00806 (S4): `sliceBlockOf` in `plugins/proposals/src/lib/tools/transition/delivery-evidence.tool.ts` sliced the text after the first `#` of the slice heading and searched it for the next heading, which matched the slice's own heading at position 0. Every slice block it returned was `"#"`. Its only caller, the stale-verdict check of `review -> done` in `peer-review-gate.tool.ts`, therefore never saw an approval and never refused a close on a superseded one.

## non-goals

- Changing what the stale-verdict check decides once it reads the block.

## slices

- global_gate: none

### S1 — One slice reader, ending at the next slice or section
- **Status**: review
- **Files**: `plugins/proposals/src/lib/swarm/proposal-stage.ts`, `plugins/proposals/src/lib/tools/transition/delivery-evidence.tool.ts`, `plugins/proposals/src/lib/tools/transition/peer-review-gate.tool.ts`, `plugins/proposals/tests/src/lib/swarm/proposal-stage.spec.ts`, `plugins/proposals/tests/src/lib/tools/transition/peer-review-gate.tool.spec.ts`, `plugins/proposals/tests/src/lib/tools/transition/delivery-evidence.tool.spec.ts`, `plugins/proposals/tests/src/lib/tools/transition/validate-evidence.tool.spec.ts`
- **Gate**: type
- acceptance:
  - "`sliceBlockById` returns a slice's block from its heading up to the next `### ` slice or `## ` section, in any case of its id, and `''` for a slice the document lacks; a spec reads a slice and the slice that follows it, and a last slice before `## acceptance`."
  - "With the block read whole, `review -> done` refuses a close on an approval a newer delivery superseded (spec with the delivery history faked); the gate's spec moves to its mirror path, and the delivery-evidence helpers get one."
  - "`sliceBlockOf` is removed; the stale-verdict gate reads blocks through `sliceBlockById`, the reader f00806's review-state derivation already uses, which now also stops at the next `## ` section."
- shipped-in: `1445cb73cbe5`
- review-state: in_review
- review-implementer: claude-opus-5-5

## acceptance

- A slice's block is read whole, up to the next slice or section, by one reader shared by the review-state derivation and the stale-verdict gate.
