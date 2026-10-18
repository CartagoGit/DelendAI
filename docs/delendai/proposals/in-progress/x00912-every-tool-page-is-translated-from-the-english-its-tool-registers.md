---
id: x00912
title: "Every tool page is translated from the English its tool registers"
kind: fix
status: in-progress
type: proposal
track: general
date: 2026-10-18
last-transition-id: 128fa125-b488-4e2c-a826-a1840dc1a15f
last-correlation-id: 128fa125-b488-4e2c-a826-a1840dc1a15f
last-transition-from: ready
last-transition-at: 2026-10-18T04:21:42.084Z
---

# x00912 — Every tool page is translated from the English its tool registers

## goal

Every tool page on the site shows, in each of its twelve languages, the description the tool registers in its code. When this is done the stale-translation baseline of `gen-capabilities` is empty and gone, and `--strict` fails on any tool whose translations were made from an English other than its registration's.

## why

x00910 S2 made a tool's registration the single source of its long description: the site's English is read from it, and the i18n catalogue's `en` (under `apps/web/src/i18n/tools/`) records the English its translations were made from. Measured 2026-10-18, 56 tools have translations made from an English their code no longer registers, so in eleven languages their pages describe an older tool. They were recorded in `apps/web/scripts/stale-translations.baseline.json` so the check could fail on new drift without failing on old; this proposal pays that debt.

By plugin: proposals 15, external-mcps 7, orchestrator-runner 7, logs 4, memory 4, core 3, rules 3, audit 2, docs 2, usage-tracking 2, and one each for agent-orchestrator, analyze, deps, notification, plan, quality and search.

## non-goals

- Changing any tool's registered description: the code is the source; only the catalogue follows it.
- Translating tools that have no catalogue entry yet.

## slices

- global_gate: type

### S1 — The proposals tools

- **Status**: review
- **Files**:
  - `apps/web/src/i18n/tools/delendai_proposals_agent_worktree.ts`
  - `apps/web/src/i18n/tools/delendai_proposals_auto_work.ts`
  - `apps/web/src/i18n/tools/delendai_proposals_branch_gc.ts`
  - `apps/web/src/i18n/tools/delendai_proposals_branch_status.ts`
  - `apps/web/src/i18n/tools/delendai_proposals_close_slice.ts`
  - `apps/web/src/i18n/tools/delendai_proposals_compact_status.ts`
  - `apps/web/src/i18n/tools/delendai_proposals_get_proposal_workflow.ts`
  - `apps/web/src/i18n/tools/delendai_proposals_proposal_adopt.ts`
  - `apps/web/src/i18n/tools/delendai_proposals_proposal_board.ts`
  - `apps/web/src/i18n/tools/delendai_proposals_proposal_force_transition.ts`
  - `apps/web/src/i18n/tools/delendai_proposals_proposal_review.ts`
  - `apps/web/src/i18n/tools/delendai_proposals_state_health.ts`
  - `apps/web/src/i18n/tools/delendai_proposals_swarm_hygiene.ts`
  - `apps/web/src/i18n/tools/delendai_proposals_sync_proposals.ts`
  - `apps/web/src/i18n/tools/delendai_proposals_task_queue.ts`
  - `apps/web/scripts/stale-translations.baseline.json`
- **Gate**: type
- acceptance:
  - "The 15 proposals tools in the baseline carry, in their catalogue entry, `en` equal to their registration's description and eleven translations made from it; they leave the baseline (56 → 41), and `gen-capabilities --strict` passes."
  - "Found on the way: `agent_worktree` registers a description rendered from the project's development profile, so the site shows the one the harvest's scratch project gets (`shared-checkout-merge`) and calls it 'this project'. Translated as registered; a site page that states one profile's flow is a defect of its own, left for the slice that owns the site's tool pages to raise."
- review-state: in_review
- review-implementer: claude-opus-5-5

### S2 — The orchestration tools

- **Status**: review
- **Files**:
  - `apps/web/src/i18n/tools/external-mcps/delendai_external-mcps_ack.ts`
  - `apps/web/src/i18n/tools/external-mcps/delendai_external-mcps_call.ts`
  - `apps/web/src/i18n/tools/external-mcps/delendai_external-mcps_catalog.ts`
  - `apps/web/src/i18n/tools/external-mcps/delendai_external-mcps_status.ts`
  - `apps/web/src/i18n/tools/external-mcps/delendai_external-mcps_suggest.ts`
  - `apps/web/src/i18n/tools/external-mcps/delendai_external-mcps_validate_config.ts`
  - `apps/web/src/i18n/tools/external-mcps/delendai_external-mcps_verify_result.ts`
  - `apps/web/src/i18n/tools/orchestrator-runner/delendai_orchestrator-runner_advise_routing.ts`
  - `apps/web/src/i18n/tools/orchestrator-runner/delendai_orchestrator-runner_advise_spend.ts`
  - `apps/web/src/i18n/tools/orchestrator-runner/delendai_orchestrator-runner_bootstrap_providers.ts`
  - `apps/web/src/i18n/tools/orchestrator-runner/delendai_orchestrator-runner_discover_providers.ts`
  - `apps/web/src/i18n/tools/orchestrator-runner/delendai_orchestrator-runner_get_quota.ts`
  - `apps/web/src/i18n/tools/orchestrator-runner/delendai_orchestrator-runner_healthcheck_providers.ts`
  - `apps/web/src/i18n/tools/orchestrator-runner/delendai_orchestrator-runner_invoke.ts`
  - `apps/web/src/i18n/tools/usage-tracking/delendai_usage-tracking_usage_clear.ts`
  - `apps/web/src/i18n/tools/usage-tracking/delendai_usage-tracking_usage_report.ts`
  - `apps/web/scripts/stale-translations.baseline.json`
- **Gate**: type
- acceptance:
  - "The external-mcps (7), orchestrator-runner (7) and usage-tracking (2) tools in the baseline are translated from their registration's English and leave the baseline (41 → 25); `gen-capabilities --strict` passes."
- review-state: in_review
- review-implementer: claude-opus-5-5

### S3 — The rest, and no baseline

- **Status**: pending
- **Files**:
  - `apps/web/src/i18n/tools/`
  - `apps/web/scripts/stale-translations.baseline.json`
  - `apps/web/scripts/gen-capabilities.ts`
- **Gate**: type
- acceptance:
  - "The remaining 25 tools are translated from their registration's English; the baseline file is deleted with the code that reads it, so `--strict` fails on any stale translation."

## acceptance

- Every tool page reads, in every language, the description its tool registers.
- No baseline excuses a stale translation.
