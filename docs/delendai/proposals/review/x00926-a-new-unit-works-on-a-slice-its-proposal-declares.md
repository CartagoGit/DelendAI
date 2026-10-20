---
id: x00926
title: "A new unit works on a slice its proposal declares"
kind: fix
status: review
type: proposal
track: general
date: 2026-10-20
related:
  - f00772
  - a00095
last-transition-id: efa31974-45bc-452a-853e-470aa2b7df76
last-correlation-id: efa31974-45bc-452a-853e-470aa2b7df76
last-transition-from: in-progress
last-transition-at: 2026-10-20T22:09:14.936Z
---

# x00926 — A new unit works on a slice its proposal declares

## goal

`work enter` refuses a new unit on a slice the proposal does not declare, and names the slices it does. Slices already worked on are left alone, and so are slices declared in a unit that has not landed. `all` and the review batch are unaffected.

## why

a00095 C3, recorded 2026-10-20. a00095 declares the slices S1, S2, S10 and S11, yet its reviewers entered units in S3–S9 and S12–S16. One unit was published as `pr/minimax-m3/audit/a00095-S11S12S13S14-g1` (commit `7994f0c87`), merging four invented slices into one name.

`work enter` took any `--slice`. A claim is held per slice, so an invented slice collides with no one, and inventing one was the easy way past every other reviewer's claim. The proposal ended up listing none of the work done under those slices. The reviewer slots and denominators then had nothing to anchor to (a00095 C2).

## non-goals

- Refusing re-entry into existing units. The swarm working now keeps its units.
- How an audit distributes work. That is assignments in f00772 S1, not slices.

## slices

- global_gate: type

### S1 — Refuse an undeclared slice for a new unit

- **Status**: review
- **Files**: `packages/core/src/lib/work-units/declared-slice.service.ts`, `packages/core/src/lib/work-units/work-unit-enter.service.ts`, `packages/core/src/lib/work-units/work-unit-generation.service.ts`, `packages/core/tests/src/lib/work-units/declared-slice.service.spec.ts`, `packages/core/tests/src/lib/work-units/reviewed-proposal.service.spec.ts`
- **Gate**: type
- acceptance:
  - "`declaredSlices` reads a proposal's `### S<n>` headings at a ref."
  - "`undeclaredSlice` refuses (exit 4) a slice the proposal declares neither on the integration branch nor at the tip of any of its units, naming the declared ones and `--slice=all`."
  - "It lets through a slice some unit already has, a proposal with no file or no slices, `all`, and the review batch."
  - "The reviewed-proposal spec's 'slice only an unlanded unit has' case now creates that unlanded unit instead of assuming it."
- shipped-in: `809a5d441b5d`
- review-state: in_review
- review-implementer: claude-opus-5-5

## acceptance

- The S1 specs pass, and the core and CLI suites stay green (5,638 tests on 2026-10-20).
