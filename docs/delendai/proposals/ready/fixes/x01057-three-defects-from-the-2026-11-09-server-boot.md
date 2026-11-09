---
id: x01057
title: "Three defects from the 2026-11-09 server boot"
kind: fix
status: ready
type: proposal
track: general
date: 2026-11-09
---

# x01057 — Three defects from the 2026-11-09 server boot

## goal

A server takes over a maintainer lease held by a dead process, every compute-slot proof names its agent and the waiter reports each new holder, and the compute-slot spec leaves no process running.

## why

The 2026-11-09 boot showed three defects. A new server said another server maintains the workspace while that pid was dead, so nothing was maintained. The compute slot logged a proof by an unidentified agent, because a proof was started without the agent id. The compute-slot spec spawned children that busy-looped on setImmediate until a release file appeared; when the spec died, two children spun at 92% CPU for 44 hours.

## non-goals

- Changing how the compute slot orders waiters or its lanes.
- Making the maintainer lease cross-host: only a dead pid on the same host is taken over.

## slices

- global_gate: type

### S1 — A lease held by a dead pid on this host is taken over
- **Status**: pending
- **Files**: `packages/core/src/lib/development-policy/maintenance-lease.service.ts`, `packages/core/tests/src/lib/development-policy/maintenance-lease.service.spec.ts`
- **Gate**: type
- acceptance:
  - "A server that finds the maintainer lease held by a pid that is dead on the same host takes it over and says so once."
  - "A lease held by a live pid, or by another host, is never taken over."
  - "The refusal line never names a dead pid as the maintainer."

### S2 — Every proof names its agent and the waiter follows the holder
- **Status**: pending
- **Files**: `packages/core/src/lib/work-units/work-unit-proof.service.ts`, `packages/core/src/lib/work-units/work-unit-prove.service.ts`, `packages/core/src/lib/work-units/work-unit-publish.service.ts`
- **Gate**: type
- acceptance:
  - "The proof request carries the agent the work command already resolved (agentFor), which the proof label uses instead of reading DELENDAI_AGENT_ID; prove and publish both pass it, so no proof reads 'an unidentified agent' when the caller is identified."
  - "A proof with no agent at all fails the work command with the reason instead of being labelled unidentified."

### S3 — The compute-slot waiter re-prints when the holder changes
- **Status**: pending
- **Files**: `packages/core/src/lib/shared/compute-slot.service.ts`
- **Gate**: type
- acceptance:
  - "While a proof waits, a notice is printed when the holder changes, once per holder, and not again for the same holder."
  - "The notice still ends with 'got its turn' when the wait ends."

### S4 — The compute-slot spec leaves no child running and never busy-loops
- **Status**: pending
- **Files**: `packages/core/tests/src/lib/shared/compute-slot.service.spec.ts`
- **Gate**: type
- acceptance:
  - "A child exits when its parent dies or its /tmp/compute-slot-* directory disappears."
  - "A child waits for the release with fs.watch or an fd/IPC message from the parent, not a setImmediate loop; it uses no CPU while waiting."
  - "afterEach kills every child the spec spawned and the spec ends with none left."

## acceptance

- A server that finds the maintainer lease held by a pid that is dead on the same host takes it over and says so once.
- A lease held by a live pid, or by another host, is never taken over.
- The refusal line never names a dead pid as the maintainer.
- The proof request carries the agent the work command already resolved (agentFor), which the proof label uses instead of reading DELENDAI_AGENT_ID; prove and publish both pass it, so no proof reads 'an unidentified agent' when the caller is identified.
- A proof with no agent at all fails the work command with the reason instead of being labelled unidentified.
- While a proof waits, a notice is printed when the holder changes, once per holder, and not again for the same holder.
- The notice still ends with 'got its turn' when the wait ends.
- A child exits when its parent dies or its /tmp/compute-slot-* directory disappears.
- A child waits for the release with fs.watch or an fd/IPC message from the parent, not a setImmediate loop; it uses no CPU while waiting.
- afterEach kills every child the spec spawned and the spec ends with none left.
