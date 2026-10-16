---
id: x00907
title: "An approved proposal closes, and one that cannot is seen"
kind: fix
status: in-progress
type: proposal
track: general
date: 2026-10-16
---

# x00907 — An approved proposal closes, and one that cannot is seen

## goal

A proposal whose every slice is approved leaves review; when its close is refused, `proposals status` shows it waiting to close instead of counting it with the proposals nobody has reviewed.

## why

The owner, 2026-10-16: ten proposals in review that other agents had reviewed, so "the work cannot be finished, or things are not working as they should". Three of them (x00880, x00882, q00026) had every slice approved for two days. The hydrator tried to close them on every pass — 575 times in its log — and the closing gate refused each with `missing-declared-files`:

- x00880 and x00882 declare their own document as a slice file, under the folder it lived in then (`in-progress/…`, `ready/fixes/…`). The review entry's check (`missingDeclaredFiles`) already reads a proposal's own document, and another proposal's cited by an old folder, as present; the closing gate (`guardSlicesComplete`) had its own copy of the rule and did not. Two readings of one rule, and the stricter one sat at the door out.
- q00026 declares `packages/roadmap/package.json`, which became `plugins/roadmap/package.json` when the roadmap was made a plugin (cd69b79aa).

Nothing said so outside that log: `proposals status` counted them as `review`, the same as proposals no reviewer had opened.

## non-goals

- Accepting a declared code file that is not there: a slice whose code is gone is not delivered.

## slices

- global_gate: type

### S1 — The closing gate reads declared files as the review entry does

- **Status**: review
- **Files**:
  - `plugins/proposals/src/lib/services/proposal-completeness.ts`
  - `plugins/proposals/tests/src/lib/services/proposal-completeness-moved.spec.ts`
- **Gate**: type
- acceptance:
  - `guardSlicesComplete` takes the proposal's own document, and another proposal's document cited by a folder it has left, as present, the rule `missingDeclaredFiles` applies; a missing code file is still refused.
  - Against this repository, x00880 and x00882 pass it.
- review-state: in_review
- review-implementer: claude-opus-5-5

### S2 — q00026 names the file where it is now

- **Status**: review
- **Files**:
  - `docs/delendai/proposals/review/q00026-vitest-5-major-migration-planned-after-sqlite-consolidation.md`
- **Gate**: type
- acceptance:
  - Its slice declares `plugins/roadmap/package.json`, with the path it had when the slice shipped, and passes the closing gate.
- review-state: in_review
- review-implementer: claude-opus-5-5

### S3 — An approved proposal waiting to close shows as approved

- **Status**: in-progress
- **Files**:
  - `plugins/proposals/src/lib/tools/compact-status.tool.ts`
  - `plugins/proposals/tests/src/lib/tools/compact-status-units.spec.ts`
- **Gate**: type
- acceptance:
  - `proposals status` counts a proposal in review whose every slice is approved as `approved` (waiting to close), apart from `in-review` and `review`; the three add up to the proposals in review. A count that stays above zero is a close somebody has to look at.

## acceptance

- x00880, x00882 and q00026 leave review at the next hydration pass after this lands, and `proposals status` shows `approved: 0` once they have.
