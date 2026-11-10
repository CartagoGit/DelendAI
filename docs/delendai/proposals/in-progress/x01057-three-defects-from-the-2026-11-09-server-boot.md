---
id: x01057
title: "Three defects from the 2026-11-09 server boot"
kind: fix
status: in-progress
type: proposal
track: general
date: 2026-11-09
last-transition-id: e2843f76-14b2-493c-8f5e-8c3977bb5a71
last-correlation-id: e2843f76-14b2-493c-8f5e-8c3977bb5a71
last-transition-from: ready
last-transition-at: 2026-11-09T23:03:06.050Z
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

### S5 — The launcher reaches its fallback from a deleted directory
- **Status**: pending
- **Files**: `packages/cli/src/lib/alias/alias-manager.ts`, `packages/cli/src/lib/alias/alias-manager.spec.ts`
- **Gate**: type
- acceptance:
  - "With an empty or relative PWD, as a hook started in a deleted directory sees it, the POSIX launcher walks from / and reaches its fallback instead of looping on dirname forever."
  - "A spec runs the rendered launcher in bash with an empty PWD and sees it reach the fallback."

### S6 — review next fits its queue request in the response budget
- **Status**: pending
- **Files**: `packages/cli/src/commands/review.command.ts`
- **Gate**: type
- acceptance:
  - "With 25 proposals and 58 slices in review, review next hands out a pack instead of failing with response-too-large; it asks for the queue in pages or without detail."

### S7 — A claim that times out reports what actually happened
- **Status**: pending
- **Files**: `plugins/proposals/src/lib/services/review-claim.service.ts`
- **Gate**: type
- acceptance:
  - "When a review claim's git call times out under load, the tool checks whether the claim commit landed and reports the claim as held when it did, instead of 'Could not claim'."

### S8 — A failed proof step keeps its whole output
- **Status**: pending
- **Files**: `tools/scripts/ci/prove-plan.script.ts`, `tools/scripts/ci/prove-plan.script.spec.ts`
- **Gate**: type
- acceptance:
  - "Every step a proof runs that fails writes its whole output to a file of its own under .cache/delendai/results/logs/prove-failed/, and the proof names that file among its causes, so a failure seen once can be read again: the cause lines name a failing test without its assertion, and a caller keeps only the tail of the proof."

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

## notes

- 2026-11-09: S1 needed no code change. `createMaintenanceLease` already treats a lease held by a dead pid on this host as free (`live()` checks `isAlive`), and the spec "passes at once when the holder process on this machine is gone" proves it. So pid 1764375 was alive when the boot log named it: it was a second, real server. What remains is that two servers ran at all, which f00813 (branch-following runtime) and the extension's single launch address.

- (a) The lease code is `packages/core/src/lib/development-policy/maintenance-lease.service.ts`; the message came from `createMaintenanceGate` and `observeMaintenance`.
- (b) Both `work-unit-prove.service.ts` and `work-unit-publish.service.ts` resolve the agent with `agentFor` but call the proof service, which labels the slot from the environment variable alone; a caller that passed `--agent` without the variable was labelled unidentified.
- (c) The spec is `packages/core/tests/src/lib/shared/compute-slot.service.spec.ts`; the children were `bun -e` scripts looping on `setImmediate` until a release file appeared.
