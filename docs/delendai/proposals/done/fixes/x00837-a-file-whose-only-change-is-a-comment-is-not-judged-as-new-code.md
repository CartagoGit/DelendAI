---
id: x00837
title: "A file whose only change is a comment is not judged as new code"
kind: fix
status: done
type: proposal
track: trust
date: 2026-10-03
priority: P2
related: [x00836, r00040]
last-transition-id: 5a134fa6-97aa-4bb0-bc5f-e001328fdd19
last-correlation-id: 5a134fa6-97aa-4bb0-bc5f-e001328fdd19
last-transition-from: review
shipped-in:
  - "f09d4c1abcd6b264c6099afbcaf8c48d2b3db04f"
---

# x00837 — A file whose only change is a comment is not judged as new code

## goal

The changed-file coverage gate leaves out a file whose statements are the
same as before, whether what changed is an import or a comment.

## why

With x00836 in place, r00040 S2 went from 26 files under the floor to one:
the CLI entry, where the pull request had added re-exports and a two-line
comment saying why they live there. The comment alone made the file "changed
code", and its pre-existing statements were judged at 50%.

A comment adds no statement and removes none. The gate asks whether new code
is covered; a sentence about old code is not new code.

## why this design

- Only comments standing on their own lines are ignored: a `//` line, or a
  block opened by a line starting with `/*`. A comment after code stays with
  its line, so the helper never has to tell a comment from the inside of a
  string, and a change hidden behind a trailing comment is still a change.
- The printed count says imports or comments, so the run shows why a file
  was not judged.

## non-goals

- A full parser: the line rule is enough for what comments in this
  repository look like, and errs toward judging.

## Slices

- global_gate: none

### S1 — A comment-only change is reported and not judged

- **Status**: done
- **Files**: `tools/scripts/ci/import-only-change.helper.ts`, `tools/scripts/ci/changed-file-coverage.script.ts`, `tools/scripts/ci/changed-file-coverage.script.spec.ts`
- **Gate**: `npx vitest run tools/scripts/ci/changed-file-coverage.script.spec.ts`
- `behaviourOf` drops comments that stand on their own lines before it drops
  the imports; a trailing comment on a line of code is kept with the line.
- shipped-in: `2c0b99381aba`
- review-state: done
- review-implementer: claude-opus-5-5
- review-reviewer: minimax-m31
- review-log: approved by minimax-m31 — verified at f09d4c1abcd6, validate exit 0, tests 22/22 — f09d4c1abcd6 is the merge of PR #755 and is the slice's own delivery (the shipped-in 2c0b99381 is its second parent). Delivered as claimed: import-only-change.helper.ts gains withoutComments(), applied inside behaviourOf BEFORE the import strip, so a comment standing on its own line can no longer make an unchanged file look like new code; a trailing comment stays attached to its line of code, and the new spec asserts exactly that asymmetry ('is false when a comment on a line of code hides a change to that line'). changed-file-coverage.script.ts already consumed behaviourOf through onlyImportsChanged, so the behaviour reaches the gate; only the console wording changed. Gate run in the review worktree: npx vitest run tools/scripts/ci/changed-file-coverage.script.spec.ts -> 22 passed, exit 0. Known trade-off, documented by the author and accepted here: the filter is line-based, so a line inside a template literal starting with // or /* would also be dropped - that makes such a file look MORE unchanged, never less, so it cannot turn new code into a false pass in the direction that matters.
- review-attribution: claude-opus-5-5 from commit f09d4c1abcd6 names refs/heads/delendai/wip/claude-opus-5-5/implement/x00837-all-g1/a-comment-only-change-is-not-new-code (f09d4c1abcd6b264c6099afbcaf8c48d2b3db04f), opened by minimax-m31

## dependency graph

None.

## acceptance

- A file that gains a line comment and a block comment and nothing else is
  not judged; the same file with a change on a line that also carries a
  trailing comment is.
