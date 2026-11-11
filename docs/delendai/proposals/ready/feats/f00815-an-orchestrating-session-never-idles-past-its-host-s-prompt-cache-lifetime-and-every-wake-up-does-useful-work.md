---
id: f00815
title: "An orchestrating session never idles past its host's prompt-cache lifetime, and every wake-up does useful work"
kind: feat
status: ready
type: proposal
track: general
date: 2026-11-09
---

# f00815 — An orchestrating session never idles past its host's prompt-cache lifetime, and every wake-up does useful work

## goal

A session that delegates work and then waits must wake before its host's prompt cache expires, and the wake-up must carry the next useful task, never an empty check. Each host declares or detects its cache lifetime (TTL); the product tracks outstanding delegated work per session, schedules one wake-up at a safety margin before the TTL, and fills that wake-up from the work queue. Event-driven completion (agent and forge events) stays the primary wake signal; the keep-warm wake-up is only the fallback when nothing happened for close to the TTL. Cache hits, misses, cost avoided and idle gaps over the TTL are measured and related to tokens per accepted task.

## why

Owner, 2026-11-09. LLM hosts cache the conversation prompt for a limited time after the last request (about 1 h on Claude Code, often 5 min elsewhere). An orchestrator that delegates and waits idle longer loses the cache: its next turn re-writes the whole context (hundreds of thousands of tokens) at cache-write price instead of a cheap cached read. The owner saw an orchestrator idle 50+ minutes. The Claude Code host appendix states the rule in prose only. The owner also rejects empty 'still waiting' turns: while subagents run the orchestrator must advance other unfinished proposals, improvements, optimisations or reviews. Builds on the agent-orchestrator, orchestrator-runner, notification and usage-tracking plugins, on f00814 (forge events, no polling) and on x00977 (tokens per accepted task); it duplicates none of them. Generic: any project, any host, policy-driven.

## non-goals

- No polling loop of session or queue state: one wake-up per session.
- No host-specific behaviour in core: the host profile declares the TTL, the host's native mechanism is an adapter.
- Does not replace event-driven completion (f00814); it is the fallback.
- Does not measure the host's private cache meter; it records what delendai can observe (turn gaps and declared TTL).

## slices

- global_gate: lint

### S1 — Host profile declares the prompt-cache TTL (detected or declared, policy-overridable)
- **Status**: pending
- **Files**: `plugins/orchestrator-runner/src/lib/contracts/interfaces/host-cache-ttl.interface.ts`, `plugins/orchestrator-runner/src/lib/services/host-cache-ttl.service.ts`, `plugins/orchestrator-runner/tests/src/lib/services/host-cache-ttl.service.spec.ts`
- **Gate**: type
- acceptance:
  - "A host profile exposes cacheTtlMs; defaults are 1 h for Claude Code and 5 min for an unknown or other host."
  - "A project policy value overrides the default and an invalid value is refused with a reason naming the key."
  - "The resolved TTL reports its source (declared, detected, policy, default)."
  - "The spec names its max time and uses no real timers."

### S2 — Outstanding-work tracker and one keep-warm wake-up per session
- **Status**: pending
- **DependsOn**: [S1]
- **Files**: `plugins/agent-orchestrator/src/lib/dispatch/outstanding-work-tracker.service.ts`, `plugins/agent-orchestrator/src/lib/dispatch/keep-warm-scheduler.service.ts`, `plugins/agent-orchestrator/src/lib/contracts/interfaces/keep-warm-wakeup.interface.ts`, `plugins/agent-orchestrator/tests/src/lib/dispatch/outstanding-work-tracker.service.spec.ts`, `plugins/agent-orchestrator/tests/src/lib/dispatch/keep-warm-scheduler.service.spec.ts`
- **Gate**: type
- acceptance:
  - "While a session has outstanding delegated work (subagents, proofs, CI) exactly one wake-up is scheduled at TTL minus a policy margin (default 15 %)."
  - "Any agent or forge event, or any turn, re-arms the single wake-up; nothing scheduled while no work is outstanding."
  - "The host's native mechanism is used through an injected port; the fallback is a single timer."
  - "No polling loop exists: the spec proves no timer is armed twice for one session."

