---
id: x01092
title: "The core-proposals boundary lint fails on what its spec fails on"
kind: fix
status: done
type: proposal
track: fixes
date: 2026-11-18
last-transition-id: 264fb41e-0217-43e1-8363-31052e5a105d
last-correlation-id: 264fb41e-0217-43e1-8363-31052e5a105d
last-transition-from: review
last-transition-at: 2026-11-20T23:38:40.748Z
shipped-in:
  - "d97732a47200690f68f9f94f11d7bd03ba9406c1"
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
- **Status**: done
- **Files**: `tools/scripts/lint/core-proposals-boundary.script.ts`, `tools/scripts/lint/core-proposals-boundary.script.spec.ts`
- **Gate**: lint
- acceptance:
  - "The lint calls scanCoreProposalsBoundary from tools/scripts/inspect/core-proposals-boundary.script.ts and fails, naming file and line, when result.unclassified or result.missing is non-empty."
  - "The lint fails when renderInventoryMarkdown(result) differs from docs/delendai/CORE-PROPOSALS-BOUNDARY-INVENTORY.md, naming the command that regenerates it."
  - "core-proposals-boundary.script.spec.ts drives the lint over a fixture tree with one unclassified line, one missing finding and one stale inventory, asserts each fails with its own message, and asserts the fixed tree passes."
  - "On the develop tree that carries the boundary classification from #1957 the lint passes."
- shipped-in: `943fdf1e55b3`
- review-state: done
- review-implementer: claude-sonnet-5-5
- review-reviewer: mai-code-2
- review-log: approved by mai-code-2 — verified at d97732a47200, validate exit 0 and tests 4/4 claimed, no recorded run cited; acceptance 4/4: (1) checkInventoryBoundary calls scanCoreProposalsBoundary, maps unclassified to file:line unclassified and missing to a missing finding failure, and the fixture s… (2) checkInventoryBoundary compares committed inventory text with renderInventoryMarkdown(result); the stale fixture fails with one message containing `is stale; r… (3) The spec builds a classified/current fixture, then independently introduces each defect and asserts pass/three distinct failures; all 4 tests pass. (4) The live `bun run lint:core-proposals-boundary` scan passed: 1,218 files scanned, 38 active exceptions, 0 expired. — Reviewed the delivered diff and current implementation; no later change touches these slice files. The 4 focused fixture tests pass and the live lint succeeds over 1,218 core files with 0 expired exceptions, proving the lint and its architectural spec now judge the same three failure classes.

## acceptance

- The lint calls scanCoreProposalsBoundary from tools/scripts/inspect/core-proposals-boundary.script.ts and fails, naming file and line, when result.unclassified or result.missing is non-empty.
- The lint fails when renderInventoryMarkdown(result) differs from docs/delendai/CORE-PROPOSALS-BOUNDARY-INVENTORY.md, naming the command that regenerates it.
- core-proposals-boundary.script.spec.ts drives the lint over a fixture tree with one unclassified line, one missing finding and one stale inventory, asserts each fails with its own message, and asserts the fixed tree passes.
- On the develop tree that carries the boundary classification from #1957 the lint passes.
