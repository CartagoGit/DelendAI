---
id: x00911
title: "One authority for a work ref's life, one maintainer per workspace, and never on stale code"
kind: fix
status: in-progress
type: proposal
track: general
date: 2026-10-18
last-transition-id: 2a615d94-c5b7-4c67-9c97-4135088c898b
last-correlation-id: 2a615d94-c5b7-4c67-9c97-4135088c898b
last-transition-from: ready
last-transition-at: 2026-10-18T00:14:19.366Z
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

- **Status**: pending
- **Files**: `packages/core/src/lib/work-units/work-ref-lifecycle.service.ts`
- **Gate**: type
- acceptance:
  - "One core service answers, for a work ref: keep it on the forge, withdraw it, reap it with its worktree, or put it back, with the reason; the checkout publisher, the ref maintenance and the doctor's `in-progress-has-units` and `no-remote-work-refs` read it instead of their own conditions, and a spec holds the four states against one table."

### S2 — One maintainer per workspace

- **Status**: pending
- **Files**: `tools/scripts/host/host-server.script.ts`
- **Gate**: type
- acceptance:
  - "Background maintenance that changes refs or the forge (candidate refresh, hydration, checkout publishing) runs only in the process holding the workspace's maintenance lease (renewed by heartbeat, taken over when its holder dies); every other server serves and says in `status` which process maintains. Two servers started on one workspace run each maintenance step once per period, not twice."

### S3 — Stale code serves, but does not maintain

- **Status**: pending
- **Files**: `tools/scripts/host/host-server.script.ts`
- **Gate**: type
- acceptance:
  - "A server whose runtime is behind its checkout (the existing `createStaleRuntimeWatch` reading, not a second detector) gives up the maintenance lease and runs no ref-changing step until it restarts; its status and its log say why. A supervised server still restarts onto the new code as today."

### S4 — A loop on a ref is said

- **Status**: pending
- **Files**: `packages/core/src/lib/work-units/work-ref-lifecycle.service.ts`
- **Gate**: type
- acceptance:
  - "The maintainer records each withdraw, reap and put-back of a ref; one undone and redone more than twice in a day is reported in `work status` and the doctor, with the two rules that disagree."

## acceptance

- A work ref's life is decided by one rule, read by everything that acts on refs or judges them.
- One process per workspace runs ref-changing maintenance.
- A server behind its checkout changes no ref.
- A ref pushed and deleted in a loop is reported.
