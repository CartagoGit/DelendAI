---
id: c00134
title: "Métricas de plugin lifecycle en dashboard"
kind: chore
status: done
type: proposal
track: lifecycle
date: 2026-08-25
priority: P2
parent-plan: q00006
audit-source:
    file: docs/mcp-vertex/audits/legacy/2026-08-25-develop-external-audit-chatgpt-sol-cuarta-pasada.md
    section: "Track D / c00134"
    sha256: 2374da0f620dc2cfab21e0d435e143f10174731864efce9f26f2d3a00104232a
shipped-in:
    - f5836e9 # S1 módulo de métricas + sección del dashboard
related:
    - q00006
    - f00185 # plugin states (emite los eventos)
    - f00184 # lifecycle phases (emite los eventos)
    - f00198 # activation KPIs (Track M)
---

# c00134 — Métricas de plugin lifecycle en dashboard

## Goal

Exponer al dashboard de tokens/observabilidad las métricas de
lifecycle de plugins que ya están disponibles internamente tras
`f00184` y `f00185`, para que un humano o un agente pueda
diagnosticar:

- Cuántos plugins están `LOADED_HIDDEN` vs `ACTIVE` vs `DENIED`.
- Cuántas activaciones/desactivaciones ocurren en una ventana.
- Qué plugins son invocados con más frecuencia.
- Cuánto tiempo tarda `prepare()` / `activate()` por plugin.

### Comportamiento actual

- `packages/core/src/lib/plugins/router.ts` ya emite eventos de
  transición tras `f00185`, pero no se persisten ni se proyectan
  al dashboard.
- `packages/core/src/lib/observability/` no tiene un módulo dedicado
  a métricas de plugins.
- La auditoría externa (§48) señala que las métricas de lifecycle
  faltan en el dashboard.

### Comportamiento deseado

- Nuevo módulo `packages/core/src/lib/observability/plugin-metrics.ts`
  que:
  - Mantiene counters:
    - `plugin.loaded` (transiciones `→ LOADED_HIDDEN`).
    - `plugin.activated` (transiciones `LOADED_HIDDEN → ACTIVE`).
    - `plugin.invoked` (cada `tools/call` exitoso).
    - `plugin.unloaded` (transiciones `→ UNLOADED`).
    - `plugin.denied` (transiciones `→ DENIED`).
  - Mantiene histogramas:
    - `plugin.prepare.duration_ms` (por plugin id).
    - `plugin.activate.duration_ms`.
  - Snapshot actual:
    - `plugin.state.count{state="ACTIVE"}` (gauge).
- Endpoint del dashboard: el script de generación del dashboard
  (`tools/scripts/report/token-budget-dashboard.script.ts` o
  equivalente) incluye una sección "Plugin Lifecycle".

## why

- Habilita diagnóstico de "por qué este plugin no responde" sin
  grep en logs.
- Habilita el KPI "activation precision" (`f00198`).
- Visibilidad operativa para detectar plugins zombi (cargados pero
  nunca invocados).
- Visibilidad para Track F (capabilities): correlacionar denegación
  con capacidades.

## non-goals

- No introduce métricas de negocio (no cuenta entidades, no cuenta
  propuestas cerradas).
- No persiste métricas a un sink externo (R1.9).
- No obliga a los plugins a emitir métricas.
- No cambia los eventos existentes; solo los proyecta.

## architecture

### 1. Módulo de métricas

- `packages/core/src/lib/observability/plugin-metrics.ts`:
  ```ts
  interface PluginMetrics {
    incr(event: PluginEvent): void;
    observe(event: PluginEvent, ms: number): void;
    snapshot(): PluginMetricsSnapshot;
    formatForDashboard(): DashboardSection;
  }
  ```
- Suscripción a eventos del router: el router
  (`packages/core/src/lib/plugins/router.ts`) llama a
  `metrics.incr(...)` en cada transición.

### 2. Sección del dashboard

- `tools/scripts/report/token-budget-dashboard.script.ts`
  (extensión) añade sección `## Plugin Lifecycle` con:
  - Tabla de counters por evento.
  - Top 5 plugins por `invoked`.
  - Distribución de `state` actual.

### 3. Tests

- `packages/core/tests/src/lib/observability/plugin-metrics.spec.ts`:
  - Counters incrementan correctamente.
  - Histogramas capturan duración.
  - Snapshot es consistente.

### 4. Privacidad

- Sin nombres de usuario, paths, emails ni tool names externos en
  las métricas (R1.1).
- Solo `pluginId` (público) y contadores agregados.

## Slices

### S1 — Módulo de métricas + sección del dashboard

- **Status**: done
- **Files**: `packages/core/src/lib/observability/plugin-metrics.ts`, `packages/core/src/lib/plugins/router.ts`, `tools/scripts/report/token-budget-dashboard.script.ts`, `packages/core/tests/src/lib/observability/plugin-metrics.spec.ts`
- **Gate**: type
- review-state: done
- review-implementer: falcon
- review-reviewer: delivery_verifier
- review-log: approved by delivery_verifier — Verificado: plugin-metrics.spec 7/7 verde, typecheck core OK, sección Plugin Lifecycle en dashboard única (sin duplicado) tras regeneración. Módulo + dashboard + spec cumplen el contrato del slice.
## acceptance

- Módulo `plugin-metrics.ts` exporta la API.
- Dashboard incluye sección "Plugin Lifecycle" generada
  automáticamente.
- Tests verdes.
- Sin filtración de paths/usuarios en métricas.
- `bun run validate` verde.
