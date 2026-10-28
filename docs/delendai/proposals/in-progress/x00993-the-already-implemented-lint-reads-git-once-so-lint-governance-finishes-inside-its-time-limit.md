---
id: x00993
title: "The already-implemented lint reads git once, so lint-governance finishes inside its time limit"
kind: fix
status: in-progress
type: proposal
track: a00095-consistency
date: 2026-10-28
last-transition-id: 06c252c9-72e8-43c2-9a94-0e9d41bfe3de
last-correlation-id: 06c252c9-72e8-43c2-9a94-0e9d41bfe3de
last-transition-from: ready
last-transition-at: 2026-10-28T17:26:34.586Z
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
- **Status**: pending
- **Files**: `tools/scripts/lib/git-file-origin.ts`, `tools/scripts/lint/proposal-already-implemented.script.ts`, `tools/tests/lib/git-file-origin.spec.ts`
- **Gate**: type
- acceptance:
  - "`gitFileOrigins` reads the whole history once (`git log --reverse --diff-filter=AR -M --name-status`) and dates a renamed path by its old name's origin, as `--follow` does (git-file-origin.spec.ts)."
  - "On the repository at develop the lint runs in under 10 seconds (it took 4 min 10 s) and prints the same report as before."

## acceptance

- `gitFileOrigins` reads the whole history once (`git log --reverse --diff-filter=AR -M --name-status`) and dates a renamed path by its old name's origin, as `--follow` does (git-file-origin.spec.ts).
- On the repository at develop the lint runs in under 10 seconds (it took 4 min 10 s) and prints the same report as before.
