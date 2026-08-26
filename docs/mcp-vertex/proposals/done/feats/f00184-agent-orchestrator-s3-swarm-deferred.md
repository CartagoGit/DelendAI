---
id: f00184
title: "agent-orchestrator S3 — swarm parallel dispatch (deferred to follow-up)"
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
# f00184 — `agent-orchestrator` S3 (deferred)

## Status

S3 was punted to a follow-up. The contract (`IPlanStep.kind === "join"`)
is in place; S1's `SwarmModeAdapter` returns the canonical
5-step plan; S2's `IDispatchPort` is a stable seam. The runtime
swarm executor was not implemented in this session.

## Why deferred

The user wanted the four-mode policy engine end-to-end, and S2's
linear runtime is enough to validate the rotation policy, the
budget tracker, and the dispatcher/detector contract. A parallel
executor needs real concurrency primitives (the test harness would
race), and serializing concurrent subagent results through
`IDispatchPort` while keeping the join step deterministic is best
done as its own slice (with its own proposal).

## What a follow-up will deliver

- A `SwarmDispatcher` that runs `SwarmModeAdapter` steps 2 and 3
  concurrently via `Promise.all`, then `join`s their results into a
  single coherent merged plan.
- Mid-swarm rotation: when a parallel slice's `LoopDetector` fires,
  spawn a single replacement for that slice only (not the whole
  swarm).
- Schema-violation dedupe: when a slice's `outputSchema` fails, the
  join step merges the validated sibling slices and surfaces a
  structured error for the failed one.
- Smoke that drives 5+ concurrent subagents over `FakeDispatchPort`
  with a forced `repeated-output` on one slice.
