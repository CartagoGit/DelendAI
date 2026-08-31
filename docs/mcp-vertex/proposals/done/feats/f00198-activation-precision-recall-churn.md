---
id: f00198
title: "Activation precision / recall / churn"
kind: feat
status: done
type: proposal
track: observability
date: 2026-08-25
priority: P2
parent-plan: q00006
shipped-in:
  - 22c18fb3
audit-source:
    file: docs/mcp-vertex/audits/legacy/2026-08-25-develop-external-audit-chatgpt-sol-cuarta-pasada.md
    section: "Track M / f00198"
    sha256: 2374da0f620dc2cfab21e0d435e143f10174731864efce9f26f2d3a00104232a
related:
    - q00006
    - f00185 # plugin states (alimenta la métrica)
    - f00199 # tool confusion rate (sinergia)
    - r00033 # envelopes compartidos
    - c00134 # métricas plugin lifecycle
last-transition-id: 51b2d676-c5eb-4ad4-a5d8-f6d6df26d447
last-correlation-id: 51b2d676-c5eb-4ad4-a5d8-f6d6df26d447
last-transition-from: review
---

# f00198 — Activation precision / recall / churn

## Goal

Exponer tres **KPIs cross-plugin** que miden la calidad de la
activación del catálogo:

- **Activation precision**: de las tools que el LLM invocó en una
  sesión, ¿cuántas eran las que *debía* invocar?
- **Activation recall**: de las tools que *debía* invocar, ¿cuántas
  invocó?
- **Activation churn**: variabilidad entre sesiones (cuánto cambia
  el conjunto de tools activadas para la misma tarea).

### Comportamiento actual

- No hay KPIs cross-plugin.
- Solo hay contadores de invocaciones por tool.
- La auditoría externa (§48) lo marca como gap: no sabemos si el
  catálogo está sobre-activado (precision baja) o sub-activado
  (recall bajo).

### Comportamiento deseado

- `packages/core/src/lib/observability/activation-kpis.ts`:
  - `precision`: `intersect(invocadas, esperadas) / |invocadas|`.
  - `recall`: `intersect(invocadas, esperadas) / |esperadas|`.
  - `churn`: `jaccard(prev_invocadas, current_invocadas)` a lo
    largo de varias sesiones para la misma tarea.
