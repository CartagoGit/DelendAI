---
id: f00538
title: "Forward-sync the release branch back into the integration branch after every promotion"
kind: feat
status: review
type: proposal
track: trust
date: 2026-09-15
tags:
    - forge
    - branches
    - release
    - automation
last-transition-id: 38e5f9ef-ccfa-4ea4-9466-fd7f5d0ee26d
last-correlation-id: 38e5f9ef-ccfa-4ea4-9466-fd7f5d0ee26d
last-transition-from: in-progress
shipped-in:
  - "7dfa7abc3476102c786e172126e750286090d948"
---

# f00538 — Forward-sync the release branch back into the integration branch after every promotion

## goal

Every time the release branch moves, a pull request carries it back into
the integration branch, so the integration branch never stays behind the
branch it releases to. The same step keeps a hotfix that landed on the
release branch from being reverted by the next promotion.

## why

f00395 adopted the flow "pull request integration → release, merge, then
sync release → integration". The sync half was never automated.

Measured on 2026-09-15: `develop` was 127 ahead of `main` and 1 behind
while an audit was running. By the end of that audit it was 136 ahead and
still 1 behind. The one commit is `c7eda197a`, "Merge pull request #178
from CartagoGit/develop": the merge commit the last promotion wrote. It
carries no patch of its own. A trial merge of `main` into `develop`
produced tree `1a19f55e9`, byte-identical to `develop`'s tree.

Two different situations produce that same "1 behind":

- **History only.** The merge commit every promotion leaves behind. The
  gap is harmless, but it never closes on its own, and it hides the next
  case.
- **Content.** A change that reached the release branch without passing
  through integration. The next promotion reverts it, and nothing warns
  anyone.

The ahead/behind counts cannot tell these two apart, which is why nobody
could act on the counts. With develop moving this fast, the gap will keep
coming back after every promotion unless the step is automated.

`tools/scripts/forge/sync-with-integration.script.ts` is not this. It
fast-forwards a local clone and never touches the forge.

## non-goals

- **Never push to a protected branch.** The integration branch requires a
  pull request and `delendai-validate`, and this proposal satisfies both
  instead of going around them.
- **No conflict resolution.** A conflicting sync is reported with the next
  action and left to a person.
- **No permanent admin token.** The workflow runs on `github.token` only.
- **No weakened delivery gate.** `lint:candidate-delivers` gains one
  exemption, exactly as wide as the fact it rests on.

## slices

### S1 — Decide what carrying the release branch back amounts to, then open it

- **Status**: done
- **Files**: [`tools/scripts/forge/forward-sync-release.script.ts`, `tools/scripts/forge/forward-sync-release.interface.ts`, `tools/scripts/forge/forward-sync-release.script.spec.ts`, `tools/scripts/lib/declared-branches.ts`, `tools/scripts/lib/declared-branches.spec.ts`, `tools/scripts/lint/ref-lifecycle-guard.script.ts`, `package.json`]
- **Gate**: `npx vitest run tools/scripts/forge/forward-sync-release.script.spec.ts tools/scripts/lib/declared-branches.spec.ts`
- shipped-in: `e07b21b26b02`
- review-state: done
- review-implementer: claude-opus-5-5
- review-reviewer: minimax-m31
- review-log: approved by minimax-m31 — verified at 7dfa7abc3476, validate exit 0, tests 22/22 — Gate npx vitest run forward-sync-release.script.spec.ts declared-branches.spec.ts: 22/22 pass. Read the delivery: forwardSyncVerdict classifies from measured facts (releaseIsAncestor -> in-sync; conflicts -> conflict; treeChanges -> content; else ancestry-only) at forward-sync-release.script.ts:83-85, and mergeOutcome (line 97) treats unmerged paths as the only conflict, which is the fix the S5 defect note describes. The trial merge runs in a throwaway worktree; --apply pushes delendai/pr/forward-sync-<sha9>, opens the pull request and arms auto-merge; it never force-pushes over an existing ref (line 365 reports the refusal instead). Branch names come from declaredBranches, and ref-lifecycle-guard now imports that shared module instead of a private copy (ref-lifecycle-guard.script.ts:48,143,377). Non-goals honoured: no push to a protected branch (a pull request + delendai-validate is the path), no conflict resolution (the conflict verdict names the next action and stops). Later commits touched these files (56cdbd7a4 ref-lifecycle reaping, 7425f7cf0 work progress) and extend rather than contradict the delivery.
- review-attribution: claude-opus-5-5 from commit 7dfa7abc3476 names refs/heads/delendai/wip/claude-opus-5-5/implement/f00538-S5-g1/the-sync-merge-commits-with-its-hooks (7dfa7abc3476102c786e172126e750286090d948), opened by minimax-m31

### S2 — A history-only sync is a delivery, and only that one

- **Status**: done — `lint:candidate-delivers` accepts a zero-file pull request only when the release tip is in the candidate's history and not in its base's. It asks the forge's compare API in CI and falls back to `git merge-base --is-ancestor`. A fact it cannot establish exempts nothing, so the #100 shape (empty, with no release tip) is still refused.
- **Files**: [`tools/scripts/lint/candidate-delivers.script.ts`, `tools/scripts/lint/candidate-delivers.script.spec.ts`]
- **Gate**: `npx vitest run tools/scripts/lint/candidate-delivers.script.spec.ts`
- shipped-in: `0bf0fe61e015`

