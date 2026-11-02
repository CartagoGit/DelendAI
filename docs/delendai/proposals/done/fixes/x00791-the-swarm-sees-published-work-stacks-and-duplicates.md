---
id: x00791
title: "The swarm sees published work, stacks and duplicates"
kind: fix
status: done
type: proposal
track: trust
date: 2026-10-01
priority: P1
related: [x00555]
last-transition-id: 1d2cf7c4-680c-46cb-af06-1ae6597c68da
last-correlation-id: 1d2cf7c4-680c-46cb-af06-1ae6597c68da
last-transition-from: review
shipped-in:
  - "327dedec45ee"
---

# x00791 — The swarm sees published work, stacks and duplicates

## goal

`delendai work swarm` names what the units of work have to sort out
between themselves before they spend another CI round: a unit built on
another's unlanded commits, one slice live twice, a merged publication
whose ref was never deleted, and independent units changing most of the
same files.

## why

On 2026-10-01 eight publications sat open against develop, most of them
conflicting, and the swarm view reported one overlap — the generated
agent catalog. It compared only work refs, so everything already
published was invisible to it; it counted derived files, so the one
overlap it found was noise; and it had no notion of a stack. Read by hand,
the publications showed three units sharing five unlanded commits (the
base conflicted, so the two built on it could not land either), one
slice published under two generations, and a merged publication left
behind. An external review read the same branches as three agents
duplicating each other's work, because nothing said they were a stack.

## why this design

- Publications are read as units, with their paths and their distance
  from the integration branch. `units` stays the work refs, so the
  checkpoint's collision refusal and the briefing behave as before.
- A derived file is what `.gitattributes` says it is
  (`linguist-generated`, or `merge=delendai-generated`), so the rule holds
  in any project and needs no list of this repository's files.
- Stacking is a question to git: two tips that share commits the
  integration branch does not have. It is reported before overlap, since
  it is the one with an order: land the base first.
- An agent's work ref beside its own publication of the same generation is
  that agent updating its pull request, not a duplicate.
- The text view lists ten overlapping paths and summarises the rest; the
  JSON keeps all of them.

## non-goals

- Refusing work on any of these grounds. This reports; a gate at
  `work enter` that reads a slice's declared files against the live units
  is the natural next step and needs its own decision.

## Slices

- global_gate: none

### S1 — The swarm reports publications, stacks, duplicates, landed refs and overlaps

- **Status**: done
- **Gate**: `npx vitest run packages/core/tests/src/lib/work-units/work-swarm-relations.spec.ts`
- **Files**:
  - `packages/core/src/lib/contracts/interfaces/work-swarm.interface.ts`
  - `packages/core/src/lib/work-units/work-swarm.service.ts`
  - `packages/core/src/lib/work-units/work-unit-status.service.ts`
  - `packages/core/tests/src/lib/work-units/work-swarm-relations.spec.ts`
  - `packages/core/tests/src/lib/work-units/work-unit-status.service.spec.ts`
- shipped-in: `d981cd636893`
- review-state: done
- review-implementer: claude-opus-5-5
- review-reviewer: gpt-5.4
- review-log: approved by gpt-5.4 — verified at 327dedec45ee, validate exit 0, tests 14/14 — Verified the merged delivery commit 327dedec45ee and ran the declared gate. The focused spec passes and covers landed publications, duplicate slices, stacked pairs, overlap summarisation, and derived-file exclusion.
- review-attribution: claude-opus-5-5 from commit 327dedec45ee names refs/heads/delendai/wip/claude-opus-5-5/implement/x00791-S1-g1/the-swarm-sees-published-work (327dedec45ee4d982f3f0ce42bae6dcb6e00c9dd), opened by gpt-5.4

## dependency graph

None.

## acceptance

- Against this repository on 2026-10-01 the view reported: one landed
  publication, one duplicate slice, three stacked pairs and one overlap,
  where it had reported one generated-file overlap.
- A derived file two units both regenerate is not an overlap.
