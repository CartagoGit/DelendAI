---
id: x00873
title: "Proposal files are judged against the file conventions when written"
kind: fix
status: done
type: proposal
track: trust
date: 2026-10-05
last-transition-id: 5bd19839-8473-4781-837f-e75828c12093
last-correlation-id: 5bd19839-8473-4781-837f-e75828c12093
last-transition-from: review
shipped-in:
  - "496d1721d"
---

# x00873 — Proposal files are judged against the file conventions when written

## goal

A lint reports a declared file name the file conventions refuse while the
proposal that declares it is still unfinished, so the name is fixed when
the proposal is written and not after the code is.

## why

On 2026-10-05 three agents each implemented a slice whose proposal declared
names the repository's own lints refuse: `git-observer.ts` (the convention
wants `git-observer.service.ts`), `knowledge-cache.ts` (wants
`knowledge-cache.service.ts`), an `observers/index.ts` barrel, and a type
named `TGitTrigger` (wants `IGitTrigger`). Each learned it only from the
full gate run, which takes ten minutes and stops at the first failing rule,
so each lost twenty to thirty minutes renaming files after the work was
written.

The proposal is where the name was chosen, and nothing checked it there.
`lint:proposal-files-exist` looks at declared files only after the work is
done, and `lint:file-conventions` only after the file exists.

## why this design

- It reuses the classifier of `lint:file-conventions` (`classifyPath` with
  `DEFAULT_TS_RULES`) and its scan roots and walker exclusions, so a path
  this lint accepts is one `lint:file-conventions` accepts once the file
  exists.
- It reuses the Files-block parser of `lint:proposal-files-exist`, which
  now exports it, instead of a second parser.
- Only `ready/` and `in-progress/` are judged, and only declared paths that
  do not exist yet. Finished work already has its files.
- It is a ratchet with a baseline written once by `--write-baseline`: the
  proposals that already declare refused names are recorded, and only new
  findings fail. The finding names the accepted file when one can be
  derived by adding a role suffix, and lists the suffixes otherwise.
- It is chained into `lint:architecture`, which CI runs.

## non-goals

- Type names such as `TGitTrigger`: that is `lint:type-naming`, which reads
  code, not proposals.
- Renaming the declared files in the proposals already in the baseline: the
  right suffix (service, helper, tool) is the decision of the proposal that
  is claimed or about to be, and several of them are being edited.
- Directories, globs and files that are not TypeScript sources.

## Slices

- global_gate: none

### S1 — Declared file names are judged against the conventions

- **Status**: done
- **Files**: `tools/scripts/lint/proposal-files-follow-conventions.script.ts`, `tools/scripts/lint/proposal-files-follow-conventions.script.spec.ts`, `tools/scripts/lint/proposal-files-follow-conventions.baseline.json`, `tools/scripts/lint/proposal-files-exist.script.ts`, `package.json`
- **Gate**: `npx vitest run tools/scripts/lint/proposal-files-follow-conventions.script.spec.ts`
- A finding names the proposal, the slice, the path, and the file the
  convention would accept.
- `--write-baseline=<path>` accepts today's findings as the floor.
- shipped-in: `207557e218a9`
- review-state: done
- review-implementer: claude-sonnet-5-5
- review-reviewer: claude-opus-5-5
- review-log: approved by claude-opus-5-5 — verified at 496d1721d, validate exit 0, tests 8/8 — Delivered by #782 (merge 496d1721d). Proposal acceptance: spec 'accepts a declared path whose name has a role', 'reports a path with no role with proposal, slice and the accepted name', 'does not judge a file that already exists', 'does not judge directories, globs or other kinds of file', 'does not judge done or review proposals'; the lint is chained into lint:architecture, which CI runs, and passes on the repository. Used in anger on 2026-10-05: it found 31 refused names in pending proposals, all fixed, baseline now 0. 8/8.

## dependency graph

None.

## acceptance

- A declared path with a role passes; one without a role is reported with
  proposal, slice and the accepted name.
- An existing file, a directory, a glob, and a proposal under `done/` or
  `review/` are not judged.
- `bun run lint:proposal-files-follow-conventions` passes on the repository
  and `lint:architecture` runs it.
