---
id: f00816
title: "A session compacts itself before its context gets expensive, on any host and model, and loses nothing it needs"
kind: feat
status: ready
type: proposal
track: general
date: 2026-11-12
---

# f00816 — A session compacts itself before its context gets expensive, on any host and model, and loses nothing it needs

## goal

Minimum total cost per correct, integrated, verified result, on any host and any model. A session compacts itself before its context turns expensive and loses nothing it needs, because everything it needs is rebuilt from delendai's own stores, never from a model summary. Work goes to the cheapest capable model tier under a closed contract, every spend is bounded and recorded, and what a host cannot technically guarantee is stated plainly. Everything is policy-driven and host-neutral; host specifics are adapters.

## why

Owner, 2026-11-12. Cost is driven by long expensive contexts, wrong-tier models, workers that redesign or widen scope, repeated work and sessions resumed from lossy summaries. Most pieces exist; the gaps are the policy that binds them. Complements f00815 (cache lifetime, wake-ups) and x00977 (tokens per accepted task); it duplicates neither.

### Inventory: already covered / missing

| Requirement | Covered by (verified paths) | Missing |
|---|---|---|
| Cheapest capable provider, ladder | `plugins/auto-agent-selector/src/lib/routing/rank-providers.ts`, `plugins/auto-agent-selector/src/lib/escalate/build-ladder.ts`, `plugins/auto-agent-selector/src/lib/routing/task-mode.service.ts` | Task-class to tier policy from config; blocker instead of auto-escalation (`escalate/run-with-escalation.ts` escalates automatically); explicit owner authorization for the top tier |
| Model requested vs model used | `plugins/orchestrator-runner/src/lib/services/invocation-journal.service.ts`, `plugins/usage-tracking/src/lib/services/invocation-recorder.service.ts` | Check that the recorded model equals the requested one |
| Worker gets a bounded task | `plugins/orchestrator-runner/src/lib/invoke/task-pack.service.ts`, `plugins/orchestrator-runner/src/lib/invoke/task-pack-budget.service.ts`, `plugins/agent-orchestrator/src/lib/dispatch/delegation-manifest.service.ts` | One closed-contract template (authorized files, invariants, stop conditions, no redesign or sub-agents) |
| Isolation per unit | `packages/core/src/lib/work-units/work-unit-enter.service.ts`, `packages/core/src/lib/work-units/work-unit-claim.service.ts` | none |
| Unit, proposal and evidence state | `packages/core/src/lib/work-units/work-unit.service.ts`, `packages/proposals-sqlite/src/lib/work-model`, `packages/core/src/lib/context-store/file-artifact-store.ts` | A single handover index over them |
| Session handover before and after compaction | `plugins/usage-tracking/src/lib/services/checkpoint-advisory.service.ts` (advice only), `docs/delendai/host-appendices/claude-code.md` (prose) | Persisted handover, bounded re-injection, selective retrieval, rebuild from stores |
| Compaction threshold per host | `packages/core/src/lib/hosts/host-capability-profile.ts`, `packages/core/src/lib/hosts/agent-renderers.helper.ts` | One policy value rendered per host (env, hooks, native setting, MCP directive) |
| Token budgets per agent | `plugins/agent-orchestrator/src/lib/budget/budget-tracker.ts`, `plugins/orchestrator-runner/src/lib/invoke/spend-guard.ts` | Per-task budgets; limits on calls, turns, retries, concurrency |
| Ledger of model, tokens, cache, result | `plugins/usage-tracking/src/lib/services/usage-rollup.service.ts`, `plugins/usage-tracking/src/lib/services/delegation-rollup.service.ts`, `plugins/orchestrator-runner/src/lib/services/quota-ledger.helper.ts` | Cost per correctly completed task; cache fields per invocation |
| Duplicate-work detection | `packages/core/src/lib/work-units/work-unit-claim.service.ts` (file claims) | Detection of equivalent work across units; reuse of still-valid proofs (`packages/core/src/lib/work-units/work-unit-proof.service.ts` records them) |
| Stop on no progress | none | No-progress stop |
| Cache lifetime and wake-ups | f00815 (ready) | Out of scope here |

## non-goals

- No new plugin or store: every slice extends the module named in the inventory.
- No claim of what a host cannot guarantee; S5 states it per host.
- Does not duplicate f00815 (cache lifetime) or x00977 (tokens per accepted task).
- No forced single model and no automatic escalation to a stronger model.

## slices

- global_gate: lint

### S1 — Model-selection policy from config
- **Status**: pending
- **Extends**: `plugins/auto-agent-selector` (`routing/task-mode.service.ts`, `escalate/run-with-escalation.ts`)
- **Files**: `plugins/auto-agent-selector/src/lib/routing/task-class-tier.service.ts`, `plugins/auto-agent-selector/src/lib/escalate/run-with-escalation.ts`, `plugins/auto-agent-selector/tests/src/lib/routing/task-class-tier.service.spec.ts`
- **Gate**: type
- acceptance:
  - "Config maps task class to tier: mechanical to the small tier, multi-file coding and debugging to the mid tier, architecture and blockers to the top tier only when an explicit owner authorization is present; no single model is forced."
  - "A worker that needs more capacity returns a blocker; nothing escalates automatically."
  - "The model actually used is recorded and a mismatch with the requested one is reported."

