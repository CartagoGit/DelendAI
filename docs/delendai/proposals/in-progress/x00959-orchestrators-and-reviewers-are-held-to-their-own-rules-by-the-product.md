---
id: x00959
title: "Orchestrators and reviewers are held to their own rules by the product"
kind: fix
status: in-progress
type: proposal
track: a00095-consistency
date: 2026-10-23
last-transition-id: 841f52af-d902-4929-b74f-f3bb905b18ab
last-correlation-id: 841f52af-d902-4929-b74f-f3bb905b18ab
last-transition-from: ready
last-transition-at: 2026-11-01T05:21:21.203Z
---

# x00959 — Orchestrators and reviewers are held to their own rules by the product

## goal

A create unit makes one proposal, a delivery is checked against its slice's Files and acceptance at publish, a commit with a red spec of the touched files is refused, the gates a unit must pass are one product command, reviewers keep one unit per session and cannot claim more than they work, and two instances of one model are told apart.

## why

Joint audit a00095 and the reviewer observations recorded during it. C4: identities keep being wrong; only one cause is closed. C5: proposal ids are burned and one create unit made four proposals. C9: the orchestrator rewrites the gate list by hand in each assignment. C10: a subagent costs 34k tokens before its first action. C11: a subagent's delivery departed from the proposal's Files and acceptance. C13: a commit with a red spec is possible, and a smoke that wrote into the tree was cleaned with rm. Reviewers (minimax-m3.1-flash-preview, 2026-10-22/23): one unit per claim, six live at once, units silent with approvals never published, and two instances under one identity.

## non-goals

- Review evidence (x00944 S2).

## slices

- global_gate: type

### S1 — Units
- **Status**: pending
- **Files**: `packages/core/src/lib/work-units/unit-adoption.service.ts`, `packages/core/src/lib/work-units/unit-departures.service.ts`, `packages/core/src/lib/work-units/work-unit-publish.service.ts`, `plugins/proposals/src/lib/tools/authoring/create-proposal.tool.ts`
- **Gate**: type
- acceptance:
  - "A create unit refuses a second create_proposal (C5)."
  - "Publish compares the delivered paths with the slices' Files and lists departures in its report, without blocking (C11)."

### S2 — Gates as one command and hooks
- **Status**: pending
- **Files**: `packages/core/src/lib/work-units/work-unit-prove.service.ts`
- **Gate**: type
- acceptance:
  - "`delendai work prove` runs the gates CI runs for the unit's changes, so no orchestrator lists them by hand (C9, C10)."
  - "A publication with a red spec is refused by the proof before it leaves the unit; a commit in a unit is a checkpoint and stays fast (C13)."

### S3 — Reviewers
- **Status**: pending
- **Files**: `plugins/proposals/src/lib/tools/review-claim.tool.ts`, `plugins/proposals/src/lib/services/review-claim.service.ts`, `plugins/proposals/src/lib/services/review-earlier-pack.service.ts`
- **Gate**: type
- acceptance:
  - "A reviewer session holds one review unit; claiming again from another unit is refused while the first holds unpublished verdicts."
  - "Identity stays the declared model id: a name suffix is not read as an instance, because `gpt-5-mini` is not `gpt-5` (C4)."

## acceptance

- A create unit refuses a second create_proposal (C5).
- Publish compares the delivered paths with the slices' Files and lists departures in its report, without blocking (C11).
- `delendai work prove` runs the gates CI runs for the unit's changes, so no orchestrator lists them by hand (C9, C10).
- A publication with a red spec is refused by the proof before it leaves the unit; a commit in a unit is a checkpoint and stays fast (C13).
- A reviewer session holds one review unit; claiming again from another unit is refused while the first holds unpublished verdicts.
- Identity stays the declared model id: a name suffix is not read as an instance, because `gpt-5-mini` is not `gpt-5` (C4).

## notes

The pre-commit spec run was dropped: the proof refuses a red spec at hand-over, and every checkpoint commit would pay for it. `work prove` is the gate command `work gate` was to be. A suffix is not an instance (see `agent-alias.service.ts`), so a declared id stays the identity.
