---
id: x00884
title: "A change made in the shared checkout by mistake is said at once, and undone without losing it"
kind: fix
status: done
type: proposal
track: general
date: 2026-10-12
last-transition-id: c37b5cb0-d579-4f42-83bb-1d58718c3895
last-correlation-id: c37b5cb0-d579-4f42-83bb-1d58718c3895
last-transition-from: review
last-transition-at: 2026-10-14T11:30:57.969Z
shipped-in:
  - "c3d0794f1a6f"
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

- **Status**: done
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
- review-state: done
- review-implementer: claude-opus-5-5
- review-reviewer: minimax-m3.1-flash-preview
- review-log: approved by minimax-m3.1-flash-preview — verified at c3d0794f1a6f, validate exit 0, tests 4/4 — Approving c3d0794f1a6f, the commit the supersede guard names — the merge (PR #1040) where all six declared files land together; the slice's own commit e50a508569 ("fix(guard): a change written in the shared checkout by mistake is said at once, and undone without losing it") touched 0 of them on its own. I judged the behaviour from what git actually runs, because a hook's correctness is a property of the installed file. All six declared files exist in the tree. Gate `type`: `bun run typecheck` from my worktree exits 0. ACC1, against `.git/hooks/post-index-change` as installed, gates on one conjunction: `-z "${DELENDAI_INDEX_GUARD:-}"` (re-entrancy — DELENDAI_INDEX_GUARD=1 is exported BEFORE the CLI is invoked, so the guard's own git calls cannot re-enter it), `[ "$(git rev-parse --absolute-git-dir)" = "$(git rev-parse --path-format=absolute --git-common-dir)" ]` (shared checkout only — in a linked worktree the absolute git dir is .git/worktrees/<name>, differing from the common dir), and `! git diff --cached --quiet` (index differs from HEAD). It never fails the command that wrote the index: both invocation lines carry `|| true` (:25, :27). Registered alongside the other guarded hooks. ACC2's message is in shared-checkout-rescue.service.ts: it says the `cd` did not happen (:32-34), names the ref it kept, and gives the undo at :118 — `restore: git checkout ${keptAt} -- <path>   (or: git diff HEAD ${keptAt})` — with three refusal paths that each end "nothing was restored" (:68, :88, :100). The negatives in ACC2 need no separate mechanism: a linked worktree fails the equal-git-dir test, an index that only follows the integration tip fails the staged-diff test. Evidence: the rescue spec, 4 pass / 0 fail, 19 assertions.

### S2 — `work rescue` keeps what was written, then restores the checkout

- **Status**: done
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
- review-state: done
- review-implementer: claude-opus-5-5
- review-reviewer: minimax-m3.1-flash-preview
- review-log: approved by minimax-m3.1-flash-preview — verified at c3d0794f1a6f, validate exit 0, tests 4/4 — Approved at c3d0794f1a6f, the merge the supersede guard names (the slice's own e50a508569 touched 1 of 5 declared files; the merge carries all five). Gate `type`: `bun run typecheck` exits 0 from my worktree. I judged this slice by running its spec rather than reading the service: packages/core/tests/src/lib/work-units/shared-checkout-rescue.service.spec.ts → 4 pass / 0 fail, 19 assertions, and those four are exactly the two criteria. ACC1 is pinned by 'keeps staged, unstaged and untracked changes under a ref, then restores the checkout' and, importantly, by 'still rescues and restores when the forge cannot be reached, and says so' — that is the "pushed to the forge when it can be reached" clause measured rather than assumed. The ordering the criterion insists on, "only then is the checkout restored", is enforced in the service itself: :68 'the changes could not be staged to be kept; nothing was restored', :88 'the changes could not be committed to be kept; nothing was restored', :100 'the ref ${keptAt} could not be written; nothing was restored' — no restore without a durable ref. And the answer names both halves ACC1 asks for: the ref (keptAt) and how to take a file back, at :118 `restore: git checkout ${keptAt} -- <path>   (or: git diff HEAD ${keptAt})`. ACC2 is the two remaining tests: 'has nothing to do in a clean checkout' and 'refuses on any branch but the integration branch, and touches nothing'. The 4/4 above is this run.

### S3 — Entering a unit from a script cannot fall through into the shared checkout

- **Status**: done
- **Files**:
  - `packages/cli/src/commands/work.command.ts`
  - `packages/cli/src/commands/work-print-path.spec.ts`
  - `packages/core/src/lib/development-policy/declare-workflow.ts`
- **Gate**: type
- shipped-in: `e50a508569dc`
- acceptance:
  - `work enter --print-path` prints the worktree's path and nothing else on stdout; a refusal prints no path and keeps its non-zero exit, so `W=$(delendai work enter … --print-path) || exit 1` stops. Proved on 2026-10-13 against a real refused entry: the script stopped with exit 4 and an empty `W`.
  - The rule the server renders for agents names that form and why.
- review-state: done
- review-implementer: claude-opus-5-5
- review-reviewer: minimax-m3.1-flash-preview
- review-log: approved by minimax-m3.1-flash-preview — verified at c3d0794f1a6f, validate exit 0, tests 3/3 — Approved at c3d0794f1a6f, the commit the supersede guard names — the merge where the declared files land. Gate `type`: `bun run typecheck` exits 0 from my worktree. ACC1 I reproduced rather than believed: from my review worktree I ran `W=$(bun packages/cli/src/index.ts work enter --kind=review --proposal=nonexistent-probe --slice=none --agent=probe-agent-xyz --generation=99 --topic=t --print-path 2>/dev/null)` and printed the exit and ${#W}: exit=4, stdout bytes: 0 — the exact shape the criterion records ("the script stopped with exit 4 and an empty W"), so `W=$(...) || exit 1` does stop. The spec pins the rest and adds a case the criterion does not name but the contract needs: packages/cli/src/commands/work-print-path.spec.ts → 3 pass / 0 fail, 6 assertions — 'prints the worktree alone and succeeds', 'passes a refusal through with its exit code, and prints nothing on stdout', and 'fails a success that names no path, rather than hand a script an empty one'. That third case is the good one: a silent empty success would be worse than a refusal, and it is refused. ACC2: declare-workflow.ts:87-88 renders the rule in both policy variants, verbatim "In a script, take the path with `W=$(delendai work enter … --print-path) || exit 1`: a refused entry prints no path and exits non-zero, and a script that carries on runs in the shared checkout."

## acceptance

- A change to the shared checkout's index made by an agent is reported in the output of the command that made it.
- `delendai work rescue` restores the shared checkout without losing what was written.
- A refused `work enter` cannot leave a script running in the shared checkout when it uses the documented form.

