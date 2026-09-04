---
id: f00284
title: "Completar integración runtime y VS Code de activation KPIs"
kind: feat
status: blocked
type: proposal
track: observability
date: 2026-08-30
---

# f00284 — Completar integración runtime y VS Code de activation KPIs

## Goal

Completar las brechas señaladas en la revisión de f00198: producir y persistir el snapshot local de activation KPIs desde el flujo runtime existente, y mostrar la vista activation en el dashboard de VS Code. La sección del dashboard CLI ya existe y queda fuera de una reimplementación.

## why

f00198 tiene la lógica pura y el dashboard CLI, pero la revisión independiente detectó que faltan consumo runtime, persistencia local y presentación en VS Code.

## non-goals

- No duplicar la sección Activation KPIs ya existente en token-budget-dashboard.script.ts.
- No añadir telemetría remota.
- No modificar el algoritmo puro de precision, recall o churn salvo lo necesario para persistirlo.

## Slices

- global_gate: type

### S1 — Runtime y persistencia local
- **Status**: pending
- **Files**: `plugins/usage-tracking/src/index.ts`, `packages/core/src/lib/observability/activation-kpis.ts`, `plugins/usage-tracking/tests/session-surface-bytes.spec.ts`, `packages/core/tests/src/lib/observability/activation-kpis.spec.ts`
- **Gate**: type
- acceptance:
  - "Conectar los eventos runtime existentes con activation KPIs sin abrir una vía paralela."
  - "Persistir el snapshot local en .vscode/delendai/kpis.json mediante una escritura segura y testeable."
  - "Mantener la privacidad local y validar la serialización/hidratación."
- review-state: changes_requested
- review-implementer: copilot-orchestrator
- review-reviewer: proposal_guardian
- review-log: requested_changes by proposal_guardian — Gate focalizado no verde: 1 test falla y 30 pasan. session-surface-bytes.spec.ts espera longitud 1, pero la respuesta observada contiene 2 registros. Corregir implementación o expectativa y repetir el gate antes de aprobar.
### S2 — Vista Activation KPIs en VS Code
- **Status**: pending
- **DependsOn**: [S1]
- **Files**: `extensions/vscode/src/contracts/interfaces/kpi-dashboard.interface.ts`, `extensions/vscode/src/providers/kpi-dashboard-provider.ts`, `extensions/vscode/src/test/kpi-dashboard-provider.spec.ts`, `packages/ui-extension/src/kpi-dashboard.ts`
- **Gate**: type
- acceptance:
  - "Incluir activation en el contrato de vistas KPI."
  - "Renderizar precision, recall, churn y tendencia desde los datos disponibles."
  - "Actualizar las pruebas del provider y de la UI sin conservar placeholders incorrectos."

## acceptance

- Conectar los eventos runtime existentes con activation KPIs sin abrir una vía paralela.
- Persistir el snapshot local en .vscode/delendai/kpis.json mediante una escritura segura y testeable.
- Mantener la privacidad local y validar la serialización/hidratación.
- Incluir activation en el contrato de vistas KPI.
- Renderizar precision, recall, churn y tendencia desde los datos disponibles.
- Actualizar las pruebas del provider y de la UI sin conservar placeholders incorrectos.
