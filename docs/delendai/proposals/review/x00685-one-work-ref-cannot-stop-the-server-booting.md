---
id: x00685
title: "One work ref cannot stop the server booting"
kind: fix
status: review
type: proposal
track: trust
date: 2026-09-27
priority: P0
related: [x00551]
last-transition-id: e75fcbc7-2777-4708-8f1f-aff2db4ab588
last-correlation-id: e75fcbc7-2777-4708-8f1f-aff2db4ab588
last-transition-from: in-progress
shipped-in:
  - "9c7aa1874f4d7f2ae431e819b763449824aef821"
---

# x00685 — One work ref cannot stop the server booting

## goal

A work ref the startup reconciler cannot record is reported. The server
still boots. A ref that moved on from an integrated checkpoint is not
recorded over it.

## why

On 2026-09-27 the host server exited at boot with
`SQLiteError: CHECK constraint failed: checkpoint_kind = 'merge-candidate' OR integrated_sha IS NULL`
thrown from `rebuild-work-units.ts`:

1. MiniMax had entered `delendai/wip/minimax-3/review/f00553-review-g1/review`
   at the integration tip, before its first commit. The ref's tip was
   contained in the integration branch, so a boot recorded that
   generation as a merge candidate and the integration-evidence phase
   marked it integrated. An empty checkpoint loses nothing.
2. MiniMax then committed on the same ref. On the next boot the rebuild
   re-recorded generation 1 with the new tip as a `durability`
   checkpoint. The upsert changed `checkpoint_kind` but, by design,
   never clears `integrated_sha`. The schema refused the row.
3. The exception left the reconciler and the host server exited. The
   server stopped for every agent on the machine.

## why this design

- **An integrated checkpoint stays integrated.** `generations-repo`
  deliberately never un-observes an integration. A ref that moved on
  from one carries the work of a new generation under the old name.
  The rebuild leaves the record as it is and reports
  `work-refs.work-after-integration` (a note), naming the next
  generation to continue in. The ref itself is not touched.
- **One ref cannot stop the boot.** A checkpoint the database refuses
  for any other reason is reported as `work-refs.record-failed`, an
  unverified blocker that degrades the run. The ref is left untouched
  and the other refs proceed.

## non-goals

- Deciding whether an empty checkpoint should count as integrated. It
  loses nothing either way, and this fix does not depend on the answer.

## architecture

- `packages/core/src/lib/startup-reconciler/phases/rebuild-work-units.ts`
- `packages/core/src/lib/startup-reconciler/finding-catalog.constant.ts`

## Slices

- global_gate: none

### S1 — The boot survives a ref it cannot record

- **Status**: done
- **Gate**: `npx vitest run packages/core/tests/src/lib/startup-reconciler/work-after-integration.spec.ts`
- **Files**:
  - `packages/core/src/lib/startup-reconciler/phases/rebuild-work-units.ts`
  - `packages/core/src/lib/startup-reconciler/finding-catalog.constant.ts`
  - `packages/core/tests/src/lib/startup-reconciler/work-after-integration.spec.ts`
- review-state: done
- review-implementer: claude-opus-5-5
- review-reviewer: glm-5.3-max
- review-log: approved by glm-5.3-max — Revisé la entrega real 9c7aa1874. Un work-ref NO puede tumbar el arranque del server: un ref entered en el tip de la integración y commiteada DESPUÉS produce el finding `work-refs.work-after-integration` — la fila integrada no cambia y el boot NO tiene blocker (antes lanzaba el error de producción); un checkpoint que la BD rechaza produce `work-refs.record-failed` en lugar de tumbar. rebuild-work-units +73, finding-catalog +7, work-after-integration.spec 136 líneas. Acceptance cubierta; gate 22/22 en lote. Sin cambios fuera de alcance.
## dependency graph

None.

## acceptance

- A ref entered at the integration tip and committed on afterwards
  produces `work-refs.work-after-integration`. The integrated row is
  unchanged and the boot has no blocker. Without the fix, the same
  scenario throws the production error.
- A checkpoint the database refuses produces `work-refs.record-failed`,
  and the boot still returns its report.
