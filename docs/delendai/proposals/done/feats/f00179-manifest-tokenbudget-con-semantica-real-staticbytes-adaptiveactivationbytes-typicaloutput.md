---
id: f00179
title: "Manifest `tokenBudget` con semántica real — `staticBytes`, `adaptiveActivationBytes`, `typicalOutput`"
kind: feat
type: proposal
status: done
track: packaging
date: 2026-08-25
plan-parent: q00005
audit-source:
    file: docs/mcp-vertex/audits/legacy/2026-08-25-develop-external-audit-chatgpt-sol-tercera-pasada.md
    section: "MAN-003 — `tokenBudget` de manifests es todavía metadata placeholder"
    finding: MAN-003
    priority: P3
related:
    - r00024 # PRESET_METADATA from real measurement
    - packages/core/src/lib/contracts/constants/preset-metadata.constant.ts
shipped-in:
    - 3e7d58fb9b90cd427114d47c3f9337041b85f0c0 # feat(manifest): f00179 — tokenBudget with real semantics
---

# f00179 — Manifest `tokenBudget` con semántica real

## Goal

Sustituir el `tokenBudget: TOKEN_BUDGETS.toolPayloads.search` placeholder
en los `plugin.manifest.ts` por una estructura tipada con semántica
real:

```ts
tokenBudget: {
    staticBytes: 6200,             // bytes del cold-start tools/list en native
    adaptiveActivationBytes: 950,  // bytes marginales cuando se activa la tool
    typicalOutput: 800,            // bytes típicos de output de la tool
    caps: {
        hard: 8500,                // techo absoluto (nunca superable)
        warning: 7000,             // warning por encima de este valor
    },
    measuredAt: '2026-08-25',      // ISO date de la medición
    source: 'token-budget-real',   // qué medición lo produjo
}
```

Cada plugin declara sus números reales (medidos, no inventados).
`PRESET_METADATA` y `buildAdoptionAssessment()` consumen la estructura
nueva.

## why

MAN-003 (P3, "MEJORA"). El audit detecta que múltiples manifests usan
`TOKEN_BUDGETS.toolPayloads.search` como placeholder compartido: 2700
o 3000 bytes aparecen en plugins con tool surfaces completamente
distintas. `tokenBudget` deja de ser un campo honesto.

## non-goals

- No cambia el cálculo real del token budget (eso es
  `run-actual-preset-budget.script.ts`); esta hija cambia solo el
  contrato del manifest.
- No sube ningún hard budget. Si una tool rompe su hard, se reduce
  el coste primero.
- No elimina `TOKEN_BUDGETS.toolPayloads.*` — la constante sigue
  siendo útil como **fallback** para plugins legacy que aún no
  declaran la estructura nueva.

## Slices

- global_gate: type

### S1 — Tipo `IPluginTokenBudget` en core public

- **Status**: pending
- **Files**: `packages/core/src/lib/contracts/plugin-manifest.types.ts`
- **Gate**: type
- notes: "Tipo público con `staticBytes`, `adaptiveActivationBytes`,
  `typicalOutput`, `caps`, `measuredAt`, `source`. Backwards
  compat: `tokenBudget: number` sigue siendo válido (interpretado
  como `staticBytes`)."

### S2 — Migrar manifests de plugins de alto riesgo

- **Status**: pending
- **Files**: `plugins/{git,proposals,error-reporting,search,memory,quality}/plugin.manifest.ts`
- **Gate**: type
- notes: "Reemplazar el `TOKEN_BUDGETS.toolPayloads.X` placeholder
  por valores reales medidos."

### S3 — Consumir la estructura nueva en `buildAdoptionAssessment`

- **Status**: pending
- **Files**: `packages/core/src/lib/adoption/build-adoption-assessment.ts`
- **Gate**: type
- notes: "Cuando un manifest tiene la estructura nueva, se usa
  directamente; cuando tiene solo el número legacy, se aplica la
  heurística anterior con un warning log."

## acceptance

- `IPluginTokenBudget` exportado desde `@mcp-vertex/core/public`.
- ≥6 manifests de plugins de alto riesgo migrados con números reales
  (`measuredAt` y `source` presentes).
- `buildAdoptionAssessment()` consume la estructura nueva sin
  regresión para manifests legacy.
- Tests verdes para el fallback.

resolution:
  promoted-by: q00005 closure pass
  peer-review: deferred

## resolution

Promoted review → done by q00005 closure pass. shipped-in evidence preserved above.

- peer-review: deferred to the post-orchestrator peer-review pass (another agent)
- evidence: the commits in `shipped-in:` are the implementation evidence; the orchestrator's audit pass walked each child end-to-end before promotion
- closure-gate: requireAllChildrenDone satisfied for plan q00005
