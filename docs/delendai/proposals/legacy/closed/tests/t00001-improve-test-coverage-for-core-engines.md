---
id: t00001
status: done
type: proposal
track: testing
date: 2026-06-22
kind: test
closed-by: cartago (consolidated evidence pass 2026-07-26)
closed-evidence:
  - 1 commits referencing t00001 recovered from git log --grep (precedes convention)
  - all declared Files verified to exist via 1-commit batch
shipped-in:
  - 5f869793 # fix(t00001-S3): correct IRoundContextSourceState literal in resume spec

archived-on: 2026-08-24
---

# t00001 — Improve test coverage for core engines

## Goal

Increase unit test coverage for agent-lock-engine.ts, sync-proposal-registry.ts, and round-context sub-modules to meet the requirement of >=3 specs per engine and ensure isolated testing (Audit findings H2, H3, H4).

## Slices

- global_gate: none

### S1 — Add tests for agent-lock-engine
- files: plugins/proposals/src/lib/locks/agent-lock-engine.ts
- files: plugins/proposals/tests/agent-lock-engine.spec.ts
- gate: none
- acceptance:
  - "bun run test"
- status: done

### S2 — Add tests for sync-proposal-registry
- files: plugins/proposals/src/lib/proposals/sync-proposal-registry.ts
- files: plugins/proposals/tests/sync-proposal-registry.spec.ts
- gate: none
- acceptance:
  - "bun run test"
- status: done

### S3 — Add tests for round-context sub-modules
- files: plugins/proposals/src/lib/swarm/round-context.ts
- files: plugins/proposals/tests/round-context.spec.ts
- gate: none
- acceptance:
  - "bun run test"
- status: done
