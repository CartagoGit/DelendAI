---
id: x00924
title: "A finished unit ends while its proposal stays open for others"
kind: fix
status: in-progress
type: proposal
track: general
date: 2026-10-20
related:
  - f00772
  - x00917
---

# x00924 — A finished unit ends while its proposal stays open for others

## goal

A work ref whose work has landed, and whose unit has been silent past abandonment, ends even while its proposal is still in progress, keeping its tip. A rescued ref can be retired with the command that retires everything else.

## why

The owner reported on 2026-10-20 that agents which had finished their a00095 audits kept leaving refs, branches and worktrees behind.

On 2026-10-20 the wips of glm-5.3-arquitectura (`a00095-S1-g2`) and qwen-3.8-flash (`a00095-S8-g1`) were fully merged into develop and were still live on the forge and locally, a day after their last commit. They were retired by hand.

The rule for a work ref's life (`workRefFate`) keeps and even restores every ref of a proposal that is in progress. That is right for one agent working slice by slice. It is wrong for a proposal several agents work on: a multi-reviewer audit stays in progress for days, and each reviewer that had finished kept its ref until the last reviewer did.

Separately, the start-up rescue keeps edits found in the shared checkout under `refs/delendai/rescued/`. Once those edits were published (a00095 G151), `work retire` refused the ref ("is not a unit of work"), so no command could remove it. The two other rescued refs on this machine are in the same state.

## non-goals

- Changing a live unit's life. A unit committed to within the abandonment window (30 min × 8 lease windows), or one holding work the integration branch lacks, is kept as before.
- The CI reaper (`keepInProgressWorkRefs`). It reads the forge through the API and only keeps; it learns no silence here, so it never fights the local rule.

## slices

- global_gate: type

### S1 — Silence past abandonment releases a landed ref of an open proposal

- **Status**: in-progress
- **Files**: `packages/core/src/lib/contracts/interfaces/work-ref-lifecycle.interface.ts`, `packages/core/src/lib/work-units/unit-lease.constant.ts`, `packages/core/src/lib/work-units/work-ref-lifecycle.service.ts`, `packages/core/src/lib/wip-engine/proposal-in-progress.helper.ts`, `packages/core/tests/src/lib/work-units/work-ref-lifecycle.service.spec.ts`
- **Gate**: type
- acceptance:
  - "`IWorkRefFacts.silentSeconds` is read from the tip's commit time by both openness readers (`workRefOpenness`, `workRefOpennessOf`), so every caller of the rule gets it."
  - "`workRefProposalOpen` no longer holds a landed ref open once its silence passes `ABANDONED_UNIT_SILENCE_SECONDS`. Such a ref is withdrawn or reaped, never restored, with a reason that says its proposal stays open for others."
  - "Unknown silence, a silence within the window, and an abandoned ref with unlanded work are all kept, as before."

### S2 — A rescued ref is retired like a stray one

- **Status**: in-progress
- **Files**: `packages/core/src/lib/work-units/stray-ref-retire.service.ts`, `packages/core/src/lib/work-units/work-unit-retire.service.ts`, `packages/core/tests/src/lib/work-units/stray-ref-retire.service.spec.ts`
- **Gate**: type
- acceptance:
  - "`work retire --ref=refs/delendai/rescued/<name>` keeps the tip on the forge under the retired namespace, then removes the ref."

## acceptance

- The specs of S1 and S2 pass.
- After this lands, the three rescued refs on this machine are retired with `work retire`.
