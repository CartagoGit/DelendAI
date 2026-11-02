---
id: x00918
title: "A work plan states the work model it runs under"
kind: fix
status: done
type: proposal
track: general
date: 2026-10-18
last-transition-id: 59b127de-3d3e-420c-bede-5cfa45b5b59b
last-correlation-id: 59b127de-3d3e-420c-bede-5cfa45b5b59b
last-transition-from: review
last-transition-at: 2026-10-23T06:54:32.178Z
shipped-in:
  - "b625f0e2545f"
---

# x00918 — A work plan states the work model it runs under

## goal

`auto_work`'s plan tells the agent how work starts and how it lands under the project's development profile, from the renderer every other surface uses (`workModelSummary`, `packages/core/src/lib/development-policy/declare-workflow.ts`), so an agent that follows only the plan works the way the policy says.

## why

Called on this repository 2026-10-18 (`shared-checkout-pr`), `delendai_proposals_auto_work` returned twelve steps; none says to start with `delendai work enter` or to land by pull request into `develop`. The server instructions, the overview (`workModel`), the guard and the isolation rule all say both, each from `briefWorkModel`/`workModelSummary`; the plan is the one surface that does not, and it is the one an agent is told to follow step by step. An agent that does sees "Claim its files", "Implement exactly that slice", "Submit … for peer review", and edits the shared checkout, where delendai's writes are refused.

Reading the plan's other lines for the same fault found two more: its branch warnings said "behind develop" whatever the project's integration branch, and five lines (hygiene, needs-worktree, loop-blocked) told the agent to call unprefixed tools such as `proposals_branch_gc`, names no server registers.

## non-goals

- Rewriting the plan's other steps.

## slices

- global_gate: type

### S1 — The plan names the work model

- **Status**: done
- **Files**: `plugins/proposals/src/lib/tools/auto-work.tool.ts`, `plugins/proposals/src/index.ts`, `packages/core/src/plugin/index.ts`, `plugins/proposals/tests/src/lib/auto-work.spec.ts`
- **Gate**: type
- acceptance:
  - "With a resolved development policy, the work plan's first step is the profile's one-line work model (`workModelSummary`), read from the policy, not written in the tool; without one the plan is as before. A spec holds both."
  - "The plan's hygiene lines name the branch they measure against (the snapshot's base, not a literal `develop`) and every tool it points to under the plugin's prefix (`<prefix>_branch_gc`, `<prefix>_agent_worktree`, `<prefix>_continue_proposal`, not unprefixed names no server registers). Specs hold both."
- shipped-in: `b625f0e2545f`
- review-state: done
- review-implementer: claude-opus-5-5
- review-reviewer: minimax-m3.1-flash-preview
- review-log: approved by minimax-m3.1-flash-preview — verified at b625f0e2545f, validate exit 0, tests 42/42; acceptance 2/2: (1) plugins/proposals/src/lib/tools/auto-work.tool.ts imports workModelSummary from '@delendai/core/plugin' (exported at packages/core/src/plugin/index.ts:45 from … (2) The hygiene lines are built from the snapshot's own base: branchStatusWarningsFor uses `const base = snapshot.baseBranch` and names it in every line (main chec… — Gate `type` = `bun run typecheck` exit 0 in this worktree. Delivery commit b625f0e2545f (merge of PR #1225, claude-opus-5-5) is the commit that touches the slice's declared files; the slice's own commits are c97d7c12b829 (prefixed tool names) and the work-model line. Tests: plugins/proposals/tests/src/lib/auto-work.spec.ts 42/42 under vitest. Verified by reading the delivered diff and running the specs; the two acceptance criteria are each pinned by a named spec case that passes.

## acceptance

- An agent following only `auto_work` starts and lands work the way the policy says.
