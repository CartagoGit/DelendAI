---
id: x01057
title: "Three defects from the 2026-11-09 server boot"
kind: fix
status: review
type: proposal
track: general
date: 2026-11-09
last-transition-id: 8f2f8381-9124-4e77-afac-78f29519fc92
last-correlation-id: 8f2f8381-9124-4e77-afac-78f29519fc92
last-transition-from: in-progress
last-transition-at: 2026-11-10T02:41:56.200Z
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
- **Status**: review
- **Files**: `packages/core/src/lib/development-policy/maintenance-lease.service.ts`, `packages/core/tests/src/lib/development-policy/maintenance-lease.service.spec.ts`
- **Gate**: type
- acceptance:
  - "A server that finds the maintainer lease held by a pid that is dead on the same host takes it over and says so once."
  - "A lease held by a live pid, or by another host, is never taken over."
  - "The refusal line never names a dead pid as the maintainer."
- shipped-in: `d6d8d0b09b50`
- review-state: in_review
- review-implementer: claude-opus-5-5

### S2 — Every proof names its agent and the waiter follows the holder
- **Status**: review
- **Files**: `packages/core/src/lib/work-units/work-unit-proof.service.ts`, `packages/core/src/lib/work-units/work-unit-prove.service.ts`, `packages/core/src/lib/work-units/work-unit-publish.service.ts`
- **Gate**: type
- acceptance:
  - "The proof request carries the agent the work command already resolved (agentFor), which the proof label uses instead of reading DELENDAI_AGENT_ID; prove and publish both pass it, so no proof reads 'an unidentified agent' when the caller is identified."
  - "A proof with no agent at all fails the work command with the reason instead of being labelled unidentified."
- shipped-in: `dfd2c2c9fb2e`
- review-state: in_review
- review-implementer: claude-opus-5-5

### S3 — The compute-slot waiter re-prints when the holder changes
- **Status**: review
- **Files**: `packages/core/src/lib/shared/compute-slot.service.ts`
- **Gate**: type
- acceptance:
  - "While a proof waits, a notice is printed when the holder changes, once per holder, and not again for the same holder."
  - "The notice still ends with 'got its turn' when the wait ends."
- shipped-in: `dfd2c2c9fb2e`
- review-state: in_review
- review-implementer: claude-opus-5-5

### S4 — The compute-slot spec leaves no child running and never busy-loops
- **Status**: review
- **Files**: `packages/core/tests/src/lib/shared/compute-slot.service.spec.ts`
- **Gate**: type
- acceptance:
  - "A child exits when its parent dies or its /tmp/compute-slot-* directory disappears."
  - "A child waits for the release with fs.watch or an fd/IPC message from the parent, not a setImmediate loop; it uses no CPU while waiting."
  - "afterEach kills every child the spec spawned and the spec ends with none left."
- shipped-in: `dfd2c2c9fb2e`
- review-state: in_review
- review-implementer: claude-opus-5-5

### S5 — The launcher reaches its fallback from a deleted directory
- **Status**: review
- **Files**: `packages/cli/src/lib/alias/alias-manager.ts`, `packages/cli/src/lib/alias/alias-manager.spec.ts`
- **Gate**: type
- acceptance:
  - "With an empty or relative PWD, as a hook started in a deleted directory sees it, the POSIX launcher walks from / and reaches its fallback instead of looping on dirname forever."
  - "A spec runs the rendered launcher in bash with an empty PWD and sees it reach the fallback."
- shipped-in: `c3f8c52e085c`
- review-state: in_review
- review-implementer: claude-opus-5-5

### S6 — review next fits its queue request in the response budget
- **Status**: review
- **Files**: `packages/cli/src/commands/review.command.ts`
- **Gate**: type
- acceptance:
  - "With 25 proposals and 58 slices in review, review next hands out a pack instead of failing with response-too-large; it asks for the queue in pages or without detail."
- shipped-in: `fa8e4df71afe`
- review-state: in_review
- review-implementer: claude-opus-5-5

### S7 — A claim that times out reports what actually happened
- **Status**: review
- **Files**: `plugins/proposals/src/lib/services/review-claim.service.ts`
- **Gate**: type
- acceptance:
  - "When a review claim's git call times out under load, the tool checks whether the claim commit landed and reports the claim as held when it did, instead of 'Could not claim'."
- shipped-in: `abc442fef686`
- review-state: in_review
- review-implementer: claude-opus-5-5

### S8 — A failed proof step keeps its whole output
- **Status**: review
- **Files**: `tools/scripts/ci/prove-plan.script.ts`, `tools/scripts/ci/prove-plan.script.spec.ts`
- **Gate**: type
- acceptance:
  - "Every step a proof runs that fails writes its whole output to a file of its own under .cache/delendai/results/logs/prove-failed/, and the proof names that file among its causes, so a failure seen once can be read again: the cause lines name a failing test without its assertion, and a caller keeps only the tail of the proof."
- shipped-in: `737a7d85e9da`
- review-state: in_review
- review-implementer: claude-opus-5-5

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
