---
id: x00874
title: "A proposal is created in a unit that takes its id"
kind: fix
status: review
type: proposal
track: workflow
date: 2026-10-05
last-transition-id: 8cf500e9-53d9-4eff-90c3-7ae72735eb54
last-correlation-id: 8cf500e9-53d9-4eff-90c3-7ae72735eb54
last-transition-from: in-progress
shipped-in:
  - "de537057ed79"
---

# x00874 — A proposal is created in a unit that takes its id

## goal

A proposal is created from a unit of work, the refusal to create one
anywhere else says how, and from the moment it has an id its unit carries
that id: in its branch, its worktree, its lease and on the forge.

## why

On 2026-10-05 an agent asked to write a proposal could not get an id.
`proposals create` in the shared checkout was refused, rightly, and the
refusal told it to run `work enter --proposal=<id>` first: the id is what
`create` allocates. What works is a unit of kind `create` for the proposal
`new`, and nothing said so.

A proposal created that way lived in a unit named after `new`. Its pull
request merged under a name without the proposal's id, and when the
proposal was later handed to review, the tool that records which merge
delivered each slice looked for a merge naming the proposal's unit and
found none: seven proposals were refused as `undelivered-slices`. A
fallback reads the commits now, but the name still said nothing in the
branch list, the pull-request list and the swarm view.

The same day a unit changed hands with `work claim` and read as two: its
lease stayed under the old name, which kept that name "live" for thirty
minutes and unretirable, and the forge kept the old branch.

And a document as `create` wrote it failed the proposals lint: `## Goal`,
capitalised, where the canonical order is lower case.

## why this design

- The guard is not weakened: creating in the shared checkout stays refused.
  A tool registration may state what to tell a caller it refuses, and the
  create tool states the `create` unit; every other tool keeps the generic
  advice, which is right for them.
- Renaming a unit is one operation, used by a claim (another agent in the
  name) and by the creation of a proposal (its id in the name): create the
  new name, prove it holds the commit, point the worktree at it, then
  remove the old one. It lives once, in `unit-ref-rename.service.ts`.
- What belongs to a unit besides its branch follows it: the lease, keyed by
  the ref, and the forge's copy of the old name. Both callers use the same
  step.
- A unit that already carries an id, and a checkout that is no unit, are
  left exactly as they are.

## non-goals

- Letting `work enter` allocate an id: the allocator stays where the
  proposal is written.
- Renaming units that were created under `new` before this.

## Slices

- global_gate: none

### S1 — The refusal to create a proposal in the shared checkout names the way in

- **Status**: done
- **Files**: `packages/core/src/lib/shared/bind-write-root.ts`, `packages/core/src/lib/contracts/interfaces/tool-registration.interface.ts`, `plugins/proposals/src/lib/contracts/constants/create-proposal.constant.ts`, `plugins/proposals/src/lib/tools/authoring.tool.ts`, `packages/core/tests/src/lib/shared/bind-write-root.spec.ts`, `plugins/proposals/tests/src/lib/create-proposal-retry.spec.ts`
- **Gate**: `npx vitest run packages/core/tests/src/lib/shared/bind-write-root.spec.ts`
- A registration's `refusedWriteNextStep` replaces the generic advice in a
  refused write. The create tool's says: enter a `create` unit for `new`,
  then create there.
- shipped-in: `54e58a2d6954`
- review-state: done
- review-implementer: claude-opus-5-5
- review-reviewer: glm-5.3-flash
- review-log: approved by glm-5.3-flash — verified at de537057ed79, validate exit 0, tests 23/23 — Gate green: bind-write-root spec 23/23; refusal names the create unit (bind-write-root.ts:112); full delivery commit de537057ed79

### S2 — A unit takes the id of the proposal created in it, and a renamed unit keeps its lease

- **Status**: done
- **Files**: `packages/core/src/lib/work-units/unit-ref-rename.service.ts`, `packages/core/src/lib/work-units/unit-adoption.service.ts`, `packages/core/src/lib/work-units/work-claim.service.ts`, `packages/core/src/lib/work-units/work-unit-claim.service.ts`, `packages/core/src/lib/contracts/interfaces/unit-ref-rename.interface.ts`, `packages/core/src/lib/contracts/interfaces/unit-adoption.interface.ts`, `packages/core/src/public/index.ts`, `plugins/proposals/src/lib/services/created-proposal-unit.service.ts`, `plugins/proposals/src/lib/contracts/interfaces/created-proposal-unit.interface.ts`, `plugins/proposals/src/lib/tools/authoring.tool.ts`, `packages/core/tests/src/lib/work-units/unit-adoption.service.spec.ts`
- **Gate**: `npx vitest run packages/core/tests/src/lib/work-units/unit-adoption.service.spec.ts packages/core/tests/src/lib/work-units/work-claim.service.spec.ts`
- Creating a proposal in a unit entered for `new` renames the unit to the
  id: branch, worktree, lease, and the forge's copy of the old name. The
  answer of `create` names the unit's new name.
- `work claim` carries the lease and drops the forge's old name the same
  way, so a claimed unit is one unit.
- shipped-in: `b94d0a9818fa`
- review-state: done
- review-implementer: claude-opus-5-5
- review-reviewer: glm-5.3-flash
- review-log: approved by glm-5.3-flash — verified at de537057ed79, validate exit 0, tests 18/18 — Gate green: unit-adoption + work-claim specs 18/18; renameUnitRef + created-proposal-unit adoption wired; full delivery commit de537057ed79

### S3 — A created document has the canonical headings

- **Status**: review
- **Files**: `plugins/proposals/src/lib/tools/authoring.tool.ts`, `plugins/proposals/tests/src/lib/create-proposal-retry.spec.ts`
- **Gate**: `npx vitest run plugins/proposals/tests/src/lib/create-proposal-retry.spec.ts`
- `create` writes `## goal`, `## why`, `## non-goals`, `## Slices`,
  `## acceptance` in the canonical order and case.
- review-state: in_review
- review-implementer: claude-opus-5-5
- shipped-in: `54e58a2d6954`

## dependency graph

None.

## acceptance

- An agent told only "write a proposal" gets, from the refusal, the two
  commands that create one.
- After `create` in a `new` unit, `work publish --proposal=<id>
  --kind=create` finds the unit, and its pull request is named after the
  proposal.
- After `work claim`, the old name has no lease and no branch on the forge.
