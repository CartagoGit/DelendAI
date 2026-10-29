---
id: v00149
title: "A unit is brought forward only when it must be, so one landing does not send the others back"
kind: perf
status: ready
type: proposal
track: ci
date: 2026-10-29
---

# v00149 — A unit is brought forward only when it must be, so one landing does not send the others back

## goal

An open pull request runs again only for a reason of its own: its author pushed, it conflicts with the integration branch, or it shares a file with what landed. It is never sent back because a derived file both sides regenerate moved, or because an agent was told to merge the integration branch into it by habit.

## why

Of the 40 pull requests merged on 2026-10-28/29, 31 took at least one merge of develop after they were opened. Each merge starts the whole CI run again, 13 to 51 runner-minutes.

The proposal first suspected the derived files every change regenerates. Measuring each of the 74 merges (what the pull request had changed against what the merge brought) said otherwise:

- **7 of the 74 shared any file at all.** In those, the files were mostly derived (`TOKEN-BUDGETS.md` 7 times, `preset-metadata` 5), and the queue already leaves out the ones `gen:all` rebuilds. The per-workspace `AGENT.md` and `tool-outputs.ts`, which `.gitattributes` declares generated, were still counted.
- **49 were made in the unit's own worktree before it was republished, bringing about 30 commits each.** The product told agents to do so: a unit whose base moved was told to "merge the integration branch into it (`git merge <remote>/<integration>`) before it publishes". Under this profile a pull request is judged on its merge with the integration branch and need not be refreshed against it, so those merges bought nothing.
- **The other 23** were the refreshes of red or overlapping candidates, with about 99 commits each.

## non-goals

- Bringing candidates forward less carefully. A real overlap on a hand-written file, a conflict, or a red verdict against a moved branch is still acted on.
- Splitting or un-committing derived files: measured, they are not what sends candidates back.

## slices

- global_gate: type

### S1 — What sends candidates back is measured
- **Status**: pending
- **Files**: `tools/scripts/forge/candidate-overlap-report.script.ts`, `tools/scripts/forge/candidate-overlap-report.script.spec.ts`
- **Gate**: type
- acceptance:
  - "`candidate-overlap-report.script.ts --since=<date>` says how many merges of the integration branch the merged pull requests took, how many shared a file with what they brought, and which files, each marked derived when `.gitattributes` declares it generated (candidate-overlap-report.script.spec.ts)."

### S2 — A derived file is not an overlap
- **Status**: pending
- **Files**: `tools/scripts/git/refresh-candidate-artifacts.script.ts`, `tools/scripts/git/refresh-candidate-derived.spec.ts`
- **Gate**: type
- acceptance:
  - "`overlappingFiles` leaves out every path `.gitattributes` marks `merge=delendai-generated` (`derivedPaths`, read through `git check-attr`, so `AGENT.md` and the `**/src/generated` outputs count as derived), besides the projections `gen:all` rebuilds (refresh-candidate-derived.spec.ts)."

### S3 — A unit is not told to merge what it need not
- **Status**: pending
- **Files**: `packages/core/src/lib/work-units/work-swarm-relations.service.ts`, `packages/core/tests/src/lib/work-units/work-swarm-relations.spec.ts`
- **Gate**: type
- acceptance:
  - "A unit with work whose base moved is told so and that it need not be brought forward. It is told to merge the integration branch into it only when publishing or its pull request reports a conflict (work-swarm-relations.spec.ts)."

## acceptance

- `candidate-overlap-report.script.ts --since=<date>` says how many merges of the integration branch the merged pull requests took, how many shared a file with what they brought, and which files, each marked derived when `.gitattributes` declares it generated (candidate-overlap-report.script.spec.ts).
- `overlappingFiles` leaves out every path `.gitattributes` marks `merge=delendai-generated` (`derivedPaths`, read through `git check-attr`, so `AGENT.md` and the `**/src/generated` outputs count as derived), besides the projections `gen:all` rebuilds (refresh-candidate-derived.spec.ts).
- A unit with work whose base moved is told so and that it need not be brought forward. It is told to merge the integration branch into it only when publishing or its pull request reports a conflict (work-swarm-relations.spec.ts).
