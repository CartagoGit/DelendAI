---
id: x00938
title: "A proposal an earlier release already lists is not released again"
kind: fix
status: in-progress
type: proposal
track: release
date: 2026-10-23
last-transition-id: da2f8480-8483-4195-8166-94ce9f868760
last-correlation-id: da2f8480-8483-4195-8166-94ce9f868760
last-transition-from: ready
last-transition-at: 2026-10-23T09:02:01.582Z
---

# x00938 — A proposal an earlier release already lists is not released again

## goal

`release:prepare` leaves out every proposal whose id an earlier CHANGELOG section already names, so a proposal that moved from review to done after it was released is neither listed twice nor counted toward the next bump.

## why

0.2.0 listed the proposals that had reached done or review since main. Several of them were in review then and reached done afterwards (f00765, f00775, f00776, f00777, f00780…). `release:prepare` reads renames into `done/` since the last tag as new arrivals, so on 2026-10-23 it proposed 0.3.0 from 20 proposals, most of them already in the 0.2.0 section and none new to a reader. A proposal is released once, when it first reaches review or done.

## non-goals

- Changing the bump rule or the section format.

## slices

- global_gate: type

### S1 — Released ids are skipped
- **Status**: pending
- **Files**: `tools/scripts/release/prepare-release.script.ts`, `tools/scripts/release/prepare-release.spec.ts`
- **Gate**: type
- acceptance:
  - "The proposals counted for a release exclude every id any `## [X.Y.Z]` section of `CHANGELOG.md` other than the one being refreshed already names; with nothing left, the command says there is nothing to release."
  - "A spec drives a CHANGELOG that lists f1 under 0.2.0 and asserts f1 reaching done afterwards is not counted for 0.2.1, while a new fix is."

## acceptance

- The proposals counted for a release exclude every id any `## [X.Y.Z]` section of `CHANGELOG.md` other than the one being refreshed already names; with nothing left, the command says there is nothing to release.
- A spec drives a CHANGELOG that lists f1 under 0.2.0 and asserts f1 reaching done afterwards is not counted for 0.2.1, while a new fix is.
