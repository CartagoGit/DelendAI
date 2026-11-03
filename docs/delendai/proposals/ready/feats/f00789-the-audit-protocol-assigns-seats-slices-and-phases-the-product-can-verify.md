---
id: f00789
title: "The audit protocol assigns seats, slices and phases the product can verify"
kind: feat
status: ready
type: proposal
track: a00095-consistency
date: 2026-10-23
last-transition-id: 0f879927-272e-4d63-95f3-0cae2f3b0c9f
last-correlation-id: 0f879927-272e-4d63-95f3-0cae2f3b0c9f
last-transition-from: review
last-transition-at: 2026-11-03T04:35:23.742Z
---

# f00789 — The audit protocol assigns seats, slices and phases the product can verify

## goal

Reviewer seats are claimed through the product, not self-declared; the phases, the evidence contract, the inventory and the closure the audit prompt demands are checked by tools; and the audit is closed by a recorded consensus.

## why

Joint audit a00095, on its own protocol. C2: reviewers assign themselves seats and two claim the same one. G74: the audit prompt demands conditions nothing verifies. G75: Phase A (investigate without consulting others) is unverifiable. G76: the evidence contract (15 mandatory fields) is not met by most findings. G77: the inventory with a normalised state per item is absent. G78: the closure cannot be verified from the record. G150: the inventory of active proposals the prompt demands is missing. C3 (invented slices) is settled by x00926.

## non-goals

- The document layout (the audit-document proposal).

## slices

- global_gate: type

### S1 — Seats and phases
- **Status**: pending
- **Files**: `plugins/audit/src/lib/tools/audit-consolidate.tool.ts`, `plugins/audit/src/lib/services/audit-seats.service.ts`, `plugins/audit/src/lib/contracts/constants/audit-protocol.constant.ts`, `plugins/audit/src/lib/contracts/interfaces/audit-protocol.interface.ts`, `plugins/audit/tests/src/lib/services/audit-protocol.spec.ts`
- **Gate**: type
- acceptance:
  - "A seat is claimed with an exclusive create and two reviewers cannot hold one (C2)."
  - "A reviewer's Phase A file is committed before it can read the others' (G75)."
- shipped-in: `5c9c99b52b42`
- review-state: changes_requested
- review-implementer: claude-opus-5-5
- review-reviewer: minimax-m3.1-flash
- review-log: requested_changes by minimax-m3.1-flash — Changes requested on slice S1, the seats and the phases.

WHAT IS WRONG. The first criterion is delivered: a seat is claimed with an exclusive create and a second reviewer is refused it, and the spec proves it. The second criterion is not: the Phase A gate is the reader's to invoke, and a reader that does not name itself is never checked.

WHERE. plugins/audit/src/lib/tools/audit-consolidate.tool.ts:142 declares `reviewer: z.string().optional()` and :233 runs the gate only `if (args.reviewer !== undefined)`. The close path reads the peers' reports first, plugins/audit/src/lib/tools/audit-close.tool.ts:186, and asks the seats' Phase A state at :210-218, so the read precedes the check.

HOW TO REPRODUCE. Call the consolidate tool over an audit directory that holds seat claims, without the `reviewer` argument: the answer carries every peer's report and no Phase A refusal. The gate itself is proven only for the named reviewer, at plugins/audit/tests/src/lib/tools/audit-close.tool.spec.ts:133.

WHAT MUST HOLD. A reader of the others' reports is checked, not the one who asks to be checked: the reviewer is required whenever the audit directory holds seat claims, and the close path checks the seats' Phase A state before it reads the reports. The criterion is a guarantee about the protocol, and a guarantee the caller can switch off is not the guarantee the criterion names.

The type gate exited 0 and the audit protocol's spec passes 8 of 8.

### S2 — Contract, inventory and closure
- **Status**: pending
- **Files**: `plugins/audit/src/lib/services/audit-contract.service.ts`, `plugins/audit/src/lib/tools/audit-close.tool.ts`, `plugins/audit/src/index.ts`, `apps/web/src/i18n/tools/delendai_audit_close.ts`, `apps/web/src/i18n/tools/index.ts`, `plugins/audit/tests/src/lib/tools/audit-close.tool.spec.ts`, `plugins/audit/src/lib/services/audit-path-policy.service.ts`, `plugins/audit/skills/audit-runner/SKILL.md`
- **Gate**: type
- acceptance:
  - "Each finding is checked for the required fields and listed when incomplete (G76, G74)."
  - "The inventory and the proposal inventory are generated (G77, G150)."
  - "Closing records the consensus and its threshold per finding (G78)."
- shipped-in: `5c9c99b52b42`
- review-state: changes_requested
- review-implementer: claude-opus-5-5
- review-reviewer: minimax-m3.1-flash
- review-log: requested_changes by minimax-m3.1-flash — Changes requested on slice S2, the contract, the inventory and the closure.

WHAT IS WRONG. The first and the third criteria are delivered: the required fields are checked and the incomplete findings are listed, and the closing record holds the consensus and its threshold per finding. The second is not: the inventories are computed, rendered and answered, and then dropped on the floor.

WHERE. plugins/audit/src/lib/services/audit-contract.service.ts:68, :79 and :116 build and render the two inventories; plugins/audit/src/lib/tools/audit-close.tool.ts:220 renders them into the answer; the only file the close writes is at :229-231, `JSON.stringify({ threshold, consensus })` into .audit/closure.json. No inventory row and no inventory file reaches the audit directory.

HOW TO REPRODUCE. Close an audit and look in the audit directory: .audit/closure.json holds the threshold and the consensus and nothing else, and the rendered inventory appears only in the tool's answer. The finding the criterion names, G77, is that the record does not contain the inventory, and the record still does not.

WHAT MUST HOLD. The inventory and the proposal inventory are written into the audit record: the rendered inventory and its rows land in the audit directory beside the closure, and a spec reads them back from the directory rather than from the answer.

The type gate exited 0 and the close tool's spec passes 4 of 4.

## acceptance

- A seat is claimed with an exclusive create and two reviewers cannot hold one (C2).
- A reviewer's Phase A file is committed before it can read the others' (G75).
- Each finding is checked for the required fields and listed when incomplete (G76, G74).
- The inventory and the proposal inventory are generated (G77, G150).
- Closing records the consensus and its threshold per finding (G78).
