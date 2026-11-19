---
id: x01102
title: "Land rehearsals run here without touching ordinary work"
kind: fix
status: ready
type: proposal
track: trust
date: 2026-11-19
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
- **Status**: pending
- **Files**: `plugins/integration/src/lib/services/rehearsal-setup.helper.ts`, `plugins/integration/tests/src/lib/services/rehearsal-namespace.spec.ts`
- **Gate**: none
- **Decisions**: none
- acceptance:
  - "Decision: rehearsalPolicy, given a run id, sets development.branches.namespacePrefix to the run root without its trailing slash, so the land config of the rehearsal branch takes its batch prefix and repair prefix from <ns>/rehearsal/<run>/queue/ and never from the real <ns>/queue/"
  - "A spec resolves the policy a rehearsal writes and passes it to landConfigFromPolicy: batchPrefix and landRepairPrefix start with <ns>/rehearsal/<run>/, and neither starts with the real queue or pr prefix [<50ms]"
  - "A spec expects every ref a rehearsal names (integration, head, batch, repair) to start with <ns>/rehearsal/<run>/ [<50ms]"

### S2 — PR-triggered rehearsal runs in process; the real forge only on dispatch or a land-engine merge, always cleaned
- **Status**: pending
- **Files**: `plugins/integration/src/lib/services/rehearsal-ci-workflow.helper.ts`, `plugins/integration/src/lib/services/rehearsal-groups-workflow.helper.ts`, `plugins/integration/src/lib/services/rehearsal-trigger.helper.ts`, `plugins/integration/src/lib/contracts/constants/rehearsal.constant.ts`, `plugins/integration/tests/src/lib/services/rehearsal-workflow.spec.ts`, `plugins/integration/tests/src/lib/services/rehearsal-trigger.helper.spec.ts`, `.github/workflows/rehearsal.yml`
- **Gate**: none
- **Decisions**: none
- acceptance:
  - "Decision: a pull_request run executes the in-process land specs against the fake world (no GitHub token minted, no integration rehearse call); the real-forge plan, play and report jobs run only on workflow_dispatch or on a push to the integration branch whose paths are packages/core/src/lib/integration/land/** or plugins/integration/src/**"
  - "A spec expects the PR-mode plan to hold no real forge step: no identity token, no integration rehearse, no gh call [<50ms]"
  - "A spec expects a cleanup job with if: always() that sweeps the run after a failed or cancelled play [<50ms]"
  - "A spec expects the committed .github/workflows/rehearsal.yml to equal the render, which is regenerated from the helper and never hand-edited [<50ms]"

## acceptance

- Decision: rehearsalPolicy, given a run id, sets development.branches.namespacePrefix to the run root without its trailing slash, so the land config of the rehearsal branch takes its batch prefix and repair prefix from <ns>/rehearsal/<run>/queue/ and never from the real <ns>/queue/
- A spec resolves the policy a rehearsal writes and passes it to landConfigFromPolicy: batchPrefix and landRepairPrefix start with <ns>/rehearsal/<run>/, and neither starts with the real queue or pr prefix [<50ms]
- A spec expects every ref a rehearsal names (integration, head, batch, repair) to start with <ns>/rehearsal/<run>/ [<50ms]
- Decision: a pull_request run executes the in-process land specs against the fake world (no GitHub token minted, no integration rehearse call); the real-forge plan, play and report jobs run only on workflow_dispatch or on a push to the integration branch whose paths are packages/core/src/lib/integration/land/** or plugins/integration/src/**
- A spec expects the PR-mode plan to hold no real forge step: no identity token, no integration rehearse, no gh call [<50ms]
- A spec expects a cleanup job with if: always() that sweeps the run after a failed or cancelled play [<50ms]
- A spec expects the committed .github/workflows/rehearsal.yml to equal the render, which is regenerated from the helper and never hand-edited [<50ms]
