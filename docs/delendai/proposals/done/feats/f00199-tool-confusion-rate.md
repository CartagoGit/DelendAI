---
id: f00199
title: "Tool confusion rate"
kind: feat
status: done
type: proposal
track: observability
date: 2026-08-25
priority: P2
parent-plan: q00006
shipped-in:
  - 20ce1c3a
audit-source:
    file: docs/mcp-vertex/audits/legacy/2026-08-25-develop-external-audit-chatgpt-sol-cuarta-pasada.md
    section: "Track M / f00199"
    sha256: 2374da0f620dc2cfab21e0d435e143f10174731864efce9f26f2d3a00104232a
related:
    - q00006
    - f00198 # activation KPIs (sinergia)
    - c00134 # métricas plugin lifecycle
    - f00196 # model-aware presets (confusion difiere por perfil)
---

# f00199 — Tool confusion rate

## Goal

Detectar **pares de tools** que el LLM confunde (el LLM invoca la
tool equivocada cuando quería la otra). Métrica observable en el
dashboard para guiar la decisión de renombrar, fusionar o
documentar mejor.

### Comportamiento actual

- No hay métrica de confusion.
- Cuando el LLM invoca `git.commit` queriendo decir `commit_policy.run`,
  el error es invisible.
- La auditoría externa (§48) lo señala: el catálogo crece y la
  confusión entre tools similares crece también.

### Comportamiento deseado

- `packages/core/src/lib/observability/tool-confusion.ts`:
  - Recibe el log de invocaciones del LLM (`tools/call` con
    `toolName` y opcional `intendedTool`).
  - Computa una matriz `confusion[toolA][toolB] = count`.
  - Identifica los pares con mayor confusion: top N.
  - Sugerencia: si `confusion[a][b] > threshold`, marcar como
    par candidato a fusión / renombrado / clarificación de
    description.
- Dashboard:
  - Sección "Tool Confusion" con top 5 pares.
  - Tendencia.

## why

- Cierra §48 de la auditoría.
- Da una medida objetiva de "qué tan confuso es el catálogo".
- Es input para `f00196` (model-aware presets): modelos `small`
  tienen más confusion → requiere catálogo más pequeño.
- Guía refactors futuros (fusionar tools similares).

## non-goals

- No renombra tools automáticamente (es informativa).
- No entrena un clasificador; usa señales explícitas (p. ej.
  `intendedTool` cuando el LLM lo declara).
- No rompe el flujo actual; agrega una capa de medición.

## architecture

### 1. Módulo

- `packages/core/src/lib/observability/tool-confusion.ts`:
  - API:
    ```ts
    recordInvocation(toolName: string, intendedTool?: string): void;
    snapshot(): ConfusionMatrix;
    topPairs(n: number): ConfusionPair[];
    ```
  - Persistencia en `.vscode/mcp-vertex/confusion.json` (local).

### 2. UI Dashboard

- `tools/scripts/report/token-budget-dashboard.script.ts` añade
  sección "Tool Confusion".

### 3. Privacidad

- Solo toolIds (públicos) y contadores.
- Sin contenido de args/outputs.

### 4. Tests

- `packages/core/tests/src/lib/observability/tool-confusion.spec.ts`:
  - Datos sintéticos (R1.4): `plugin_a.tool_x` confundido con
    `plugin_a.tool_y`.
  - Verifica top pairs.
  - Verifica que un threshold filtra pares irrelevantes.

## Slices

### S1 — Módulo + dashboard + tests básicos

- **Status**: done
- **Files**: `packages/core/src/lib/observability/tool-confusion.ts`, `tools/scripts/report/token-budget-dashboard.script.ts`, `packages/core/tests/src/lib/observability/tool-confusion.spec.ts`
- **Gate**: type
- review-state: done
- review-implementer: implementation_runner
- review-reviewer: delivery_verifier
- review-log: approved by delivery_verifier — Verificación independiente: módulo de tool confusion y dashboard pasan 21/21 tests focales; packages/core typecheck pasa. La matriz, top pairs y sugerencias están cubiertos sin payloads ni telemetría.
## acceptance

- Módulo computa matriz de confusion.
- Top N pares identificados.
- Dashboard muestra sección.
- Tests verdes.
- Sin telemetría, sin contenido en logs.
