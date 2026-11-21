---
id: x00911
title: "One authority for a work ref's life, one maintainer per workspace, and never on stale code"
kind: fix
status: done
type: proposal
track: general
date: 2026-10-18
last-transition-id: 93f30291-f2ed-42c9-aed8-ba53af23f164
last-correlation-id: 93f30291-f2ed-42c9-aed8-ba53af23f164
last-transition-from: review
last-transition-at: 2026-10-23T07:30:53.036Z
shipped-in:
  - "7d6021378d0b3cf5f07d4f3cc13a42a2543eafaa"
---

# x00911 — One authority for a work ref's life, one maintainer per workspace, and never on stale code

## goal

Whether a work ref exists on the forge, when it is withdrawn, reaped or put back, is decided by one rule in core, read by every component that acts on refs and by the doctor that judges them. That rule runs in one process per workspace (a maintainer chosen by lease), and never in a process whose code is older than its checkout. When this is done, two components cannot undo each other's work on a ref, four servers on one workspace do not each run the same maintenance, and a server left running over a merged fix does not keep applying the rule the fix replaced.

## why

The owner, 2026-10-18: "el problema profundo crea una propuesta para arreglarlo". What 2026-10-16/18 showed, confirmed against `develop`:

- **Three components, three readings of one rule.** The checkout publisher (`packages/core/src/lib/wip-engine/work-checkout-publisher.ts`, `withdrawLanded`) took a work ref off the forge as soon as its work landed; the ref maintenance (`tools/scripts/git/maintain-ref-namespace.script.ts`) reaped the worktree and ref of a unit whose work had landed; the queue's doctor requires every in-progress proposal to have a unit on the forge (`in-progress-has-units`) and excuses a landed ref while its proposal is open (`no-remote-work-refs`). The first two contradicted the third: x00910's unit was reaped with slices left, f00551's and x00910's refs were withdrawn after each merged slice, and develop's queue went red on it. x00910 S10 patched both callers with the same check; the rule itself still lives in three places.
- **One workspace, four maintainers.** On 2026-10-17 four host-server processes served this workspace (started 10:36, 11:02, 17:38, 17:38). Each runs candidate refresh and hydration on its own clock (`tools/scripts/host/host-server.script.ts`, `refreshCandidatesInBackground`), and each publishes the work checkouts it can see. The same maintenance ran up to four times per period, from processes that may disagree on the code they run.
- **Stale code still acts.** A server behind its checkout already says so on every tool result (x00701, `createStaleRuntimeWatch`), and a supervised one restarts onto the new code. An unsupervised one keeps running its background maintenance with the old rules until someone restarts it; the advisory reaches the agent in the conversation, not the maintenance loop. f00639's retirement did not publish on 2026-10-16 because the server predated x00908 by five hours.
- **Repeated deletes nobody saw.** The forge's events show `delendai/wip/claude-opus-5-5/implement/f00551-all-g1/batuta` deleted 46 times between 2026-10-16 18:27 and 2026-10-17 07:27 (UTC) and pushed back each time: the publisher withdrawing a landed ref and the next commit restoring it, every pass, with nothing recording the loop.

## non-goals

- Changing what a work ref is for, or the publication flow (x00908 and x00910 S10 stand).
- Killing processes: a maintainer that loses its lease stops maintaining, and keeps serving its session.

## slices

- global_gate: type

### S1 — One rule for a work ref's life

- **Status**: done
- **Files**:
  - `packages/core/src/lib/contracts/interfaces/work-ref-lifecycle.interface.ts`
  - `packages/core/src/lib/work-units/work-ref-lifecycle.service.ts`
  - `packages/core/tests/src/lib/work-units/work-ref-lifecycle.service.spec.ts`
  - `packages/core/src/lib/wip-engine/proposal-in-progress.helper.ts`
  - `packages/core/src/lib/wip-engine/landed-work-ref.ts`
  - `packages/core/src/lib/wip-engine/work-checkout-publisher.ts`
  - `packages/core/tests/src/lib/wip-engine/work-checkout-publisher.spec.ts`
  - `packages/core/src/lib/work-units/workflow-invariants.service.ts`
  - `packages/core/src/runtime/index.ts`
  - `tools/scripts/git/maintain-ref-namespace.script.ts`
  - `tools/scripts/git/maintain-ref-namespace.interface.ts`
  - `tools/scripts/git/maintain-ref-namespace.script.spec.ts`
  - `plugins/commit-policy/src/lib/services/integrated-work-refs.service.ts`
  - `plugins/commit-policy/src/lib/contracts/interfaces/integrated-work-refs.interface.ts`
  - `plugins/commit-policy/src/lib/persistence/wip-persistence.ts`
  - `plugins/commit-policy/tests/src/lib/services/integrated-work-refs.service.spec.ts`
