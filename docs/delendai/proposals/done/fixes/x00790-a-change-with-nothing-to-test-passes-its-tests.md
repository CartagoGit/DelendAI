---
id: x00790
title: "A change with nothing to test passes its tests"
kind: fix
status: done
type: proposal
track: trust
date: 2026-10-01
priority: P1
related: [f00538, x00556]
last-transition-id: 949b477a-c740-4535-a57b-0596e1a0385f
last-correlation-id: 9146e094-6e4d-4235-8b7c-2d5548186cbd
last-transition-from: review
shipped-in:
  - "429c2a77fd2b"
---

# x00790 — A change with nothing to test passes its tests

## goal

A pull request whose change reaches no test zone gets a `tests` verdict
instead of a failure, so a forward-sync of `main` into `develop` can land.

## why

On 2026-09-30 the forward-sync pull request #686 (main 0720e8436 into
develop) failed `tests` and could never merge. Its content is already in
develop, so the test planner mapped it to no zone; every zone job ran no
shard and uploaded no blob, and the `tests` job's merge failed with
`ENOENT .vitest-reports`. The release commit stayed outside develop's
history, which is the one thing a forward-sync exists to fix.

## why this design

- The plan is the verdict. The `tests` job reads the planner's own output:
  only a plan that succeeded, whose zone jobs succeeded, and which lists
  its zones with none of them run, skips the merge. Every other case still
  goes through the merge, so a lost blob or a crashed planner still fails.
- Nothing is lowered: the coverage gate and the merge are untouched for
  any run that executed a shard.

## non-goals

- Changing what the planner selects.

## Slices

- global_gate: none

### S1 — The tests job accepts a plan that runs no zone

- **Status**: done
- **Gate**: `bun run lint:workflow`
- **Files**:
  - `.github/workflows/ci.yml`
- shipped-in: `429c2a77fd2b`

## dependency graph

None.

## acceptance

- A pull request with no content change against develop passes `tests`.
- A run in which any zone ran still merges the blobs and enforces coverage.
