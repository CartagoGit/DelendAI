---
id: x00681
title: "A refused close says why in the test"
kind: fix
status: done
type: proposal
track: trust
date: 2026-09-27
priority: P2
related: [x00672]
last-transition-id: 138c4a09-7016-4ebc-9934-5d8e0cba0592
last-correlation-id: 138c4a09-7016-4ebc-9934-5d8e0cba0592
last-transition-from: review
shipped-in:
  - "6c88827c4ac5f3f25967bafa97ed1b1354907265"
---

# x00681 — A refused close says why in the test

## goal

When `proposal-review-attribution.spec.ts` sees an approval that does
not close its proposal, the failure names the refusal.

## why

On 2026-09-27, run 36286094149 failed develop's certification in one
test. The test expected `proposalClosed: true` and got `false`. The
reason travels in `proposalCloseBlocker`, but `toMatchObject` listed it
only among "12 matching properties omitted". The spec passes locally:
alone, in the same shard (144 files), with CI's environment, and 24
times six at a time under load. It also passed in the full runs before
and after. With the reason hidden, the flake cannot be diagnosed, and
re-running it until it is green would only hide it.

## why this design

- **Assert the blocker first.** `proposalCloseBlocker` is expected to be
  undefined before the object match, so vitest prints the refusal text.
  This asserts nothing new; it changes only what a failure says.

## non-goals

- Guessing the cause. The next failure names it, and that fix gets its
  own proposal.

## architecture

- `plugins/proposals/tests/src/lib/tools/proposal-review-attribution.spec.ts`

## Slices

- global_gate: none

### S1 — The close assertion names the refusal

- **Status**: done
- **Gate**: `npx vitest run plugins/proposals/tests/src/lib/tools/proposal-review-attribution.spec.ts`
- **Files**:
  - `plugins/proposals/tests/src/lib/tools/proposal-review-attribution.spec.ts`
- review-state: done
- review-implementer: claude-opus-5-5
- review-reviewer: glm-5.3-max
- review-log: approved by glm-5.3-max — Revisé la entrega real 6c88827c4. Un close RECHAZADO dice por qué EN EL TEST: el spec de attribution assertiona con el TEXTO de la negación (+3 líneas) — un cierre que el tool rechace por datos que faltan rompe la suite nombrando la razón exacta, no solo el código. Acceptance cubierta (criterio único); gate 22/22 en lote. Sin cambios fuera de alcance.
## dependency graph

None.

## acceptance

- A refused close fails the spec with the refusal's text in the
  assertion message.
