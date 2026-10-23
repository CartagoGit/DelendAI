---
id: x00929
title: "A create unit does not take an id someone holds"
kind: fix
status: done
type: proposal
track: general
date: 2026-10-21
related:
  - a00095
  - f00772
last-transition-id: 7da90a21-26d9-4be8-8013-54f0ea80df81
last-correlation-id: 7da90a21-26d9-4be8-8013-54f0ea80df81
last-transition-from: review
last-transition-at: 2026-10-23T09:33:11.599Z
shipped-in:
  - "142432cd4b6c"
---

# x00929 — A create unit does not take an id someone holds

## goal

`work enter --kind=create --proposal=<id>` refuses an id that is taken: a proposal with that id is already on the integration branch, or another agent has a unit or publication for it, here or on the forge. The refusal tells the agent to let the id be allocated.

## why

a00095 C5, 2026-10-20:

- minimax-m3.1-flash-preview's create unit and claude-opus-5-5's were both handed f00769.
- claude-opus-5-5 later entered a create unit on f00776 while develop already held it.

The proposal id allocator already reads every worktree and every ref, keeps a counter the whole clone shares, and reserves the id on the forge. Entering a create unit with an id picked by hand skipped all of that, and nothing checked the id.

The same day `lint:proposal-id-drift` failed in fresh worktrees. It compares the files with the per-checkout counter in `.cache/`, which is stale in any worktree created before a newer proposal landed. The allocator does not depend on that counter (it seeds from disk, from the shared counter and from every ref), so the lint now guards a failure mode the allocator no longer has. Whether to point it at the shared counter or retire it is left to its owner; it is recorded here so the false failures are explained.

## non-goals

- Allocating the id inside `work enter`. Core does not reach the proposals plugin's allocator; the refusal sends the agent to it.
- Changing `lint:proposal-id-drift` (see above).

## slices

- global_gate: type

### S1 — Refuse a taken id for a create unit

- **Status**: done
- **Files**: `packages/core/src/lib/work-units/taken-proposal-id.service.ts`, `packages/core/src/lib/work-units/work-unit-generation.service.ts`, `packages/core/tests/src/lib/work-units/taken-proposal-id.service.spec.ts`
- **Gate**: type
- acceptance:
  - "`takenProposalId` refuses (exit 4) a `--kind=create` unit whose id the integration branch holds, or that another agent's wip or publication ref names, local or remote."
  - "It lets through the agent's own units, a free id, and every other kind."
  - "`unitRefusal` asks it between the ambiguous-name check and the declared-slice check."
- shipped-in: `13e38219232f`
- review-state: done
- review-implementer: claude-opus-5-5
- review-reviewer: minimax-m3.1-flash-preview
- review-log: approved by minimax-m3.1-flash-preview — verified at 142432cd4b6c, validate exit 0, tests 3/3; acceptance 3/3: (1) A create unit on a taken id is refused with exit 4, whether the integration branch holds it or another agent's unit does. takenProposalId refuses a --kind=crea… (2) It lets through the agent's own units, a free id, and every other kind. The agent's own units are not another's: the ref filter drops any ref under the agent's… (3) unitRefusal asks it between the ambiguous-name check and the declared-slice check. The chain is exactly that: `ambiguousUnit(root, args, policy, agent, proposa… — Gate is `type`: `bun run typecheck` exits 0 in this worktree. Verified: a --kind=create unit on an id the integration branch holds, or that another agent's wip or publication ref names - local or remote - is refused with exit 4 (EXIT_CODE.VALIDATION is 4) and a reason naming the proposal or the other agent's ref; the agent's own units, a free id and every other kind are let through; and unitRefusal asks takenProposalId between the ambiguous-name check and the declared-slice check. The spec passes 3/3. Delivery: the slice's commit is 142432cd4b6c, merged as 48a3be3a9265 (PR #1338).

## acceptance

- The S1 spec passes, and the core and CLI suites stay green.
