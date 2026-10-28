---
id: x00993
title: "The already-implemented lint reads git once, so lint-governance finishes inside its time limit"
kind: fix
status: review
type: proposal
track: a00095-consistency
date: 2026-10-28
last-transition-id: 92d19160-6858-488f-928b-c95a1312179c
last-correlation-id: 92d19160-6858-488f-928b-c95a1312179c
last-transition-from: in-progress
last-transition-at: 2026-10-28T17:27:39.480Z
---

# x00993 — The already-implemented lint reads git once, so lint-governance finishes inside its time limit

## goal

`lint:proposal-already-implemented` answers in seconds whatever the size of the history, so `lint-governance` ends inside its 15-minute CI limit and a pull request is judged instead of cancelled.

## why

On 2026-10-28 all twelve open pull requests were BLOCKED and none was armed. Every `lint-governance` run ended "The operation was canceled" at 15 minutes (`timeout-minutes: 15` in ci.yml), inside `proposal-already-implemented`. The lint spawned `git ls-files --error-unmatch` for every file of every pending slice and `git log --follow --diff-filter=A` for every tracked one, over about 1,300 proposals and a history of thousands of commits: 4 min 10 s on the owner's machine, more on a runner after the other governance lints. The queue arms a candidate only when its required checks pass, so no pull request could land, and none was brought forward.

## non-goals

- Raising the job's time limit.
- Changing what the lint reports.

## slices

- global_gate: type

### S1 — One `git ls-files` and one history walk
- **Status**: review
- **Files**: `tools/scripts/lib/git-file-origin.ts`, `tools/scripts/lint/proposal-already-implemented.script.ts`, `tools/tests/lib/git-file-origin.spec.ts`
- **Gate**: type
- acceptance:
  - "`gitFileOrigins` reads the whole history once (`git log --reverse --diff-filter=AR -M --name-status`) and dates a renamed path by its old name's origin, as `--follow` does (git-file-origin.spec.ts)."
  - "On the repository at develop the lint runs in under 10 seconds (it took 4 min 10 s) and prints the same report as before."
- shipped-in: `52b03daa0da2`
- review-state: in_review
- review-implementer: claude-opus-5-5

## acceptance

- `gitFileOrigins` reads the whole history once (`git log --reverse --diff-filter=AR -M --name-status`) and dates a renamed path by its old name's origin, as `--follow` does (git-file-origin.spec.ts).
- On the repository at develop the lint runs in under 10 seconds (it took 4 min 10 s) and prints the same report as before.
