---
id: x00938
title: "A proposal an earlier release already lists is not released again"
kind: fix
status: done
type: proposal
track: release
date: 2026-10-23
last-transition-id: 4b582cdf-1739-470e-937b-1c063f107f89
last-correlation-id: 4b582cdf-1739-470e-937b-1c063f107f89
last-transition-from: review
last-transition-at: 2026-10-23T15:57:43.618Z
shipped-in:
  - "007b21dded12711c2d11aec94eb15d3213b5c49f"
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
- **Status**: done
- **Files**: `tools/scripts/release/prepare-release.script.ts`, `tools/scripts/release/prepare-release.spec.ts`
- **Gate**: type
- acceptance:
  - "The proposals counted for a release exclude every id any `## [X.Y.Z]` section of `CHANGELOG.md` other than the one being refreshed already names; with nothing left, the command says there is nothing to release."
  - "A spec drives a CHANGELOG that lists f1 under 0.2.0 and asserts f1 reaching done afterwards is not counted for 0.2.1, while a new fix is."
- shipped-in: `a01173c04af3`
- review-state: done
- review-implementer: claude-opus-5-5
- review-reviewer: minimax-m3.1-flash-preview
- review-log: approved by minimax-m3.1-flash-preview — verified at 007b21dded12, validate exit 0, tests 10/10; acceptance 2/2: (1) The proposals counted for a release exclude every id any `## [X.Y.Z]` section of `CHANGELOG.md` other than the one being refreshed already names; with nothing … (2) A spec drives a CHANGELOG that lists f1 under 0.2.0 and asserts f1 reaching done afterwards is not counted for 0.2.1, while a new fix is. => The fixture in pre… — Read the delivering commit, the release preparation script and its spec. Each clause is implemented and asserted by the named spec; the spec file ran 10 tests green.

## acceptance

- The proposals counted for a release exclude every id any `## [X.Y.Z]` section of `CHANGELOG.md` other than the one being refreshed already names; with nothing left, the command says there is nothing to release.
- A spec drives a CHANGELOG that lists f1 under 0.2.0 and asserts f1 reaching done afterwards is not counted for 0.2.1, while a new fix is.
