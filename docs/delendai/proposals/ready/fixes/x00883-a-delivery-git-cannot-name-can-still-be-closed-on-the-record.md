---
id: x00883
title: "A delivery Git cannot name can still be closed, on the record"
kind: fix
status: ready
type: proposal
track: general
date: 2026-10-11
---

# x00883 — A delivery Git cannot name can still be closed, on the record

## goal

A slice delivered by work Git cannot attribute to anybody can be closed
through a recorded path, and a pull request that can no longer move is
reported instead of sitting open.

## why

Pull request #1008 sat open and red from 04:04 UTC on 2026-10-11 until the
owner asked about it that night. It is a review pack by `minimax-m31` that
approves the five slices of f00538 and closes the proposal. Two of those
slices were delivered on 2026-09-15 by commit `d615fc5a2550`, on a branch
called `delendai/pr/forward-sync-release`: no agent in the ref, none in
the merge that landed it, no trailer. The review tool recorded their
implementer as `unrecorded`, as designed, and the gate
`closed-with-independent-approval` refuses to close a proposal over an
unrecorded implementer, also as designed. Three things were missing
between those two designs:

1. **No way out.** The only path was "the owner merges the red pull
   request by hand". Nothing recorded who delivered the work, even when
   that is known — here the session record shows which model made the
   commit.
2. **The pull request was let be born.** The transition to `done` did not
   apply the gate's rule at the time (it does since x00880), so the pack
   closed the proposal and published a pull request its own gate could
   never pass.
3. **Nobody was told.** The queue leaves a red candidate to its author,
   which is right while there is one. This author was a swarm agent long
   gone; `work doctor --forge` reported every invariant as holding.

## non-goals

- **Not a way around review.** An attestation names an implementer; the
  slice still needs an approval by somebody else, and an attested name
  that matches the approver makes it a self-approval like any other.
- **Not proof.** The line reads `attested by`, never as if Git said it,
  and a closure that rests on one needs the owner's label.
- **No history rewrite.** The old commits stay as they are.

## slices

- global_gate: type

### S1 — Who delivered work Git cannot name is attested, with its evidence

- **Status**: review
- **Files**:
  - `plugins/proposals/src/lib/services/attested-implementer.service.ts`
  - `plugins/proposals/src/lib/contracts/constants/review-attribution.constant.ts`
  - `plugins/proposals/src/lib/tools/authoring.tool.ts`
  - `plugins/proposals/src/public/index.ts`
  - `packages/cli/src/commands/groups/proposals.ts`
  - `plugins/proposals/tests/src/lib/services/attested-implementer.service.spec.ts`
  - `plugins/proposals/tests/src/lib/tools/proposal-review-attest.spec.ts`
- **Gate**: type
- shipped-in: `8bbc9885b9a0`
- acceptance:
  - `proposal_review { action: "attest", implementer, note }` (CLI: `proposals review <id> <slice> --action=attest --implementer=<who> --note=<evidence>`) writes the implementer and a `review-attribution: <who> attested by <agent> — <evidence>` line on a slice reviewed as `unrecorded`.
  - It refuses a slice whose implementer is already named, a slice no review round was opened for, a name that is empty, `unrecorded` or more than one word, and evidence shorter than a sentence; a refusal writes nothing.
  - The reviewer's own lines are untouched, and an approval by the attested implementer itself still does not count.

### S2 — Closing over an attestation is the owner's decision, taken on the record

- **Status**: review
- **Files**:
  - `tools/scripts/lint/closed-with-independent-approval.script.ts`
  - `tools/scripts/lint/closed-with-independent-approval.script.spec.ts`
- **Gate**: type
- shipped-in: `8bbc9885b9a0`
- acceptance:
  - `closed-with-independent-approval` fails a pull request that closes a proposal with an attested slice, names the proposal and the slices, and passes once the pull request carries the owner's label (`delendai:owner-reconcile`).
  - A proposal Git names throughout is judged exactly as before.

### S3 — A publication nobody moves any more is reported

- **Status**: review
- **Files**:
  - `packages/core/src/lib/work-units/forge-work-refs.service.ts`
  - `packages/core/src/lib/work-units/workflow-invariants.service.ts`
  - `packages/core/tests/src/lib/work-units/stalled-publications.spec.ts`
- **Gate**: type
- shipped-in: `8bbc9885b9a0`
- acceptance:
  - `work doctor --forge` reports `publications-move` broken for a publication whose tip is older than the window after which a unit counts as abandoned, with how long, and the remedy: read why it is not merging, then fix it on its own publication or retire it.
  - A fresh publication, and a ref the clone never fetched, are not reported.
  - Run on 2026-10-11 it named the pull request this proposal exists for, nine hours stalled.

### S4 — The pull request that was stuck is closed through the mechanism

- **Status**: pending
- **Files**:
  - `docs/delendai/proposals/done/feats/f00538-forward-sync-the-release-branch-back-into-the-integration-branch-after-every-promotion.md`
- **Gate**: none
- acceptance:
  - On its own publication (`delendai/pr/minimax-m31/review/f00538-review-g1/the-cited-tree-is-not-a-commit`), once S1 and S2 are on the integration branch: S2 and S3 of f00538 are attested to `claude-opus-5`, the model the session record of 2026-09-15 shows making `d615fc5a2550`; the reviewer's verdicts stay the reviewer's.
  - The pull request carries the owner's label — the owner asked on 2026-10-11 for this branch to be put right with the fix — its required check passes, and it merges through the queue.

## acceptance

- A slice reviewed as `unrecorded` can be attested with a name and its evidence, and only such a slice.
- A proposal closed over an attestation passes its gate under the owner's label and fails without it, naming what the owner is asked to decide.
- `work doctor --forge` reports a publication nobody has moved since its author went quiet.
- Pull request #1008 is merged through that path, with the reviewer's verdicts as the reviewer wrote them.

