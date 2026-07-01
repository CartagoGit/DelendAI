---
id: f00091
status: ready
type: proposal
kind: feat
track: swarm+coordination+git-integration
title: close_slice branch-integration step (non-destructive mark-for-integration)
date: 2026-07-01
shipped-in: []
recan: []
related:
    - f00082 # composite agent identity — the branch names close_slice would mark for integration
    - a00013 # master audit that first flagged swarm coordination gaps
ownership:
    - { agent: technical_investigator, task: 'S1: inventory every close_slice caller and the current branch/worktree lifecycle (read-only)' }
    - { agent: implementation_runner, task: 'S2: add the non-destructive mark-for-integration record + swarm_hygiene surfacing' }
    - { agent: delivery_verifier, task: 'S3: prove no destructive git runs and the rescue list is accurate' }
globalGate: validate
acceptance:
    - { command: bun run typecheck, expect: exit0 }
    - { command: bun run test, expect: exit0 }
    - { command: bun run validate, expect: exit0 }
---

# f00091 — close_slice branch-integration step (non-destructive)

## goal

Give `close_slice` an explicit **branch-integration step** so that when a swarm
agent finishes a slice on its own `agent/*` branch/worktree, that branch is
**recorded as pending integration** and surfaced to the orchestrator — instead
of being silently marked done, left unmerged, and eventually GC-eligible. The
step is **advisory and non-destructive**: it never runs a merge, rebase, reset,
or worktree prune on its own.

## why

Today `close_slice` (`plugins/proposals/src/lib/tools/authoring.tool.ts`) marks
the slice `done`, releases the agent lock, and re-syncs the registry — but it
**touches git not at all**. When `agentWorktree` is enabled, the agent's branch
is never merged into `develop` and its worktree is never converged. The result
is exactly the failure mode captured in memory
([[swarm-has-no-branch-integration-step]]): agent branches accumulate unmerged,
worktrees pile up, and the FASE 0 GC-resilience fix
([[concurrent-agents-shared-worktree-hazard]]) is the only thing preventing an
unmerged branch from being deleted when its `ahead` count can't be computed.

The convergence has to happen *somewhere*. Doing an **automatic merge** inside
`close_slice` is unacceptable: it is a destructive git mutation with conflict
potential, run from a tool that today is pure bookkeeping, and it would fight
the FASE 0 invariant that no swarm machinery performs destructive git. The safe
shape is a **record + report**: `close_slice` writes the finished branch into a
pending-integration list, and `swarm_hygiene` surfaces it as a rescue candidate
for a human/orchestrator to integrate deliberately.

## why this design

- **Mark, don't merge.** `close_slice` records `{ branch, worktree, sliceId,
  identity }` into the registry's pending-integration set. It performs zero git
  writes. The orchestrator (or a human) runs the actual merge on its own terms.
- **Reuse `swarm_hygiene` as the surfacing point.** It already computes
  `rescueCandidates`; the pending-integration list feeds that surface so there
  is one place to look for "work that landed on a branch but isn't on develop".
- **No-op when `agentWorktree` is off.** The default has no agent branch, so the
  step records nothing and behaviour is byte-identical to today.
- **Idempotent.** Re-closing or re-syncing never duplicates a pending entry;
  integrating a branch (detected by `mergedIntoBase`) removes it from the list.

## non-goals

- **No automatic merge / rebase / reset / worktree prune** inside `close_slice`
  or `swarm_hygiene`. Integration stays a deliberate, human-or-orchestrator
  action.
- **No change to the FASE 0 GC-resilience rule** — branch deletion still gates
  only on the positive `mergedIntoBase` signal.
- **No new transport, no cross-repo push.** This is local registry bookkeeping
  plus reporting.
- Does not implement an auto-integration agent; that would be a separate
  proposal built on top of this record.

## slices

### S1 — Inventory the close_slice + branch lifecycle (read-only)
- **Status**: pending
- **Files**: `plugins/proposals/src/lib/tools/authoring.tool.ts`,
  `plugins/proposals/src/lib/agents/agent-worktree-engine.ts`,
  `plugins/proposals/src/lib/shared/branch-gc-engine.ts`,
  `plugins/proposals/src/lib/tools/swarm-hygiene.tool.ts`
- **Gate**: type
- **Acceptance**:
  - "Documented: exactly where close_slice ends today, what identity/branch data
    is available at that point (post-f00082), and how swarm_hygiene builds
    `rescueCandidates`."

### S2 — Non-destructive mark-for-integration + surfacing
- **Status**: pending
- **Files**: `plugins/proposals/src/lib/tools/authoring.tool.ts`,
  the agent-registry store, `plugins/proposals/src/lib/shared/swarm-hygiene-engine.ts`
- **Gate**: validate
- **Acceptance**:
  - "close_slice, when an agent branch exists, records a pending-integration
    entry; it runs no git write (asserted by a spec that fails if any git
    mutation is invoked)."
  - "swarm_hygiene surfaces pending-integration entries in its output."
  - "With agentWorktree off, close_slice records nothing (byte-identical)."
  - "Idempotent: re-close does not duplicate; a merged branch drops off."

### S3 — Verify non-destructiveness and accuracy
- **Status**: pending
- **Files**: specs under `plugins/proposals/tests/`
- **Gate**: validate
- **Acceptance**:
  - "A spec proves close_slice performs no destructive git op even with a branch
    present."
  - "The rescue list matches the set of finished-but-unmerged branches."

## acceptance

- `bun run validate` is green (exit 0).
- `close_slice` records finished agent branches for integration and performs no
  destructive git operation.
- `swarm_hygiene` surfaces the pending-integration set.
- Behaviour with `agentWorktree` disabled is unchanged.
