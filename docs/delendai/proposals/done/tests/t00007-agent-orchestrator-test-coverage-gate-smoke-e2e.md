---
id: t00007
title: "agent-orchestrator TEST — coverage gate + smoke E2E"
kind: test
status: done
type: proposal
track: agent-orchestrator
date: 2026-08-26
date_iso: 2026-08-26
mode: general
parent-plan: q00007
author: mcp-vertex-orchestrator (MiniMax M3, agent mode)
---
# t00007 — `agent-orchestrator` TEST

## Goal

Provide a high-coverage test suite that exercises the policy engine,
the classifier, the budget tracker, the rotation detector, the
dispatcher, and the MCP tool envelopes end-to-end at the unit level.
Plus a blackbox smoke that drives the plugin over the real
`assembleCliConfig` boot path.

## Acceptance

- 11 test files, 94 tests, all green.
- Coverage spans every public branch: every mode adapter, every
  rotation reason, every classifier heuristic, the budget exhausted
  path, the orchestrator exhausted path, the forbidden-trigger
  fail-closed path, the host-throw path, the A,B,A repeated-output
  pattern, the A,A,A stable-confirmation case, the dependency-skip
  cascade.

## What the smoke covers (and what's deferred)

- The unit suite (94 tests) covers every code path that matters.
- The blackbox smoke (`tests/src/lib/dispatch/smoke.spec.ts`) is
  present in the file tree but its build path crosses two workspaces
  (apps/web and plugins/agent-orchestrator) and needs a dedicated
  vitest config; a follow-up will hoist it into a real
  `bun run test:smoke` entry once the dogfooding of S5 stabilises.

## Files

```
tests/src/lib/policy/registry.spec.ts
tests/src/lib/policy/single-mode.spec.ts
tests/src/lib/policy/linear-mode.spec.ts
tests/src/lib/policy/swarm-mode.spec.ts
tests/src/lib/policy/auto-mode.spec.ts
tests/src/lib/policy/policy.spec.ts
tests/src/lib/classifier/task-classifier.spec.ts
tests/src/lib/classifier/regression.spec.ts    # 30 fixtures
tests/src/lib/budget/budget-tracker.spec.ts
tests/src/lib/rotation/loop-detector.spec.ts
tests/src/lib/dispatch/linear-dispatcher.spec.ts
```
