---
id: x00746
title: "A declared directory covers its files"
kind: fix
status: in-progress
type: proposal
track: hosts
date: 2026-09-29
priority: P2
related: [x00744, x00745]
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

- **Status**: in-progress
- **Gate**: `npx vitest run plugins/proposals/tests/src/lib/services/delivering-merge.service.spec.ts plugins/proposals/tests/src/lib/tools/proposal-review-attribution.spec.ts`
- **Files**:
  - `plugins/proposals/src/lib/services/delivering-merge.service.ts`
  - `plugins/proposals/src/lib/services/review-attribution.ts`
  - `plugins/proposals/tests/src/lib/services/delivering-merge.service.spec.ts`
  - `plugins/proposals/tests/src/lib/tools/proposal-review-attribution.spec.ts`

## dependency graph

None.

## acceptance

- A slice declaring `src`, delivered by a direct commit changing
  `src/a.ts` that cites no proposal, is approved against that commit.
- `touchesDeclared` does not match a sibling that shares a prefix.
