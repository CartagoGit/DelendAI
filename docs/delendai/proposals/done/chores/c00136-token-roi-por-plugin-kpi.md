---
id: c00136
title: "Token ROI por plugin (KPI)"
kind: chore
status: done
type: proposal
track: tokens
date: 2026-08-25
priority: P1
parent-plan: q00006
audit-source:
    file: docs/mcp-vertex/audits/legacy/2026-08-25-develop-external-audit-chatgpt-sol-cuarta-pasada.md
    section: "Track E / c00136"
    sha256: 2374da0f620dc2cfab21e0d435e143f10174731864efce9f26f2d3a00104232a
shipped-in:
    - f5836e9 # S1 módulo ROI + manifest.ts + generador + dashboard
related:
    - q00006
    - f00186 # TokenBudgetRegistry unificado (provee mediciones)
    - c00135 # dashboards separados (sinergia)
    - f00196 # model-aware presets (consume el ROI)
---

# c00136 — Token ROI por plugin (KPI)

## Goal

Calcular y exponer un KPI **token ROI por plugin**:

```
tokenROI = (successful_calls × value) / (schema_bytes + response_tokens)
```

donde `value` es una constante configurable por plugin (declarada en
el manifest). El KPI es consumible por `auto-plugin-selector`
(`f00196`) para rankear plugins por eficiencia.

### Comportamiento actual

- §19 de la auditoría: existe medición de tokens pero no se cruza
  con valor funcional.
- `auto-plugin-selector` rankea plugins solo por heurísticas de
  matching, sin coste.
- No hay forma de responder "¿qué plugin da más valor por byte?".

### Comportamiento deseado

- Módulo `packages/core/src/lib/budgets/roi.ts`:
  ```ts
  export interface PluginValue {
      pluginId: string;
      value: number; // constante declarada en el manifest
  }
  export function computeROI(args: {
      successfulCalls: number;
      schemaBytes: number;
      responseTokens: number;
      value: number;
  }): number;
  export interface ROIReport {
      pluginId: string;
      roi: number;
      sampleSize: number; // successful_calls
      confidence: 'low' | 'medium' | 'high';
  }
  ```
- El manifest de cada plugin declara `value` (entero positivo):
  - Ejemplo: `proposals.get` → `value: 5` (resolver el estado de
    una propuesta vale 5 unidades).
- El `TokenBudgetRegistry` (`f00186`) agrega
  `successful_calls × value` por plugin y lo cruza con
  `schema + response`.
- Dashboard entry: top 5 / bottom 5 por ROI.

## why

- §19: sin cruzar tokens con valor funcional, las decisiones de
  routing son ciegas al coste.
- Habilita `f00196` (model-aware presets) y rankea plugins por
  eficiencia, no solo por matching.
- Es la base para que `auto-plugin-selector` haga trade-offs
  explícitos entre "este plugin responde mejor" y "este plugin
  cuesta menos".
- Compatibilidad aditiva: plugins sin `value` declarado quedan
  fuera del KPI (no rompen el registry).

## non-goals

- No inventa `value` para plugins que no lo declaran.
- No persiste el ROI histórico (es un snapshot por ventana).
- No introduce una noción de "valor económico" (las unidades son
  arbitrarias, declaradas por el manifest).
- No reemplaza a otras métricas (latencia, error rate); las
  complementa.

## architecture

### 1. Módulo ROI

- `packages/core/src/lib/budgets/roi.ts`:
  - `computeROI(args)`: implementación pura, sin side effects.
  - `aggregate(measurements, manifests): ROIReport[]`: agrega por
    plugin.
  - `confidence` se calcula en función del `sampleSize`:
    `< 10` → `low`, `10–100` → `medium`, `> 100` → `high`.

### 2. Manifest

- `plugins/<name>/manifest.json` (o equivalente) admite un campo
  opcional:
  ```json
  {
      "id": "proposals.get",
      "value": 5
  }
  ```
- Validación: `value` debe ser entero positivo si está presente.

### 3. Dashboard

- `apps/web/src/data/token-roi.json` (generado):
  ```json
  {
      "top": [
          { "pluginId": "...", "roi": 12.3, "sampleSize": 84 }
      ],
      "bottom": [...],
      "generatedAt": "2026-08-25T..."
  }
  ```

### 4. Generador

- `tools/scripts/report/token-roi.script.ts`:
  - Lee los manifests.
  - Lee el `TokenBudgetRegistry` (mediciones + successful_calls).
  - Llama a `aggregate`.
  - Emite `token-roi.json` y una tabla Markdown.

### 5. Tests

- `packages/core/tests/src/lib/budgets/roi.spec.ts`:
  - `computeROI(0 calls)` → 0.
  - `computeROI(10 calls, 1000 bytes, 500 tokens, value=5)` →
    `50 / 1500` = `0.033` (con redondeo documentado).
  - Confidence buckets correctos.
  - Plugins sin `value` se omiten del reporte (no se incluyen
    como 0).

## Slices

### S1 — Módulo ROI + manifest field + dashboard + generador + tests

- **Status**: done
- **Files**: `packages/core/src/lib/budgets/roi.ts`, `packages/core/src/lib/budgets/manifest.ts`, `packages/core/tests/src/lib/budgets/roi.spec.ts`, `tools/scripts/report/token-roi.script.ts`, `apps/web/src/data/token-roi.json`
- **Gate**: type
- review-state: done
- review-implementer: crow
- review-reviewer: delivery_verifier
- review-log: approved by delivery_verifier — Verificado: roi.spec 11/11 verde, typecheck core OK, token-roi.json generado por el script. Módulo + manifest.ts + generador + dashboard cumplen el contrato del slice.
## acceptance

- `computeROI` produce valores consistentes con la fórmula.
- `auto-plugin-selector` puede consumir el reporte.
- Dashboard muestra top/bottom 5.
- Tests verdes con todos los casos.
- `bun run validate` verde.
