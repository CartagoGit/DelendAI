---
id: x00742
title: "A review pack ends in a pull request"
kind: fix
status: done
type: proposal
track: hosts
date: 2026-09-28
priority: P0
related: [x00739, x00740, x00741]
last-transition-id: 9f1d4b08-75b7-48b0-90e6-945ce93b8471
last-correlation-id: 9f1d4b08-75b7-48b0-90e6-945ce93b8471
last-transition-from: review
shipped-in:
  - "5eba33120"
---

# x00742 — A review pack ends in a pull request

## goal

Every reviewer, on any host, works in one unit per pack of proposals and
publishes each pack as a pull request. No unit is left behind, and nothing
tells a reviewer to run git by hand.

## why

On 2026-09-28 a swarm of `minimax-3` and `glm-5.3-max` reviewers had nine
review units and no pull request. Nothing they judged reached the
integration branch.

- The procedure said to publish "when nothing waits". With a hundred
  proposals in review, something always waited, so no reviewer ever reached
  the publish step.
- Each `review next` or `work enter` without `--session` counted as another
  session, and a new generation was handed out. Agents lose the token, so
  one instance left seven units behind.
- The queue told reviewers to claim with a raw `git commit --allow-empty`.
  Agents then did the rest by hand as well: 32 proposals were moved to
  `done` by editing their files.
- Units lost their branches while their worktrees still stood: someone
  deleted "empty" branches from a shell with `update-ref -d`, which never
  asks.
- The doctor, run from a hook in a unit, answered about the unit as if it
  were the shared checkout. It reported "off `develop`, 14 changes" and told
  the agent to `git switch develop`. It also flagged every live unit's
  forge backup, and told the agent to delete it.

## why this design

- **Packs of five.** `REVIEW_PACK_SIZE` is stated once, in the proposals
  plugin. A unit that holds a full pack is refused a sixth claim, and a
  verdict on a sixth proposal, with the step that publishes the pack.
  `review_queue` given `unit` reports `pack: { size, claimed, full, next }`.
  `delendai review next` publishes a full pack itself, continues in a new
  unit, and publishes the last pack when nothing is left.
- **A published pack's name is taken until it merges.** A review batch's
  claims are read back to its unit's name. A generation whose publication
  still exists is skipped, so a new unit never inherits the published
  pack's proposals.
- **Your unit is where you stand.** Run from inside one of this agent's
  unit worktrees, a `work` command without `--session` resumes that unit.
- **The tool, not git.** The queue's claim text names `review_claim`, and
  the procedure says the rest: one unit per pack, never delete or rename a
  branch, never move a proposal with git.
- **A live unit's branch is not deleted.** The guard judges branch
  deletions in `reference-transaction`: deleting a work ref that a worktree
  stands on is refused, for anyone. Publishing removes the worktree first.
- **The doctor asks the shared checkout.** Its git calls drop what git
  exports to a hook (`GIT_DIR`, `GIT_INDEX_FILE`, …), and a remote work ref
  counts only when nothing works on its unit.

## non-goals

- A configurable pack size.

## architecture

- `plugins/proposals`: `review-claims.constant.ts`,
  `review-claim.service.ts`, `review-claim.tool.ts`,
  `review-queue.service.ts`, `review-queue-schema.constant.ts`,
  `review-procedure.ts`.
- `packages/cli/src/commands/review.command.ts`, `guard.command.ts`.
- `packages/core`: `work-unit.service.ts`, `work-unit-shared.service.ts`,
  `work-unit-generation.service.ts`, `workflow-invariants.service.ts`,
  `git-guard-live-unit.ts`, `git-guard.ts`, `git-guard-shape.ts`.

## Slices

- global_gate: none

### S1 — Packs, resumed units, live branches, an honest doctor

