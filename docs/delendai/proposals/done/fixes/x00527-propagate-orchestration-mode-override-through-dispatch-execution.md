---
id: x00527
title: "Propagate orchestration mode override through dispatch execution"
kind: fix
status: done
type: proposal
track: architecture
date: 2026-09-07
last-transition-id: 0ec5bd85-a715-4b4d-b2ef-68feb2b22958
last-correlation-id: 0ec5bd85-a715-4b4d-b2ef-68feb2b22958
last-transition-from: review
shipped-in: ["1100497e7"]
---

# x00527 — Propagate orchestration mode override through dispatch execution

## Goal

Hacer que el override de modo recibido por la herramienta dispatch llegue al classify/plan efectivo y determine la ejecución, no solo al resultado de plan.

## why

La implementación del override vive en dispatch.tool.ts, fuera del alcance original del slice x00525; sin este seguimiento el criterio público de x00521 no puede quedar demostrado.

## non-goals

- No modificar la política persistida del engine.
- No cambiar la ejecución paralela.
- No duplicar las correcciones de timeout, dependencias o rotación.

## Slices

- global_gate: type

### S1 — Propagar override en dispatch y cubrirlo end to end
- **Status**: done
- **Files**: `plugins/agent-orchestrator/src/lib/tools/dispatch.tool.ts`, `plugins/agent-orchestrator/tests/src/lib/tools/dispatch.tool.spec.ts`
- **Gate**: type
- acceptance:
  - "`ns_dispatch` acepta el override y lo incorpora al plan que clasifica y ejecuta."
  - "El resultado y el plan_ref reflejan el modo efectivo solicitado."
  - "Sin override se conserva el modo configurado."
  - "Existen pruebas de override válido y ausencia de override."
- review-state: done
- review-implementer: github-copilot
- review-reviewer: orchestrator
- review-log: approved by orchestrator — Revisión independiente: override válido y ausencia de override están cubiertos; outcome y plan_ref reflejan el modo efectivo; commit 1100497e7 publicado; 12/12 tests y typecheck pasan.
## acceptance

- `ns_dispatch` acepta el override y lo incorpora al plan que clasifica y ejecuta.
- El resultado y el plan_ref reflejan el modo efectivo solicitado.
- Sin override se conserva el modo configurado.
- Existen pruebas de override válido y ausencia de override.
