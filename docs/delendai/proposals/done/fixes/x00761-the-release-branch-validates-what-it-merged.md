---
id: x00761
title: "The release branch validates what it merged"
kind: fix
status: done
type: proposal
track: trust
date: 2026-09-29
priority: P1
related: [x00757, x00758]
last-transition-id: 4d9fcceb-0c05-4a66-9bd6-243675537931
last-correlation-id: 4d9fcceb-0c05-4a66-9bd6-243675537931
last-transition-from: review
shipped-in:
  - "abb55b856b3c"
---

# x00761 — The release branch validates what it merged

## goal

The CI run on the release branch after a promotion judges the merged
code, and is not red for a rule about making commits.

## why

The first push run of `ci.yml` on `main` (run `36608774433`, after #641
merged on 2026-09-29) failed `lint-governance`, and with it
`delendai-validate`. The failing step was `lint:commit-branch`:
"committing on `main` — outside every branch namespace the development
policy declares". The push run checks the release branch out by name, so
the guard, whose question is "may a commit be made on this branch", read
the forge's merge as an agent committing on `main`. Every promotion would
end red on the release branch, for a commit nobody made.

## why this design

- The guard keeps refusing a commit on the release branch where a commit
  is being made: locally, or anywhere with files staged.
- It stands aside only for a CI checkout (`CI=true`, the variable CI
  providers set) of the policy's declared release branch
  (`branches.release`) with nothing staged, and says so as
  `NOT_APPLICABLE` rather than passing silently.
- The release branch comes from the development policy, not a literal,
  so a project that releases from another branch gets the same answer.

## non-goals

- Changing where agents may commit.

## Slices

- global_gate: none

### S1 — A CI checkout of the release branch is not a commit

- **Status**: done
- **Gate**: `npx vitest run tools/scripts/lint/commit-branch-discipline.script.spec.ts`
- **Files**:
  - `tools/scripts/lint/commit-branch-discipline.script.ts`
  - `tools/scripts/lint/commit-branch-discipline.script.spec.ts`
- shipped-in: `abb55b856b3c`
- review-state: done
- review-implementer: claude-opus-5-5
- review-reviewer: MiniMaxM3
- review-log: approved by MiniMaxM3 — x00761 S1 shipped in abb55b856b3c (fix(lint): the release branch validates what it merged). commit-branch-discipline now reads branches.release from the policy: a CI checkout (CI=true) of the release branch with nothing staged returns NOT_APPLICABLE; a commit on it (locally, or with files staged) is still refused. 20/20 tests green.
- review-attribution: claude-opus-5-5 from Merge pull request #661 from CartagoGit/delendai/pr/claude-opus-5-5/implement/x00761-all-g1/the-release-branch-checkout-is-not-a-commit (refs/heads/delendai/wip/claude-opus-5-5/implement/x00761-all-g1/the-release-branch-checkout-is-not-a-commit) (abb55b856b3ce2c0b8e4d077de9ea6d6b776643d), opened by MiniMaxM3

## dependency graph

None.

## acceptance

- `CI=true bun tools/scripts/lint/commit-branch-discipline.script.ts --branch main`
  exits 0 and prints `NOT_APPLICABLE`.
- The same with a file staged, or without `CI`, still refuses.
- The next push run on `main` passes `lint-governance`.
