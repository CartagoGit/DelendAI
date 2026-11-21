---
id: x00836
title: "A file whose only change is an import is not judged as new code"
kind: fix
status: done
type: proposal
track: trust
date: 2026-10-03
priority: P2
related: [r00040, x00541]
last-transition-id: a01de2a4-eeb0-4a91-8be0-42604a797420
last-correlation-id: a01de2a4-eeb0-4a91-8be0-42604a797420
last-transition-from: review
shipped-in:
  - "f53e21ae8024"
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

- **Status**: done
- **Files**: `tools/scripts/ci/import-only-change.helper.ts`, `tools/scripts/ci/changed-file-coverage.script.ts`, `tools/scripts/ci/changed-file-coverage.script.spec.ts`
- **Gate**: `npx vitest run tools/scripts/ci/changed-file-coverage.script.spec.ts`
- `onlyImportsChanged(before, after)` is true when the two texts are equal
  once their static imports and re-exports are removed, and false for a new
  or deleted file.
- The gate leaves such files out of what it judges and prints their count.
- shipped-in: `463e7b1e3313`
- review-state: done
- review-implementer: claude-opus-5-5
- review-reviewer: glm-5.3-flash
- review-log: approved by glm-5.3-flash — verified at f53e21ae8024, validate exit 0, tests 22/22 — Reviewed the current delivery. The helper removes only static imports/re-exports before comparison, while dynamic imports and local exports remain behavior. New/deleted files remain judged. The declared Vitest gate passes 22/22.
- review-attribution: claude-opus-5-5 from commit f53e21ae8024 names refs/heads/delendai/wip/claude-opus-5-5/implement/x00836-all-g1/an-import-only-change-is-not-new-code (f53e21ae802400f2522cda251cc0862c29a1a117), opened by glm-5.3-flash

## dependency graph

None.

## acceptance

- A consumer whose import of a name moves from one entry point to another,
  on one line or several, is not judged; the same file with one changed
  statement is.
