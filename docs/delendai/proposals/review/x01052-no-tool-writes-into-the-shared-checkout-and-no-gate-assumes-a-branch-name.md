---
id: x01052
title: "No tool writes into the shared checkout, and no gate assumes a branch name"
kind: fix
status: review
type: proposal
track: a00095-consistency
date: 2026-11-08
last-transition-id: 47917abc-e3f2-4976-b92e-7098061085c3
last-correlation-id: 47917abc-e3f2-4976-b92e-7098061085c3
last-transition-from: in-progress
last-transition-at: 2026-11-08T08:14:45.094Z
---

# x01052 — No tool writes into the shared checkout, and no gate assumes a branch name

## goal

A shell command cannot leave loose edits in the shared checkout unnoticed, and no gate or script assumes the integration branch is called develop.

## why

A subagent wrote files into the shared checkout with Bash heredocs and python open().write() on relative paths after its cwd reset there. The x01003 guard covers delendai tools, commits and the Claude Code PreToolUse hook on Edit/Write, not shell writes. Separately, prove-plan and the spec-duration budget default their base to the literal origin/develop, so a project whose integration branch is trunk gets a wrong base; the queue already reads policy.branches.integration.

## non-goals

- Blocking a shell command before it runs: no host can tell a write from a read in a command line.
- Rescuing for an agent that holds no unit: a person editing the checkout is not a stray write.

## slices

- global_gate: none

### S1 — A host hook after every shell command rescues loose edits in the shared checkout
- **Status**: review
- **Files**: `packages/core/src/lib/work-units/shared-checkout-shell-rescue.service.ts`, `packages/core/src/lib/work-units/shared-checkout-shell-rescue.interface.ts`, `packages/core/tests/src/lib/work-units/shared-checkout-shell-rescue.service.spec.ts`, `packages/core/src/lib/work-units/unit-edit-fence.service.ts`, `packages/core/src/cli.ts`, `packages/cli/src/lib/post-shell-guard.service.ts`, `packages/cli/src/lib/post-shell-guard.service.spec.ts`, `packages/cli/src/commands/guard.command.ts`, `packages/cli/src/contracts/constants/pre-edit-guard.constant.ts`, `packages/cli/src/lib/init/init-claude-settings.ts`, `packages/cli/src/lib/init/init-claude-settings.spec.ts`
- **Gate**: none
- acceptance:
  - "Decision: when an agent that holds a unit finishes a Bash call and the shared checkout is dirty, delendai guard post-shell runs the work rescue at once and tells the agent which unit worktree to write in; a clean checkout, an agent holding no unit, or a policy without unit worktrees does nothing and prints nothing."
  - "Cost: the clean path is one git status --porcelain with optional locks off and nothing else."
  - "init writes the PostToolUse hook on Bash beside the PreToolUse one, merged into an existing settings file without touching other keys, twice changes nothing."
  - "Hosts without hooks keep the existing refusal at the next delendai command."
- shipped-in: `d0ddaedb1765`
- review-state: in_review
- review-implementer: claude-sonnet-5-5

### S2 — Gates read the integration branch from the development policy
- **Status**: review
- **Files**: `tools/scripts/lib/declared-branches.ts`, `tools/scripts/lib/declared-branches.spec.ts`, `tools/scripts/ci/prove-plan.script.ts`, `tools/scripts/ci/job-reach.helper.ts`, `tools/scripts/forge/release-checkout.script.ts`, `tools/scripts/lint/agent-claims.script.ts`, `tools/scripts/lint/candidate-delivers.script.ts`, `tools/scripts/lint/no-secrets.script.ts`, `tools/scripts/lint/publication-scope.script.ts`, `tools/scripts/reclaim/reclaim-orphans.script.ts`, `tools/scripts/reclaim/reclaim-worktrees.script.ts`
- **Gate**: none
- acceptance:
  - "prove-plan takes its default base from policy.branches.integration, not the literal origin/develop; a policy whose integration branch is trunk proves against origin/trunk."
  - "The spec-duration budget --declared default reads the same policy value once PR 1841 has landed."
  - "Other literal develop / origin/develop defaults in tools/scripts and packages are read from the policy too."
- shipped-in: `95aafcbdec2f`
- review-state: in_review
- review-implementer: claude-sonnet-5-5

## acceptance

- Decision: when an agent that holds a unit finishes a Bash call and the shared checkout is dirty, delendai guard post-shell runs the work rescue at once and tells the agent which unit worktree to write in; a clean checkout, an agent holding no unit, or a policy without unit worktrees does nothing and prints nothing.
- Cost: the clean path is one git status --porcelain with optional locks off and nothing else.
- init writes the PostToolUse hook on Bash beside the PreToolUse one, merged into an existing settings file without touching other keys, twice changes nothing.
- Hosts without hooks keep the existing refusal at the next delendai command.
- prove-plan takes its default base from policy.branches.integration, not the literal origin/develop; a policy whose integration branch is trunk proves against origin/trunk.
- The spec-duration budget --declared default reads the same policy value once PR 1841 has landed.
- Other literal develop / origin/develop defaults in tools/scripts and packages are read from the policy too.
