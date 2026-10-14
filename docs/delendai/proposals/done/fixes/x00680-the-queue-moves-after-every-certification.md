---
id: x00680
title: "The queue moves after every certification"
kind: fix
status: done
type: proposal
track: trust
date: 2026-09-27
priority: P1
related: [x00672, x00677]
last-transition-id: f25281b1-c61b-4d45-82b3-3077c3b29b7b
last-correlation-id: f25281b1-c61b-4d45-82b3-3077c3b29b7b
last-transition-from: review
shipped-in:
  - "6e55adec2f7dc54cee262841b3e6d774d477c7fe"
---

# x00680 — The queue moves after every certification

## goal

After each merge into the integration branch, the queue runs again as
soon as that branch's tip finishes its certification. Nobody has to
dispatch `keep-the-queue-moving` by hand.

## why

The queue arms its head only when the integration branch's tip is
certified. On 2026-09-27, #512, #513, #515 and #516 sat green and
unarmed after each merge until the queue was dispatched by hand, for
three reasons:

- the queue merges with the workflow token, so the merge starts no
  `push` workflow;
- `workflow_run` and `schedule` run the default branch's copy of the
  workflow, which is behind the integration branch;
- the hydrator's `certify-integration` starts the certification but
  does not wait for it to finish.

## why this design

- **Wait where the credential already is.** The local hydrator already
  runs after every merge it pulls, holds the owner's credential, and
  dispatches the certification. A final step waits for that
  certification, polling it for up to 50 minutes, and then dispatches
  the queue once. No workflow or CI artifact gets a credential.
- **One reading of certification.** The step reuses
  `certificationOf` from `certify-integration`; it does not re-spell
  it.
- **A red tip still gets a queue run.** The queue's repair path is what
  arms the candidate that turns the branch green.
- **The step stands down if the tip moves.** The hydration of that
  newer tip advances the queue instead, so the queue is never
  dispatched twice for stale state.

## non-goals

- Changing the default branch or promoting develop to main (the
  owner's decision). Either would also fix the scheduled trigger.

## architecture

- `tools/scripts/forge/advance-queue.script.ts`: `nextStep`, which is
  pure, and a polling `main`.
- `tools/scripts/git/hydrate-candidates-after-merge.script.ts`: the
  last hydration step.

## Slices

- global_gate: none

### S1 — The hydrator dispatches the queue after certification

- **Status**: done
- **Gate**: `npx vitest run tools/scripts/forge/advance-queue.script.spec.ts`
- **Files**:
  - `tools/scripts/forge/advance-queue.script.ts`
  - `tools/scripts/forge/advance-queue.script.spec.ts`
  - `tools/scripts/git/hydrate-candidates-after-merge.script.ts`
- review-state: done
- review-implementer: claude-opus-5-5
- review-reviewer: glm-5.3-max
- review-log: approved by glm-5.3-max — Revisé la entrega real 6e55adec2. La cola se mueve tras CADA certificación: advance-queue (103 líneas + spec 43) despacha UNA vez con tip certificado o rojo; un tip pendiente se espera como mucho 50 minutos; si el tip se mueve mientras se espera, no se despacha (la espera observa el ref, no un reloj ciego). hydrate-candidates-after-merge ajustado. Acceptance cubierta; gate 113/113 en lote. Sin cambios fuera de alcance.
## dependency graph

None.

## acceptance

- A certified or red tip leads to one dispatch of the queue.
- A pending tip is waited on for at most 50 minutes.
- A tip that moves while it is being waited on leads to no dispatch.