- **Status**: done
- **Gate**: `npx vitest run plugins/proposals/tests/src/lib/tools/review-claim.tool.spec.ts plugins/proposals/tests/src/lib/tools/review-queue-swarm.tool.spec.ts packages/core/tests/src/lib/work-units packages/core/tests/src/lib/development-policy packages/cli/src/commands/guard.command.spec.ts`
- **Files**:
  - `plugins/proposals/src/lib/contracts/constants/review-claims.constant.ts`
  - `plugins/proposals/src/lib/contracts/constants/review-queue-schema.constant.ts`
  - `plugins/proposals/src/lib/contracts/interfaces/review-claim-outcome.interface.ts`
  - `plugins/proposals/src/lib/contracts/interfaces/review-queue.interface.ts`
  - `plugins/proposals/src/lib/services/review-claim.service.ts`
  - `plugins/proposals/src/lib/services/review-queue.service.ts`
  - `plugins/proposals/src/lib/services/review-procedure.ts`
  - `plugins/proposals/src/lib/tools/review-claim.tool.ts`
  - `plugins/proposals/src/generated/tool-outputs.ts`
  - `plugins/proposals/tests/src/lib/tools/review-claim.tool.spec.ts`
  - `plugins/proposals/tests/src/lib/tools/review-queue-swarm.tool.spec.ts`
  - `packages/cli/src/commands/review.command.ts`
  - `packages/cli/src/commands/guard.command.ts`
  - `packages/cli/src/commands/guard.command.spec.ts`
  - `packages/cli/src/contracts/interfaces/guard.interface.ts`
  - `packages/core/src/lib/contracts/constants/hook-git-environment.constant.ts`
  - `packages/core/src/lib/contracts/interfaces/git-guard.interface.ts`
  - `packages/core/src/lib/development-policy/git-guard-live-unit.ts`
  - `packages/core/src/lib/development-policy/git-guard.ts`
  - `packages/core/src/lib/development-policy/git-guard-shape.ts`
  - `packages/core/src/lib/work-units/work-unit.service.ts`
  - `packages/core/src/lib/work-units/work-unit-shared.service.ts`
  - `packages/core/src/lib/work-units/work-unit-generation.service.ts`
  - `packages/core/src/lib/work-units/workflow-invariants.service.ts`
  - `packages/core/tests/src/lib/development-policy/git-guard-live-unit.spec.ts`
  - `packages/core/tests/src/lib/work-units/work-unit.service.spec.ts`
  - `packages/core/tests/src/lib/work-units/workflow-invariants.service.spec.ts`
- review-state: done
- review-implementer: claude-opus-5-5
- review-reviewer: minimax-m3
- review-log: approved by minimax-m3 — Revisé 5eba33120 (x00742 S1, merge PR #612). review-claims.constant.ts declara REVIEW_PACK_SIZE=5; una unidad con 5 claims es rechazada para el sexto claim y para un sexto verdict, y la cola (con unit) reporta pack.{size,claimed,full,next}. review next publica un pack lleno y abre una nueva unidad que NO reutiliza la generación publicada. work enter sin --session dentro del worktree retoma esa unidad. git-guard-live-unit.ts en reference-transaction rechaza borrar un work ref con worktree vivo (cualquiera); tras git worktree remove, el delete procede. workflow-invariants.service.ts strip los GIT_* exportados por hooks y considera la unidad viva, no la rama. Esta misma sesión vivió este flujo (pack 1 lleno → publish → nueva unidad → pack 2 lleno → join del PR existente). 334/334 verde en 30 specs. claude-opus-5-5 != minimax-m3 → veredicto independiente.
- review-attribution: claude-opus-5-5 from commit 5eba33120e0a names refs/heads/delendai/wip/claude-opus-5-5/implement/x00742-S1-g1/a-review-pack-ends-in-a-pull-request (5eba33120e0af58a1ceef01464112450f700c05b), opened by minimax-m3

## dependency graph

None.

## acceptance

- A unit holding five claims is refused a sixth, by `review_claim` and by
  a verdict, and told how to publish. `review_queue` with `unit` reports
  the pack.
- `delendai review next` on a full pack publishes it and continues in a
  new unit, which does not reuse the published generation.
- `work enter` run inside the agent's unit, with no `--session`, returns
  that unit.
- `git update-ref -d` of a work ref a worktree stands on fails; after the
  worktree is removed it succeeds.
- Run with a worktree's `GIT_DIR` exported, the doctor reports the shared
  checkout clean and on `develop`. A live unit's remote ref is not flagged.
