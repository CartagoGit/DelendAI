---
id: x00504
title: "create_proposal acepta los kinds cross-cutting `plan` y `repair`: el input schema estaba desincronizado del glossary, así que para mintear un `qNNNNN-...` había que mentir con `kind: 'chore'`"
kind: fix
status: done
type: proposal
track: proposals-integrity
date: 2026-09-06
---

# x00504 — create_proposal acepta los kinds cross-cutting `plan` y `repair`: el input schema estaba desincronizado del glossary, así que para mintear un `qNNNNN-...` había que mentir con `kind: 'chore'`

## Goal

Sincronizar `CREATE_PROPOSAL_INPUT_SCHEMA` en `plugins/proposals/src/lib/tools/authoring.tool.ts` con el glosario canónico `PROPOSAL_KINDS` de `proposal-glossary.constant.ts`. El schema declaraba 13 kinds (sin `plan` ni `repair`); el glosario declara 15. La consecuencia observable era que `create_proposal` rechazaba cualquier intento de `kind: 'plan'` con `unrecognized_enum_value`, obligando a los autores a marcar `kind: 'chore'` para emitir planes con prefijo `q`, lo que rompía `prefixForKind('plan') !== 'q'` downstream y contaminaba el `cascade` con entradas `chore` que querían ser `plan`. Esta propuesta añade las dos entradas al enum e introduce un test de regresión que mantiene el contrato: el set de valores válidos en el input schema es exactamente el set declarado en `PROPOSAL_KIND_VALUES`.

## why

Encontrado durante la creación de `q00020` (plan de Work Telemetry). El primer intento con `kind: 'plan'` y prefijo `q` devolvió `id prefix "q" (kind=plan) does not match kind "refactor"` y luego `Your input to the tool was invalid`. La causa raíz fue que `authoring.tool.ts` redefinió su propio enum sin actualizarlo cuando el glossary agregó `plan` (q00001) y `repair` (q00013 S4). El acoplamiento entre el input schema y el glosario es estructural: cualquier `kind` que el glosario acepte debe ser aceptado por el input schema, o el tool se vuelve inaccesible para esa familia.

## non-goals

- Cambiar la semántica de `plan` o `repair`. Las definiciones viven en `proposal-glossary.constant.ts`; este fix sólo sincroniza el input schema con ellas.
- Añadir nuevos kinds. Esta propuesta no introduce familias nuevas; sólo refleja las que ya existen.
- Cambiar el comportamiento de `prefixForKind`. Ya devuelve `'q'` para `'plan'` y `'e'` para `'repair'`; el bug era exclusivamente que el input schema los rechazaba antes de llegar a esa función.

## Slices

- global_gate: lint

### x00513-S1 — Sincronizar `CREATE_PROPOSAL_INPUT_SCHEMA.kind` con `PROPOSAL_KIND_VALUES` (incluye `plan` y `repair`)
- **Status**: done
- **Files**: `plugins/proposals/src/lib/tools/authoring.tool.ts`
- **Gate**: lint
- acceptance:
  - "`CREATE_PROPOSAL_INPUT_SCHEMA.shape.kind._def.values` contiene exactamente los 15 miembros de `PROPOSAL_KIND_VALUES`, en el mismo orden."
  - "`create_proposal` con `kind: 'plan'` ya NO falla con `unrecognized_enum_value`; mintea un `qNNNNN-...` con `kind: 'plan'` y `prefixForKind` resuelve a `'q'`."
  - "`create_proposal` con `kind: 'repair'` mintea un `eNNNNN-...`."
  - "`bunx biome check plugins/proposals/src/lib/tools/authoring.tool.ts` verde."
  - "`bun run packages/proposals lint` verde."
- review-state: done
- review-implementer: delendai-impl-20260906
- review-reviewer: delendai-orch-20260906
- review-log: approved by delendai-orch-20260906 — x00513-S1 reviewed: enum values match PROPOSAL_KIND_VALUES in order; no other consumer of the schema needed updating; lint clean on the touched file.
### x00513-S2 — Test de regresión que fija la invariante: `kind` input schema ≡ `PROPOSAL_KIND_VALUES`
- **Status**: done
- **DependsOn**: [x00513-S1]
- **Files**: `plugins/proposals/tests/src/lib/authoring.kind-glossary-parity.spec.ts`
- **Gate**: type
- acceptance:
  - "Test nuevo `authoring.kind-glossary-parity.spec.ts` itera `PROPOSAL_KIND_VALUES` y verifica que cada uno es aceptado por `CREATE_PROPOSAL_INPUT_SCHEMA.shape.kind`."
  - "Test verifica también que `kindMatchesId('plan', 'q00020')` y `kindMatchesId('repair', 'e00001')` devuelven `{ok: true}`."
  - "Test de no-rompimiento: ejecutar `create_proposal` con `kind: 'chore'` (camino legacy) sigue funcionando idénticamente."
  - "Test falla con un mensaje útil si alguien añade un kind al glosario sin actualizar el input schema (`Expected kind 'X' to be present in CREATE_PROPOSAL_INPUT_SCHEMA.kind, but it was missing`)."
- review-state: done
- review-implementer: delendai-impl-20260906
- review-reviewer: delendai-orch-20260906
- review-log: approved by delendai-orch-20260906 — x00513-S2 reviewed: 11/11 spec cases green (parity-foreach, same-order, plan/repair acceptance, legacy chore, unknown reject, optional kind, round-trip via proposalKindSchema, kindMatchesId plan/repair + mismatch). Lint-clean (biome) and typecheck-clean on the touched file.
## acceptance

- `CREATE_PROPOSAL_INPUT_SCHEMA.shape.kind._def.values` contiene exactamente los 15 miembros de `PROPOSAL_KIND_VALUES`, en el mismo orden.
- `create_proposal` con `kind: 'plan'` ya NO falla con `unrecognized_enum_value`; mintea un `qNNNNN-...` con `kind: 'plan'` y `prefixForKind` resuelve a `'q'`.
- `create_proposal` con `kind: 'repair'` mintea un `eNNNNN-...`.
- `bunx biome check plugins/proposals/src/lib/tools/authoring.tool.ts` verde.
- `bun run packages/proposals lint` verde.
- Test nuevo `authoring.kind-glossary-parity.spec.ts` itera `PROPOSAL_KIND_VALUES` y verifica que cada uno es aceptado por `CREATE_PROPOSAL_INPUT_SCHEMA.shape.kind`.
- Test verifica también que `kindMatchesId('plan', 'q00020')` y `kindMatchesId('repair', 'e00001')` devuelven `{ok: true}`.
- Test de no-rompimiento: ejecutar `create_proposal` con `kind: 'chore'` (camino legacy) sigue funcionando idénticamente.
- Test falla con un mensaje útil si alguien añade un kind al glosario sin actualizar el input schema (`Expected kind 'X' to be present in CREATE_PROPOSAL_INPUT_SCHEMA.kind, but it was missing`).
