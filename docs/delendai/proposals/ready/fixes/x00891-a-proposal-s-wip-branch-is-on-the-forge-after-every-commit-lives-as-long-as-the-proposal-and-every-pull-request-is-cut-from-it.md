---
id: x00891
title: "a proposal's wip branch is on the forge after every commit, lives as long as the proposal, and every pull request is cut from it"
kind: fix
status: ready
type: proposal
track: general
date: 2026-10-13
---

# x00891 — a proposal's wip branch is on the forge after every commit, lives as long as the proposal, and every pull request is cut from it

## goal

No work exists only on one machine: every commit an agent makes on its unit is pushed to the same branch on the forge at once, the unit's branch is one per proposal and survives each publication, every pull request is a snapshot of it, and each start of the server leaves every unit in step with the forge so work continues from any machine.

## why

The owner, 2026-10-13: work left in a worktree on one machine is in limbo on another. With no commit and no push, at the office there is nothing of it; doing it again there means the same work twice and an orphan. That is why every change an agent makes must be committed and pushed to its branch, even when it works through refs in a worktree without disturbing anyone, so the worktree, its branch and its ref stay chained, visible, and the same on every machine. That is also why there should be one perennial wip branch per proposal, with every pull request cut from it. Work continues on the wip; a pull request that fails is fixed there, and a later pull request from the same branch carries the reconciled code with it.

What the code does today, measured on this clone on 2026-10-13:

1. **Commits stay on the machine.** `persistence.autoPushAfterCommit` is true in every profile (`development-policy/profiles.ts`), but only the WIP engine's checkpoints honour it (`wip-engine/work-ref-publication.ts`, `work-checkout-publisher.ts`). A `git commit` in a unit's worktree, which is how agents work, pushes nothing: the forge held no `delendai/wip/claude-opus-5-5/*` branch at all while four units had commits. No guard hook runs after a commit (the installed set is pre-commit, commit-msg, reference-transaction, pre-push, post-checkout, post-merge, post-index-change).
2. **Publishing ends the branch.** `work-units/work-publish.service.ts` removes the worktree, deletes the work ref on the forge and deletes it locally after pushing `pr/…`. f00642 S3 kept a proposal's branch "after it publishes" only for a later `work enter` to find, and that never happens once the ref is gone. Re-entering x00887 and x00889 on 2026-10-13 started from develop, and their publications had to be merged back in by hand.
3. **One proposal, several branches.** The work ref is `wip/<agent>/<kind>/<proposal>-<slice>-g<n>/<topic>`: the proposal's creation and its implementation are two branches, and so is each slice entered on its own.
4. **A start does not reconcile.** Nothing at start pushes a unit's unpushed commits or brings in the commits the same unit gained on another machine, so the state an agent resumes from depends on which machine it is on.

## non-goals

- Changing how work reaches the integration branch: pull requests into develop, merged by the queue, stay as they are.
- Pushing the integration branch from the shared checkout: it only follows develop.

## slices

- global_gate: type

### S1 — Every commit on a unit's branch is on the forge at once

- **Status**: pending
- **Files**:
  - `packages/core/src/lib/contracts/interfaces/guard-hooks.interface.ts`
  - `packages/core/src/lib/contracts/interfaces/unit-push.interface.ts`
  - `packages/core/src/lib/guard-hooks/guard-hook-block.helper.ts`
  - `packages/core/src/lib/work-units/unit-push.service.ts`
  - `packages/core/src/cli.ts`
  - `packages/cli/src/commands/guard.command.ts`
  - `packages/cli/src/contracts/constants/guard-hooks.constant.ts`
  - `packages/cli/src/contracts/interfaces/guard.interface.ts`
  - `lefthook.yml`
  - `packages/core/tests/src/lib/work-units/unit-push.service.spec.ts`
  - `packages/cli/src/commands/guard-facts.spec.ts`
  - `packages/cli/src/lib/guard-hooks.service.spec.ts`
  - `packages/cli/src/lib/guard-hooks-autoinstall.service.spec.ts`
- **Gate**: type
- acceptance:
  - A commit or merge on a work ref, made in its worktree by any means, is pushed to the same branch on the forge before the command returns. A push the forge refuses (the branch moved on another machine) is reported with the command that reconciles it, never forced.
  - A commit on the integration branch or any branch outside the work namespace pushes nothing.

