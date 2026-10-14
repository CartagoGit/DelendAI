---
id: x00886
title: "What a unit leaves behind is recognised as kept or spent by one reading, everywhere"
kind: fix
status: review
type: proposal
track: general
date: 2026-10-13
last-transition-id: cbe6dc23-379a-4c82-9057-e0c5fe333dca
last-correlation-id: cbe6dc23-379a-4c82-9057-e0c5fe333dca
last-transition-from: in-progress
last-transition-at: 2026-10-13T04:05:37.876Z
shipped-in:
  - "708edad24396"
  - "facf2968c1e6d6915b7b86272ab1e01e5040ebb3"
  - "6ee9769b01941d8c1dc6981af5fc9b25457a943d"
---

# x00886 — What a unit leaves behind is recognised as kept or spent by one reading, everywhere

## goal

A retired unit never blocks a boot, a spent review claim never outlives its proposal, and a ref copied outside the product's namespaces is recognised and cleaned when it carries no work.

## why

On 2026-10-13 the owner asked why branches, worktrees and refs are still left behind when the system is meant to be hardened. An inventory of this repository answered it with three gaps, each a place where one part of the product read a leftover differently from another:

- The boot's integration evidence called a checkpoint "lost" unless it was exactly a retired tip. A unit retired after one more commit keeps its checkpoint as an ancestor of the tip, so the boot went DEGRADED and blocked every mutation for a ref that was safely kept (the gpt-5.4 review pack). The tips were also read from `ls-remote` without fetching them, so ancestry could not even be asked.
- The reservation reaper only knew slice claims. A review claim (`claims/review/<id>`) whose unit was gone stayed on the forge for ever (`review/f00538`).
- Refs copied by hand outside the product's namespaces (26 under `refs/<ns>-remote-claims/`) had no owner: no reaper looked at them, so nothing could say whether they held work.

The server log pasted with the same request showed two more departures: the checkout publisher re-wrote an idle unit's "no commits of its own yet" every five minutes whenever another unit changed, and the supervisor's restart line ended with "It still applies the rules it started with", contradicting the restart it announced.

## non-goals

- Deleting a stray ref that holds a commit of its own: it is reported as kept, never removed.
- A retention rule for retired refs (an owner decision still open).

## slices

- global_gate: type

### S1 — A checkpoint kept under a later retired tip is not lost

- **Status**: done
- **Files**:
  - `packages/core/src/lib/startup-reconciler/phases/integration-evidence.ts`
  - `packages/core/src/lib/startup-reconciler/retired-tips.service.ts`
  - `packages/core/tests/src/lib/startup-reconciler/swarm-boot.spec.ts`
- **Gate**: type
- acceptance:
  - A checkpoint that is a retired tip, or an ancestor of one, is reported kept; the boot does not go DEGRADED for it.
  - Retired tips absent from the local object store are fetched before ancestry is asked.
- shipped-in: `708edad24396`
- review-state: done
- review-implementer: claude-opus-5-5
- review-reviewer: gemini-3.8-flash
- review-log: approved by gemini-3.8-flash — verified at 708edad24396, validate exit 0, tests 5/5 — Verified S1: checkpoints under retired tips are kept without degrading boot; remote tips are fetched before ancestry checks. 5/5 tests passing.

### S2 — The reaper releases spent review claims and empty stray refs

- **Status**: done
- **Files**:
  - `packages/core/src/lib/work-units/slice-reservation-reap.service.ts`
  - `packages/core/src/lib/work-units/stray-refs-reap.interface.ts`
  - `packages/core/src/lib/work-units/stray-refs-reap.service.ts`
  - `packages/core/src/lib/work-units/work-unit-reap.service.ts`
  - `packages/core/tests/src/lib/work-units/slice-reservation.service.spec.ts`
  - `packages/core/tests/src/lib/work-units/stray-refs-reap.service.spec.ts`
- **Gate**: type
- acceptance:
  - `work reap` releases a review claim whose unit is gone, as it does a slice claim.
  - `work reap` reports `strays`: a ref under the namespace prefix but outside the product's namespaces is removed only when every commit it adds is empty or a snapshot of a tree already on the integration branch; any other is listed as kept. Without `--apply` nothing is removed.
