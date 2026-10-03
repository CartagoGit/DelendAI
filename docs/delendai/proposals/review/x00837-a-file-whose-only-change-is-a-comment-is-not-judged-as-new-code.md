---
id: x00837
title: "A file whose only change is a comment is not judged as new code"
kind: fix
status: review
type: proposal
track: trust
date: 2026-10-03
priority: P2
related: [x00836, r00040]
last-transition-id: 062a5452-56c5-43d9-bfd6-cc24a213cc83
last-correlation-id: 062a5452-56c5-43d9-bfd6-cc24a213cc83
last-transition-from: in-progress
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

- **Status**: review
- **Files**: `tools/scripts/ci/import-only-change.helper.ts`, `tools/scripts/ci/changed-file-coverage.script.ts`, `tools/scripts/ci/changed-file-coverage.script.spec.ts`
- **Gate**: `npx vitest run tools/scripts/ci/changed-file-coverage.script.spec.ts`
- `behaviourOf` drops comments that stand on their own lines before it drops
  the imports; a trailing comment on a line of code is kept with the line.
- shipped-in: `2c0b99381aba`

## dependency graph

None.

## acceptance

- A file that gains a line comment and a block comment and nothing else is
  not judged; the same file with a change on a line that also carries a
  trailing comment is.
