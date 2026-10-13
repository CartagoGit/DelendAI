---
id: x00890
title: "what the part-by-part review of the project found, fixed at the root"
kind: fix
status: ready
type: proposal
track: general
date: 2026-10-13
---

# x00890 — what the part-by-part review of the project found, fixed at the root

## goal

Every defect the owner-requested review of the whole project finds (core, each plugin, web, extension) is recorded here with its evidence and fixed at its root, one slice per defect, so the review leaves a list of what was wrong and proof that it no longer is.

## why

The owner, 2026-10-13: once the open proposals are finished, review the project exhaustively, part by part (core, plugin by plugin, web, extension), and keep fixing what is wrong so everything works better each time. A review that only reports leaves the defects in place; one proposal per finding buries the review's shape. Each finding is a slice here, with the evidence that showed it and the root it was fixed at. A finding too large for a slice becomes its own proposal, referenced from here.

## non-goals

- New features. A finding that is a missing capability, not a defect, is proposed separately.
- Raising a baseline or a budget to make a finding go away.

## slices

- global_gate: type

### S1 — A review claim taken on a merged branch is recognised as spent

- **Status**: pending
- **Files**:
  - `packages/core/src/lib/work-units/stray-refs-reap.service.ts`
  - `packages/core/tests/src/lib/work-units/stray-refs-reap.service.spec.ts`
- **Gate**: type
- evidence: `work doctor` on 2026-10-13 reports `refs/delendai-remote-claims/{q00018,r00040,x00877}` as BROKEN and `work reap` keeps them. Each is a root commit (`review claim <id> <uuid>`) whose tree is the tree of `chore(review): claim <id>`, a commit that is in develop, but reached through a merged pull request, not develop's first-parent line. The stray reaper reads only the first-parent trees (`git log --first-parent`), so a claim made on a review unit's branch never matches.
- acceptance:
  - A root commit whose tree is the tree of any commit develop reaches (within the same history bound) is a snapshot already held and is removed by `work reap --apply`; a root commit over a tree nobody has is still kept.
  - `work doctor` reports the stray-refs invariant as holding on the clone where the three refs were found, after one `work reap --apply`.

## acceptance

- Every slice names the evidence that showed its defect and is closed with the check that shows it gone.
