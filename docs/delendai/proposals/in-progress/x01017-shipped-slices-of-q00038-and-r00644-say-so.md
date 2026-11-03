---
id: x01017
title: "Shipped slices of q00038 and r00644 say so"
kind: fix
status: in-progress
type: proposal
track: a00095-consistency
date: 2026-11-03
last-transition-id: 87f7d07d-bbd3-48e1-9625-89640d83fa18
last-correlation-id: 87f7d07d-bbd3-48e1-9625-89640d83fa18
last-transition-from: ready
last-transition-at: 2026-11-03T18:45:44.596Z
---

# x01017 — Shipped slices of q00038 and r00644 say so

## goal

The slices of q00038 and r00644 that already landed are recorded as done with the commit that shipped them, so proposal-already-implemented passes on develop and every proof can pass again.

## why

On 2026-11-03, `lint:job:governance` failed on develop itself, at 02efae3ec. `proposal-already-implemented` found that q00038 S4 and r00644 S5 name files git already tracks, while both slices are still pending. Every `work prove` runs that job, so no unit could be proved. x01011, the repair for develop's red compute-slot spec, was refused, and the whole queue stopped.

The slices did land:

| Proposal | Slice | Commit |
|---|---|---|
| q00038 | S1 | 07672aeb0 |
| q00038 | S4 | 81bb8408a, ec67a86ad |
| q00038 | S5 and S6 | cbedb634b |
| q00038 | S7 | aea829e83 |
| r00644 | S5 | c79af46f5 |

None of them was recorded, because q00038 is moving to blocked (its S2 and S3 wait on the owner) rather than to review, and review is the step that records `shipped-in`. Both files are fixed in one unit: separately, each proof would still fail on the other.

## non-goals

- Closing or moving q00038 or r00644: their open slices stay open.
- Changing the lint: it reported a real gap.

## slices

- global_gate: none

### S1 — Record what shipped
- **Status**: pending
- **Files**: `docs/delendai/proposals/in-progress/q00038-plan-every-check-runs-only-for-what-the-change-can-affect.md`, `docs/delendai/proposals/ready/refactors/r00644-the-proposals-plugin-is-split-along-its-engines-and-each-engine-is-covered.md`
- **Gate**: none
- acceptance:
  - "q00038 S1, S4, S5, S6 and S7 and r00644 S5 are done with their shipping commits, and lint:job:governance passes on develop."

## acceptance

- q00038 S1, S4, S5, S6 and S7 and r00644 S5 are done with their shipping commits, and lint:job:governance passes on develop.
