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
last-transition-id: 9cd14084-1e78-4f8e-b68b-9db95faef2d2
last-correlation-id: 9cd14084-1e78-4f8e-b68b-9db95faef2d2
last-transition-from: review
shipped-in:
  - "b36cb317e83e7076e8ccbc49daf85ca21a07ee6d"
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
- review-state: done
- review-implementer: claude-opus-5-5
- review-reviewer: glm-5.3-flash
- review-log: approved by glm-5.3-flash — verified at b36cb317e83e, validate exit 0, tests 1/1 — Verified the no-zone guard requires successful planner and zone jobs plus a non-empty zones list where every zone has run=false; both shard download and merge/coverage remain enabled otherwise. bun run lint:workflow passes (0 findings).
- review-attribution: claude-opus-5-5 from commit b36cb317e83e names refs/heads/delendai/wip/claude-opus-5-5/implement/x00790-all-g1/a-change-with-nothing-to-test-passes (b36cb317e83e7076e8ccbc49daf85ca21a07ee6d), opened by glm-5.3-flash

## dependency graph

None.

## acceptance

- A pull request with no content change against develop passes `tests`.
- A run in which any zone ran still merges the blobs and enforces coverage.
