---
id: x00884
title: "A change made in the shared checkout by mistake is said at once, and undone without losing it"
kind: fix
status: in-progress
type: proposal
track: general
date: 2026-10-12
last-transition-id: df90d586-f9ea-4fe0-ac22-5260710d3dcd
last-correlation-id: df90d586-f9ea-4fe0-ac22-5260710d3dcd
last-transition-from: ready
last-transition-at: 2026-10-12T23:23:31.454Z
---

# x00884 — A change made in the shared checkout by mistake is said at once, and undone without losing it

## goal

An agent whose command lands in the shared checkout is told in that
command's own output; one command keeps what was written and restores the
checkout; and the way agents are told to enter a unit cannot carry a
script into the shared checkout when the entry is refused.

## why

On 2026-10-12 a script ran `W=$(delendai work enter … | grep path | cut …);
cd "$W" || exit 1; git merge --squash <pull request branch>`. The entry was
refused (the slice was reserved by the same agent's earlier unit). The
refusal exited 4, but the pipe kept only `cut`'s exit; `W` was empty;
`cd ""` succeeds without moving; and the merge staged 146 files in the
shared checkout, on the integration branch. Nothing said so until a later
`work doctor`. Restoring it meant `git reset --hard`, which the agent's
harness rightly refused to run unasked.

The guard already refuses a commit there; nothing caught the step before
it. The owner: "there should be safeguards for this kind of mistake — you
are intelligent and broke it; imagine a careless model."

## non-goals

- **No refusal of `git add` or a checkout.** Git offers no veto before the
  index is written; the hook tells, it does not block.
- **Nothing for people.** The guard governs agents; a person's index is
  their own.

## slices

- global_gate: type

### S1 — The shared checkout says so the moment its index changes

- **Status**: review
- **Files**:
  - `packages/core/src/lib/guard-hooks/guard-hook-block.helper.ts`
  - `packages/core/src/lib/contracts/interfaces/guard-hooks.interface.ts`
  - `packages/cli/src/contracts/constants/guard-hooks.constant.ts`
  - `packages/cli/src/contracts/interfaces/guard.interface.ts`
  - `packages/cli/src/commands/guard.command.ts`
  - `packages/cli/src/commands/guard-index-change.spec.ts`
- **Gate**: type
- shipped-in: `e50a508569dc`
- acceptance:
  - A `post-index-change` hook, installed with the other guarded hooks, asks the guard only in the shared checkout and only when the index differs from HEAD; it cannot be re-entered by the guard's own git calls and never fails the command that wrote the index.
  - To an agent (or an actor a pinned checkout takes for one) the guard says how many paths changed, where, that the `cd` into the unit did not happen, and the command that undoes it. A person, another branch, a linked worktree, and an index that only follows the integration branch's tip get nothing.

### S2 — `work rescue` keeps what was written, then restores the checkout

- **Status**: review
- **Files**:
  - `packages/core/src/lib/work-units/shared-checkout-rescue.service.ts`
  - `packages/core/src/lib/work-units/shared-checkout-rescue.interface.ts`
  - `packages/core/src/lib/work-units/work-unit.service.ts`
  - `packages/cli/src/contracts/constants/work-command.constant.ts`
  - `packages/core/tests/src/lib/work-units/shared-checkout-rescue.service.spec.ts`
- **Gate**: type
- shipped-in: `e50a508569dc`
- acceptance:
  - Staged, unstaged and untracked changes (never ignored files) become one commit on top of the branch tip, kept under `refs/<namespace>/rescued/shared-checkout-<sha>` and pushed to the forge when it can be reached; only then is the checkout restored. The answer names the ref and how to take a file back.
  - A clean checkout is told so; any branch but the integration branch is refused and touched not at all.

### S3 — Entering a unit from a script cannot fall through into the shared checkout

- **Status**: review
- **Files**:
  - `packages/cli/src/commands/work.command.ts`
  - `packages/cli/src/commands/work-print-path.spec.ts`
  - `packages/core/src/lib/development-policy/declare-workflow.ts`
- **Gate**: type
- shipped-in: `e50a508569dc`
- acceptance:
  - `work enter --print-path` prints the worktree's path and nothing else on stdout; a refusal prints no path and keeps its non-zero exit, so `W=$(delendai work enter … --print-path) || exit 1` stops. Proved on 2026-10-13 against a real refused entry: the script stopped with exit 4 and an empty `W`.
  - The rule the server renders for agents names that form and why.

## acceptance

- A change to the shared checkout's index made by an agent is reported in the output of the command that made it.
- `delendai work rescue` restores the shared checkout without losing what was written.
- A refused `work enter` cannot leave a script running in the shared checkout when it uses the documented form.

