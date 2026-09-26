---
id: f00644
title: "A branch names the kind of work"
kind: feat
status: ready
type: proposal
track: trust
date: 2026-09-26
priority: P1
related: [x00563, f00642, x00660, x00671]
---

# f00644 — A branch names the kind of work

## goal

Every work ref and every publication ref says what kind of work it
carries: `<namespace>/wip/<agent>/<kind>/<id>-<slice>-g<n>/<topic>`, and
the same under `pr/`. The kinds form one closed vocabulary, stated once
next to the shape, so renaming the scheme is a one-line change. A review
batch is one branch, published as one pull request when the batch is
done.

## why

The maintainer asked for this on 2026-09-26. Branch names should show
at a glance what is happening, under a single source of truth that is
easy to change. Today the shape (`WORK_REF_SHAPE`, x00563) says who and
on what, but not what kind of work. An implementation, a review round, a
proposal being authored and a closing pass look alike. A reviewer's unit
is recognised only by the magic slice names `review` and `close`. A
proposal published by `create_proposal` was named outside the shape
altogether until x00671. Reviews also go one proposal per branch and one
pull request per proposal. The maintainer would rather see a batch of
reviews advance on one work branch and land as one pull request.

## why this design

- **The kind is a placeholder in the one shape.** It is `${kind}` in
  `WORK_REF_SHAPE`, with the vocabulary as a constant beside it:
  `implement`, `review`, `create`, `revise`, `audit`, `retire`, `repair`.
  Every writer builds names from the template and every reader parses
  with the template's own parser, so neither spells the shape again.
- **Slice and generation stay.** The generation keeps a regenerated unit
  from colliding with the old one, and the slice is still how work is
  published slice by slice. With f00642 it is mostly `all`.
- **Readers accept both shapes while old refs live.** Refs without a
  kind stay readable, as `implement`, or as `review` for the old `review`
  and `close` slices, until none are left. The migration renames
  nothing, because a branch rename closes its pull requests.
- **A review batch keeps claims without a new store.** A batch branch is
  `…/review/batch-g<n>/<topic>`. Each proposal it takes is declared by a
  commit on the branch with a `Claims: <id>` trailer, made before
  reviewing. `review_queue` reads claims from those commits, so the
  branch itself remains the only source. The batch is published as one
  pull request when the reviewer finishes it.

## non-goals

- Renaming refs that exist today.
- Letting a kind outside the vocabulary be written. An unknown kind is
  refused and the vocabulary is named, so a typo never becomes a new
  kind.

## architecture

- `packages/core/src/lib/development-policy/profiles.constant.ts`: the
  shape and the vocabulary.
- The readers that still use their own regex (for example
  `tools/scripts/lint/ref-lifecycle-guard.script.ts`) switch to the
  template's parser.
- `work enter --kind=` (default `implement`), review units as
  `review`, `create_proposal` as `create`.

## Slices

- global_gate: none

### S1 — The shape carries the kind, stated once, and every reader parses it

- **Status**: pending
- **Files**: `packages/core/src/lib/development-policy/profiles.constant.ts`, `packages/core/src/lib/wip-engine/ref-name.ts`, `tools/scripts/lint/ref-lifecycle-guard.script.ts`
- **Gate**: type
- acceptance:
  - "`WORK_REF_SHAPE` contains `${kind}`, and the vocabulary is one exported constant next to it."
  - "The template's parser reads a ref of the new shape and a ref of the old one (kind `implement`, or `review` for the old `review`/`close` slices)."
  - "No reader of work or publication refs spells the shape in its own regex."

### S2 — Writers name the kind

- **Status**: pending
- **DependsOn**: [S1]
- **Files**: `packages/cli/src/commands/work.command.ts`, `plugins/proposals/src/lib/tools/publish-proposal.ts`, `plugins/proposals/src/lib/services/review-claims.service.ts`
- **Gate**: type
- acceptance:
  - "`work enter --kind=<kind>` names the ref with it, defaults to `implement`, and refuses a kind outside the vocabulary by naming the vocabulary."
  - "A review unit is `review`, a proposal published by `create_proposal` is `create`, and review claims recognise the kind instead of the magic slices."

### S3 — A batch of reviews is one branch and one pull request

- **Status**: pending
- **DependsOn**: [S2]
- **Files**: `plugins/proposals/src/lib/services/review-procedure.ts`, `plugins/proposals/src/lib/services/review-batch-claims.service.ts`
- **Gate**: type
- acceptance:
  - "A reviewer enters one `review` batch unit and claims each proposal with a `Claims: <id>` commit before reviewing it."
  - "`review_queue` reports a proposal claimed in another agent's batch as held by that agent, until the batch merges."
  - "The procedure tells the reviewer to commit after each verdict and to publish the batch once, when it is done."

## dependency graph

S1 → S2 → S3.

## acceptance

- Every new work and publication ref names its kind, from one vocabulary
  stated once.
- Refs of the old shape are still read correctly.
- A review batch advances on one branch and lands as one pull request,
  with its claims read from its own commits.
