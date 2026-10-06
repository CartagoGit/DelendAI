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
  - "0bf0fe61e015"
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
- review-reviewer: Illyria
- review-log: approved by Illyria — verified at 7dfa7abc3476, validate exit 0, tests 21/21 — Independently verified (reviewer Illyria; implementer attributed from Git as claude-opus-5-5). Gate 'npx vitest run tools/scripts/forge/forward-sync-release.script.spec.ts tools/scripts/lib/declared-branches.spec.ts' => 21/21 passed, exit 0. Delivered state confirms every claim: forwardSyncVerdict returns exactly in-sync/conflict/content/ancestry-only from measured facts (script lines 75-77); ref namespace is FORWARD_SYNC_REF_PREFIX='delendai/pr/forward-sync-'; no --force anywhere in the 460-line script, so it never force-pushes; branch names come from the shared declaredBranches() (line 299) rather than a private copy; --apply pushes the ref, opens the PR, arms auto-merge and dispatches ci.yml inside a workflow. Non-goals hold: only a PR ref is pushed, never the protected branch; a conflict prints a 'needs a person' summary with the next action (line 178) instead of resolving; the workflow carries GH_TOKEN github.token with no admin token. No acceptance items declared. Later commits touching these files (67e5c70bb, f1da8103c, 207557e21, 7dfa7abc) are not defects of this slice.
- review-attribution: claude-opus-5-5 from commit 7dfa7abc3476 names refs/heads/delendai/wip/claude-opus-5-5/implement/f00538-S5-g1/the-sync-merge-commits-with-its-hooks (7dfa7abc3476102c786e172126e750286090d948), opened by Illyria

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

- **Status**: done
- **Files**: [`.github/workflows/forward-sync-release.yml`]
- **Gate**: a push to `main` ends with a forward-sync pull request armed for auto-merge and `delendai-validate` reported on its head, with no manual step.
- shipped-in: `0bf0fe61e015`
- review-state: done
- review-implementer: claude-opus-5-5
- review-reviewer: Illyria
- review-log: approved by Illyria — verified at 0bf0fe61e015, validate exit 0, tests 3/3 — Independently verified (reviewer Illyria, not claude-opus-5-5). Slice gate is observational, so I verified the delivery and its evidence directly. (1) The workflow declares permissions contents/pull-requests/actions: write and runs 'GH_TOKEN: ${{ github.token }}' with no admin token, so the non-goal holds. (2) I queried the forge with the authenticated gh CLI: PR #686 is author=github-actions, headRefName=delendai/pr/forward-sync-0720e8436, title 'chore(release): forward-sync main 0720e8436 into develop', state=MERGED, mergedAt=2026-10-01T06:06:32Z. That is exactly the claim in the slice: opened by the workflow token, armed for auto-merge, merged with no manual step. (3) allow_auto_merge=true on the repository. The slice's gate names a push to main; main's last move is 0720e8436 on 2026-09-29, before the workflow landed on main, so the push trigger itself is still unobserved - the slice discloses this and the dispatch path exercises the identical job. I could not read can_approve_pull_request_reviews (absent from the REST payload, GraphQL-only), but the observed merge proves the behaviour regardless. Approved on the delivered state; the unobserved push trigger is a fact about the environment, not a defect of the slice. Later commit 35fcf6860 added a bounded timeout to every job.

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
