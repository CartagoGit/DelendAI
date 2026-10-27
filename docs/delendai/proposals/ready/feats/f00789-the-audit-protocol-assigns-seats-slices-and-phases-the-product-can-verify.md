---
id: f00789
title: "The audit protocol assigns seats, slices and phases the product can verify"
kind: feat
status: ready
type: proposal
track: a00095-consistency
date: 2026-10-23
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

### S2 — Contract, inventory and closure
- **Status**: pending
- **Files**: `plugins/audit/src/lib/services/audit-contract.service.ts`, `plugins/audit/src/lib/tools/audit-close.tool.ts`, `plugins/audit/src/index.ts`, `apps/web/src/i18n/tools/delendai_audit_close.ts`, `apps/web/src/i18n/tools/index.ts`
- **Gate**: type
- acceptance:
  - "Each finding is checked for the required fields and listed when incomplete (G76, G74)."
  - "The inventory and the proposal inventory are generated (G77, G150)."
  - "Closing records the consensus and its threshold per finding (G78)."

## acceptance

- A seat is claimed with an exclusive create and two reviewers cannot hold one (C2).
- A reviewer's Phase A file is committed before it can read the others' (G75).
- Each finding is checked for the required fields and listed when incomplete (G76, G74).
- The inventory and the proposal inventory are generated (G77, G150).
- Closing records the consensus and its threshold per finding (G78).
