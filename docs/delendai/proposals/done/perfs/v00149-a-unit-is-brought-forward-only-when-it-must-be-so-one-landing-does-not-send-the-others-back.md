---
id: v00149
title: "A unit is brought forward only when it must be, so one landing does not send the others back"
kind: perf
status: done
type: proposal
track: ci
date: 2026-10-29
last-transition-id: cb0b6780-c515-4cbc-8091-9c197152396a
last-correlation-id: cb0b6780-c515-4cbc-8091-9c197152396a
last-transition-from: review
last-transition-at: 2026-11-03T00:52:48.268Z
shipped-in:
  - "09f24ba3ec4cd19ddfaf0c7f56e1f8bc30cf2444"
  - "b2bb6dfc8334814aab9d82d9bda3004fc69230ce"
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

#1597 went green on the merge ref of develop's tip and then waited about 15 minutes, because the queue counted what develop had gained since the branch left, which included that very tip. The refresh runs only on the owner's machine (a bot's refresh left generated files stale, and that stays decided), so the wait lasts as long as that machine takes, or for ever while it is off.

## non-goals

- Bringing candidates forward less carefully. A real overlap on a hand-written file, a conflict, or a red verdict against a moved branch is still acted on.
- Splitting or un-committing derived files: measured, they are not what sends candidates back.

## slices

- global_gate: type

### S1 — What sends candidates back is measured
- **Status**: done
- **Files**: `tools/scripts/forge/candidate-overlap-report.script.ts`, `tools/scripts/forge/candidate-overlap-report.script.spec.ts`
- **Gate**: type
- acceptance:
  - "`candidate-overlap-report.script.ts --since=<date>` says how many merges of the integration branch the merged pull requests took, how many shared a file with what they brought, and which files, each marked derived when `.gitattributes` declares it generated (candidate-overlap-report.script.spec.ts)."
- shipped-in: `c7f671363467`
- review-state: done
- review-implementer: claude-opus-5-5
- review-reviewer: minimax-m3.1-flash
- review-log: approved by minimax-m3.1-flash — verified at 09f24ba3ec4c, validate exit 0 and tests 6/6 claimed, no recorded run cited; acceptance 1/1: (1) At 09f24ba3 the candidate overlap report takes a date, says how many merges of the integration branch the merged pull requests took, how many shared a file wit… — Approved on the delivered state of 09f24ba3ec4cd19ddfaf0c7f56e1f8bc30cf2444. The report says how much the merged pull requests overlapped each other and which files, marking the derived ones. The type gate exited 0 and the slice spec passes 6 of 6. One residual, recorded and not blocking: the spec exercises the report's pure function with an injected predicate, so the date parsing and the pull request plumbing are unpinned.

### S2 — A derived file is not an overlap
- **Status**: done
- **Files**: `tools/scripts/git/refresh-candidate-artifacts.script.ts`, `tools/scripts/git/refresh-candidate-derived.spec.ts`
- **Gate**: type
- acceptance:
  - "`overlappingFiles` leaves out every path `.gitattributes` marks `merge=delendai-generated` (`derivedPaths`, read through `git check-attr`, so `AGENT.md` and the `**/src/generated` outputs count as derived), besides the projections `gen:all` rebuilds (refresh-candidate-derived.spec.ts)."
- shipped-in: `c7f671363467`
- review-state: done
- review-implementer: claude-opus-5-5
- review-reviewer: minimax-m3.1-flash
- review-log: approved by minimax-m3.1-flash — verified at 09f24ba3ec4c, validate exit 0 and tests 5/5 claimed, no recorded run cited; acceptance 1/1: (1) At 09f24ba3 the overlapping files leave out every path the attributes mark as generated, read through the attribute reader, so the agent index and the generate… — Approved on the delivered state of 09f24ba3ec4cd19ddfaf0c7f56e1f8bc30cf2444. The generated paths are left out of the overlap. The type gate exited 0 and the slice spec passes 5 of 5. One residual, recorded and not blocking: the spec pins the derived-path reader and not the overlap's use of it, so a regression that stopped calling it would not be caught.

### S3 — A unit is not told to merge what it need not
- **Status**: done
- **Files**: `packages/core/src/lib/work-units/work-swarm-relations.service.ts`, `packages/core/tests/src/lib/work-units/work-swarm-relations.spec.ts`
- **Gate**: type
- acceptance:
  - "A unit with work whose base moved is told so and that it need not be brought forward. It is told to merge the integration branch into it only when publishing or its pull request reports a conflict (work-swarm-relations.spec.ts)."
- shipped-in: `c7f671363467`
- review-state: done
- review-implementer: claude-opus-5-5
- review-reviewer: minimax-m3.1-flash
- review-log: approved by minimax-m3.1-flash — verified at 09f24ba3ec4c, validate exit 0 and tests 16/16 claimed, no recorded run cited; acceptance 1/1: (1) At 09f24ba3 a unit whose base moved is told so and told that it need not be brought forward, and is told to merge the integration branch into it only when publ… — Approved on the delivered state of 09f24ba3ec4cd19ddfaf0c7f56e1f8bc30cf2444. A unit whose base moved is told so and told it need not be brought forward, and is told to merge only on a conflict. The type gate exited 0 and the slice spec passes 16 of 16. No defect found.

### S4 — A candidate is not sent back for what its checks already saw
- **Status**: done
- **Files**: `tools/scripts/forge/candidate-tested-base.ts`, `tools/scripts/forge/queue-acceptance.ts`, `tools/scripts/forge/queue-acceptance.spec.ts`
- **Gate**: type
- acceptance:
  - "A candidate's overlap is counted from the integration commit its latest pull-request run saw, read from the run's start, with a margin for the merge ref, and only forward of where it left. When that cannot be told, it counts from where the candidate left, as before (queue-acceptance.spec.ts)."
- shipped-in: `39f3d8323b50`
- review-state: done
- review-implementer: claude-opus-5-5
- review-reviewer: minimax-m3.1-flash
- review-log: approved by minimax-m3.1-flash — verified at b2bb6dfc8334, validate exit 0 and tests 6/6 claimed, no recorded run cited; acceptance 1/1: (1) At b2bb6dfc a candidate's overlap is counted from the integration commit its latest pull request run saw, read from the run's start with a margin for the merge… — Approved on the delivered state of b2bb6dfc8334814aab9d82d9bda3004fc69230ce. The overlap of a candidate is counted from what its last run saw. The type gate exited 0 and the slice spec passes 6 of 6. No defect found.

## acceptance

- `candidate-overlap-report.script.ts --since=<date>` says how many merges of the integration branch the merged pull requests took, how many shared a file with what they brought, and which files, each marked derived when `.gitattributes` declares it generated (candidate-overlap-report.script.spec.ts).
- `overlappingFiles` leaves out every path `.gitattributes` marks `merge=delendai-generated` (`derivedPaths`, read through `git check-attr`, so `AGENT.md` and the `**/src/generated` outputs count as derived), besides the projections `gen:all` rebuilds (refresh-candidate-derived.spec.ts).
- A unit with work whose base moved is told so and that it need not be brought forward. It is told to merge the integration branch into it only when publishing or its pull request reports a conflict (work-swarm-relations.spec.ts).
- A candidate's overlap is counted from the integration commit its latest pull-request run saw, read from the run's start, with a margin for the merge ref, and only forward of where it left. When that cannot be told, it counts from where the candidate left, as before (queue-acceptance.spec.ts).
