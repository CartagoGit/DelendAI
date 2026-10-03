---
id: x00836
title: "A file whose only change is an import is not judged as new code"
kind: fix
status: ready
type: proposal
track: trust
date: 2026-10-03
priority: P2
related: [r00040, x00541]
---

# x00836 — A file whose only change is an import is not judged as new code

## goal

The changed-file coverage gate judges the files a pull request changed the
behaviour of. A file in which only the place a name is imported from changed
is reported, and not judged.

## why

r00040 S2 moved 112 exports from the core's public entry to its CLI entry.
That rewrote one import line in 105 consumers and nothing else in them. The
gate took all of them for changed code: 26 files whose statements the pull
request had neither added nor touched fell under the floor, and the pull
request was red for the untested past of files it had only re-pointed.

The gate's own reasoning is that the untouched majority is not re-judged,
because its verdict is the one the integration branch's full run already
gave. A file whose statements are the same as before is part of that
majority, whatever its import lines say.

## why this design

- Both versions of a changed file are read with their static imports and
  re-exports taken out, and compared. Equal means only imports changed.
- Nothing is guessed from the diff's lines: a multi-line import is one
  statement, and a line of code that happens to look like an imported name
  is still code.
- A file that is new, or gone, or differs in one character of what is left,
  is judged as before. A dynamic `import()` is behaviour, and stays.
- The gate prints how many files it did not judge for this reason, so the
  exemption is visible in every run that used it.

## non-goals

- Judging changed lines instead of changed files: a different, larger
  question, and not needed for this.
- Lowering a floor or adding a file to a baseline.

## Slices

- global_gate: none

### S1 — An import-only change is reported and not judged

- **Status**: review
- **Files**: `tools/scripts/ci/import-only-change.helper.ts`, `tools/scripts/ci/changed-file-coverage.script.ts`, `tools/scripts/ci/changed-file-coverage.script.spec.ts`
- **Gate**: `npx vitest run tools/scripts/ci/changed-file-coverage.script.spec.ts`
- `onlyImportsChanged(before, after)` is true when the two texts are equal
  once their static imports and re-exports are removed, and false for a new
  or deleted file.
- The gate leaves such files out of what it judges and prints their count.

## dependency graph

None.

## acceptance

- A consumer whose import of a name moves from one entry point to another,
  on one line or several, is not judged; the same file with one changed
  statement is.