### S2 — Publishing cuts a pull request from the branch and leaves the branch alone

- **Status**: pending
- **Files**:
  - `packages/core/src/lib/work-units/publication-target.service.ts`
  - `packages/core/src/lib/work-units/work-unit-publish.service.ts`
  - `packages/core/src/lib/work-units/unit-standings.service.ts`
  - `packages/core/src/lib/work-units/unit-reaper.service.ts`
  - `packages/core/src/lib/work-units/unit-removal.service.ts`
  - `packages/core/tests/src/lib/work-units/publication-target.service.spec.ts`
  - `packages/core/tests/src/lib/work-units/work-unit.service.spec.ts`
  - `packages/core/tests/src/lib/work-units/unit-reaper.service.spec.ts`
- **Gate**: type
- acceptance:
  - Publishing pushes the wip branch's tip to its `pr/…` branch and opens or updates the pull request. The wip branch, local and on the forge, and its worktree stay while the proposal is not done.
  - A fix made on the wip branch after a red pull request is published into the same open pull request. After a merge, the next publication opens a new pull request from the same wip branch, carrying only what develop lacks.
  - The wip branch is retired (kept under `refs/<namespace>/retired/`) only when its proposal reaches done or is abandoned, and only once everything on it is on develop.

### S3 — One wip branch per proposal

- **Status**: pending
- **Files**:
  - `packages/core/src/lib/work-units/proposal-branch.service.ts`
  - `packages/core/src/lib/work-units/work-unit-generation.service.ts`
  - `packages/core/tests/src/lib/work-units/proposal-branch.service.spec.ts`
- **Gate**: type
- acceptance:
  - Entering a proposal to create or implement it, for any slice, continues on the branch the agent already has for that proposal: creating it, implementing it and fixing it are one branch. A review or an audit stays its own unit.
  - Publishing names the unit by any of those kinds and slices and finds that one branch, so a pull request is always cut from it.
  - Branch names keep their current shape, so no existing branch is renamed and no ref migration is needed.

### S4 — A start leaves every unit in step with the forge

- **Status**: pending
- **Files**:
  - `packages/core/src/lib/contracts/constants/unit-forge-sync.constant.ts`
  - `packages/core/src/lib/contracts/interfaces/unit-forge-sync.interface.ts`
  - `packages/core/src/lib/work-units/unit-forge-sync.service.ts`
  - `packages/core/src/lib/project/create-mcp-project.ts`
  - `tools/scripts/lib/hermetic-agent-bridge-setup.ts`
  - `packages/core/tests/src/lib/work-units/unit-forge-sync.service.spec.ts`
- **Gate**: type
- acceptance:
  - At every start, each unit of this clone with commits the forge lacks is pushed. Each wip branch of the same agent on the forge that this clone lacks, or holds behind, is fetched and its unit fast-forwarded. A branch that diverged is a blocker naming the reconciling command.
  - Uncommitted edits in a kept unit's worktree are committed as a durable checkpoint and pushed (`checkpoint.durableWip`), so changing machine never leaves work only on disk.
  - A project with the old layout (wip branches that exist only on this clone) has them pushed at its first start on this code; branch names keep their shape (S3), so nothing is renamed. `DELENDAI_UNIT_FORGE_SYNC=off` turns the pass off, which the test suites do.

### S5 — The doctor sees work that is not on the forge

- **Status**: pending
- **Files**:
  - `packages/core/src/lib/work-units/units-on-forge.service.ts`
  - `packages/core/src/lib/work-units/workflow-invariants.service.ts`
  - `packages/core/src/lib/work-units/forge-work-refs.service.ts`
- **Gate**: type
- acceptance:
  - `units-on-the-forge` reports every unit whose branch holds commits the forge lacks, or uncommitted edits, with the repair; a start that repairs them leaves it holding.
  - A wip branch on the forge whose work landed is not reported as hanging (`no-remote-work-refs`) while its proposal is open.

## acceptance

- After any agent action that changed files, the work is on the forge under the proposal's wip branch.
- A second machine that starts the server has every unit of its agents, at the same commit.
- A proposal's pull requests are all cut from one wip branch that outlives them.
