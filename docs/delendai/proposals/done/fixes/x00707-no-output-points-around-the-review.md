---
id: x00707
title: "No output points around the review"
kind: fix
status: done
type: proposal
track: trust
date: 2026-09-27
priority: P1
related: [x00696, x00677, x00690]
last-transition-id: 95566f67-dc8a-4f1d-ab73-6322ffd0c641
last-correlation-id: 95566f67-dc8a-4f1d-ab73-6322ffd0c641
last-transition-from: review
shipped-in:
  - "4b52300a0"
---

# x00707 — No output points around the review

## goal

No refusal or next action tells an agent how to close without an
independent review, or to open a pull request by hand.

## why

On 2026-09-27 reviewer agents closed about 200 proposals with
`proposal_force_transition … skipPeerReview: true`. They were doing what
the tools had told them. `proposal_review`'s recovery hint named that
exact call, and the `force_transition` refusal ended "or pass
skipPeerReview:true only with host approval", an approval nothing checks.
`work publish` likewise told an agent without `gh` to run `gh pr create`
itself, which adds a second author for a publication the owner machine
opens after the next merge (x00677). x00696 made CI refuse such closes.
The outputs still pointed at them.

## why this design

- **Say whose step it is.** Closing without an independent approval is
  the owner's decision, so the refusal says so and names the CI check
  that enforces it. A missing pull request is opened by the owner machine.
- **The parameters stay.** `skipPeerReview` remains the owner's tool.
  Only the invitation goes.

## non-goals

- Removing `skipPeerReview` or `force`.

## architecture

- `plugins/proposals/src/lib/tools/authoring.tool.ts`: `missingSliceNextAction`.
- `plugins/proposals/src/lib/tools/recovery-tools.ts`: the review → done refusal.
- `packages/cli/src/lib/publication-pull-request.service.ts`: no-`gh` and failed-open reasons.

## Slices

- global_gate: none

### S1 — Outputs name the owner's step

- **Status**: done
- **Gate**: `npx vitest run plugins/proposals/tests/src/lib/review.tool.spec.ts plugins/proposals/tests/src/lib/tools/caller-checkout-tools.spec.ts packages/cli/src/lib/publication-pull-request.service.spec.ts`
- **Files**:
  - `plugins/proposals/src/lib/tools/authoring.tool.ts`
  - `plugins/proposals/src/lib/tools/recovery-tools.ts`
  - `packages/cli/src/lib/publication-pull-request.service.ts`
  - `plugins/proposals/tests/src/lib/review.tool.spec.ts`
  - `plugins/proposals/tests/src/lib/tools/caller-checkout-tools.spec.ts`
  - `packages/cli/src/lib/publication-pull-request.service.spec.ts`
- review-state: done
- review-implementer: claude-opus-5-5
- review-reviewer: glm-5.3-max
- review-log: approved by glm-5.3-max — Diff 4b52300a0 verificado: missingSliceNextAction ya no invita a force_transition+skipPeerReview (reporta al owner); refusal de force_transition a done nombra la decision del owner y CI (x00718); publication sin gh o con gh fallido dice que la rama queda publicada y la maquina del owner abre el PR tras el proximo merge - nunca gh pr create a mano. skipPeerReview/force se conservan (non-goal respetado: solo desaparece la invitacion). Gates verdes: review.tool+caller-checkout 16/16, publication-pull-request 5/5 (el spec vive ahora en packages/core/tests/src/lib/work-units/ tras el traslado del engine de x00735; el gate declarado apuntaba a la ruta cli antigua). AC cubiertos por specs que ya no contienen skipPeerReview en outputs. Sin cambios fuera de los 6 ficheros declarados.
## dependency graph

None.

## acceptance

- The review recovery hint and the force_transition refusal name neither
  `force_transition` to done nor `skipPeerReview`. The refusal names the
  owner.
- A publication without `gh` is not told to run `gh pr create`.