### S3 — Run it on every move of the release branch

- **Status**: done — `forward-sync-release.yml` runs on a push to `main` and on `workflow_dispatch`, with `contents`, `pull-requests` and `actions` write and full history. `ci.yml` gains `workflow_dispatch`, the one event a workflow token may start, so the candidate's required check can run. The forge resolves both workflows from the default branch (`main`), so they take effect from the next promotion.
- **Files**: [`.github/workflows/forward-sync-release.yml`, `.github/workflows/ci.yml`]
- **Gate**: `bun run lint:workflow-yaml && bun run lint:workflow-runner-bootstrap && bun run lint:workflow-bootstrap`
- shipped-in: `0bf0fe61e015`

### S4 — Let the workflow token open the pull request

- **Status**: review — the repository reports `can_approve_pull_request_reviews: true` since the owner changed the setting, and the workflow needs nothing else. The run of 2026-09-30 15:08 UTC opened #686 as `github-actions` with the workflow's own token, armed auto-merge on it seven seconds later, `delendai-validate` reported success on its head, and `github-actions` merged it on 2026-10-01 with no manual step. That run was a `workflow_dispatch`: `main` has not moved since, so the `push` trigger itself is still unobserved; it runs the same job. If the setting is ever turned off again the workflow still pushes the ref, fails red and prints the exact `gh pr create` command in its summary.
- **Files**: [`.github/workflows/forward-sync-release.yml`]
- **Gate**: a push to `main` ends with a forward-sync pull request armed for auto-merge and `delendai-validate` reported on its head, with no manual step.
- review-state: in_review
- review-implementer: claude-opus-5-5
- shipped-in: `0bf0fe61e015`

### S5 — Close the gap that exists today

- **Status**: done — gate read `0 302` on 2026-10-01, after #686 merged. Ran on 2026-09-15 after S2 reached `develop` (#236). The verdict was `ancestry-only` for `c7eda197a`, and the run opened #237 with 0 changed files and auto-merge armed. It stays open until #237 merges and the gate below reads 0. The first attempt found a defect: the script pushed from its throwaway worktree under the system temp directory, where the shared pre-push hooks cannot find `node_modules`. It now pushes the merge commit by SHA from the installed checkout.
- **Found 2026-09-30 — the same defect at the commit.** After the promotion of #641, `main` was one commit ahead of `develop` (`0720e8436`). The forward-sync pull request #656 was closed without merging, and a re-dispatched run reported "merging main into develop stops on a conflict". There was no conflict: the merge commit ran the repository's commit hooks in the throwaway worktree, a hook died on `Cannot find module`, and every failure of `git merge` was read as a conflict. The merge now runs `--no-commit` first and only unmerged paths count as a conflict (`mergeOutcome`, a failure otherwise names its cause); the throwaway worktree gets the installed checkout's `node_modules` before the commit, so the hooks run instead of being skipped. Run read-only against `origin/main`/`origin/develop`: `ancestry-only`, merge committed through the hooks.
- **Found 2026-09-30 — the forward sync was reaped as soon as it opened.** With the merge fixed, the re-dispatched run opened #675, and five minutes later it was closed with its branch deleted, as #656 had been. The owner machine's `maintain-ref-namespace` reaped `delendai/pr/forward-sync-0720e8436` because "develop already contains everything it adds": `isSpent` judges a ref by content (an empty three-dot diff), and an `ancestry-only` forward sync adds no content by design. A forward-sync ref is now spent only once the integration branch contains its commit (`merge-base --is-ancestor`); every other ref is judged as before.
- **Found 2026-10-01 — the forward sync could not pass `tests`.** #686 carried no content, so the planner ran no test zone, no shard uploaded a report and the `tests` job failed merging reports that did not exist. x00790 made a plan that runs no zone the verdict; #686 then needed develop merged into its head, because a pull request's run used the workflow its head carried. It passed and merged, and the gate reads 0.
- **Files**: [`tools/scripts/forge/forward-sync-release.script.ts`, `tools/scripts/forge/forward-sync-release.script.spec.ts`, `tools/scripts/git/maintain-ref-namespace.script.ts`, `tools/scripts/git/maintain-ref-namespace.script.spec.ts`, `.github/workflows/ci.yml`]
- **Gate**: `git rev-list --left-right --count origin/main...origin/develop` reports `0` on the left.
- shipped-in: `20d9a0277167`

## acceptance

- `main` behind count is `0` after every promotion, without a person
  noticing first.
- A sync that would change files opens a pull request whose body says so
  and asks for review; a conflicting one fails red with the next action.
- `lint:candidate-delivers` still refuses an empty candidate that brings
  no release tip.

## notes

- `main`'s head carries a red `delendai-validate` from the promotion on
  2026-09-14 (`lint-governance`). The scheduled `update-stale-candidates`
  run also fails every hour on `main`, because `main`'s copy of that
  workflow predates its install step. Both resolve at the next promotion,
  which also activates S3.
- A workflow token's merge into `develop` does not start `develop`'s own
  push workflows. The candidate's head was already validated, and the
  next merge by a person runs them.