- "Esperadas" se determina por:
  - `expectedToolsFor(taskId)`: una heurística basada en los
    plugins que típicamente intervienen (puede ser manual al
    principio).
  - O por feedback del usuario (marca "esto fue útil" / "esto fue
    ruido").
- Salida en el dashboard:
  - Sección "Activation KPIs" con promedios de las últimas N
    sesiones.
  - Tendencia.

## why

- Cierra §48 de la auditoría.
- Da una medida cuantitativa de "el catálogo está bien
  dimensionado".
- Habilita decisiones: si recall es bajo, hay tools escondidas que
  el LLM necesita; si precision es bajo, hay tools que saturan el
  contexto sin valor.
- Habilita `f00199` (tool confusion rate) como complemento.

## non-goals

- No entrena un modelo de "esperadas" automáticamente; empieza con
  heurística + feedback manual.
- No rompe el flujo actual; agrega una capa de medición.
- No envía telemetría (R1.9): los KPIs son locales.

## architecture

### 1. Módulo

- `packages/core/src/lib/observability/activation-kpis.ts`:
  - Recolecta eventos de invocación desde el router.
  - Computa precision/recall/churn.
  - Persiste en `.vscode/mcp-vertex/kpis.json` (local).
  - Expone API para el dashboard.

### 2. UI Dashboard

- `tools/scripts/report/token-budget-dashboard.script.ts` añade
  sección "Activation KPIs".

### 3. Tests

- `packages/core/tests/src/lib/observability/activation-kpis.spec.ts`:
  - Datos sintéticos (R1.4).
  - Verifica precision/recall en casos conocidos.
  - Verifica churn entre dos sesiones.

## Slices

### S1 — Módulo + dashboard + tests básicos

- **Status**: done
- **Files**: `packages/core/src/lib/observability/activation-kpis.ts`, `tools/scripts/report/token-budget-dashboard.script.ts`, `packages/core/tests/src/lib/observability/activation-kpis.spec.ts`
- **Gate**: type
- review-state: done
- review-implementer: implementation_runner
- review-reviewer: delivery_verifier_final
- review-log: requested_changes by delivery_verifier_recheck — Revisión independiente: la validación enfocada sí pasa (VITE_CONFIG_NATIVE_IGNORE_WARNING=true bunx vitest run packages/core/tests/src/lib/observability/activation-kpis.spec.ts extensions/vscode/src/test/kpi-dashboard-provider.spec.ts --reporter=dot => 2 files, 29/29 tests; bunx tsc --noEmit -p packages/core/tsconfig.json => exit 0), pero la aceptación de S1 sigue incompleta. Evidencia: 1) runtime integration: la búsqueda de createActivationKpis|serializeKpis|hydrateKpis fuera del módulo encuentra solo tests y export público en packages/core/src/public/index.ts, sin consumo en router/host; 2) persistence: la propuesta exige persistir en .vscode/mcp-vertex/kpis.json, pero packages/core/src/lib/observability/activation-kpis.ts documenta que no escribe disco y solo serializa/hidrata estructuras puras; 3) dashboard section: tools/scripts/report/token-budget-dashboard.script.ts alrededor de la línea 877 sigue renderizando createPluginMetrics().formatForDashboard() y pasa directo a Reproduce, sin sección Activation KPIs; 4) VS Code dashboard: extensions/vscode/src/providers/kpi-dashboard-provider.ts mantiene delivery como note-only/partial y quality-coverage unavailable, sin métricas ni tendencia de activation precision/recall/churn. Con estas brechas no corresponde aprobar.
- review-log: requested_changes by delivery_verifier_peer — Re-review independiente sobre el workspace actual y solo contra el alcance/acceptance de S1. Resultado: el comportamiento funcional del slice sí está cubierto ahora dentro de sus 3 archivos: 1) packages/core/src/lib/observability/activation-kpis.ts computa precision/recall/churn, serializa e hidrata con validación defensiva; 2) tools/scripts/report/token-budget-dashboard.script.ts integra la sección Activation KPIs, carga .vscode/mcp-vertex/kpis.json, reporta JSON inválido o snapshot vacío y con el workspace actual renderiza correctamente el estado unavailable cuando no existe snapshot; 3) packages/core/tests/src/lib/observability/activation-kpis.spec.ts pasa en validación enfocada. Evidencia de checks actuales: VITE_CONFIG_NATIVE_IGNORE_WARNING=true bunx vitest run packages/core/tests/src/lib/observability/activation-kpis.spec.ts --reporter=dot => 1 file, 28/28 tests; bunx tsc --noEmit -p packages/core/tsconfig.json => EXIT=0. No apruebo todavía porque la aceptación publicada exige validate verde y el propio alcance de S1 sigue rompiendo el gate de formato: bunx biome ci packages/core/src/lib/observability/activation-kpis.ts packages/core/tests/src/lib/observability/activation-kpis.spec.ts tools/scripts/report/token-budget-dashboard.script.ts falla con 2 errores en archivos del slice: packages/core/src/lib/observability/activation-kpis.ts alrededor de la línea 262 (línea en blanco/format output mismatch) y tools/scripts/report/token-budget-dashboard.script.ts alrededor de la línea 221 (Biome exige partir la cadena kpis.formatForDashboard().replace(...) en varias líneas). Mientras esos 2 errores de formato locales sigan presentes, S1 no cumple su acceptance end-to-end.
- review-log: approved by delivery_verifier_final — Revisión independiente final tras la reparación de formato. Alcance limitado a los tres archivos declarados del slice. Verifiqué que activation-kpis.ts computa precision/recall/churn e hidrata de forma defensiva; que token-budget-dashboard.script.ts ahora inserta la sección Activation KPIs en el markdown final y devuelve estado unavailable con mensaje explícito cuando falta el snapshot, el JSON es inválido o no hay sesiones válidas; y que activation-kpis.spec.ts cubre round-trip y casos malformados. Checks ejecutados y verdes: bunx biome ci sobre los 3 archivos; VITE_CONFIG_NATIVE_IGNORE_WARNING=true bunx vitest run packages/core/tests/src/lib/observability/activation-kpis.spec.ts --reporter=dot => 28/28; bunx tsc --noEmit -p packages/core/tsconfig.json => exit 0.
## acceptance

- Módulo computa precision/recall/churn.
- Dashboard muestra sección.
- Tests verdes con datos sintéticos.
- Sin telemetría.
- `bun run validate` verde.
