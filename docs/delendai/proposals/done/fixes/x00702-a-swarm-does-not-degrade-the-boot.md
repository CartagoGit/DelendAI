---
id: x00702
title: "A swarm does not degrade the boot"
kind: fix
status: done
type: proposal
track: trust
date: 2026-09-27
priority: P0
related: [x00685, x00687]
last-transition-id: 274efffb-5507-4535-b3ce-edeab0ac6b29
last-correlation-id: 274efffb-5507-4535-b3ce-edeab0ac6b29
last-transition-from: review
shipped-in:
  - "02e6683df416703ab9759e4f73c8d81af5d20bb4"
---

# x00702 — A swarm does not degrade the boot

## goal

Normal swarm work never turns the startup reconciler DEGRADED: publishing
a unit is not lost work, and two agents' review batches are two units.

## why

After a swarm session on 2026-09-27 the owner's server booted DEGRADED,
with mutations blocked for every agent, on two blockers. Both were
delendai's own normal flow:

- **`integration-evidence.ref-vanished`** for
  `…/x00699-S1-g1/an-agent-session-holds-its-unit`. `work publish` moves
  a unit's work to its publication and deletes the work ref. The
  reconciler looked for the checkpoint only in the integration branch,
  so every unit published and not yet merged read as lost work.
- **`work-refs.duplicate-generation`** for
  `…/copilot/review/batch-all-g1/…` and
  `…/glm-5.3-max/review/batch-all-g1/…`. Every reviewer enters its own
  review batch as `batch`/`all`, and the reconciler keyed units by
  proposal, slice and generation. Two agents' first batches claimed the
  same unit.

## why this design

- **A checkpoint held by another ref is not vanished.** The integration
  phase also receives the tips of the work refs and of the publications
  (fetched already, for pruning). A checkpoint one of them contains is
  reported as `integration-evidence.checkpoint-published`, a note. Only a
  checkpoint no ref holds is still a blocker.
- **A review batch belongs to its agent.** A batch unit is recorded as
  `batch-<agent>`, both where duplicates are detected and in the state
  database. A duplicate is still two refs of one agent's unit.

## non-goals

- Changing what a genuinely lost checkpoint reports.

## architecture

- `packages/core/src/lib/startup-reconciler/phases/integration-evidence.ts`:
  `keptBy`.
- `packages/core/src/lib/startup-reconciler/reconcile-startup.ts`: the
  tips of work refs and publications.
- `packages/core/src/lib/startup-reconciler/phases/rebuild-work-units.ts`:
  `unitProposal`.
- `packages/core/src/lib/startup-reconciler/finding-catalog.constant.ts`:
  the new note.

## Slices

- global_gate: none

### S1 — Publishing and batches are not blockers

- **Status**: done
- **Gate**: `npx vitest run packages/core/tests/src/lib/startup-reconciler/swarm-boot.spec.ts`
- **Files**:
  - `packages/core/src/lib/startup-reconciler/phases/integration-evidence.ts`
  - `packages/core/src/lib/startup-reconciler/reconcile-startup.ts`
  - `packages/core/src/lib/startup-reconciler/phases/rebuild-work-units.ts`
  - `packages/core/src/lib/startup-reconciler/finding-catalog.constant.ts`
  - `packages/core/tests/src/lib/startup-reconciler/swarm-boot.spec.ts`
- review-state: done
- review-implementer: claude-opus-5-5
- review-reviewer: minimax-3
- review-log: approved by minimax-3 — Independiente: implementer claude-opus-5-5, reviewer minimax-3. Verifiqué 02e6683df416703ab9759e4f73c8d81af5d20bb4. PR MERGED. Publishing and batches are not blockers
## dependency graph

None.

## acceptance

- A work ref deleted after its commit was pushed to a publication yields
  `checkpoint-published`, not `ref-vanished`.
- Two agents' `batch-all-g1` refs yield no `duplicate-generation`.
- Without the fix, both cases fail with the blockers the owner's boot
  reported.
