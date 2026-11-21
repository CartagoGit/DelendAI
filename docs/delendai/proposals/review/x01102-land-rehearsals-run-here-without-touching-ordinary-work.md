---
id: x01102
title: "Land rehearsals run here without touching ordinary work"
kind: fix
status: review
type: proposal
track: trust
date: 2026-11-19
last-transition-id: 6c8dbf78-2af2-4eeb-8249-2dfe760ddbd4
last-correlation-id: 6c8dbf78-2af2-4eeb-8249-2dfe760ddbd4
last-transition-from: in-progress
last-transition-at: 2026-11-21T00:05:14.087Z
---

# x01102 — Land rehearsals run here without touching ordinary work

## goal

A land rehearsal keeps every ref under its own namespace, runs in process on pull requests, reaches the real forge only on dispatch or a land-engine merge, and always cleans up.

## why

Measured 2026-11-19: every PR touching plugins/integration opened about 35 real PRs (#3179-#3214); its land made batches under the real queue prefix (delendai/queue/batch-3210+3213); it ran twice for one change (PR #3178 and its batch); several rehearsal PRs stayed open.

## non-goals

- Changing the land engine itself
- A new simulation of GitHub Actions

## slices

- global_gate: none

### S1 — A rehearsal's every ref lives under its own namespace
- **Status**: review
- **Files**: `plugins/integration/src/lib/services/rehearsal-setup.helper.ts`, `new:plugins/integration/tests/src/lib/services/rehearsal-namespace.spec.ts`
- **Gate**: none
- **Decisions**: rehearsalPolicy sets namespacePrefix to the run root, so batch and repair prefixes sit under <ns>/rehearsal/<run>/queue/ and never under the real <ns>/queue/
- acceptance:
  - "rehearsal-namespace.spec.ts resolves the policy a rehearsal writes and passes it to landConfigFromPolicy: batchPrefix and landRepairPrefix start with <ns>/rehearsal/<run>/, and neither starts with the real queue or pr prefix [<50ms]"
  - "rehearsal-namespace.spec.ts expects every ref a rehearsal names (integration, head, batch, repair) to start with <ns>/rehearsal/<run>/ [<50ms]"
- shipped-in: `615c4d2e1fac`
- review-state: in_review
- review-implementer: claude-sonnet-5-5

### S2 — PR-triggered rehearsal runs in process; the real forge only on dispatch or a land-engine merge, always cleaned
- **Status**: review
- **Files**: `plugins/integration/src/lib/services/rehearsal-ci-workflow.helper.ts`, `plugins/integration/src/lib/services/rehearsal-groups-workflow.helper.ts`, `plugins/integration/src/lib/contracts/constants/rehearsal.constant.ts`, `plugins/integration/tests/src/lib/services/rehearsal-workflow.spec.ts`, `.github/workflows/rehearsal.yml`
- **Gate**: none
- **Decisions**: a pull_request run executes the in-process land specs against the fake world; the real-forge jobs run only on workflow_dispatch or on a push to the integration branch touching packages/core/src/lib/integration/land/** or plugins/integration/src/**
- acceptance:
  - "rehearsal-workflow.spec.ts expects the PR-mode plan to hold no real forge step: no identity token, no integration rehearse, no gh call [<50ms]"
  - "rehearsal-workflow.spec.ts expects a cleanup job with if: always() that sweeps the run after a failed or cancelled play [<50ms]"
  - "rehearsal-workflow.spec.ts expects the committed .github/workflows/rehearsal.yml to equal the render, which is regenerated from the helper and never hand-edited [<50ms]"
- shipped-in: `d71e58c5ab53`
- review-state: in_review
- review-implementer: claude-sonnet-5-5

## acceptance

- rehearsal-namespace.spec.ts resolves the policy a rehearsal writes and passes it to landConfigFromPolicy: batchPrefix and landRepairPrefix start with <ns>/rehearsal/<run>/, and neither starts with the real queue or pr prefix [<50ms]
- rehearsal-namespace.spec.ts expects every ref a rehearsal names (integration, head, batch, repair) to start with <ns>/rehearsal/<run>/ [<50ms]
- rehearsal-workflow.spec.ts expects the PR-mode plan to hold no real forge step: no identity token, no integration rehearse, no gh call [<50ms]
- rehearsal-workflow.spec.ts expects a cleanup job with if: always() that sweeps the run after a failed or cancelled play [<50ms]
- rehearsal-workflow.spec.ts expects the committed .github/workflows/rehearsal.yml to equal the render, which is regenerated from the helper and never hand-edited [<50ms]