- **Gate**: type
- acceptance:
  - "One core service (`workRefFate`) answers, for a work ref: keep it on the forge, put it back, withdraw it, or reap it with its clean worktree, with the reason; a spec holds the table. It reads a landed ref's proposal on the integration branch alone (a landed tip that still says in progress is history) and an unlanded one at its tip too."
  - "Every component that ends a work ref as maintenance reads it instead of its own condition: the checkout publisher (restores a lost unit once, then leaves it; withdraws only a ref on the forge), the ref maintenance (both reap paths, the one without a worktree included, which reaped open units' refs here and on the forge; it now restores too), the doctor's `no-remote-work-refs`, and the commit-policy checkpoint reaper, which deleted every other agent's integrated ref on each checkpoint, open proposals' units included. `in-progress-has-units` reads the same integration reading the rule does."
  - "Explicit ends by the unit's owner (`work publish`, `work retire`, adoption, `forge:publish`) are not maintenance and stay theirs."
- shipped-in: `2d7ee0bb7fbc`
- review-state: done
- review-implementer: claude-opus-5-5
- review-reviewer: minimax-m3.1-flash-preview
- review-log: approved by minimax-m3.1-flash-preview — verified at 7d6021378d0b, validate exit 0, tests 57/57; acceptance 3/3: (1) workRefFate (packages/core/src/lib/work-units/work-ref-lifecycle.service.ts:82) is the one service: IWorkRefFate is 'keep' | 'restore' | 'withdraw' | 'reap' (w… (2) Every maintenance component consults the rule: the checkout publisher (packages/core/src/lib/wip-engine/landed-work-ref.ts:55 workRefFate; putsBack -> it pushe… (3) The owner's explicit ends are not routed through the rule: work publish (work-publish.service.ts), work retire (work-unit-retire.service.ts), adoption (unit-ad… — Gate `type` = `bun run typecheck` exit 0 in this worktree. Delivery commit 7d6021378d0b3cf5f07d4f3cc13a42a2543eafaa (merge; the slice's own commits are 4d5a24ea2 and the rename 2d7ee0bb7fbc) is the commit that touches the slice's declared files. Tests: work-ref-lifecycle.service.spec.ts, work-checkout-publisher.spec.ts, in-progress-units.service.spec.ts and integrated-work-refs.service.spec.ts, 57/57 under vitest. Verified by reading the delivered diff and running the specs. Observation (not a defect of this slice): the rule is consulted with different integration treeishes by different components - the publisher and the doctor's in-progress list read the local integration branch, the ref maintenance and the doctor's no-remote-work-refs read refs/remotes/<remote>/<integration>, and the checkpoint sweep pins a SHA. They agree in this clone (local and origin/develop are the same commit) but a lagging shared checkout would read them differently.

### S2 — One maintainer per workspace

- **Status**: done
- **Files**:
  - `packages/core/src/lib/contracts/constants/maintenance-lease.constant.ts`
  - `packages/core/src/lib/contracts/interfaces/maintenance-lease.interface.ts`
  - `packages/core/src/lib/development-policy/maintenance-lease.service.ts`
  - `packages/core/tests/src/lib/development-policy/maintenance-lease.service.spec.ts`
  - `packages/core/src/lib/contracts/interfaces/host-config.interface.ts`
  - `packages/core/src/lib/cli/assemble.ts`
  - `packages/core/src/lib/cli/assemble-core-tools.ts`
  - `packages/core/src/lib/wip-engine/work-checkout-publisher.ts`
  - `packages/core/tests/src/lib/wip-engine/work-checkout-publisher.spec.ts`
  - `packages/core/src/lib/startup-reconciler/hydration-watch.ts`
  - `packages/core/src/lib/startup-reconciler/hydration-watch.interface.ts`
  - `packages/core/tests/src/lib/startup-reconciler/hydration-watch.spec.ts`
  - `packages/core/src/lib/startup-gate/start-checkout-hydration.ts`
  - `packages/core/src/lib/startup-gate/start-checkout-hydration.interface.ts`
  - `tools/scripts/host/host-server.script.ts`
- **Gate**: type
- acceptance:
  - "Background maintenance that changes refs or moves the checkout (checkout publishing, hydration, candidate refresh) runs only in the process holding the workspace's maintenance lease (`<cacheDir>/startup/maintainer.lease`): taken by an atomic link, renewed by a heartbeat on its own clock, taken over when its holder is silent past the lease or dead on this machine, given up on shutdown. The holder is machine, process and a boot nonce, never an agent name, so two sessions of one model are two holders. Every other server serves, and `status` says which process maintains without taking the lease (a one-off command never becomes the maintainer). A spec holds two servers on one lease."
- shipped-in: `10efcb475628`
- review-state: done
- review-implementer: claude-opus-5-5
- review-reviewer: minimax-m3.1-flash-preview
- review-log: approved by minimax-m3.1-flash-preview — verified at 7d6021378d0b, validate exit 0, tests 27/27; acceptance 1/1: (1) The lease lives at <cacheDir>/startup/maintainer.lease (MAINTENANCE_LEASE_FILE = 'startup/maintainer.lease', maintenance-lease.constant.ts:13, resolved against… — Gate `type` = `bun run typecheck` exit 0. Delivery commit 7d6021378d0b (slice commit 9bd6c4a2e459). Tests: maintenance-lease.service.spec.ts + hydration-watch.spec.ts, 27/27 under vitest, including the delivered case 'lets one of two servers hold it' and 'takes nothing: a one-off status leaves the lease free'. Verified by reading the delivered diff and running the specs. Observation: the shutdown release is fire-and-forget (void maintenance?.stop()), so the lease file can outlive a clean exit; the dead-holder takeover covers it.

### S3 — Stale code serves, but does not maintain

- **Status**: done
- **Files**:
  - `packages/core/src/lib/development-policy/maintenance-lease.service.ts`
  - `plugins/commit-policy/src/index.ts`
  - `plugins/commit-policy/src/lib/persistence/wip-persistence.ts`
  - `plugins/commit-policy/src/lib/persistence/wip-persistence.interface.ts`
  - `plugins/commit-policy/src/lib/contracts/interfaces/integrated-work-refs.interface.ts`
  - `plugins/commit-policy/tests/src/lib/persistence/integrated-work-refs.persistence.spec.ts`
- **Gate**: type
- acceptance:
  - "A server whose runtime is behind its checkout (the existing `createStaleRuntimeWatch` reading, not a second detector) gives up the maintenance lease, so a current server takes over, and runs no ref-changing step until it restarts; the checkpoint sweep, which runs inside an agent's own checkpoint, stands down too and says so in its report (`reaped.stoodDown`). The log says each change of standing once, and `status` says why. A supervised server still restarts onto the new code as today."
- shipped-in: `9bd6c4a2e459`
- review-state: done
- review-implementer: claude-opus-5-5
- review-reviewer: minimax-m3.1-flash-preview
- review-log: approved by minimax-m3.1-flash-preview — verified at 7d6021378d0b, validate exit 0, tests 24/24; acceptance 1/1: (1) The stale reading is the existing one: assemble.ts takes `behind: staleRuntime.behind` from createStaleRuntimeWatch (stale-runtime-advisory.ts) and the deliver… — Gate `type` = `bun run typecheck` exit 0. Delivery commit 7d6021378d0b (slice commit 9bd6c4a2e459; the stoodDown report landed with 4d5a24ea2 in the same merge). Tests: hydration-watch.spec.ts + integrated-work-refs.persistence.spec.ts + stale-runtime-advisory.spec.ts, 24/24 under vitest, including the delivered assertion that the checkpoint sweep's report carries stoodDown. Verified by reading the delivered diff and running the specs.

### S4 — A loop on a ref is said

- **Status**: done
- **Files**:
  - `packages/core/src/lib/contracts/interfaces/work-ref-moves.interface.ts`
  - `packages/core/src/lib/work-units/work-ref-moves.service.ts`
  - `packages/core/tests/src/lib/work-units/work-ref-moves.service.spec.ts`
  - `packages/core/src/lib/wip-engine/landed-work-ref.ts`
  - `packages/core/src/lib/work-units/workflow-doctor.service.ts`
  - `packages/core/src/lib/work-units/work-unit-status.service.ts`
  - `tools/scripts/git/maintain-ref-namespace.script.ts`
  - `plugins/commit-policy/src/lib/services/integrated-work-refs.service.ts`
- **Gate**: type
- acceptance:
  - "The checkout publisher, the ref maintenance and the checkpoint sweep record each removal of a work ref from the forge and each return to it, with the component and process, in the clone's git directory (shared by its worktrees, never committed, kept to a day past 512 KB). A ref taken and put back more than twice in a day is reported by the doctor (`no-work-ref-loops`) and `work status`, naming the components on each side."
- shipped-in: `2d7ee0bb7fbc`
- review-state: done
- review-implementer: claude-opus-5-5
- review-reviewer: minimax-m3.1-flash-preview
- review-log: approved by minimax-m3.1-flash-preview — verified at 7d6021378d0b, validate exit 0, tests 26/26; acceptance 1/1: (1) The journal is the clone's git directory: work-ref-moves.service.ts resolves `git rev-parse --path-format=absolute --git-common-dir` (:39-45) and writes delend… — Gate `type` = `bun run typecheck` exit 0. Delivery commit 7d6021378d0b (slice commit eeb2a106e, the journal, with 10efcb475628's async write and 985c6a0cd's no-check-then-write fix in the same merge). Tests: work-ref-moves.service.spec.ts + maintain-ref-namespace.script.spec.ts, 26/26 under vitest. Verified by reading the delivered diff and running the specs. Observation (not a defect): the checkpoint sweep records removals only - it never restores a ref itself - so a 'return' in the journal always comes from the publisher or the ref maintenance; the criterion asks that each removal and each return be recorded, and each return that happens is recorded by the component that made it.

## acceptance

- A work ref's life is decided by one rule, read by everything that acts on refs or judges them.
- One process per workspace runs ref-changing maintenance.
- A server behind its checkout changes no ref.
- A ref pushed and deleted in a loop is reported.
