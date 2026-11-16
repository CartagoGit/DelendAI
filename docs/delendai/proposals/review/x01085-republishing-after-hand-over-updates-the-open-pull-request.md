---
id: x01085
title: "Republishing after hand-over updates the open pull request"
kind: fix
status: review
type: proposal
track: general
date: 2026-11-16
last-transition-id: bbb6829e-0e8a-45dc-b1db-84eca1acfc37
last-correlation-id: bbb6829e-0e8a-45dc-b1db-84eca1acfc37
last-transition-from: in-progress
last-transition-at: 2026-11-16T14:21:01.468Z
---

# x01085 — Republishing after hand-over updates the open pull request

## goal

A unit that publishes work for a proposal and slice that already has an open pull request from the same agent, whose head is an ancestor of the commit being published, fast-forwards that pull request's branch instead of opening a second branch and pull request.

## why

Root cause: choosePublicationTarget only looks for remote publications whose ref matches the unit's own kind and generation. A proposal created from a create unit (x01079, PR #2311, branch delendai/pr/claude-sonnet-5-5/create/x01079-all-g2/proposal-readiness-lint) that needs a CI fix after hand-over is re-entered as an implement unit at generation 1. Its publication name differs in kind and generation, so work deliver exited 0 three times and pushed delendai/pr/claude-sonnet-5-5/implement/x01079-all-g1/work, opening PR #2354 while #2311 stayed open, conflicting and never updated, and nothing said so. Ruled out: the push failing (it succeeded), the pull-request step (it found no open pull request for the new branch, correctly).

## why this design

- Same agent means the same agent id segment of the publication ref; another agent's open pull request is never touched.
- The open pull request must have the same proposal and the same slice (the slice of the ref the policy chose, so a whole-proposal publication matches slice all), in any kind, generation and topic.
- Its head must be an ancestor of the commit being published: the publication is then a fast-forward push to that pull request's existing branch, with no new branch and no new pull request.
- Not an ancestor (diverged histories): publish to the unit's own branch as today and add one note naming the older open pull request, saying it is superseded and must be closed or retired. The exit code does not change.
- The open pull requests are read through the existing pull-request ports (pullRequestPorts, the gh CLI the pull-request step already uses); no new client. If the forge cannot be read, publish to the unit's own branch as today and add one note saying the check was skipped; the publication never fails on that.
- The result carries the publication ref actually used (publication.ref) and, when known, the pull request number (pullRequest.number).
- One function, resolvePublicationTarget, decides the target ref; work publish and work deliver both reach it through the publish service.
- With several open pull requests of the unit, the newest ancestor one is updated and every other one is named in a note.
- Nothing is undecided.

## non-goals

- No change to the work-ref template, the generation rules or the kind names.
- No closing or retiring of the older pull request by this change; it only says when one must be closed.
- No new forge client and no new setting.

## slices

- global_gate: none

### S1 — Republish to the open pull request of the same agent, proposal and slice
- **Status**: review
- **Files**: `packages/core/src/lib/contracts/interfaces/open-pull-request-republication.interface.ts`, `packages/core/src/lib/work-units/open-pull-request-republication.service.ts`, `packages/core/src/lib/work-units/work-unit-publish.service.ts`, `packages/core/src/lib/work-units/review-unit-publish-checks.service.ts`, `packages/core/src/lib/contracts/interfaces/review-unit-publish-checks.interface.ts`, `packages/core/tests/src/lib/work-units/open-pull-request-republication.service.spec.ts`, `packages/core/tests/src/lib/work-units/review-unit-publish-checks.service.spec.ts`
- **Gate**: type
- acceptance:
  - "open-pull-request-republication.service.spec.ts proves: an open pull request of the same agent, proposal and slice whose head is an ancestor of the unit tip makes the target that pull request's branch with its number and no note."
  - "The same spec proves a diverged open pull request leaves the unit's own branch as the target and adds one note naming its number as superseded."
  - "The same spec proves another agent's open pull request is ignored with no note, and that no open pull request leaves the target of choosePublicationTarget unchanged."
  - "The same spec proves an unreadable forge leaves the unit's own branch and adds one note saying the check was skipped."
  - "work-unit-publish.service.ts takes its target from resolvePublicationTarget and returns the notes in publication.notes and the number in pullRequest.number."
- shipped-in: `204ffc5ae27d`
- review-state: in_review
- review-implementer: claude-sonnet-5-5

## acceptance

- open-pull-request-republication.service.spec.ts proves: an open pull request of the same agent, proposal and slice whose head is an ancestor of the unit tip makes the target that pull request's branch with its number and no note.
- The same spec proves a diverged open pull request leaves the unit's own branch as the target and adds one note naming its number as superseded.
- The same spec proves another agent's open pull request is ignored with no note, and that no open pull request leaves the target of choosePublicationTarget unchanged.
- The same spec proves an unreadable forge leaves the unit's own branch and adds one note saying the check was skipped.
- work-unit-publish.service.ts takes its target from resolvePublicationTarget and returns the notes in publication.notes and the number in pullRequest.number.