### S3 — Next-task picker fills each wake-up with useful work
- **Status**: pending
- **DependsOn**: [S2]
- **Files**: `plugins/agent-orchestrator/src/lib/dispatch/next-useful-task-picker.service.ts`, `plugins/agent-orchestrator/tests/src/lib/dispatch/next-useful-task-picker.service.spec.ts`
- **Gate**: type
- acceptance:
  - "The picker returns, in a policy-set order, the next ready slice not overlapping running agents, a review waiting, a red PR to fix, or a defect to file, taken from the work queue."
  - "The wake-up payload names that task; an empty queue yields an explicit idle-justified result rather than a bare check."
  - "A slice whose files overlap a running agent is never returned."

### S4 — Cache metrics: hits, misses, cost avoided and idle gaps over the TTL
- **Status**: pending
- **DependsOn**: [S2]
- **Files**: `plugins/usage-tracking/src/lib/services/cache-keepwarm-metrics.service.ts`, `plugins/usage-tracking/tests/src/lib/services/cache-keepwarm-metrics.service.spec.ts`, `plugins/project-kpis/src/lib/services/cache-keepwarm-kpi.service.ts`, `plugins/project-kpis/tests/src/lib/services/cache-keepwarm-kpi.service.spec.ts`
- **Gate**: type
- acceptance:
  - "Per session: cache hits, misses, idle gaps over the TTL and estimated cost avoided are recorded."
  - "The KPI report relates them to tokens per accepted task as defined by x00977, stating the baseline."
  - "A session with no observable TTL reports unknown rather than zero."

### S5 — Docs and skills: orchestrator playbook and host appendix state the mechanical rule
- **Status**: pending
- **DependsOn**: [S3, S4]
- **Files**: `docs/delendai/host-appendices/claude-code.md`, `plugins/orchestrator-runner/skills/delendai-orchestrator-runner-playbook/SKILL.md`
- **Gate**: lint
- acceptance:
  - "The Claude Code appendix points to the host-profile TTL and the product wake-up instead of restating the rule in prose."
  - "The playbook tells the orchestrator to use each wake-up on the task the product names, and not to end a turn with an empty wait."
  - "Size budgets of the bootstrap and skills still pass."

## acceptance

- A host profile exposes cacheTtlMs; defaults are 1 h for Claude Code and 5 min for an unknown or other host.
- A project policy value overrides the default and an invalid value is refused with a reason naming the key.
- The resolved TTL reports its source (declared, detected, policy, default).
- The spec names its max time and uses no real timers.
- While a session has outstanding delegated work (subagents, proofs, CI) exactly one wake-up is scheduled at TTL minus a policy margin (default 15 %).
- Any agent or forge event, or any turn, re-arms the single wake-up; nothing scheduled while no work is outstanding.
- The host's native mechanism is used through an injected port; the fallback is a single timer.
- No polling loop exists: the spec proves no timer is armed twice for one session.
- The picker returns, in a policy-set order, the next ready slice not overlapping running agents, a review waiting, a red PR to fix, or a defect to file, taken from the work queue.
- The wake-up payload names that task; an empty queue yields an explicit idle-justified result rather than a bare check.
- A slice whose files overlap a running agent is never returned.
- Per session: cache hits, misses, idle gaps over the TTL and estimated cost avoided are recorded.
- The KPI report relates them to tokens per accepted task as defined by x00977, stating the baseline.
- A session with no observable TTL reports unknown rather than zero.
- The Claude Code appendix points to the host-profile TTL and the product wake-up instead of restating the rule in prose.
- The playbook tells the orchestrator to use each wake-up on the task the product names, and not to end a turn with an empty wait.
- Size budgets of the bootstrap and skills still pass.
