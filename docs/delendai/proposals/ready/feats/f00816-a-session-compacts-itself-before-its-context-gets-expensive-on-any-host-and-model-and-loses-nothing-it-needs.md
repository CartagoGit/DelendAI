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

### S5 — Cost controls and honest guarantees
- **Status**: pending
- **DependsOn**: [S1]
- **Extends**: `plugins/agent-orchestrator/src/lib/budget/budget-tracker.ts`, `plugins/usage-tracking/src/lib/services/usage-rollup.service.ts`
- **Files**: `plugins/agent-orchestrator/src/lib/budget/budget-tracker.ts`, `plugins/agent-orchestrator/tests/src/lib/budget/budget-tracker.spec.ts`, `plugins/usage-tracking/src/lib/services/usage-rollup.service.ts`, `plugins/usage-tracking/tests/src/lib/services/usage-rollup.service.spec.ts`
- **Gate**: type
- acceptance:
  - "Token budgets per task and per agent; limits on calls, turns, retries and concurrency; a breach stops the work."
  - "The ledger holds real model, tokens, cache and result; a run with no progress stops; duplicate work is detected and a still-valid result or proof is reused."
  - "Cost per correctly completed task is reported."
  - "The report states what cannot be technically guaranteed on each host (for example a host that exposes no real model id or context meter)."

## acceptance

- Every inventory row names an existing module or an explicit gap, and each gap is owned by one slice.
- Each slice extends the named module and passes its own gate.
- A session killed mid-task resumes from the stores with no loss of invariants, decisions, unit states or evidence.
