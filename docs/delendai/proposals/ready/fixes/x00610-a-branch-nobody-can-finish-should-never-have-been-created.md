---
id: x00610
title: "A branch nobody can finish should never have been created"
kind: fix
status: ready
type: proposal
track: trust
date: 2026-09-23
---

# x00610 — A branch nobody can finish should never have been created

## goal

This repository accumulated **135 work refs in 42 minutes**, each one
commit deep, each commit's tree byte-identical to its parent's, every one
of them named in a spelling nothing can read back. None can be published,
claimed or renamed. Two independent defects made them; both are fixed
here, and both are fixed by removing a source rather than adding a check.

## why

Measured, not inferred. Every `delendai/wip/visual-studio-code/*` ref in
this clone:

```
refs carrying real changes:              0
refs whose tree equals their parent's:  135
created between 05:25 and 06:07, one commit each,
message `feat(xNNNNN): commit via slice SN`
```

### Defect one — the empty-checkpoint guard protected the wrong call

`checkpoint.ts` compared the new tree against the parent's and returned
`unchanged` without committing — but only `if (refExisted)`. So it
protected the **second** checkpoint and never the first, and the first is
the one that creates the branch. A slice whose scope already matched the
base therefore minted a ref *plus* an empty commit, every time it was
asked.

`no-empty-commits` exists because four such commits once reached
`develop`, and its own header says why they matter: *"they told the
proposals engine a slice had shipped while carrying not one changed
byte"*. That gate checks at **push**. These never reached a push; they
simply piled up locally, where nothing looks.

### Defect two — the shape of a work ref was stated five times

One statement expands into refs. The others were prose and advice, and
they did not agree:

| where | spelling |
| --- | --- |
| `WORK_REF_SHAPE` (the one that writes) | `…-g${generation}/${topic}` |
| `commit-branch-discipline`'s refusal | `…-g<n>-<topic>` — **a dash** |
| the claim service's regex | a hand-written twin of the first |
| `persistence-route` remedy | no `${topic}` at all |
| `validate` remedy | no `${topic}` at all |

The dash is the expensive one. A ref named that way **sits in the right
namespace**, so the guard passes it — and then `work claim` answers
*"cannot read … so there is no honest new name for it"*, and
`publicationRefFromWorkRef` cannot derive its publication ref. An agent
that obeyed the refusal message produced a branch that was litter the
moment it existed, and nothing told it so. All 135 carry that spelling.

## why this design

**Subtraction, not validation.** A second check on a second statement
still leaves two statements. There is now exactly one — the policy's
`branches.workRefTemplate`, itself expanded from `WORK_REF_SHAPE` — and
the reader, the messages and the refusals are all *derived* from it at
runtime. A reader that disagrees with the writer is no longer
expressible.

**The advice that quoted a lesser shape is gone rather than corrected.**
Two remedies taught a template with no `${topic}`. Replacing the example
with a pointer to the profiles removes a source; correcting it would have
kept one.

**Prose may still quote the shape, and must agree with it.** The new gate
does not demand silence — a comment quoting the real shape is how the next
reader learns it. It refuses *disagreement*, which is the actual defect,
and a line that deliberately exercises another operator's template says so
in the open with `work-ref-shape: alternative`. Other shapes are legal;
only our statement of ours must be single.

## non-goals

- Changing `WORK_REF_SHAPE` itself. It is right; it was simply not alone.
- Touching applied migrations or historical proposals, which record what
  was true when they were written.

## Slices

### S1 — Nothing to record creates nothing

- **Status**: done — the empty-tree comparison no longer sits behind
  `refExisted`, so a first checkpoint over an unchanged scope returns
  `unchanged`, pointing at the base, and creates neither a commit nor a
  ref. Three anchor tests had to change: they checkpointed an *unchanged*
  file and asserted `created`, which is the defect written down as an
  expectation. They now write real work first, which is what "checkpoints
  normally" was always meant to test — the anchor behaviour they exist for
  is untouched.
- **Gate**: `npx vitest run packages/core/tests/src/lib/wip-engine/checkpoint.spec.ts`
- **Files**: `packages/core/src/lib/wip-engine/checkpoint.ts`,
  `packages/core/tests/src/lib/wip-engine/checkpoint.spec.ts`
- A checkpoint whose tree equals its parent's returns `unchanged` and
  creates neither a commit nor a ref, whether or not the ref already
  existed.

### S2 — The shape of a work ref is stated once

- **Status**: done — `workSubjectPatternFor` builds the reader from the
  template that writes, so a reader that disagrees with the writer is no
  longer expressible; `commit-branch-discipline` renders the shape from
  the same template instead of restating it with a dash; the claim
  service's hand-written regex is deleted; and two remedies that taught a
  shape with no `${topic}` now point at the profiles rather than invent an
  example. `lint:one-work-ref-shape` refuses a hand-written shape that
  DISAGREES — not one that agrees, because a comment quoting the real
  shape is how the next reader learns it — and a line deliberately
  exercising another operator's template says so with
  `work-ref-shape: alternative`. It found five more disagreements than I
  had, including a fifth spelling in `validate.ts`.
- **Gate**: `npx vitest run packages/cli/src/lib/work-ref-shape.service.spec.ts tools/scripts/lint/commit-branch-discipline.script.spec.ts`
- **Files**: `packages/cli/src/lib/work-ref-shape.service.ts`,
  `packages/cli/src/lib/work-ref-shape.service.spec.ts`,
  `packages/cli/src/contracts/interfaces/work-ref-shape.interface.ts`,
  `packages/cli/src/lib/work-claim.service.ts`,
  `tools/scripts/lint/commit-branch-discipline.script.ts`,
  `tools/scripts/lint/commit-branch-discipline.script.spec.ts`,
  `tools/scripts/lint/one-work-ref-shape.script.ts`,
  `plugins/commit-policy/src/lib/persistence/persistence-route.ts`,
  `packages/core/src/lib/development-policy/validate.ts`
- The reader is derived from the template that writes, the refusal renders
  the shape from that template instead of restating it, and
  `lint:one-work-ref-shape` refuses a hand-written shape that disagrees.

### S3 — The refs that were made this way are removed, with proof

- **Status**: pending
- **Gate**: `bun tools/scripts/lint/ref-lifecycle-guard.script.ts`
- **Files**: none — the repository's refs
- Every ref deleted is shown, first, to carry a tree identical to its
  parent's: an empty commit contains nothing, so nothing is lost. A ref
  carrying one changed byte is not touched.

## acceptance

- A first checkpoint over an unchanged scope leaves no ref behind.
- A ref written by the engine parses with the derived reader; the dash
  spelling does not.
- An operator who declares a different template is told *their* shape.
- `lint:one-work-ref-shape` passes, and fails when a disagreeing shape is
  written by hand.