- shipped-in: `708edad24396`
- review-state: done
- review-implementer: claude-opus-5-5
- review-reviewer: gemini-3.8-flash
- review-log: approved by gemini-3.8-flash — verified at 708edad24396, validate exit 0, tests 12/12 — Verified S2: work reap releases spent review claims and empty stray refs while keeping working ones. 12/12 tests passing.

### S3 — The server log says each change once, and a restart in the past tense

- **Status**: done
- **Files**:
  - `packages/core/src/lib/wip-engine/work-checkout-publisher.ts`
  - `packages/core/src/lib/wip-engine/work-checkout-reports.ts`
  - `packages/core/tests/src/lib/wip-engine/work-checkout-publisher.spec.ts`
  - `tools/scripts/host/host-supervisor-process.ts`
  - `tools/scripts/host/host-supervisor-process.spec.ts`
- **Gate**: type
- acceptance:
  - The publisher's report names a unit only when its outcome or reason changed since the last report that named it.
  - The restart line describes what the server ran before the restart and no longer says it still applies the old rules.
- shipped-in: `708edad24396`
- review-state: done
- review-implementer: claude-opus-5-5
- review-reviewer: gemini-3.8-flash
- review-log: approved by gemini-3.8-flash — verified at 708edad24396, validate exit 0, tests 25/25 — Approved S3: all 25 tests pass across 2 test files and typecheck passes with exit code 0

### S4 — A unit ends once every slice of its proposal is handed in

- **Status**: done
- **Files**:
  - `packages/core/src/lib/work-units/publication-target.service.ts`
  - `packages/core/tests/src/lib/work-units/publication-target.service.spec.ts`
- **Gate**: type
- acceptance:
  - A proposal counts as in progress for its unit only while its file is in `in-progress/` and some slice is not yet in review, approved or done. Once every slice is handed in, the unit is judged delivered and reaped after its publication merges, rather than fast-forwarded and kept.
- shipped-in: `5a1d2173bf57`
- review-state: done
- review-implementer: claude-opus-5-5
- review-reviewer: gemini-3.8-flash
- review-log: approved by gemini-3.8-flash — verified at facf2968c1e6, validate exit 0, tests 14/14 — Approved S4: all 14 tests pass and typecheck passes with exit code 0

### S5 — A handed-in slice says so, whichever way it was handed in

- **Status**: done
- **Files**:
  - `plugins/proposals/src/lib/swarm/proposal-review.ts`
  - `plugins/proposals/src/lib/tools/authoring.tool.ts`
  - `plugins/proposals/src/lib/services/review-handoff.ts`
  - `plugins/proposals/tests/src/lib/proposal-review.spec.ts`
  - `plugins/proposals/tests/src/lib/services/review-handoff.spec.ts`
- **Gate**: type
- acceptance:
  - Submitting a slice that reads `pending` or `in-progress` sets its Status line to `review`. Handing the proposal to review aligns every slice already in review the same way, so a proposal in `review/` never carries a slice the completeness gate counts as not started.
- review-state: done
- review-implementer: claude-opus-5-5
- review-reviewer: gemini-3.8-flash
- review-log: approved by gemini-3.8-flash — verified at 6ee9769b0194, validate exit 0, tests 12/12 — Approved S5: all 12 tests pass across 2 test files and typecheck passes with exit code 0

### S6 — Re-entering a published unit goes back to it

- **Status**: review
- **Files**:
  - `packages/core/src/lib/work-units/work-unit-generation.service.ts`
  - `packages/core/src/lib/work-units/publication-target.service.ts`
  - `packages/core/tests/src/lib/work-units/work-unit.service.spec.ts`
- **Gate**: type
- acceptance:
  - `work enter` without `--generation`, for an agent whose own generation of that proposal and slice has an open publication, is refused. The refusal gives the generation, the topic and the merge that resume it, whether or not the forge still holds a reservation. `--alongside` still opens a deliberate next generation.
- review-state: in_review
- review-implementer: claude-opus-5-5

## acceptance

- A boot over a repository whose only leftover is a checkpoint kept under a later retired tip reports HEALTHY.
- `work reap` on this repository lists the spent review claim and the empty stray refs, and keeps the strays that carry a commit.
- The server log no longer repeats an unchanged unit's skip.
- After this proposal's publication merged, its unit's branch and worktree stayed and were fast-forwarded to develop (observed 2026-10-13). With S4 they are reaped.
