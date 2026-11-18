---
id: x01092
title: "The core-proposals boundary lint fails on what its spec fails on"
kind: fix
status: in-progress
type: proposal
track: fixes
date: 2026-11-18
last-transition-id: 5675c9d6-01fa-4e47-b2ae-5a363de5e654
last-correlation-id: 5675c9d6-01fa-4e47-b2ae-5a363de5e654
last-transition-from: ready
last-transition-at: 2026-11-18T01:57:13.253Z
---

# x01092 — The core-proposals boundary lint fails on what its spec fails on

## goal

lint:core-proposals-boundary, which every proof and CI run executes, refuses an unclassified proposal-domain line, a missing expected finding and a stale committed inventory, the same three facts packages/core/tests/src/architecture/core-proposals-boundary.spec.ts checks, so a change that moves a classified line cannot reach develop green.

## why

On 2026-11-18 develop went red after f00809 S1 (c7fe02f52) moved a classified line into pull-request-text.service.ts and added change-text files: the spec reported 9 unclassified lines, 1 missing finding and a stale inventory, while the lint, run on the same tree, printed 'ok. 1212 file(s) scanned'. The PR's changed-spec selection did not run the spec, so only the lint stood guard and it checks a narrower fact. Every PR after it inherited the red spec until #1957 carried the classification.

## non-goals

- Reclassifying any boundary line; that is the owning proposal's work.
- Running the spec itself in every proof.

## slices

- global_gate: lint

### S1 — The lint runs the inventory scan and compares the committed inventory
- **Status**: pending
- **Files**: `tools/scripts/lint/core-proposals-boundary.script.ts`, `tools/scripts/lint/core-proposals-boundary.script.spec.ts`
- **Gate**: lint
- acceptance:
  - "The lint calls scanCoreProposalsBoundary from tools/scripts/inspect/core-proposals-boundary.script.ts and fails, naming file and line, when result.unclassified or result.missing is non-empty."
  - "The lint fails when renderInventoryMarkdown(result) differs from docs/delendai/CORE-PROPOSALS-BOUNDARY-INVENTORY.md, naming the command that regenerates it."
  - "core-proposals-boundary.script.spec.ts drives the lint over a fixture tree with one unclassified line, one missing finding and one stale inventory, asserts each fails with its own message, and asserts the fixed tree passes."
  - "On the develop tree that carries the boundary classification from #1957 the lint passes."

## acceptance

- The lint calls scanCoreProposalsBoundary from tools/scripts/inspect/core-proposals-boundary.script.ts and fails, naming file and line, when result.unclassified or result.missing is non-empty.
- The lint fails when renderInventoryMarkdown(result) differs from docs/delendai/CORE-PROPOSALS-BOUNDARY-INVENTORY.md, naming the command that regenerates it.
- core-proposals-boundary.script.spec.ts drives the lint over a fixture tree with one unclassified line, one missing finding and one stale inventory, asserts each fails with its own message, and asserts the fixed tree passes.
- On the develop tree that carries the boundary classification from #1957 the lint passes.