### S2 — Closed worker contract
- **Status**: pending
- **DependsOn**: [S1]
- **Extends**: `plugins/orchestrator-runner/src/lib/invoke/task-pack.service.ts`
- **Files**: `plugins/orchestrator-runner/src/lib/invoke/task-pack.service.ts`, `plugins/orchestrator-runner/tests/src/lib/invoke/task-pack.service.spec.ts`
- **Gate**: type
- acceptance:
  - "One generated template carries objective, authorized files, interfaces and expected behaviour, invariants, dependencies, acceptance criteria, exact tests, budget and limits, and stop conditions."
  - "The worker receives only that contract and is told it cannot redesign, widen scope or launch agents; each contract is bound to one isolated unit."
  - "A contract missing a section is refused."

### S3 — Session handover from delendai's own stores
- **Status**: pending
- **Extends**: `packages/core/src/lib/work-units/work-unit.service.ts`, `plugins/usage-tracking/src/lib/services/checkpoint-advisory.service.ts`
- **Files**: `packages/core/src/lib/work-units/session-handover.service.ts`, `packages/core/tests/src/lib/work-units/session-handover.service.spec.ts`
- **Gate**: type
- acceptance:
  - "Before compaction the handover is persisted from the stores: invariants, decisions with reasons, unit states, pending and done work, branches, commits, PRs, evidence, test results, known errors and blockers."
  - "After compaction a bounded index is re-injected and details are fetched selectively on demand."
  - "A resumed session rebuilds from the stores, never from a model summary; missing information is fetched from its source, never invented."

### S4 — Compaction threshold rendered per host from one policy
- **Status**: pending
- **DependsOn**: [S3]
- **Extends**: `packages/core/src/lib/hosts/agent-renderers.helper.ts`, `packages/core/src/lib/hosts/host-capability-profile.ts`
- **Files**: `packages/core/src/lib/hosts/compaction-policy.helper.ts`, `packages/core/src/lib/hosts/agent-renderers.helper.ts`, `packages/core/tests/src/lib/hosts/compaction-policy.helper.spec.ts`
- **Gate**: type
- acceptance:
  - "One policy value renders per host: Claude Code gets CLAUDE_AUTOCOMPACT_PCT_OVERRIDE plus PreCompact and SessionStart hooks that run S3."
  - "A host with a native setting gets it; any other host gets a compact-now directive from the MCP server."

### S1b — Task-class tier policy wired to plugin config
- **Status**: pending
- **DependsOn**: [S1]
- **Extends**: `plugins/auto-agent-selector` (`index.ts` options schema)
- **Files**: `plugins/auto-agent-selector/src/index.ts`, `plugins/auto-agent-selector/src/lib/tools/auto-run.tool.ts`, `plugins/auto-agent-selector/src/lib/routing/task-class-tier.service.ts`, `plugins/auto-agent-selector/tests/src/index.spec.ts`, `plugins/auto-agent-selector/tests/src/lib/tools/auto-run.tool.spec.ts`
- **Gate**: type
- acceptance:
  - "The plugin options carry `taskClassTiers` and `ownerAuthorizedTopTier`; `auto_run` caps the ladder at the tier of the task class and returns a blocker when the top tier lacks the owner authorization."

### S5a — Ledger record and cost per correct result
- **Status**: pending
- **DependsOn**: [S1]
- **Extends**: `plugins/usage-tracking/src/lib/services/usage-rollup.service.ts`
- **Files**: `plugins/usage-tracking/src/lib/contracts/interfaces`, `plugins/usage-tracking/src/lib/services/usage-rollup.service.ts`, `plugins/usage-tracking/src/lib/services/usage-rollup-helpers.helper.ts`, `plugins/usage-tracking/tests/src/lib/services/usage-rollup.service.spec.ts`
- **Gate**: type
- acceptance:
  - "One invocation record holds requested model, real model, tokens in, out, cache read and cache write, wall time, turns, retries, task class and an outcome (correct, blocked or failed) set from a gate result, never self-reported."
  - "The rollup reports cost per correct result by task class and model, with the sample count."
  - "Records without the new fields still read."

### S5b — Cost limits and the no-progress stop
- **Status**: pending
- **DependsOn**: [S1]
- **Extends**: `plugins/agent-orchestrator/src/lib/budget/budget-tracker.ts`
- **Files**: `plugins/agent-orchestrator/src/lib/policy/types.ts`, `plugins/agent-orchestrator/src/lib/policy/policy.ts`, `plugins/agent-orchestrator/src/lib/budget/budget-tracker.ts`, `plugins/agent-orchestrator/tests/src/lib/budget/budget-tracker.spec.ts`
- **Gate**: type
- acceptance:
  - "The budget policy limits calls, turns, retries and concurrency; exceeding one returns a blocker naming the limit."
  - "A run with N consecutive turns and no progress signal stops, using the progress signal the orchestrator already has."

### S5c — Proof reuse and duplicate-work detection
- **Status**: pending
- **DependsOn**: [S5a]
- **Extends**: `packages/core/src/lib/work-units/work-unit-proof.service.ts`
- **Files**: `packages/core/src/lib/work-units/work-unit-proof.service.ts`
- **Gate**: type
- acceptance:
  - "Duplicate work is detected across units and a still-valid result or proof is reused."
  - "The report states what cannot be technically guaranteed on each host."

## acceptance

- Every inventory row names an existing module or an explicit gap, and each gap is owned by one slice.
- Each slice extends the named module and passes its own gate.
- A session killed mid-task resumes from the stores with no loss of invariants, decisions, unit states or evidence.
