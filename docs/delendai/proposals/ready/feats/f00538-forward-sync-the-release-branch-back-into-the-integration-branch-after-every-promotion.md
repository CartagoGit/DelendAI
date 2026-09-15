---
id: f00538
title: "Forward-sync the release branch back into the integration branch after every promotion"
kind: feat
status: ready
type: proposal
track: trust
date: 2026-09-15
tags:
    - forge
    - branches
    - release
    - automation
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

- **Status**: done — `forwardSyncVerdict` classifies the gap as `in-sync`, `ancestry-only`, `content` or `conflict` from measured facts. The trial merge runs in a throwaway worktree. With `--apply` the script pushes `delendai/pr/forward-sync-<sha9>`, opens the pull request and arms auto-merge; inside a workflow it also dispatches `ci.yml` so the required check reports. It never force-pushes over an existing ref. A dry run against the forge on 2026-09-15 reported `ancestry-only` for `c7eda197a`. Branch names come from the development policy through `declaredBranches`, which `ref-lifecycle-guard` now shares instead of its private copy.
- **Files**: [`tools/scripts/forge/forward-sync-release.script.ts`, `tools/scripts/forge/forward-sync-release.interface.ts`, `tools/scripts/forge/forward-sync-release.script.spec.ts`, `tools/scripts/lib/declared-branches.ts`, `tools/scripts/lib/declared-branches.spec.ts`, `tools/scripts/lint/ref-lifecycle-guard.script.ts`, `package.json`]
- **Gate**: `npx vitest run tools/scripts/forge/forward-sync-release.script.spec.ts tools/scripts/lib/declared-branches.spec.ts`

### S2 — A history-only sync is a delivery, and only that one

- **Status**: done — `lint:candidate-delivers` accepts a zero-file pull request only when the release tip is in the candidate's history and not in its base's. It asks the forge's compare API in CI and falls back to `git merge-base --is-ancestor`. A fact it cannot establish exempts nothing, so the #100 shape (empty, with no release tip) is still refused.
- **Files**: [`tools/scripts/lint/candidate-delivers.script.ts`, `tools/scripts/lint/candidate-delivers.script.spec.ts`]
- **Gate**: `npx vitest run tools/scripts/lint/candidate-delivers.script.spec.ts`

### S3 — Run it on every move of the release branch

- **Status**: done — `forward-sync-release.yml` runs on a push to `main` and on `workflow_dispatch`, with `contents`, `pull-requests` and `actions` write and full history. `ci.yml` gains `workflow_dispatch`, the one event a workflow token may start, so the candidate's required check can run. The forge resolves both workflows from the default branch (`main`), so they take effect from the next promotion.
- **Files**: [`.github/workflows/forward-sync-release.yml`, `.github/workflows/ci.yml`]
- **Gate**: `bun run lint:workflow-yaml && bun run lint:workflow-runner-bootstrap && bun run lint:workflow-bootstrap`

### S4 — Let the workflow token open the pull request

- **Status**: pending — operator decision. The repository reports `can_approve_pull_request_reviews: false`, and under that setting a workflow token cannot open a pull request. Until the setting changes, the workflow pushes the ref, fails red, and prints the exact `gh pr create` command in its summary. The setting is not changed from here: it widens what every workflow token may do, and that is the owner's call.
- **Files**: [`.github/workflows/forward-sync-release.yml`]
- **Gate**: a push to `main` ends with a forward-sync pull request armed for auto-merge and `delendai-validate` reported on its head, with no manual step.

### S5 — Close the gap that exists today

- **Status**: pending — ran on 2026-09-15 after S2 reached `develop` (#236). The verdict was `ancestry-only` for `c7eda197a`, and the run opened #237 with 0 changed files and auto-merge armed. It stays open until #237 merges and the gate below reads 0. The first attempt found a defect: the script pushed from its throwaway worktree under the system temp directory, where the shared pre-push hooks cannot find `node_modules`. It now pushes the merge commit by SHA from the installed checkout.
- **Files**: [`tools/scripts/forge/forward-sync-release.script.ts`]
- **Gate**: `git rev-list --left-right --count origin/main...origin/develop` reports `0` on the left.

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
