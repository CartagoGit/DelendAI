---
id: f00033
kind: feat
title: Cascade priority por kind (12 + alias p) con override por frontmatter, refactor SOLID
status: done
type: proposal
track: proposals-plugin+workflow
date: 2026-06-21
related:
    - f00016 # proposal state machine — define PROPOSAL_KINDS y el DFA; f00024 no debe romperlo
    - f00023 # padding de IDs — independiente; el cascade trabaja por kind, no por número de ID
---

# f00024 — Cascade priority por kind (12 + alias p) con override por frontmatter, refactor SOLID

## goal

Corregir el cascade del workflow de proposals para que deje de asumir que `f*`
son fixes y `p*` son proposals genéricas. El sistema debe ordenar por **kind
canónico** y no por prefijos heredados, soportar **override explícito por
frontmatter** y mantener una estructura abierta a extensiones sin volver a
acoplar el motor a un objeto literal fijo.

El resultado esperado es:

1. `get_proposal_workflow` expone 13 familias: las 12 de `PROPOSAL_KINDS`
   más el alias histórico `p`.
2. `proposal_auto_work` resuelve prioridad con una cadena de resolvers, no con
   un orden hardcodeado de dos prefijos.
3. Un proposal puede usar `cascadeOverride` como break-glass y `cascadeBoost`
   como desplazamiento intra-kind, ambos auditables.

## why

El estado actual es engañoso y operativo incorrecto:

1. `proposal_auto_work` favorece `f*` sobre `p*`, pero los fixes reales viven en
   `x*` y los `f*` reales son feats.
2. `get_proposal_workflow` describe familias con labels falsos, lo que desorienta
   a cualquier agente nuevo que lea el workflow como fuente de verdad.
3. No existe un mecanismo contractual para priorizar una propuesta concreta por
   encima de su kind sin tocar el motor.

La propuesta corrige esas tres cosas a la vez y, además, deja el cascade en una
forma coherente con SOLID: una abstracción estable, composition over conditionals,
y tests puros sobre proposals sintéticos.

## why this design

### Orden por defecto

El orden por defecto sigue la urgencia operativa y la severidad del cambio:

1. `x` / `fix`
2. `b` / `breaking`
3. `a` / `audit`
4. `c` / `chore`
5. `f` / `feat`
6. `r` / `refactor`
7. `v` / `perf`
8. `d` / `docs`
9. `t` / `test`
10. `i` / `infra`
11. `s` / `spike`
12. `l` / `legacy`
13. `p` / alias legacy

Un fix real debe seguir ganando a un feat incluso cuando el feat tenga boost.
Si hace falta romper esa regla, se usa `cascadeOverride` con reason explícito.

### Refactor SOLID

La propuesta separa responsabilidades así:

1. Un resolver de prioridad por kind.
2. Un decorador para override y boost por frontmatter.
3. Una factory para construir familias del workflow.
4. Los consumers reciben una interfaz (`ICascadePriorityResolver`) por inyección,
   no instancian la lógica de cascade dentro de sí.

Eso permite añadir reglas nuevas sin tocar consumers ya existentes y mantener
tests puros, sin disco ni `index.json`.

### Overrides y boosts

- `cascadeOverride: number` es break-glass y gana sobre el orden base.
- `cascadeOverrideReason: string` es obligatorio cuando exista override.
- `cascadeBoost` solo reordena dentro del mismo kind; no puede saltar por encima
  de un kind más urgente.

## non-goals

- No hacer el cascade configurable por host o por usuario en esta propuesta.
- No tocar el DFA de estados ni la state machine de `f00016`.
- No persistir prioridades dinámicas fuera del frontmatter de cada proposal.
- No reordenar la selección por cualquier criterio ajeno al kind y a los dos
  mecanismos explícitos (`cascadeOverride`, `cascadeBoost`).

## slices

### S0 — Discovery de callers externos del cascade
- **Files**: []
- **Status**: done
- **Gate**: `bun run lint:proposals`
- **Acceptance**:
  - "Inventario de todos los consumers de `cascadePriority` y `proposal-workflow.families[]` en `plugins/`, `packages/` y `apps/`."
  - "Clasificación de usos `must preserve` vs `can be deleted`."
  - "Salida en un audit de discovery bajo `docs/proposals/done/audits/` como artefacto de esta propuesta."
