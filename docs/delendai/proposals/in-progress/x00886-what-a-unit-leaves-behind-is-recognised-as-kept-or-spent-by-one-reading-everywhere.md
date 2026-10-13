---
id: x00886
title: "What a unit leaves behind is recognised as kept or spent by one reading, everywhere"
kind: fix
status: in-progress
type: proposal
track: general
date: 2026-10-13
last-transition-id: 3b87adb7-03ea-48fb-9e43-dcf6a57ebd86
last-correlation-id: 3b87adb7-03ea-48fb-9e43-dcf6a57ebd86
last-transition-from: ready
last-transition-at: 2026-10-13T00:52:28.729Z
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

- **Status**: pending
- **Files**:
  - `packages/core/src/lib/startup-reconciler/phases/integration-evidence.ts`
  - `packages/core/src/lib/startup-reconciler/retired-tips.service.ts`
  - `packages/core/tests/src/lib/startup-reconciler/swarm-boot.spec.ts`
- **Gate**: type
- acceptance:
  - A checkpoint that is a retired tip, or an ancestor of one, is reported kept; the boot does not go DEGRADED for it.
  - Retired tips absent from the local object store are fetched before ancestry is asked.
- review-state: in_review
- review-implementer: claude-opus-5-5

### S2 — The reaper releases spent review claims and empty stray refs

- **Status**: pending
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
- review-state: in_review
- review-implementer: claude-opus-5-5

### S3 — The server log says each change once, and a restart in the past tense

- **Status**: pending
- **Files**:
  - `packages/core/src/lib/wip-engine/work-checkout-publisher.ts`
  - `packages/core/tests/src/lib/wip-engine/work-checkout-publisher.spec.ts`
  - `tools/scripts/host/host-supervisor-process.ts`
  - `tools/scripts/host/host-supervisor-process.spec.ts`
- **Gate**: type
- acceptance:
  - The publisher's report names a unit only when its outcome or reason changed since the last report that named it.
  - The restart line describes what the server ran before the restart and no longer says it still applies the old rules.

## acceptance

- A boot over a repository whose only leftover is a checkpoint kept under a later retired tip reports HEALTHY.
- `work reap` on this repository lists the spent review claim and the empty stray refs, and keeps the strays that carry a commit.
- The server log no longer repeats an unchanged unit's skip.
