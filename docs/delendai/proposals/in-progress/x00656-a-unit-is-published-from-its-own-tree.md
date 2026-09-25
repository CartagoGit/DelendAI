---
id: x00656
title: "A unit is published from its own tree"
kind: fix
status: in-progress
type: proposal
track: trust
date: 2026-09-25
priority: P1
related: [x00653, x00648]
---

# x00656 — A unit is published from its own tree

## goal

Whatever sits loose in the shared checkout cannot refuse the
publication of a unit of work that does not contain it.

## why

On 2026-09-25 `work publish` for x00655 was refused by the pre-push
`publication-proof`: `lint:proposals-tracked` found an untracked
proposal file. The file was not in x00655. It was a reviewer's
(q00014) change, left loose in the shared checkout on `develop`. The
publication ran `git push` from the shared checkout, and git runs the
pre-push hook in the working tree the push is made from. So the gate
checked the shared checkout's working tree, not the commit being
published. Any loose file there blocked every agent's publication, and
so would a person's own unfinished edit. Blocking the person is not
delendai's to do.

## why this design

The unit's worktree holds exactly the commit being published. So the
publication push runs from that worktree when the unit has one. With no
worktree, it runs from the shared checkout as before. The gates are
unchanged; only the tree they inspect is now the right one.

## non-goals

- A worktree for a unit that has none. A unit written through the WIP
  engine without a checkout keeps the previous behaviour.
- The deletion push that follows publication, which carries no content.

## architecture

- `packages/cli/src/lib/work-publish.service.ts`: `pushFrom`.

## Slices

- global_gate: none

### S1 — The publication push runs from the unit's worktree

- **Status**: review
- **Gate**: `npx vitest run packages/cli/src/lib/work-publish.service.spec.ts`
- **Files**:
  - `packages/cli/src/lib/work-publish.service.ts`
  - `packages/cli/src/lib/work-publish.service.spec.ts`

## dependency graph

None.

## acceptance

- With a unit worktree and a loose file in the shared checkout, the
  pre-push hook runs in the unit's worktree, the publication succeeds,
  and the loose file is untouched.
- Without a unit worktree, the push runs from the shared checkout.
