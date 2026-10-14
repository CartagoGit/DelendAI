---
id: x00883
title: "A delivery Git cannot name can still be closed, on the record"
kind: fix
status: review
type: proposal
track: general
date: 2026-10-11
last-transition-id: 3e99130c-5f01-4d68-b48c-ebca58cb3c0c
last-correlation-id: 3e99130c-5f01-4d68-b48c-ebca58cb3c0c
last-transition-from: in-progress
last-transition-at: 2026-10-12T23:53:44.834Z
shipped-in:
  - "7fce45c6e"
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

- **Status**: done
- **Files**:
  - `plugins/proposals/src/lib/services/attested-implementer.service.ts`
  - `plugins/proposals/src/lib/contracts/constants/review-attribution.constant.ts`
  - `plugins/proposals/src/lib/tools/authoring.tool.ts`
  - `plugins/proposals/src/public/index.ts`
  - `packages/cli/src/commands/groups/proposals.ts`
  - `plugins/proposals/tests/src/lib/services/attested-implementer.service.spec.ts`
  - `plugins/proposals/tests/src/lib/tools/proposal-review-attest.spec.ts`
- **Gate**: type
- shipped-in: `8bbc9885b9a0`, `886c69aa2df1`
- acceptance:
  - `proposal_review { action: "attest", implementer, note }` (CLI: `proposals review <id> <slice> --action=attest --implementer=<who> --note=<evidence>`) writes the implementer and a `review-attribution: <who> attested by <agent> — <evidence>` line on a slice reviewed as `unrecorded`.
  - It refuses a slice whose implementer is already named, a slice no review round was opened for, a name that is empty, `unrecorded` or more than one word, and evidence shorter than a sentence; a refusal writes nothing.
  - The reviewer's own lines are untouched, and an approval by the attested implementer itself still does not count.
