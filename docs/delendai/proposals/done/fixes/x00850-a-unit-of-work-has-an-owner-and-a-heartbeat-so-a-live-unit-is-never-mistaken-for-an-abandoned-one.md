---
id: x00850
title: "A unit of work has an owner and a heartbeat, so a live unit is never mistaken for an abandoned one"
kind: fix
status: done
type: proposal
track: general
date: 2026-10-01
last-transition-id: b615ae16-7574-4af1-a32e-504224902345
last-correlation-id: b615ae16-7574-4af1-a32e-504224902345
last-transition-from: review
shipped-in:
  - "61c98cfd5"
---

# x00850 — A unit of work has an owner and a heartbeat, so a live unit is never mistaken for an abandoned one

## Goal

Every unit entered through delendai records who owns it and when it last showed life; one verdict per unit (live, idle, abandoned, delivered) feeds ref-lifecycle, reclaim:orphans, work status and the overview, abandoned units are ended by work retire, which preserves the tip, delivered units are reaped with their worktrees, and a ref pushed under a unit that already has one is refused.

## why

reclaim:orphans listed three units of a live session next to three abandoned by a rate limit and recommended git switch and git branch -D, against the policy. ref-lifecycle called a work ref developing forever. A subagent pushed scratch refs under its unit namespace and nothing refused them. Merged units keep their worktree and local branch because publish removes the worktree only when the tree is clean at that instant.

## non-goals

- Editing work publish, the swarm service, the invariants service or the work enter service
- Judging a person's branches outside delendai's namespaces

## Slices

- global_gate: none

### S1 — A unit has a lease and one verdict
- **Status**: done
- **Files**: `packages/core/src/lib/work-units/unit-lease.interface.ts`, `packages/core/src/lib/work-units/unit-lease.constant.ts`, `packages/core/src/lib/work-units/unit-lease.store.ts`, `packages/core/src/lib/work-units/unit-lease.service.ts`, `packages/core/src/lib/work-units/unit-verdict.service.ts`, `packages/core/src/lib/work-units/unit-standings.service.ts`, `packages/core/src/lib/work-units/unit-removal.service.ts`, `packages/core/src/lib/work-units/unit-worktree-state.service.ts`, `packages/core/src/lib/work-units/work-unit.service.ts`, `packages/core/src/lib/work-units/work-unit-checkpoint.service.ts`, `packages/core/src/lib/work-units/work-unit-status.service.ts`, `packages/core/src/lib/tools/overview-tool.ts`, `packages/core/src/lib/tools/overview-summary.helper.ts`, `packages/core/src/lib/cli/assemble-core-tools.ts`, `packages/core/tests/src/lib/work-units/unit-repo.helper.ts`, `packages/core/tests/src/lib/work-units/unit-verdict.service.spec.ts`, `packages/core/tests/src/lib/work-units/unit-standings.service.spec.ts`
- **Gate**: type
- acceptance:
  - "live, idle and abandoned follow the lease age against coordination.leaseTtlMinutes"
  - "two sessions of one agent hold separate leases"
  - "the lease survives the CLI process that wrote it"
- shipped-in: `955914412aa0`
- review-state: done
- review-implementer: claude-sonnet-5-5
- review-reviewer: claude-opus-5-5
- review-log: approved by claude-opus-5-5 — verified at 61c98cfd5, validate exit 0, tests 41/41 — Delivered by #726 (merge 61c98cfd5). Core specs 41/41, reclaim-orphans 10/10, guard.command 44/44.

### S2 — Reclaim, remedies and reaping follow the verdict
- **Status**: done
- **DependsOn**: [S1]
- **Files**: `packages/core/src/lib/ref-lifecycle/reconcile.interface.ts`, `packages/core/src/lib/ref-lifecycle/reconcile.service.ts`, ``packages/core/src/lib/work-units/work-unit-reap.service.ts`, `packages/core/src/lib/work-units/unit-reaper.service.ts`, `packages/core/src/lib/tools/work-unit.tool.ts`, `packages/cli/src/contracts/constants/work-command.constant.ts`, `tools/scripts/reclaim/reclaim-orphans.script.ts`, `tools/scripts/reclaim/reclaim-orphans.script.spec.ts`, `packages/core/tests/src/lib/work-units/work-unit-lease.spec.ts`, `packages/core/tests/src/lib/work-units/unit-reaper.service.spec.ts`, `packages/core/tests/src/lib/ref-lifecycle/reconcile-standing.spec.ts`, `docs/delendai/AGENT-BOOTSTRAP.md`
- **Gate**: type
- acceptance:
  - "reclaim:orphans never lists a live unit and never advises git switch"
  - "remedies for an abandoned unit name work retire, and no second exit exists"
  - "a delivered unit loses its worktree and branch, a dirty one reports what is dirty"
- shipped-in: `14da2e90af7d`
- review-state: done
- review-implementer: claude-sonnet-5-5
- review-reviewer: claude-opus-5-5
- review-log: approved by claude-opus-5-5 — verified at 61c98cfd5, validate exit 0, tests 51/51 — Delivered by #726 (merge 61c98cfd5).

### S3 — The guard refuses a second ref of a unit and agents are told how a unit ends
- **Status**: done
- **DependsOn**: [S1]
- **Files**: `packages/core/src/lib/development-policy/git-guard.ts`, `packages/core/src/lib/development-policy/git-guard-shape.ts`, `packages/core/src/lib/development-policy/git-guard-unit.ts`, `packages/core/src/lib/development-policy/declare-workflow.ts`, `packages/core/src/lib/contracts/interfaces/git-guard.interface.ts`, `packages/core/src/lib/work-units/unit-ref-facts.service.ts`, `packages/core/src/cli.ts`, `packages/cli/src/commands/guard.command.ts`, `packages/cli/src/contracts/interfaces/guard.interface.ts`, `packages/cli/src/commands/guard.command.spec.ts`, `packages/core/tests/src/lib/development-policy/git-guard-unit.spec.ts`
- **Gate**: type
- acceptance:
  - "pushing delendai/wip/<agent>/<kind>/<unit>/sim-a while the unit holds another ref is refused"
  - "served instructions say a unit ends in publish or retire"
- shipped-in: `955914412aa0`
- review-state: done
- review-implementer: claude-sonnet-5-5
- review-reviewer: claude-opus-5-5
- review-log: approved by claude-opus-5-5 — verified at 61c98cfd5, validate exit 0, tests 44/44 — Delivered by #726 (merge 61c98cfd5).

## acceptance

- live, idle and abandoned follow the lease age against coordination.leaseTtlMinutes
- two sessions of one agent hold separate leases
- the lease survives the CLI process that wrote it
- reclaim:orphans never lists a live unit and never advises git switch
- remedies for an abandoned unit name work retire, and no second exit exists
- a delivered unit loses its worktree and branch, a dirty one reports what is dirty
- pushing delendai/wip/<agent>/<kind>/<unit>/sim-a while the unit holds another ref is refused
- served instructions say a unit ends in publish or retire
