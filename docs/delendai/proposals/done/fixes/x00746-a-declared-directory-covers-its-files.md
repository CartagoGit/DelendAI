---
id: x00746
title: "A declared directory covers its files"
kind: fix
status: done
type: proposal
track: hosts
date: 2026-09-29
priority: P2
related: [x00744, x00745]
last-transition-id: 59b3d7ff-0479-40c6-893a-ed8cca946aa1
last-correlation-id: 59b3d7ff-0479-40c6-893a-ed8cca946aa1
last-transition-from: review
shipped-in:
  - "7c97176e6794124a0b228474374f3ac761c4b98a"
---

# x00746 — A declared directory covers its files

## goal

A slice that declares a directory is recognised as delivered by a commit
that changes a file under it.

## why

x00520 declares `packages/context-compiler/src` and
`packages/context-compiler/tests`. It was delivered by 274aa781b, which
changes `packages/context-compiler/src/lib/context-compiler.ts` and its
spec. Attribution compared declared entries with changed paths by exact
equality, so that commit read as "changes none of the slice's declared
files". The slice stayed blocked, even with its delivery recorded as
`shipped-in`.

x00744 also left a leftover: its edit added the merge check and kept the
old inline copy after it, so the same check ran twice.

## why this design

- `touchesDeclared(declared, paths)` is the one comparison. A declared
  entry matches a path equal to it, or any path under it (`entry/…`). A
  trailing slash is ignored, and a sibling that only shares a prefix
  (`src` vs `srcx`) does not match. Attribution and the merge check both
  use it.
- The duplicated merge check is removed.

## non-goals

None.

## architecture

- `plugins/proposals/src/lib/services/delivering-merge.service.ts`,
  `review-attribution.ts`.

## Slices

- global_gate: none

### S1 — Directories match the files under them

- **Status**: done
- **Gate**: `npx vitest run plugins/proposals/tests/src/lib/services/delivering-merge.service.spec.ts plugins/proposals/tests/src/lib/tools/proposal-review-attribution.spec.ts`
- **Files**:
  - `plugins/proposals/src/lib/services/delivering-merge.service.ts`
  - `plugins/proposals/src/lib/services/review-attribution.ts`
  - `plugins/proposals/tests/src/lib/services/delivering-merge.service.spec.ts`
  - `plugins/proposals/tests/src/lib/tools/proposal-review-attribution.spec.ts`
- review-state: done
- review-implementer: claude-opus-5-5
- review-reviewer: minimax-m3
- review-log: approved by minimax-m3 — x00746 S1 introduces touchesDeclared(declared, paths) where a declared entry matches an equal path or any path under it (entry/...) with trailing slash ignored and prefix siblings (src vs srcx) not matching. Attribution + the merge check now both use it. The duplicated merge check x00744 left behind is removed. Gate=none: 16/16 spec tests pass across delivering-merge.service.spec.ts + proposal-review-attribution.spec.ts.
- review-attribution: claude-opus-5-5 from Merge pull request #626 from CartagoGit/delendai/pr/claude-opus-5-5/implement/x00746-all-g1/a-declared-directory-covers-its-files (refs/heads/delendai/wip/claude-opus-5-5/implement/x00746-all-g1/a-declared-directory-covers-its-files) (7c97176e6794124a0b228474374f3ac761c4b98a), opened by minimax-m3

## dependency graph

None.

## acceptance

- A slice declaring `src`, delivered by a direct commit changing
  `src/a.ts` that cites no proposal, is approved against that commit.
- `touchesDeclared` does not match a sibling that shares a prefix.
