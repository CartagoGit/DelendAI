---
id: x01064
title: "The specs that overran their time budgets read git from a table, and the real clone stays in one e2e spec each"
kind: fix
status: ready
type: proposal
track: default
date: 2026-11-13
---

# x01064 — The specs that overran their time budgets read git from a table, and the real clone stays in one e2e spec each

## goal

orphaned-work, work-ref-lifecycle and shared-checkout-shell-rescue specs overran their budgets in CI because each test ran a dozen to twenty git processes, plus a scan of the machine's /proc; their logic is answered from an in-memory git through the shared read seam, with one real-git e2e spec per behaviour.

## why

CI measured 699, 326 and 49 ms against budgets of 503, 193 and 35 ms. Each test ran a dozen to twenty git processes (fixture setup and the service's own reads), and the orphaned-work reading also scanned every process of the machine in /proc, so the time follows the runner's load and no budget describes it. The services already read git through one seam, so a spec can hand it a table.

## non-goals

- The other specs that spawn processes; the count is reported, not fixed here.
- Any change of behaviour: the one added seam, an injected machine reader, defaults to the real scan.

## slices

- global_gate: none

### S1 — In-memory git for the three specs, one e2e each
- **Status**: pending
- **Files**: `packages/test-kit/src/lib/in-memory-git.helper.ts`, `packages/test-kit/src/contracts/interfaces/in-memory-git.interface.ts`, `packages/test-kit/src/public/index.ts`, `packages/test-kit/tests/src/lib/test-time-and-git.helper.spec.ts`, `packages/core/src/lib/work-units/unit-liveness.service.ts`, `packages/core/src/lib/work-units/orphaned-work.service.ts`, `packages/core/src/lib/work-units/publication-standings.service.ts`, `packages/core/tests/src/lib/work-units/orphaned-work.service.spec.ts`, `packages/core/tests/src/lib/work-units/orphaned-work.service.e2e.spec.ts`, `packages/core/tests/src/lib/work-units/work-ref-lifecycle.service.spec.ts`, `packages/core/tests/src/lib/work-units/work-ref-lifecycle.e2e.spec.ts`, `packages/core/tests/src/lib/work-units/shared-checkout-shell-rescue.service.spec.ts`, `packages/core/tests/src/lib/work-units/shared-checkout-shell-rescue.e2e.spec.ts`
- **Gate**: none

## acceptance

- The three specs' logic cases run on an in-memory git and spawn no process; each behaviour keeps one real-git e2e spec.
- No test was removed: every case still has an assertion, in the fast tier or in the e2e spec.
