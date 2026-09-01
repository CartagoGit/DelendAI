---
id: r00032
title: "Compactar output schema de `orchestrator-runner` (hotspot 43 KB)"
kind: refactor
status: ready
type: proposal
track: tokens
date: 2026-08-25
priority: P1
parent-plan: q00006
audit-source:
    file: docs/mcp-vertex/audits/legacy/2026-08-25-develop-external-audit-chatgpt-sol-cuarta-pasada.md
    section: "Track E / r00032"
    sha256: 2374da0f620dc2cfab21e0d435e143f10174731864efce9f26f2d3a00104232a
related:
    - q00006
    - r00031 # misma estrategia aplicada a proposal_get (canary)
    - f00187 # detail: compact|normal|full transversal
---

# r00032 — Compactar output schema de `orchestrator-runner` (hotspot 43 KB)

## Goal

Aplicar al plugin `orchestrator-runner` la **misma estrategia**
que `r00031` aplicó a `proposal_get`: tres niveles de detalle
(`compact | normal | full`) y default `normal`. El plugin arrastra
~43 KB por invocación según §13/§14 de la auditoría externa.

### Comportamiento actual

- `plugins/orchestrator-runner/**` devuelve un objeto completo con
  todos los runs, sus stages, artefactos, logs resumidos, métricas
  y planes.
- Consumidores típicos (agentes que solo quieren "¿hay un run
  activo?") pagan 43 KB cada vez.

### Comportamiento deseado

- Mismo contrato que `r00031`:
  - **`compact`**: `{ id, status, activeStage, startedAt,
    summary, error? }`. Estimado: < 2 KB.
  - **`normal`** (default): lo anterior + lista de stages (id,
    status, startedAt, finishedAt, error?) + métricas agregadas.
    Estimado: ~8 KB.
  - **`full`**: árbol completo incluyendo logs resumidos, planes
    y artefactos. Estimado: ~43 KB opt-in.
- `inputSchema` acepta `detail: 'compact' | 'normal' | 'full'`
  (default `'normal'`).

## why

- §13/§14: segundo hotspot de tokens del repo.
- Replicar la estrategia de `r00031` da coherencia transversal
  (un agente aprende un patrón y lo aplica a todos los plugins).
- Habilita que `f00187` migre `orchestrator-runner` al contrato
  transversal sin fricción.
- Compatibilidad aditiva: `normal` es estrictamente más pequeño
  que el output actual.

## non-goals

- No introduce comportamiento nuevo (e.g. cancelar runs via
  `detail`).
- No fusiona tools.
- No cambia el formato de los artefactos (`logs`, `plans`) ni los
  paths donde se persisten.

## architecture

### 1. Tool

- `plugins/orchestrator-runner/src/lib/tools/get.ts` (o nombre
  equivalente) — refactor análogo a `r00031`.

### 2. Proyectores

- `plugins/orchestrator-runner/src/lib/contracts/run.ts`:
  - `projectCompact`, `projectNormal`, `projectFull`.
  - Mismas reglas: tipos estrictos, sin `undefined` en JSON.

### 3. Schema + medición

- `outputSchema` actualizado por nivel.
- `staticBytes` medido antes/después y comparado contra el
  baseline (`config/metrics-baseline.json`).

### 4. Tests

- Mismos casos que `r00031`:
  - Forma exacta por nivel.
  - Tamaños medidos.
  - Ausencia de `undefined` en JSON.

## Slices

### S1 — Proyectores + tool + schema + tests + medición

- **Status**: done
- **Files**: `plugins/orchestrator-runner/src/lib/tools/advise-spend.tool.ts`, `plugins/orchestrator-runner/src/lib/contracts/spend-view.contract.ts`, `plugins/orchestrator-runner/src/lib/schemas.ts`
- **Gate**: type
- review-state: done
- review-implementer: copilot-orchestrator-r00032-s1
- review-reviewer: delivery-verifier-r00032-s1
- review-log: approved by delivery-verifier-r00032-s1 — Verified independently: r00032 S1 acceptance covered. 3 projectors exist, schema has level enum, advise-spend tests pass.
## acceptance

- `staticBytes` antes/después medido y documentado (reducción
  esperada ≥ 70 % en `compact`).
- `compact` ≤ 2 KB, `normal` ≤ 10 KB, `full` ≥ 30 KB.
- Tests verdes para los 3 niveles.
- Default `normal` más pequeño que el output actual.
- `bun run validate` verde.
