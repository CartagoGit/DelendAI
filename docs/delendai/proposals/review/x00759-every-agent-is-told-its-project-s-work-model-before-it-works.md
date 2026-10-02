---
id: x00759
title: "Every agent is told its project's work model before it works"
kind: fix
status: review
type: proposal
track: hosts
date: 2026-09-29
last-transition-id: c49277a1-8f54-417a-9bb1-0e4d915c496f
last-correlation-id: c49277a1-8f54-417a-9bb1-0e4d915c496f
last-transition-from: in-progress
shipped-in:
  - "6f377971d124"
---

# x00759 — Every agent is told its project's work model before it works

## Goal

The workflow an agent follows is derived from the project's resolved development policy, by one renderer, and reaches the agent at connect time, in the bootstrap prompt, in the compact overview and in every refusal. No static document states a profile-specific landing mechanism as if it were universal.

## why

In a consumer project on `shared-checkout-merge` (integration branch develop), an agent was correctly refused a write on develop, but the refusal said work reaches develop 'only through a work ref and a pull request', and the static bootstrap told it to publish with `forge:publish`. It followed a pull-request flow until the user corrected it. The MCP server instructions carry only `core.agentPolicy`; the resolved development policy never reaches them. `declareWorkflow` already derives the model from the policy, but nothing serves it: it is exported and printed nowhere.

## why this design

- `declareWorkflow` was already the renderer the work model needed, with
  every sentence derived from a policy axis. It gains the concrete start
  (`work enter` / `work checkpoint`) and landing sentences, and three
  projections: the instruction lines (server instructions and
  `agent_bootstrap`, the same function), a one-line summary for the
  budgeted overview, and a start+land brief for refusals. No second
  source of workflow prose.
- Driving the prose from axes surfaced two wrong declarations: `worktree-pr`
  (persistence `branch`) was told to STOP, and `shared-direct` was told
  never to commit to the branch it commits to.

## non-goals

- Wiring a shipped command that runs the local merge cycle for `shared-checkout-merge` (reported as a follow-up if still missing).
- Rewriting accepted ADRs; they get a scope note only.

## Slices

- global_gate: type

### S1 — One renderer states the work model wherever an agent connects
- **Status**: done
- **Files**: `packages/core/src/lib/development-policy/declare-workflow.ts`, `packages/core/src/lib/development-policy/declare-workflow.interface.ts`, `packages/core/src/lib/prompts/agent-policy-instructions.helper.ts`, `packages/core/src/lib/prompts/agent-bootstrap.prompt.ts`, `packages/core/src/lib/cli/assemble.ts`, `packages/core/src/lib/cli/assemble-core-tools.ts`, `packages/core/src/lib/tools/overview-tool.ts`, `packages/core/tests/src/lib/development-policy/declare-workflow.spec.ts`, `packages/core/tests/src/lib/prompts/agent-policy-instructions.helper.spec.ts`, `packages/core/tests/src/lib/prompts/agent-bootstrap.prompt.spec.ts`, `packages/core/tests/src/lib/cli/core-meta-tools.spec.ts`, `plugins/proposals/tests/src/lib/tools/proposal-publish-next-action.spec.ts`, `plugins/proposals/tests/src/lib/plugin-register-wiring.spec.ts`
- **Gate**: type
- acceptance:
  - "The connect-time server instructions and the agent_bootstrap prompt carry the same work-model lines, rendered from the resolved development policy."
  - "The compact overview carries the profile, how to start work and how work lands, within its token budget."
  - "Under shared-checkout-merge the lines say work merges into the integration branch after the local gate and that no pull request is opened; under shared-checkout-pr they say pull request; under shared-direct they say direct commit."
- shipped-in: `6f377971d124`
- review-state: done
- review-implementer: claude-opus-5-5
- review-reviewer: glm-5.3-flash
- review-log: approved by glm-5.3-flash — All three slices delivered by 6f377971d124 as specified. S1: declareWorkflow is the one renderer (route tables on persistence/integration axes) and its workModelInstructionLines reach both the connect-time server instructions and agent_bootstrap via agentOperatingLines. S2: refusals (git-guard, write-refusal in project-branches, checkout guard in work-isolation) now answer with workModelNextStep naming the profile, and the specs prove merge vs pr remedies differ; the two surfaced wrong declarations are fixed (worktree-pr no longer told STOP; shared-direct allowed to commit). S3: AGENT-BOOTSTRAP.md defers to the served model and the new lint:host-docs-landing enforces it (ran: 5 docs scanned, exit 0). Evidence: typecheck exit 0; 96/96 targeted tests across 6 specs (declare-workflow, git-guard, project-branches, agent-bootstrap, agent-policy-instructions.helper, core-meta-tools). Non-goals respected: no new merge-cycle command wired, ADRs only got a scope note. Note: this repo's own overview now carries workModel; later commits refining these files are other proposals' work.

### S2 — A refusal names the profile and its next step
- **Status**: review
- **DependsOn**: [S1]
- **Files**: `packages/core/src/lib/development-policy/git-guard.ts`, `packages/core/src/lib/development-policy/work-isolation.ts`, `packages/core/src/lib/development-policy/project-branches.ts`, `packages/core/src/cli.ts`, `packages/cli/src/commands/guard.command.ts`, `packages/core/tests/src/lib/development-policy/git-guard.spec.ts`, `packages/core/tests/src/lib/development-policy/project-branches.spec.ts`
- **Gate**: type
- acceptance:
  - "A commit or write refused on the integration branch states the active profile, how to start work and how that profile lands it, from the same renderer."
  - "Specs prove the remedies differ between shared-checkout-merge and shared-checkout-pr."
- shipped-in: `6f377971d124`
- review-state: in_review
- review-implementer: claude-opus-5-5

### S3 — Static host docs defer to the served work model
- **Status**: review
- **DependsOn**: [S1]
- **Files**: `docs/delendai/AGENT-BOOTSTRAP.md`, `docs/delendai/DEVELOPMENT-STRATEGIES.md`, `docs/delendai/adr/0020-branch-model-develop-integrates-through-pull-requests.md`, `tools/scripts/lint/host-docs-landing.script.ts`, `tools/scripts/lint/host-docs-landing.constant.ts`, `tools/scripts/lint/host-docs-landing.interface.ts`, `tools/scripts/lint/host-docs-landing.script.spec.ts`, `package.json`
- **Gate**: lint
- acceptance:
  - "AGENT-BOOTSTRAP.md no longer names a landing mechanism; it points to the server-served work model and stays within 32,000 bytes."
  - "A lint run in CI fails when a host instruction document hardcodes a landing mechanism, and fails when it finds no document to scan."
- shipped-in: `6f377971d124`
- review-state: in_review
- review-implementer: claude-opus-5-5

## acceptance

- The connect-time server instructions and the agent_bootstrap prompt carry the same work-model lines, rendered from the resolved development policy.
- The compact overview carries the profile, how to start work and how work lands, within its token budget.
- Under shared-checkout-merge the lines say work merges into the integration branch after the local gate and that no pull request is opened; under shared-checkout-pr they say pull request; under shared-direct they say direct commit.
- A commit or write refused on the integration branch states the active profile, how to start work and how that profile lands it, from the same renderer.
- Specs prove the remedies differ between shared-checkout-merge and shared-checkout-pr.
- AGENT-BOOTSTRAP.md no longer names a landing mechanism; it points to the server-served work model and stays within 32,000 bytes.
- A lint run in CI fails when a host instruction document hardcodes a landing mechanism, and fails when it finds no document to scan.
