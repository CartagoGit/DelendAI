---
id: x00768
title: "Branch tools and proposal publication follow the configured policy"
kind: fix
status: in-progress
type: proposal
track: general
date: 2026-09-30
last-transition-id: 228748a0-2ddd-4dfc-8899-1d76b00efe32
last-correlation-id: 228748a0-2ddd-4dfc-8899-1d76b00efe32
last-transition-from: ready
---

# x00768 — Branch tools and proposal publication follow the configured policy

## Goal

The proposals plugin derives the base branch and branch namespaces from the resolved development policy instead of this repository's literals (develop, agent/), branch_gc only ever acts on refs the ref-lifecycle verdict proves delivered, and a proposal created under shared-checkout-merge ends landed on the integration branch or reports a correct concrete next action.

## why

An audit found plugins/proposals hardcodes defaultBaseBranch develop and agent/ prefixes when registering branch_status, branch_gc and swarm_hygiene, making the policy fallback dead code, so these tools inspect agent/* while work refs live under the policy work-ref namespace. branch_gc removes worktrees and must never guess. Separately, shouldPublishOnRef only publishes under requiresPullRequest, so under shared-checkout-merge a new proposal is left unpublished with a nextAction pointing at a unit that does not exist.

## non-goals

- Redesigning the agent_worktree model, which still creates agent/<name> branches and stays recognised.
- The push.protectedBranches default, close_slice's gate timeout, and the doctor/init and core policy validate/resolve work owned elsewhere.

## Slices

- global_gate: none

### S1 — Policy-derived branch namespaces, verdict-classified gc, merge-profile proposal landing
- **Status**: pending
- **Files**: `packages/core/src/lib/agents/derive-agent-sessions.service.ts`, `packages/core/src/lib/contracts/interfaces/agent-session.interface.ts`, `packages/core/src/lib/ref-lifecycle/branch-delivery.ts`, `packages/core/src/public/index.ts`, `packages/core/tests/src/lib/agents/derive-agent-sessions.spec.ts`, `packages/core/tests/src/lib/ref-lifecycle/branch-delivery.spec.ts`, `plugins/proposals/src/index.ts`, `plugins/proposals/src/lib/contracts/constants/agent-branch-convention.constant.ts`, `plugins/proposals/src/lib/contracts/interfaces/publish-proposal.interface.ts`, `plugins/proposals/src/lib/locks/engine.ts`, `plugins/proposals/src/lib/locks/lock-paths.ts`, `plugins/proposals/src/lib/shared/branch-gc-engine.ts`, `plugins/proposals/src/lib/shared/branch-namespaces.ts`, `plugins/proposals/src/lib/shared/branch-status-engine.ts`, `plugins/proposals/src/lib/shared/swarm-hygiene-engine.ts`, `plugins/proposals/src/lib/swarm/validation-activity.resolver.ts`, `plugins/proposals/src/lib/tools/agent-worktree.tool.ts`, `plugins/proposals/src/lib/tools/authoring.tool.ts`, `plugins/proposals/src/lib/tools/auto-work.tool.ts`, `plugins/proposals/src/lib/tools/branch-gc.tool.ts`, `plugins/proposals/src/lib/tools/branch-status.tool.ts`, `plugins/proposals/src/lib/tools/proposal-publish-next-action.ts`, `plugins/proposals/src/lib/tools/publish-proposal.ts`, `plugins/proposals/src/lib/tools/swarm-hygiene.tool.ts`, `plugins/proposals/tests/src/lib/locks/agent-lock-engine.spec.ts`, `plugins/proposals/tests/src/lib/shared/branch-gc-engine.spec.ts`, `plugins/proposals/tests/src/lib/tools/branch-tools-follow-policy.spec.ts`, `plugins/proposals/tests/src/lib/tools/create-proposal-publishes.spec.ts`, `plugins/proposals/tests/src/lib/tools/proposal-publish-next-action.spec.ts`, `plugins/proposals/tests/src/lib/tools/publish-proposal.spec.ts`
- **Gate**: type
- acceptance:
  - "branch_status, branch_gc and swarm_hygiene resolve the base branch and prefixes from the policy when not passed"
  - "branch_gc removes only worktrees whose ref the ref-lifecycle verdict marks as delivered"
  - "a proposal created under shared-checkout-merge is landed or reports a concrete nextAction"

## acceptance

- branch_status, branch_gc and swarm_hygiene resolve the base branch and prefixes from the policy when not passed
- branch_gc removes only worktrees whose ref the ref-lifecycle verdict marks as delivered
- a proposal created under shared-checkout-merge is landed or reports a concrete nextAction