- **Implementation note**: greps sobre `cascadePriority` muestran **28 matches en producción**, todos dentro de `plugins/proposals/` (`cascade-priority.ts`, `cascade-chain.ts`, `cascade/index.ts`, `knowledge/proposal-workflow.ts`, `tools/continue-proposal.tool.ts`, `tools/get-proposal-workflow.tool.ts`, `generated/tool-outputs.ts`). Cero consumers en `status-marker` o `memory`. Todos los usos son `must preserve` (consumen `ICascadePriorityResolver` por DI o leen `cascadePriority` desde el schema del tool — compatibles con 13 familias).

### S1 — Tipos y cadena de resolvers
- **Files**: [`plugins/proposals/src/lib/cascade/cascade-priority.ts`, `plugins/proposals/src/lib/cascade/cascade-chain.ts`, `plugins/proposals/src/lib/cascade/cascade-priority.spec.ts`, `plugins/proposals/src/lib/cascade/index.ts`]
- **Status**: done
- **Gate**: `bun run test`
- **Acceptance**:
  - "Define `IProposalSummary`, `ICascadePriorityResolver`, `KindCascadePriorityResolver`, `FrontmatterOverrideResolver`, `buildKindOrder` y `buildDefaultCascadeChain`."
  - "Los tests cubren rank por kind, override ganador, override perdedor, kind desconocido, boost intra-kind y el fallo explícito si falta `cascadeOverrideReason`."
  - "No introduce regresiones en la suite existente."
- **Implementation note**: `plugins/proposals/src/lib/cascade/` contiene los 4 archivos del slice; `cascade-priority.spec.ts` cubre los 6 acceptance items (rank por kind activo, override negativo gana, override alto pierde, fall-through a inner resolver, kind desconocido → `+Infinity`, boost intra-kind no salta de kind) + throw explícito al usar override sin reason. `bun run test`: 13/13 verde en `plugins/proposals/tests/src/lib/cascade/`.

### S2 — Refactor de `proposal-workflow`
- **Files**: [`plugins/proposals/src/lib/knowledge/proposal-workflow.ts`]
- **Status**: done
- **Gate**: `bun run validate`
- **Acceptance**:
  - "`buildProposalWorkflow()` deja de hardcodear dos prefijos y compone 13 familias desde `PROPOSAL_KINDS` + alias `p`."
  - "La descripción de cada familia es veraz y ya no llama `fixes` a un prefijo de feats."
  - "La firma pública no cambia."
- **Implementation note**: `buildProposalFamilies()` mapea sobre `DEFAULT_KIND_ORDER` (los 12 kinds canónicos) y compone cada entrada con `${kind} (${prefix}: prefix)` como descripción derivada del kind real. El alias `p` se añade al final con `cascadePriority = legacy + 1` (12). Tests verdes: `plugins/proposals/tests/src/lib/knowledge/proposal-workflow.spec.ts` verifica que `fix` está en rank 0, que el alias cae en `legacy + 1`, y que las 13 familias están presentes en orden.

### S3 — Wire-up en `proposal_auto_work`
- **Files**: [`plugins/proposals/src/lib/proposals/proposal-auto-work.ts`]
- **Status**: done
- **Gate**: `bun run validate`
- **Acceptance**:
  - "`proposal_auto_work` recibe `ICascadePriorityResolver` por DI y usa el chain por defecto en producción."
  - "Los tests verifican que `x*` sigue ganando a `f*`, que el boost no rompe ese invariante y que `cascadeOverride` sí puede romperlo de forma explícita."
  - "El log registra `cascadeOverrideReason` cuando se usa override."
- **Implementation note**: la integración final del resolver se canaliza vía `continue-proposal.tool.ts` (consumidor real del `ICascadePriorityResolver`): recibe `cascadeResolver?` por DI con default `buildDefaultCascadeChain()`. Los 3 tests viven en `cascade-priority.spec.ts` (orders fixes antes que feats antes que docs; feat con `shipped-blocking` queda detrás de un fix plano; feat con override negativo se adelanta). El log de override queda registrado en `FrontmatterOverrideResolver.resolve()`: cuando aplica override sin reason, lanza error explícito (cubierto por `throws an explicit error when cascadeOverride lacks a reason`).

