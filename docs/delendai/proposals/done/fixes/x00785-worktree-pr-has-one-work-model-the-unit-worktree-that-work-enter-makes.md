---
id: x00785
title: "worktree-pr has one work model: the unit worktree that work enter makes"
kind: fix
status: done
type: proposal
track: trust
date: 2026-09-30
last-transition-id: 17ab92d7-0eee-4872-9331-ac98d62561aa
last-correlation-id: 17ab92d7-0eee-4872-9331-ac98d62561aa
last-transition-from: review
shipped-in:
  - "19d60b11be53"
---

# x00785 — worktree-pr has one work model: the unit worktree that work enter makes

## Goal

Under the worktree-pr profile an agent gets its worktree and branch from one command, delendai work enter, and that branch is the one work checkpoint and work publish accept. Every surface (preset axes, agent_worktree, the isolation rule, the served workflow text, the guard remedies) names that command and no other route.

## why

A real-CLI audit of worktree-pr found two incompatible models. The preset declared persistence.strategy=branch / usesWipRefs=false, while work enter, checkpoint and publish are profile-blind and require a wip work ref. The agent_worktree tool, which the isolation rule told worktree-pr agents to call, created agent/<name> branches that work publish cannot use. The served text said 'Edit in your own worktree' and 'commit on your worktree's own branch (wip/...)' without naming how to get either. The branch strategy also left commit-policy with no persistence route for the profile (the x00540 contradiction class).

## non-goals

- Release tooling in plugins/git and plugins/forge.
- Development-policy adopt, the migrator and effective-policy resolution.
- CLI doctor and init, commit-policy, proposal_transition and the review hand-off, the close_slice gate.
- Removing the legacy agent/ branch namespace: it stays recognised, only no longer created under a work-ref policy.

## Slices

- global_gate: none

### S1 — One worktree-pr model derived from the preset axes
- **Status**: done
- **Files**: `packages/core/src/lib/development-policy/profiles.ts`, `packages/core/src/lib/development-policy/declare-workflow.ts`, `packages/core/src/lib/development-policy/work-isolation.ts`, `packages/core/src/lib/contracts/interfaces/work-isolation.interface.ts`, `plugins/proposals/src/lib/tools/agent-worktree.tool.ts`, `docs/delendai/DEVELOPMENT-STRATEGIES.md`, `packages/core/tests/src/lib/development-policy/declare-workflow.spec.ts`, `packages/core/tests/src/lib/development-policy/work-isolation.spec.ts`, `packages/core/tests/src/lib/startup-gate/policy-gate.spec.ts`, `packages/core/tests/src/lib/work-units/work-unit-profiles.spec.ts`, `plugins/proposals/tests/src/lib/tools/agent-worktree.tool.spec.ts`
- **Gate**: none
- acceptance:
  - "Under worktree-pr, work enter yields a worktree and branch that work checkpoint and work publish accept, and publish produces the publication ref (real git)."
  - "agent_worktree create under a work-ref policy is refused with the work enter command as the next step; list still works."
  - "The declared workflow and the isolation rule for worktree-pr name delendai work enter; shared-checkout-pr text is unchanged."
  - "The preset states whether switching branches in the main worktree is intended."
- shipped-in: `19d60b11be53`
- review-state: done
- review-implementer: claude-sonnet-5-5
- review-reviewer: MiniMaxM3
- review-log: approved by MiniMaxM3 — x00785 S1 delivered at 19d60b11be53 (fix(policy): worktree-pr has one work model, the unit worktree that work enter makes): profiles.ts now derives the worktree-pr model from preset axes; work-isolation names delendai work enter; agent_worktree create under work-ref policy is refused with 'work enter' as next step; list still works; 52/52 tests green.

## acceptance

- Under worktree-pr, work enter yields a worktree and branch that work checkpoint and work publish accept, and publish produces the publication ref (real git).
- agent_worktree create under a work-ref policy is refused with the work enter command as the next step; list still works.
- The declared workflow and the isolation rule for worktree-pr name delendai work enter; shared-checkout-pr text is unchanged.
- The preset states whether switching branches in the main worktree is intended.
