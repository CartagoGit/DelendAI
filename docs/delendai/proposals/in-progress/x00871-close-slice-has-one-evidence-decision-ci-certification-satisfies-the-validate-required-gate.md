---
id: x00871
title: "close_slice has one evidence decision: CI certification satisfies the validate-required gate"
kind: fix
status: in-progress
type: proposal
track: general
date: 2026-10-03
last-transition-id: 6f06c854-b56f-4eea-b53b-5f102958abaa
last-correlation-id: 6f06c854-b56f-4eea-b53b-5f102958abaa
last-transition-from: ready
---

# x00871 — close_slice has one evidence decision: CI certification satisfies the validate-required gate

## Goal

Remove the older validate-required refusal in close_slice that CI certification of the exact tree never satisfied; the tree-keyed close gate becomes the single decision, with explicit validateEvidence as one accepted source, and a nextAction that never suggests force.

## why

Merged proposals with green CI could not close type/e2e-gated slices: the older gate demanded inline validateEvidence or a local validate.jsonl row and its nextAction invited force:true.

## non-goals

- Changing what `force: true` does for callers that pass it deliberately; only the guidance stops pointing at it.
- The declared gate, the certification readers and the landing routes (they already decide per route).

## Slices

- global_gate: none

### S1 — Unify the validate-evidence decision
- **Status**: pending
- **Files**: `plugins/proposals/src/lib/tools/authoring.tool.ts`, `plugins/proposals/src/lib/tools/authoring-options.ts`, `plugins/proposals/tests/src/lib/e2e/close-slice-ci-evidence.e2e.spec.ts`
- **Gate**: type
- acceptance:
  - "a type-gated slice closes from CI certification of the exact tree"
  - "a different tree is refused with a nextAction that never mentions force"
  - "explicit validateEvidence is still accepted"
  - "a red CI result blocks"

## acceptance

- a type-gated slice closes from CI certification of the exact tree
- a different tree is refused with a nextAction that never mentions force
- explicit validateEvidence is still accepted
- a red CI result blocks
