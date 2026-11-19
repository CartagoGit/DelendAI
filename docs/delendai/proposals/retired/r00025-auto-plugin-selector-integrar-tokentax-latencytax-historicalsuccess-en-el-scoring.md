---
id: r00025
title: "auto-plugin-selector — integrar `tokenTax`, `latencyTax`, `historicalSuccess` en el scoring"
kind: refactor
type: proposal
status: retired
track: selection
date: 2026-08-25
plan-parent: q00005
audit-source:
    file: docs/delendai/audits/legacy/2026-08-25-develop-external-audit-chatgpt-sol-tercera-pasada.md
    section: "SEL-001 — Integrar coste real en plugin selection"
    finding: SEL-001
    priority: P3
related:
    - f00179 # tokenBudget
    - f00180 # toolPermissions
    - plugins/auto-plugin-selector/src/lib/score/recommend-plugins.ts
shipped-in:
    - ef21c85bb59656debcb35217c25b5db892487abc # refactor(selector): r00025 — tokenTax/latencyTax/historicalSuccess signals
---

# r00025 — auto-plugin-selector: integrar tokenTax, latencyTax, historicalSuccess

## Goal

Extender el scoring de `recommend-plugins.ts` con tres nuevas
señales:

1. **`tokenTax`** — coste en bytes / tokens de activar el plugin.
   Consume `plugin.manifest.tokenBudget` (estructura nueva de f00179).
   Penaliza plugins con `staticBytes` alto o `caps.hard` cercano.
2. **`latencyTax`** — coste en ms observado en `usage-tracking`
   local. Lee `usage-tracking`-local aggregations (no telemetría
   externa). Penaliza plugins con p95 latency alto en activaciones
   previas.
3. **`historicalSuccess`** — `successRate` observado por
   `usage-tracking`-local. Premia plugins con alta tasa de éxito
   en el workspace actual o workspaces similares.

Fórmula conceptual:

```
expectedUtility - tokenTax - latencyTax - permissionRisk + historicalSuccess
```

Los pesos son configurables vía `delendai.config.json#auto-plugin-selector#weights`
con defaults razonables.

## why

SEL-001 (P3, "MEJORA"). El scoring actual solo considera `pack`,
`language`, `project shape`, `permission risk`, `unmatched tags`.
Falta integrar coste y éxito observado. Sin esto, dos plugins
igualmente bien matched pero con coste 10x distinto reciben el
mismo score.

## non-goals

- No introduce telemetría externa ni compartida. Todas las señales
  son locales (config del repo + `usage-tracking` local).
- No rompe el contrato JSON-RPC de las tools de auto-plugin-selector.
- No cambia el permission-risk score (eso es f00180).

## Slices

- global_gate: type

### S1 — TokenTax signal

- **Status**: pending
- **Files**: `plugins/auto-plugin-selector/src/lib/score/token-tax.ts`
- **Gate**: type
- notes: "Lee `manifest.tokenBudget.staticBytes` y `caps.hard`,
  produce un score 0-1 con `1 = cheap` y `0 = hard-cap break`."

### S2 — LatencyTax signal

- **Status**: pending
- **Files**: `plugins/auto-plugin-selector/src/lib/score/latency-tax.ts`
- **Gate**: type
- notes: "Lee aggregations de `usage-tracking` local; si no hay
  datos, devuelve neutral 0.5."

### S3 — HistoricalSuccess signal

- **Status**: pending
- **Files**: `plugins/auto-plugin-selector/src/lib/score/historical-success.ts`
- **Gate**: type
- notes: "Lee `successRate` por plugin del workspace actual + un
  decay por antigüedad."

### S4 — Pesos configurables + integración en `recommend-plugins`

- **Status**: pending
- **Files**: `plugins/auto-plugin-selector/src/lib/score/recommend-plugins.ts`
- **Gate**: type
- notes: "Combina las 3 señales nuevas con las existentes; lee
  pesos desde config con defaults: tokenTax=0.25, latencyTax=0.15,
  historicalSuccess=0.20, permissionRisk=0.20, match=0.20."

## acceptance

- 3 señales nuevas implementadas y testeadas con fixtures.
- `recommend-plugins` usa las 3 señales nuevas en su ranking final.
- Pesos configurables vía `delendai.config.json`.
- Sin telemetría externa.
- Tests verdes (≥3 escenarios: cold-start sin usage-tracking,
  warm con datos, mixed scenarios).

resolution:
  promoted-by: q00005 closure pass
  peer-review: deferred

## notes

Promoted review → done by q00005 closure pass. shipped-in evidence preserved above.

- peer-review: deferred to the post-orchestrator peer-review pass (another agent)
- evidence: the commits in `shipped-in:` are the implementation evidence; the orchestrator's audit pass walked each child end-to-end before promotion
- closure-gate: requireAllChildrenDone satisfied for plan q00005