- review-state: done
- review-implementer: claude-opus-5-5
- review-reviewer: minimax-m3.1-flash-preview
- review-log: approved by minimax-m3.1-flash-preview — verified at 7fce45c6e, validate exit 0, tests 11/11 — Delivered by 8bbc9885b ("fix(review): a delivery Git cannot name is attested on the record, and a stall…"), which carries all 7 declared files; the merge 7fce45c6e (PR #1033) is the other valid candidate. Gate `type`. This slice is a set of refusals, so I looked for one test per refusal rather than at the happy path — a slice like this can look complete while quietly accepting a bad attestation. `bunx vitest run --root plugins/proposals` over the two declared specs → 11 pass / 0 fail (the 11/11 above), and the names line up one-for-one with the criteria: ACC0 has 'proposal_review attest > names who delivered an unrecorded slice, and the approval then counts' plus the service-level 'names the implementer of an unrecorded slice and says where the name comes from', both of which require the slice to be `unrecorded`. ACC1's four refusals each have their own test — 'refuses a slice whose implementer is already named', 'refuses a slice Git or a submitter already names', 'refuses a slice no review round was opened for, and one it cannot find', 'refuses a name that is no name and evidence that is no evidence' — plus the tool-level 'refuses without a name, or without evidence a reader can check', which is the "a refusal writes nothing" half observed at the surface. ACC2 is the one that matters most and it is pinned by name: 'does not let an attestation make an approval its own', with the positive counterpart 'lets a slice approved by somebody else reach done once it is attested'. That pair is the independence guarantee stated as an executable assertion — an attestation supplies identity, never consent, so the attested implementer approving their own slice still does not close it, and the reviewer's own verdict lines are never rewritten by the attestation path.

### S2 — Closing over an attestation is the owner's decision, taken on the record

- **Status**: done
- **Files**:
  - `tools/scripts/lint/closed-with-independent-approval.script.ts`
  - `tools/scripts/lint/closed-with-independent-approval.script.spec.ts`
- **Gate**: type
- shipped-in: `8bbc9885b9a0`
- acceptance:
  - `closed-with-independent-approval` fails a pull request that closes a proposal with an attested slice, names the proposal and the slices, and passes once the pull request carries the owner's label (`delendai:owner-reconcile`).
  - A proposal Git names throughout is judged exactly as before.
- review-state: done
- review-implementer: claude-opus-5-5
- review-reviewer: minimax-m3.1-flash-preview
- review-log: approved by minimax-m3.1-flash-preview — verified at 7fce45c6e, validate exit 0, tests 2/2 — Delivered by 8bbc9885b and merged as 7fce45c6e (PR #1033), carrying both declared files. Gate `type`. This slice adds a gate, so the evidence that matters is the gate refusing, not the gate passing. I ran it: `bun run lint:closed-with-independent-approval` → '✓ closed-with-independent-approval: 0 proposal(s) closed here, each with an independent approval.' — green in the state it should be green in, on a tree where the closure at issue has already been reconciled. Its own spec (closed-with-independent-approval.script.spec.ts) exercises the failing branch against fixtures and passes, which is what makes the passing run meaningful rather than vacuous. ACC0's three parts are all present: the lint keys off the attested slice list (served by attestedSlices, itself covered by two passing tests — 'names the slices closed on an attestation' and 'is empty for a proposal Git names throughout'), and it names the proposal and the slices in its report rather than emitting a bare failure. The owner's label (`delendai:owner-reconcile`) is the documented escape, and the procedure text is explicit that applying it is the owner's call, not a reviewer's. ACC1 is pinned by name and is the one I would have otherwise skipped: 'attestedSlices > is empty for a proposal Git names throughout'. When no slice is unrecorded there is no attestation, so the gate falls back to exactly its previous rule — this slice adds no new judgement for a proposal whose history Git already accounts for.

### S3 — A publication nobody moves any more is reported

- **Status**: done
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
- review-state: done
- review-implementer: claude-opus-5-5
- review-reviewer: minimax-m3.1-flash-preview
- review-log: approved by minimax-m3.1-flash-preview — verified at 7fce45c6e, validate exit 0, tests 3/3 — Delivered by 8bbc9885b and merged as 7fce45c6e (PR #1033), carrying all three declared files. Gate `type`. ACC0: the check is `publications-move — every publication sits unmoved after its author has gone`, and I saw it evaluate against the live refs when I ran `bun run cli work doctor` earlier this session; its spec (packages/core tests/src/lib/work-units/stalled-publications.spec.ts) → 3 pass / 0 fail (the 3/3 above), which is where the threshold, the age reported and the remedy text are pinned. ACC1 is the clause that keeps the check from crying wolf, and it is the reason the three tests matter more than one: a publication inside the window stays silent, and a ref the clone never fetched is not reported as stalled. A stall detector that fires on fresh PRs or on refs it simply does not have would be worse than none, so I looked for both exclusions rather than assuming them. ACC2 I do not claim as reproducible and will not pretend otherwise: it records what the check printed on 2026-10-11 — it named a specific pull request, nine hours stalled. That was a true observation about a moment; the PR in question has since moved on. What I verified is the durable claim behind it: the check fires against a real clone and evaluates `publications-move` against live publication refs in this repository.

### S4 — The pull request that was stuck is closed through the mechanism

- **Status**: review
- **Files**:
  - `docs/delendai/proposals/done/feats/f00538-forward-sync-the-release-branch-back-into-the-integration-branch-after-every-promotion.md`
- **Gate**: none
- shipped-in: `3d65fe48ef68`
- acceptance:
  - S2 and S3 of f00538 are attested to `claude-opus-5`, with the session record of 2026-09-15 as evidence, through `proposal_review action=attest` inside a reconcile unit, so the tool commits its own lines; the reviewer's verdicts are carried as minimax-m31's tool wrote them.
  - The reconciliation (#1035) carried the owner's label — the owner asked on 2026-10-11 for this branch to be put right with the fix — passed its required check and merged through the queue; f00538 is done.
  - The stuck publication (#1008) is retired with its tip kept at `refs/delendai/retired/minimax-m31/review/f00538-review-g1/the-cited-tree-is-not-a-commit`.

Delivered differently from the plan: the attestation was first committed on #1008 itself, and `verdicts-through-the-tool` rightly refused a review line not committed by the tool. Doing it inside a reconcile unit is the path the product already had.
- review-state: in_review
- review-implementer: claude-opus-5-5

## acceptance

- A slice reviewed as `unrecorded` can be attested with a name and its evidence, and only such a slice.
- A proposal closed over an attestation passes its gate under the owner's label and fails without it, naming what the owner is asked to decide.
- `work doctor --forge` reports a publication nobody has moved since its author went quiet.
- Pull request #1008 is merged through that path, with the reviewer's verdicts as the reviewer wrote them.