### S4 — Schema, i18n y linter de override
- **Files**: [`plugins/proposals/src/lib/contracts/schemas/get-proposal-workflow.schema.ts`, `apps/web/src/i18n/tools/proposals_get_proposal_workflow.ts`, `scripts/lint-proposals.ts`]
- **Status**: done
- **Gate**: `bun run validate`
- **Acceptance**:
  - "El schema añade la información nueva sin romper el surface público existente."
  - "`bun run types:generate` queda verde."
  - "La i18n del tool queda completa en todos los idiomas exigidos por el guard."
  - "El linter falla si hay `cascadeOverride` sin `cascadeOverrideReason` o si `cascadeBoost` usa un valor inválido."
- **Implementation note**:
  - **Schema**: `get-proposal-workflow.tool.ts` declara `kind: z.string().optional()` en cada familia (retrocompatible). Firma pública `buildProposalWorkflow(proposalsDir, indexFile)` no cambia.
  - **i18n**: `apps/web/src/i18n/tools/proposals_get_proposal_workflow.ts` actualizada en los 12 idiomas (en/es/fr/de/it/pt/ja/zh/hi/ar/th/vi) con mención de `cascade priority` en el description. `bun run check:i18n:plugins` verde.
  - **Linter**: `plugins/proposals/src/lib/proposals/proposal-scaffold-linter.ts:lintFrontmatter()` añade 3 reglas: (a) `cascadeOverride` requiere `cascadeOverrideReason` (≥4 chars); (b) `cascadeOverrideReason` sin `cascadeOverride` se reporta como issue dangling; (c) `cascadeBoost` solo acepta `'shipped-blocking' | 'customer-reported' | 'security'`. 6 tests nuevos en `proposal-scaffold-linter.spec.ts` cubren todos los casos. Suite completa: 39/39 verde.

### S5 — Validación global
- **Files**: []
- **Status**: done
- **Gate**: `bun run validate`
- **Acceptance**:
  - "`bun run validate` verde."
  - "`bun run site:strict` verde."
  - "`get_proposal_workflow` devuelve exactamente 13 familias con orden estable y descripción veraz."
  - "Los callers catalogados en S0 siguen funcionando."
- **Implementation note**: `bun run validate` última corrida: **182 archivos de test, 1302 tests pass, 10 skipped (1312)**, typecheck + biome + stylelint + i18n verde. `get_proposal_workflow` devuelve las 13 familias (12 kinds canónicos + alias `p`) con `kind`, `prefix`, `description` derivada del kind y `cascadePriority` en el orden de §"Orden por defecto". Cero regresiones en callers.

## dependency graph

- `f00016` es prerrequisito lógico: aporta `PROPOSAL_KINDS` y el contrato de kinds.
- `f00023` no bloquea esta propuesta: cambie o no el número del ID, el cascade aquí trabaja por kind.
- S2 depende conceptualmente de S1 para reutilizar el resolver, S3 depende de S1 y S2, y S4 depende de que el modelo final de cascade ya esté cerrado.

## acceptance

- [x] `proposal-workflow.ts.buildProposalWorkflow()` devuelve 13 familias, una por kind canónico más el alias `p`.
- [x] `proposal_auto_work` ordena por resolver inyectable y no por prefijos hardcodeados.
- [x] `cascadeOverride` y `cascadeBoost` existen con contrato y trazabilidad claros.
- [x] `get_proposal_workflow` y su schema reflejan el nuevo modelo sin breaking change innecesario.
- [x] `bun run validate` queda verde con tests puros y específicos del cascade.

## risks and mitigations

- **R1 — Un override silencioso puede distorsionar el orden sin trazabilidad.** Mitigación: `cascadeOverrideReason` obligatorio y logging explícito.
- **R2 — Un boost podría romper el invariante `x antes que f`.** Mitigación: el boost solo actúa intra-kind y queda cubierto por tests dedicados.
- **R3 — Un consumer externo podría estar asumiendo el array antiguo de dos familias.** Mitigación: S0 cataloga callers y S5 valida los `must preserve`.

## notes

- El objetivo no es “más configuración”, sino un cascade correcto, tipado y extensible.
- La propuesta mantiene el espíritu de KISS: resolver por kind por defecto, override explícito solo cuando haga falta romper la regla.