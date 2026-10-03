---
id: x00871
title: "close_slice has one evidence decision: CI certification satisfies the validate-required gate"
kind: fix
status: ready
type: proposal
track: general
date: 2026-10-03
---

# x00871 — close_slice has one evidence decision: CI certification satisfies the validate-required gate

## Goal

Remove the older validate-required refusal in close_slice that CI certification of the exact tree never satisfied; the tree-keyed close gate becomes the single decision, with explicit validateEvidence as one accepted source, and a nextAction that never suggests force.

## why

Merged proposals with green CI could not close type/e2e-gated slices: the older gate demanded inline validateEvidence or a local validate.jsonl row and its nextAction invited force:true.

## non-goals

- TODO: what this proposal deliberately skips.

## Slices

- global_gate: none

### S1 — Unify the validate-evidence decision
- **Status**: pending
- **Files**: `plugins/proposals/src/lib/tools/authoring.tool.ts`, `plugins/proposals/src/lib/tools/authoring-options.ts`, `plugins/proposals/tests/src/lib/tools/close-slice-ci-evidence.spec.ts`
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
