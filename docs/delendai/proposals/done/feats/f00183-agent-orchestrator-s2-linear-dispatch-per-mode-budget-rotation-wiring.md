---
id: f00183
title: "agent-orchestrator S2 — linear dispatch + per-mode budget + rotation wiring"
kind: feat
status: done
type: proposal
track: agent-orchestrator
date: 2026-08-26
date_iso: 2026-08-26
mode: general
parent-plan: q00007
author: mcp-vertex-orchestrator (MiniMax M3, agent mode)
---
# f00183 — `agent-orchestrator` S2

## Goal

Make the linear plan actually execute. The dispatcher honours
`dependsOn`, runs each `spawn` step through a host-injected
`IDispatchPort`, and rotates subagents when the `LoopDetector`
fires. A two-pass acceptance rule guarantees a single observation
isn't mistaken for a clean run while still letting the happy path
through in three subagents (warmup + baseline + acceptance).

## Why

Without S2, the plugin is a planner with no actuator. The user
explicitly asked for mid-task rotation when a subagent goes off
rails — that's the core S2 feature.

## Acceptance

- `LinearDispatcher` enforces `IBudgetPolicy` (orchestrator +
  per-subagent caps, `0` = unlimited).
- `LoopDetector` keys per `slotId` so rotations don't lose context.
- `repeated-output` fires on the **A,B,A** pattern (reverted loop),
  not on A,A,A (stable confirmation).
- `error-storm` fires on 3+ errors in the last 5 observations.
- `schema-violation` fires on the last step's `schemaOk === false`.
- Forbids rotations whose reason isn't in the policy's `allow[]`
  (fail-closed).
- 64 tests passing across the plugin.

## Files added

```
src/lib/dispatch/contracts.ts            # IDispatchPort, IPlanOutcome
src/lib/dispatch/linear-dispatcher.ts     # the executor
src/lib/dispatch/fake-port.ts            # deterministic port for tests
src/lib/tools/dispatch.tool.ts           # <ns>_dispatch / _budget / _plan_ref
tests/src/lib/dispatch/linear-dispatcher.spec.ts  # 6 tests
```

## non-goals

- Swarm parallel dispatch (S3 — punted to a follow-up; the
  contract is in place, the runtime is not).
- Mid-task rotation telemetry (S4 covers).
- Auto dogfooding (S5).
