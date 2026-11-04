---
id: x01003
title: "A slice commit takes only what its own unit wrote"
kind: fix
status: in-progress
type: proposal
track: a00095-consistency
date: 2026-11-02
last-transition-id: 5675143e-62c4-4fdc-9dfe-eda33385c04b
last-correlation-id: 5675143e-62c4-4fdc-9dfe-eda33385c04b
last-transition-from: in-progress
last-transition-at: 2026-11-04T09:27:59.272Z
---

# x01003 — A slice commit takes only what its own unit wrote

## goal

Nothing reaches a unit's work ref from the shared checkout, and the shared checkout stays clean by construction: under a profile that gives every unit its own worktree, a unit's work reaches its ref by commit in that worktree and from nowhere else, and no work command or commit runs while the shared checkout holds loose edits.

## why

Cut from x00990 S6 on 2026-11-02. On 2026-10-28 a `package.json` hunk another agent left uncommitted in the shared checkout was committed into two of `minimax-m3.1-flash-preview`'s units (`implement/x00950-S3-g1`, `implement/x00956-S2-g1`) as their only change: commit-policy's slice persistence checkpointed the slice's declared files from the shared checkout, whoever changed them.

On 2026-11-04 a subagent edited ten files in the shared checkout instead of its unit worktree and copied them into its work ref with `work checkpoint --paths` (commit 25547e5f3); the shared checkout was restored with `work rescue`. The product invited it: the work-model instructions every agent receives said "from the shared checkout, `delendai work checkpoint --paths=<a,b> --message=<text>` writes the same ref without moving HEAD". Owner rule: under a profile with unit worktrees no agent edits the shared checkout, on any host.

Git cannot say who wrote which hunk of a file, and a checkpoint from the shared checkout also reverts the unit's own work wherever the file there is unchanged (the WIP engine builds "base plus these paths from this tree"). So the answer is not attribution but the route: every profile with a work-ref model makes a worktree per unit (`work enter`), so no route takes files from another checkout. A profile without unit worktrees has no work ref either, so no base-blob comparison is needed today; a future profile that has work refs without unit worktrees must bring one.

## non-goals

- The per-call commit in a unit's worktree, which already commits only what the call changed.

## architecture

- One reading, in core: `unitsHaveWorktrees(policy)` (persistence route `wip-ref`) and `sharedCheckoutStaysClean(policy)` (that, plus a pinned checkout), with the refusal text naming `delendai work rescue`.
- `work checkpoint` refuses under `unitsHaveWorktrees`, naming each declared file it leaves and why, and the unit's worktree when it has one.
- `work enter`, `checkpoint`, `prove` (and so `deliver`) and `publish` refuse while the shared checkout holds loose edits; `status` and `rescue` never do. delendai's own state directory is not an edit.
- The commit guard refuses an agent's commit anywhere while the shared checkout holds loose edits, under `sharedCheckoutStaysClean`.
- commit-policy's slice persistence checkpoints nothing from the shared checkout under `unitsHaveWorktrees` (`WIP_SHARED_CHECKOUT`, a terminal refusal, so the event is not replayed) and says which file it left and why.
- commit-policy's `work_ref` tool, the route an MCP-only host (Copilot) takes, refuses `checkpoint` and `materialize` with the same message as `work checkpoint`; `recover` moves no file and stays.
- An extra barrier where the host offers one: `delendai guard pre-edit` judges an edit tool call (Claude Code's PreToolUse JSON) and blocks, with exit 2, an edit inside the repository but outside the worktree of the unit the agent holds; `init` writes the hook into `.claude/settings.json` for a project whose hosts include Claude Code, merging into the person's file.
- Every rendered instruction (work-model steps, guard remedies, status advice, proposal next action, the work-unit skill, the bootstrap) loses the shared-checkout checkpoint invitation and says the shared checkout is never edited.

## slices

- global_gate: none

### S1 — Nothing reaches a work ref from the shared checkout, which stays clean
- **Status**: review
- **Files**: `packages/core/src/lib/development-policy/shared-checkout-clean.ts`, `plugins/commit-policy/src/lib/tools/work-ref.tool.ts`, `packages/core/src/lib/work-units/unit-edit-fence.service.ts`, `packages/cli/src/lib/pre-edit-guard.service.ts`, `packages/cli/src/lib/init/init-claude-settings.ts`, `packages/core/src/lib/work-units/shared-checkout-clean.service.ts`, `packages/core/src/lib/work-units/work-unit.service.ts`, `packages/core/src/lib/work-units/work-unit-checkpoint.service.ts`, `packages/core/src/lib/development-policy/git-guard.ts`, `packages/cli/src/commands/guard.command.ts`, `plugins/commit-policy/src/lib/persistence/wip-persistence.ts`, `plugins/commit-policy/src/lib/engine.ts`, `packages/core/src/lib/development-policy/declare-workflow.ts`, `docs/delendai/AGENT-BOOTSTRAP.md`
- **Gate**: none
- acceptance:
  - "`work checkpoint` from the shared checkout under shared-checkout-pr and worktree-pr takes nothing, names each declared file it left and why and the unit's worktree; a spec covers a file changed by two writers."
  - "`work enter`, `checkpoint`, `prove` and `publish` refuse while the shared checkout holds a loose edit, naming `delendai work rescue`; `status` and `rescue` run; specs cover each."
  - "The commit guard refuses an agent's commit while the shared checkout holds loose edits under shared-checkout-pr, and not under worktree-pr or for a person; a spec covers it."
  - "A slice event whose declared file was changed in the shared checkout by another writer checkpoints none of the declared files, says which file it left and why, and is settled as terminal; specs cover it."
  - "No rendered work-model step under shared-checkout-pr, shared-checkout-merge or worktree-pr contains `work checkpoint`; a spec covers it."
  - "commit-policy's `work_ref` checkpoint and materialize refuse from the shared checkout under every work-ref profile with `work checkpoint`'s message and move nothing; a spec covers it."
  - "`delendai guard pre-edit` blocks Edit and Write outside the agent's unit worktree with exit 2 and lets its own worktree through; `init` writes the hook for Claude Code projects and keeps the person's settings; specs cover both."
- shipped-in: `ef203ed1fd27`
- review-state: in_review
- review-implementer: claude-opus-5-5

## acceptance

- `work checkpoint` from the shared checkout under shared-checkout-pr and worktree-pr takes nothing, names each declared file it left and why and the unit's worktree; a spec covers a file changed by two writers.
- `work enter`, `checkpoint`, `prove` and `publish` refuse while the shared checkout holds a loose edit, naming `delendai work rescue`; `status` and `rescue` run; specs cover each.
- The commit guard refuses an agent's commit while the shared checkout holds loose edits under shared-checkout-pr, and not under worktree-pr or for a person; a spec covers it.
- A slice event whose declared file was changed in the shared checkout by another writer checkpoints none of the declared files, says which file it left and why, and is settled as terminal; specs cover it.
- No rendered work-model step under shared-checkout-pr, shared-checkout-merge or worktree-pr contains `work checkpoint`; a spec covers it.
- commit-policy's `work_ref` checkpoint and materialize refuse from the shared checkout under every work-ref profile with `work checkpoint`'s message and move nothing; a spec covers it.
- `delendai guard pre-edit` blocks Edit and Write outside the agent's unit worktree with exit 2 and lets its own worktree through; `init` writes the hook for Claude Code projects and keeps the person's settings; specs cover both.
